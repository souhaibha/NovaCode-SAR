import os, json, glob, numpy as np, h5py, warnings
warnings.simplefilter("ignore")
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
from affine import Affine
from PIL import Image

RAW = os.path.expanduser("~/data/gunw"); OUT = os.path.expanduser("~/data/souss"); WEB = "web"
meta = json.load(open(os.path.join(OUT, "meta40.json"))); S = meta["spacing"]
wc = np.load(os.path.join(OUT, "context.npz"))["wc"]; ny, nx = wc.shape
left = meta["x0"] - abs(meta["dx"]) / 2; top = meta["y0"] + abs(meta["dy"]) / 2
xc = left + (np.arange(nx) + .5) * S; yc = top - (np.arange(ny) + .5) * S
G = "science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram"
stack, used = [], []
for path in sorted(glob.glob(os.path.join(RAW, "*GUNW*.h5")), key=lambda p: os.path.basename(p).split("_")[11]):
    t = os.path.basename(path).split("_"); name = f"{t[11][:8]}->{t[13][:8]}"
    with h5py.File(path, "r") as f:
        g = G + "/HH" if "xCoordinates" in f[G + "/HH"] else G
        x = f[g + "/xCoordinates"][:]; y = f[g + "/yCoordinates"][:]
        ix = np.clip(np.round((xc - x[0]) / (x[1] - x[0])).astype(int), 0, len(x) - 1)
        iy = np.clip(np.round((yc - y[0]) / (y[1] - y[0])).astype(int), 0, len(y) - 1)
        coh = f[G + "/HH/coherenceMagnitude"][iy.min():iy.max() + 1, ix.min():ix.max() + 1][np.ix_(iy - iy.min(), ix - ix.min())]
    med = float(np.nanmedian(coh)); keep = med > 0.3
    print(name, f"median coherence {med:.2f}", "kept" if keep else "DROPPED")
    if keep: stack.append(coh); used.append(name)
cohm = np.nanmean(np.stack(stack), axis=0).astype(np.float32); cohmin = np.nanmin(np.stack(stack), axis=0).astype(np.float32)
names = {10: "trees", 20: "shrub", 30: "grass", 40: "cropland", 50: "built", 60: "bare", 80: "water"}
print("== MEAN COHERENCE BY LAND COVER (p10 p50 p90) ==")
for c, nm in names.items():
    if (wc == c).sum(): print(f"{nm:9}", " ".join(f"{np.nanpercentile(cohm[wc == c], q):.2f}" for q in (10, 50, 90)))
try:
    with rasterio.open(os.path.join(OUT, "changemap_v2.tif")) as d: cls = d.read(1)
    print("== MEAN COHERENCE BY CHANGE CLASS (median) ==")
    for c, nm in ((0, "stable"), (1, "vegetation gain"), (2, "vegetation loss"), (3, "other change, flat"), (7, "slope wetting")):
        if (cls == c).sum(): print(f"{nm:20} {np.nanmedian(cohm[cls == c]):.2f}   (cropland only: {np.nanmedian(cohm[(cls == c) & (wc == 40)]):.2f})")
except Exception as e:
    print("change map comparison skipped:", repr(e))
src = f"EPSG:{meta['epsg']}"; tfm = Affine(S, 0, left, 0, -S, top); bounds = (left, top - ny * S, left + nx * S, top)
with rasterio.open(os.path.join(OUT, "coherence.tif"), "w", driver="GTiff", height=ny, width=nx, count=2, dtype="float32",
                   crs=src, transform=tfm, compress="deflate", nodata=np.nan) as d:
    d.write(cohm, 1); d.write(cohmin, 2)
t, w, h = calculate_default_transform(src, "EPSG:3857", nx, ny, *bounds, dst_width=nx // 2, dst_height=ny // 2)
g = (np.clip(np.nan_to_num(cohm), 0, 1) * 255).astype(np.uint8)
arr = np.stack([g, g, g, np.where(np.isfinite(cohm), 255, 0).astype(np.uint8)]); out = np.zeros((4, h, w), np.uint8)
reproject(arr, out, src_transform=tfm, src_crs=src, dst_transform=t, dst_crs="EPSG:3857", resampling=Resampling.average)
Image.fromarray(np.moveaxis(out, 0, -1), "RGBA").save(os.path.join(WEB, "coherence.png"))
if os.path.exists(os.path.join(WEB, "deformation.png")): os.remove(os.path.join(WEB, "deformation.png"))
sp = os.path.join(WEB, "summary.json"); sm = json.load(open(sp)); sm.pop("deformation", None)
sm["coherence"] = {"file": "coherence.png", "meaning": "bright = surface unchanged between passes, dark = surface disturbed",
                   "pairs_used": used, "source": "NISAR L2 GUNW, HH, 80 m"}
sm["deformation_note"] = "Not included: over 108 days atmospheric noise (about 4 cm) exceeds any expected ground motion."
json.dump(sm, open(sp, "w"), indent=1)
print("saved coherence.tif and web/coherence.png; removed web/deformation.png; summary.json updated")
