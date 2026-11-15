import os, json, numpy as np, warnings
warnings.simplefilter("ignore")
import pystac_client, planetary_computer, odc.stac
from odc.geo.geobox import GeoBox
from affine import Affine

OUT = os.path.expanduser("~/data/souss")
meta = json.load(open(os.path.join(OUT, "meta40.json")))
s1 = np.load(os.path.join(OUT, "stage1.npz")); dH, dV, mH = s1["dH"], s1["dV"], s1["mH"]
ny, nx = dH.shape; S = meta["spacing"]
left = meta["x0"] - abs(meta["dx"]) / 2; top = meta["y0"] + abs(meta["dy"]) / 2
gbox = GeoBox((ny, nx), Affine(S, 0, left, 0, -S, top), f"EPSG:{meta['epsg']}")
bbox = meta["bbox_lonlat"]
cat = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1",
                                modifier=planetary_computer.sign_inplace)

# ---- land cover ----
items = list(cat.search(collections=["esa-worldcover"], bbox=bbox).items())
sel = [i for i in items if "2021" in str(i.properties.get("start_datetime") or i.datetime)] or items
print("worldcover items:", len(items), "used:", len(sel))
wc = odc.stac.load(sel, bands=["map"], geobox=gbox, resampling="mode", chunks={})["map"].max("time").compute().values

# ---- elevation and slope ----
items = list(cat.search(collections=["cop-dem-glo-30"], bbox=bbox).items())
print("dem items:", len(items))
dem = odc.stac.load(items, bands=["data"], geobox=gbox, resampling="bilinear", chunks={})["data"].max("time").compute().values.astype(np.float32)
gy, gx = np.gradient(dem, S); slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)

# ---- Sentinel-2 NDVI, cloud-masked median per period ----
def ndvi(period):
    items = list(cat.search(collections=["sentinel-2-l2a"], bbox=bbox, datetime=period,
                            query={"eo:cloud_cover": {"lt": 15}}).items())
    print(period, "sentinel-2 items:", len(items), flush=True)
    if not items:
        return np.full((ny, nx), np.nan, np.float32)
    ds = odc.stac.load(items, bands=["B04", "B08", "SCL"], geobox=gbox, groupby="solar_day",
                       resampling={"*": "bilinear", "SCL": "nearest"}, chunks={"x": 2048, "y": 2048})
    print("  days:", ds.sizes["time"], flush=True)
    r = ds.B04.astype("float32") - 1000; n = ds.B08.astype("float32") - 1000   # baseline >= 04.00 offset
    ok = ds.SCL.isin([4, 5, 6, 7]) & (ds.B04 > 0)
    nd = ((n - r) / (n + r)).where(ok).chunk({"time": -1})
    return nd.median("time", skipna=True).compute().values.astype(np.float32)
nE = ndvi("2026-06-20/2026-07-25"); nL = ndvi("2026-10-08/2026-11-10"); dN = nL - nE
np.savez(os.path.join(OUT, "context.npz"), wc=wc, dem=dem, slope=slope, ndvi_early=nE, ndvi_late=nL)

# ---- how do radar changes relate to land cover and to NDVI change? ----
names = {10: "trees", 20: "shrub", 30: "grass", 40: "cropland", 50: "built", 60: "bare", 80: "water", 90: "wetland"}
inc, dec = (dH > 3) | (dV > 3), (dH < -3) | (dV < -3)
print("== LAND COVER: share of area | % radar increase | % radar decrease | median slope ==")
for c, nm in names.items():
    m = wc == c
    if m.sum():
        print(f"{nm:9} {100 * m.mean():6.2f}% | {100 * inc[m].mean():5.2f} | {100 * dec[m].mean():5.2f} | {np.nanmedian(slope[m]):.1f} deg")
print(f"NDVI valid: early {100 * np.isfinite(nE).mean():.1f}%  late {100 * np.isfinite(nL).mean():.1f}%")
print("NDVI percentiles p5 p50 p95: early", *[f"{np.nanpercentile(nE, q):.2f}" for q in (5, 50, 95)],
      "| late", *[f"{np.nanpercentile(nL, q):.2f}" for q in (5, 50, 95)])
for nm, m in (("cropland", wc == 40), ("all land", (wc != 80) & (wc > 0))):
    v = m & np.isfinite(dN) & np.isfinite(dH) & np.isfinite(dV)
    print(f"== {nm}: {v.sum()} px | corr(dHV,dNDVI)={np.corrcoef(dV[v], dN[v])[0, 1]:+.3f} "
          f"corr(dHH,dNDVI)={np.corrcoef(dH[v], dN[v])[0, 1]:+.3f} ==")
    print("radar class | n px | % NDVI gain(>+0.15) | % NDVI stable | % NDVI loss(<-0.15) | mean dNDVI")
    for rn, rm in (("increase", inc), ("decrease", dec), ("stable", ~inc & ~dec)):
        k = v & rm
        if k.sum():
            d = dN[k]
            print(f"{rn:9} | {k.sum()} | {100 * (d > .15).mean():.1f} | {100 * (np.abs(d) <= .15).mean():.1f} | "
                  f"{100 * (d < -.15).mean():.1f} | {d.mean():+.3f}")
    print("NDVI class -> mean dHH, mean dHV:",
          " | ".join(f"{t}: {dH[v & q].mean():+.2f}, {dV[v & q].mean():+.2f}" for t, q in
                     (("gain", dN > .15), ("stable", np.abs(dN) <= .15), ("loss", dN < -.15)) if (v & q).sum()))
print("saved context.npz")
