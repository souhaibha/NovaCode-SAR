import os, sys, json, numpy as np, warnings, datetime as dt
warnings.simplefilter("ignore")
import pystac_client, planetary_computer, odc.stac
from odc.geo.geobox import GeoBox
from affine import Affine
from PIL import Image

site = sys.argv[1]; OUT = os.path.expanduser(f"~/data/{site}")
meta = json.load(open(os.path.join(OUT, "meta.json"))); S = meta["spacing"]; ny, nx = meta["ny"], meta["nx"]
left = meta["x0"] - abs(meta["dx"]) / 2; top = meta["y0"] + abs(meta["dy"]) / 2
gbox = GeoBox((ny, nx), Affine(S, 0, left, 0, -S, top), f"EPSG:{meta['epsg']}")
bbox = meta["bbox_lonlat"]; ev = meta["event"]; e0 = dt.date.fromisoformat(meta["event_date"])
win = lambda a, b: f"{e0 + dt.timedelta(days=a)}/{e0 + dt.timedelta(days=b)}"
cat = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1", modifier=planetary_computer.sign_inplace)
ha = S * S / 1e4
print(f"== {site}: {ev} on {e0} | grid {ny} x {nx} at {S} m")

# ---- context: land cover, elevation, slope ----
items = list(cat.search(collections=["esa-worldcover"], bbox=bbox).items())
sel = [i for i in items if "2021" in str(i.properties.get("start_datetime") or i.datetime)] or items
wc = odc.stac.load(sel, bands=["map"], geobox=gbox, resampling="mode", chunks={})["map"].max("time").compute().values
items = list(cat.search(collections=["cop-dem-glo-30"], bbox=bbox).items())
dem = odc.stac.load(items, bands=["data"], geobox=gbox, resampling="bilinear", chunks={})["data"].max("time").compute().values.astype(np.float32)
gy, gx = np.gradient(dem, S); slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
print("land cover %:", {k: round(100 * float((wc == k).mean()), 1) for k in (10, 20, 30, 40, 50, 60, 80, 90) if (wc == k).any()})

def s2_index(period, kind, maxcloud=30):
    items = list(cat.search(collections=["sentinel-2-l2a"], bbox=bbox, datetime=period,
                            query={"eo:cloud_cover": {"lt": maxcloud}}).items())
    print(f"  sentinel-2 {period} ({kind}): {len(items)} items", flush=True)
    if not items: return np.full((ny, nx), np.nan, np.float32)
    bands = ["B04", "B08", "SCL"] if kind == "ndvi" else ["B8A", "B12", "SCL"]
    ds = odc.stac.load(items, bands=bands, geobox=gbox, groupby="solar_day",
                       resampling={"*": "bilinear", "SCL": "nearest"}, chunks={"x": 2048, "y": 2048})
    a = ds[bands[1]].astype("float32") - 1000; b = ds[bands[0]].astype("float32") - 1000
    ok = ds.SCL.isin([4, 5, 6, 7]) & (ds[bands[0]] > 0)
    idx = ((a - b) / (a + b)) if kind == "ndvi" else ((b - a) / (b + a))      # ndvi=(B08-B04)/(..), nbr=(B8A-B12)/(..)
    return idx.where(ok).chunk({"time": -1}).median("time", skipna=True).compute().values.astype(np.float32)

lab = np.full((ny, nx), 255, np.uint8)        # 0 stable, 1 veg gain, 2 veg loss, 3 burned, 4 flooded, 255 ignore
extra = {}
if ev == "fire":
    pre, post = win(-40, -2), win(12, 50)
    nbr0, nbr1 = s2_index(pre, "nbr"), s2_index(post, "nbr"); dnbr = nbr0 - nbr1
    n0, n1 = s2_index(pre, "ndvi"), s2_index(post, "ndvi"); dn = n1 - n0
    print("dNBR p5 p50 p95 p99:", *[f"{np.nanpercentile(dnbr, q):.2f}" for q in (5, 50, 95, 99)])
    lab[np.abs(dn) <= .05] = 0; lab[dn > .15] = 1; lab[dn < -.15] = 2
    lab[(dnbr > .1) & (dnbr <= .27)] = 255                                   # low severity: ambiguous
    lab[dnbr > .27] = 3
    extra = dict(dnbr=dnbr, ndvi_pre=n0, ndvi_post=n1)
elif ev == "flood":
    def s1_stack(period):
        items = list(cat.search(collections=["sentinel-1-rtc"], bbox=bbox, datetime=period).items())
        print(f"  sentinel-1 {period}: {len(items)} items", flush=True)
        if not items: return None
        ds = odc.stac.load(items, bands=["vv", "vh"], geobox=gbox, groupby="solar_day", resampling="bilinear", chunks={"x": 2048, "y": 2048})
        vv = ds.vv.where(ds.vv > 0); vh = ds.vh.where(ds.vh > 0)
        return (10 * np.log10(vv)).compute().values.astype(np.float32), (10 * np.log10(vh)).compute().values.astype(np.float32)
    pre, post = s1_stack(win(-75, -20)), s1_stack(win(-14, 14))
    if pre is None or post is None: sys.exit("no Sentinel-1 data in a window: tell Claude")
    water = lambda vv, vh: np.where(np.isfinite(vv), ((vv < -18) & (vh < -24)).astype(np.float32), np.nan)
    wpre, wpost = np.nanmean(water(*pre), 0), np.nanmean(water(*post), 0)
    items = list(cat.search(collections=["jrc-gsw"], bbox=bbox).items())
    occ = odc.stac.load(items, bands=["occurrence"], geobox=gbox, resampling="nearest", chunks={})["occurrence"].max("time").compute().values if items else np.zeros((ny, nx))
    perm = (occ > 50) & (occ <= 100)
    dvv = np.nanmedian(post[0], 0) - np.nanmedian(pre[0], 0)
    print("S1 dates pre/post:", pre[0].shape[0], post[0].shape[0], "| water share pre", f"{np.nanmean(wpre):.3f}", "post", f"{np.nanmean(wpost):.3f}")
    lab[(wpre == 0) & (wpost == 0) & (np.abs(dvv) < 1.5) & ~perm] = 0
    lab[(wpost >= .5) & (wpre <= .1) & ~perm & (slope < 5)] = 4
    extra = dict(water_pre=wpre, water_post=wpost, jrc_occurrence=occ.astype(np.float32), dvv=dvv)
else:
    print("no optical/radar labels for this event type (earthquake uses the interferogram step)")
lab[(wc == 80) & (lab != 4)] = 255

names = {0: "stable", 1: "vegetation gain", 2: "vegetation loss", 3: "burned", 4: "flooded", 255: "ignore"}
print("== LABELS ==")
for k, n in names.items():
    print(f"{n:16} {(lab == k).sum() * ha:10.0f} ha  {100 * (lab == k).mean():5.2f}%")
np.savez(os.path.join(OUT, "context.npz"), wc=wc, dem=dem, slope=slope)
np.savez(os.path.join(OUT, "labels.npz"), labels=lab, **extra)
col = {0: (200, 200, 200), 1: (40, 200, 60), 2: (230, 50, 50), 3: (60, 20, 20), 4: (0, 140, 255), 255: (0, 0, 0)}
img = np.zeros((ny, nx, 3), np.uint8)
for k, c in col.items(): img[lab == k] = c
for dest in (os.path.join(OUT, "labels.png"), f"{site}_labels.png"): Image.fromarray(img).save(dest)
print("saved context.npz, labels.npz,", f"{site}_labels.png")
