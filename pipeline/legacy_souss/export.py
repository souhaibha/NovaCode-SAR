import os, json, numpy as np, warnings
warnings.simplefilter("ignore")
from scipy import ndimage as ndi
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling, transform_bounds
from affine import Affine
from PIL import Image

OUT = os.path.expanduser("~/data/souss"); WEB = "web"; os.makedirs(WEB, exist_ok=True)
meta = json.load(open(os.path.join(OUT, "meta40.json"))); S = meta["spacing"]; dates = meta["dates"]
H = np.load(os.path.join(OUT, "H40.npy")); V = np.load(os.path.join(OUT, "V40.npy"))
s1 = np.load(os.path.join(OUT, "stage1.npz")); cx = np.load(os.path.join(OUT, "context.npz"))
dH, dV, eH, lH, mH = s1["dH"], s1["dV"], s1["eH"], s1["lH"], s1["mH"]
wc, slope, dem = cx["wc"], cx["slope"], cx["dem"]
with rasterio.open(os.path.join(OUT, "changemap.tif")) as d: cls = d.read(1)
ny, nx = cls.shape; ha = S * S / 1e4

# ---- diagnosis: what is "other surface change" on slopes? ----
D = np.nan_to_num(np.diff(H, axis=0)); step = np.abs(D).argmax(axis=0)
print("== OTHER SURFACE CHANGE BY SLOPE ==")
print("slope | ha | mean dHH | mean dHV | % increases | mean elevation m | most common date of biggest HH jump")
for lo, hi in ((0, 5), (5, 15), (15, 90)):
    k = (cls == 3) & (slope >= lo) & (slope < hi)
    if k.sum():
        j = np.bincount(step[k], minlength=len(dates) - 1).argmax()
        print(f"{lo}-{hi} deg | {k.sum() * ha:.0f} | {np.nanmean(dH[k]):+.2f} | {np.nanmean(dV[k]):+.2f} | "
              f"{100 * ((dH[k] > 0).mean()):.0f} | {np.nanmean(dem[k]):.0f} | {dates[j]}->{dates[j + 1]} "
              f"({100 * (step[k] == j).mean():.0f}% of pixels)")
k = (cls == 3) & (slope >= 15)
if k.sum():
    print("steep-slope pixels, mean HH anomaly per date:",
          " ".join(f"{d[5:]}:{np.nanmean((H[t] - mH)[k]):+.1f}" for t, d in enumerate(dates)))

# ---- water: fixed mask plus extent change around inland water (HV-based, ocean excluded) ----
from pyproj import Transformer
eV, lV = s1["eV"], s1["lV"]
w0 = wc == 80
lab, n = ndi.label(w0); sizes = np.bincount(lab.ravel()); sizes[0] = 0
ocean = lab == sizes.argmax(); inland = w0 & ~ocean
print("== BACKSCATTER dB (p10 p50 p90): HH early | HH late | HV early | HV late ==")
for nm, m in (("ocean", ocean), ("inland water", inland), ("cropland", wc == 40)):
    print(f"{nm:13}", " | ".join(" ".join(f"{np.nanpercentile(a[m], q):.1f}" for q in (10, 50, 90)) for a in (eH, lH, eV, lV)))
TH = -26.0
near = ndi.binary_dilation(inland, iterations=15) & (slope < 5) & ~ndi.binary_dilation(ocean, iterations=25)
wet_e, wet_l = eV < TH, lV < TH
new = cls.copy()
new[ndi.binary_dilation(w0, iterations=2)] = 4
new[near & wet_e & wet_l] = 4
new[near & ~wet_e & wet_l & (dV < -3)] = 5
new[near & wet_e & ~wet_l & (dV > 3)] = 6
tr = Transformer.from_crs(meta["epsg"], 4326, always_xy=True)
lab2, n2 = ndi.label(inland); sz = np.bincount(lab2.ravel()); sz[0] = 0; objs = ndi.find_objects(lab2)
print("== LARGEST INLAND WATER BODIES: lon | lat | mapped ha (2021) | radar-dark ha early | radar-dark ha late ==")
for i in np.argsort(sz)[::-1][:6]:
    if sz[i] == 0: break
    r, c = objs[i - 1]
    r = slice(max(r.start - 20, 0), r.stop + 20); c = slice(max(c.start - 20, 0), c.stop + 20)
    reg = ndi.binary_dilation(lab2[r, c] == i, iterations=15) & (slope[r, c] < 5)
    cy, cx_ = ndi.center_of_mass(lab2[r, c] == i)
    lo, la = tr.transform(meta["x0"] + ((c.start + cx_) * 2 + .5) * meta["dx"], meta["y0"] + ((r.start + cy) * 2 + .5) * meta["dy"])
    print(f"{lo:.4f} | {la:.4f} | {sz[i] * ha:.0f} | {(reg & wet_e[r, c]).sum() * ha:.0f} | {(reg & wet_l[r, c]).sum() * ha:.0f}")
new[(new == 3) & (slope >= 10)] = 7                                   # kept separate until explained
legend = {0: ("stable", None), 1: ("vegetation gain", (40, 200, 60)), 2: ("vegetation loss", (230, 50, 50)),
          3: ("other surface change, flat land", (250, 200, 40)), 4: ("water", (40, 90, 220)),
          5: ("land became water", (0, 210, 230)), 6: ("water became land", (240, 130, 30)),
          7: ("unexplained change on slopes", (170, 120, 200))}
print("== FINAL MAP v2 ==")
areas = {}
for c, (nm, _) in legend.items():
    areas[nm] = round(float((new == c).sum() * ha)); print(f"{nm:34} {areas[nm]:9d} ha")

src_crs = f"EPSG:{meta['epsg']}"
left = meta["x0"] - abs(meta["dx"]) / 2; top = meta["y0"] + abs(meta["dy"]) / 2
tfm = Affine(S, 0, left, 0, -S, top); bounds = (left, top - ny * S, left + nx * S, top)
with rasterio.open(os.path.join(OUT, "changemap_v2.tif"), "w", driver="GTiff", height=ny, width=nx, count=1,
                   dtype="uint8", crs=src_crs, transform=tfm, compress="deflate") as d:
    d.write(new, 1)

# ---- web export: Web Mercator PNGs with transparency, plus lon/lat bounds ----
def warp(arr, method, scale=1):
    t, w, h = calculate_default_transform(src_crs, "EPSG:3857", nx, ny, *bounds, dst_width=nx // scale, dst_height=ny // scale)
    out = np.zeros((arr.shape[0], h, w), np.uint8)
    reproject(arr, out, src_transform=tfm, src_crs=src_crs, dst_transform=t, dst_crs="EPSG:3857", resampling=method)
    b = transform_bounds("EPSG:3857", "EPSG:4326", *rasterio.transform.array_bounds(h, w, t))
    return out, [[b[1], b[0]], [b[3], b[2]]]                          # [[south, west], [north, east]] for Leaflet
rgba = np.zeros((4, ny, nx), np.uint8)
for c, (_, col) in legend.items():
    if col:
        for i in range(3): rgba[i][new == c] = col[i]
        rgba[3][new == c] = 255
img, bb = warp(rgba, Resampling.nearest)
Image.fromarray(np.moveaxis(img, 0, -1), "RGBA").save(os.path.join(WEB, "changemap.png"))
sc = lambda a, lo, hi: (np.clip((np.nan_to_num(a, nan=lo) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
frames = []
for t, d in enumerate(dates):
    f = np.stack([sc(H[t], -22, -2), sc(V[t], -32, -10), sc(H[t] - V[t], 2, 16), np.where(np.isfinite(H[t]), 255, 0).astype(np.uint8)])
    img, _ = warp(f, Resampling.average, scale=2)
    name = f"radar_{d}.jpg"; Image.fromarray(np.ascontiguousarray(np.moveaxis(img, 0, -1)[..., :3])).save(os.path.join(WEB, name), quality=82); frames.append(name)
json.dump({"bounds": bb, "dates": dates, "frames": frames, "changemap": "changemap.png",
           "legend": [{"class": c, "name": nm, "color": col, "hectares": areas[nm]} for c, (nm, col) in legend.items()],
           "frame_colors": "R=HH, G=HV, B=HH-HV (dB)", "excluded_dates": ["2026-09-07 (radio interference)"],
           "source": "NISAR L2 GCOV, track 23 frame 73, L-band, 40 m"},
          open(os.path.join(WEB, "summary.json"), "w"), indent=1)
print("bounds [[south, west], [north, east]]:", bb)
print("web files:", sorted(os.listdir(WEB)), "| total MB:",
      round(sum(os.path.getsize(os.path.join(WEB, f)) for f in os.listdir(WEB)) / 2**20, 1))
