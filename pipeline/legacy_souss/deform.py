import os, json, shutil, numpy as np, h5py, warnings
warnings.simplefilter("ignore")
import asf_search as asf, rasterio
from scipy import ndimage as ndi
from pyproj import Transformer
from PIL import Image
from rasterio.warp import calculate_default_transform, reproject, Resampling
from affine import Affine
from datetime import date

RAW = os.path.expanduser("~/data/gunw"); OUT = os.path.expanduser("~/data/souss"); WEB = "web"
os.makedirs(RAW, exist_ok=True); os.makedirs(WEB, exist_ok=True)
meta = json.load(open(os.path.join(OUT, "meta40.json"))); S = meta["spacing"]
cx = np.load(os.path.join(OUT, "context.npz")); wc, dem, slope = cx["wc"], cx["dem"], cx["slope"]
ny, nx = wc.shape; ha = S * S / 1e4
left = meta["x0"] - abs(meta["dx"]) / 2; top = meta["y0"] + abs(meta["dy"]) / 2
xc = left + (np.arange(nx) + .5) * S; yc = top - (np.arange(ny) + .5) * S
G = "science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram"
LAM = 299792458 / 1229000000.0; K = -LAM / (4 * np.pi) * 100      # cm per radian; positive = toward satellite (assumed)

# ---- download the chain ----
session = asf.ASFSession().auth_with_token(open(os.path.expanduser("~/.edl_token")).read().strip())
res = asf.search(dataset="NISAR", processingLevel="GUNW", intersectsWith="POINT(-8.877 30.470)", maxResults=1000)
res = [r for r in res if r.properties.get("processingLevel") == "GUNW" and r.properties.get("pathNumber") == 23]
res.sort(key=lambda r: r.properties["fileName"].split("_")[11])
print("disk free GB:", shutil.disk_usage(RAW).free // 2**30, "| pairs:", len(res))
paths = []
for r in res:
    p = r.properties; n = p["fileName"]; path = os.path.join(RAW, n)
    want = (p.get("bytes") or {}).get(n, {}).get("bytes")
    if os.path.exists(path) and want and os.path.getsize(path) != want: os.remove(path)
    if not os.path.exists(path):
        print("downloading", n.split("_")[11][:8], "->", n.split("_")[13][:8], flush=True)
        asf.download_url(p["url"], path=RAW, session=session)
    paths.append(path)

def read(path):
    with h5py.File(path, "r") as f:
        g = G + "/HH" if "xCoordinates" in f[G + "/HH"] else G
        x = f[g + "/xCoordinates"][:]; y = f[g + "/yCoordinates"][:]
        ix = np.clip(np.round((xc - x[0]) / (x[1] - x[0])).astype(int), 0, len(x) - 1)
        iy = np.clip(np.round((yc - y[0]) / (y[1] - y[0])).astype(int), 0, len(y) - 1)
        r = slice(iy.min(), iy.max() + 1); c = slice(ix.min(), ix.max() + 1)
        get = lambda n: f[G + "/HH/" + n][r, c][np.ix_(iy - iy.min(), ix - ix.min())]
        return get("unwrappedPhase"), get("coherenceMagnitude"), get("connectedComponents"), get("ionospherePhaseScreen")

rs = np.random.default_rng(0); Hn = dem / 1000.0
rampx = (np.arange(nx) / nx)[None, :]; rampy = (np.arange(ny) / ny)[:, None]
stable_lc = np.isin(wc, [20, 30, 60]); crop = wc == 40
D, days, cohs, noise, names = [], [], [], [], []
print("pair | days | coherence median all/cropland | valid % | iono removed | noise on stable land before->after cm | cropland std cm")
for path in paths:
    t = os.path.basename(path).split("_"); a, b = t[11][:8], t[13][:8]
    nd = (date(int(b[:4]), int(b[4:6]), int(b[6:])) - date(int(a[:4]), int(a[4:6]), int(a[6:]))).days
    ph, coh, cc, ion = read(path)
    v = cc[(cc > 0) & (cc < 65535)]
    ok = np.isfinite(ph) & (coh > 0.3) & (cc == (np.bincount(v).argmax() if v.size else 1))
    st = ok & stable_lc
    s_raw = np.nanstd(ph[st]); s_ion = np.nanstd((ph - ion)[st & np.isfinite(ion)])
    use = bool(s_ion < s_raw)
    if use: ph = ph - ion
    idx = np.flatnonzero((st & np.isfinite(ph)).ravel()); sub = rs.choice(idx, min(len(idx), 200_000), replace=False)
    rr, c2 = np.unravel_index(sub, (ny, nx))
    A = np.c_[np.ones(len(sub)), c2 / nx, rr / ny, Hn.ravel()[sub]]
    k = np.linalg.lstsq(A, ph.ravel()[sub], rcond=None)[0]
    ph = ph - (k[0] + k[1] * rampx + k[2] * rampy + k[3] * Hn); ph[~ok | ~np.isfinite(ph)] = np.nan
    d = (K * ph).astype(np.float32)
    D.append(d); days.append(nd); cohs.append(coh); noise.append(float(np.nanstd(d[st]))); names.append(f"{a}->{b}")
    print(f"{a}->{b} | {nd} | {np.nanmedian(coh):.2f}/{np.nanmedian(coh[crop]):.2f} | {100 * ok.mean():.0f} | {use} | "
          f"{abs(K) * s_raw:.2f}->{noise[-1]:.2f} | {np.nanstd(d[ok & crop]):.2f}")

good = [i for i in range(len(D)) if noise[i] <= 2 * np.median(noise)]
print("pairs kept:", [names[i] for i in good], "| dropped:", [names[i] for i in range(len(D)) if i not in good])
def combine(ids, need):
    st = np.stack([D[i] for i in ids]); fin = np.isfinite(st)
    den = sum(days[i] * fin[j] for j, i in enumerate(ids)).astype(np.float32)
    rate = np.nansum(st, axis=0) / np.where(den > 0, den, np.nan)
    rate[fin.sum(axis=0) < need] = np.nan
    return rate                                                     # cm per day
total = sum(days[i] for i in good)
cum = combine(good, max(3, len(good) - 2)) * total                   # cm over the observed period
def smooth(a, n=11):
    w = ndi.uniform_filter(np.isfinite(a).astype(np.float32), n)
    return np.where(w > .5, ndi.uniform_filter(np.nan_to_num(a), n) / np.maximum(w, 1e-6), np.nan)
cs = smooth(cum); flat = slope < 5
sig = float(np.nanstd(cs[stable_lc & flat]))
print(f"== MOTION OVER {total} DAYS, cm along line of sight (smoothed 440 m) ==")
print(f"valid: all {100 * np.isfinite(cum).mean():.0f}%  cropland {100 * np.isfinite(cum[crop]).mean():.0f}%")
for nm, m in (("stable flat land", stable_lc & flat), ("cropland", crop), ("built", wc == 50)):
    print(f"{nm:17} p1 p5 p50 p95 p99:", " ".join(f"{np.nanpercentile(cs[m], q):+.2f}" for q in (1, 5, 50, 95, 99)))
print(f"noise level (std on stable flat land): {sig:.2f} cm")
h = len(good) // 2
r1, r2 = smooth(combine(good[:h], max(2, h - 1))), smooth(combine(good[h:], max(2, len(good) - h - 1)))
for nm, m in (("cropland", crop), ("stable flat land", stable_lc & flat)):
    v = m & np.isfinite(r1) & np.isfinite(r2)
    print(f"split-half correlation, {nm}: {np.corrcoef(r1[v], r2[v])[0, 1]:+.3f}  ({v.sum()} px)")
tr = Transformer.from_crs(meta["epsg"], 4326, always_xy=True)
for title, mask in (("AWAY from satellite (possible sinking)", cs < -2.5 * sig), ("TOWARD satellite", cs > 2.5 * sig)):
    mask = ndi.binary_opening(np.nan_to_num(mask).astype(bool) & flat, structure=np.ones((5, 5)))
    lab, n = ndi.label(mask); sz = np.bincount(lab.ravel()); sz[0] = 0
    print(f"== {title}: beyond 2.5 x noise, {n} areas, {mask.sum() * ha:.0f} ha ==")
    for i in np.argsort(sz)[::-1][:8]:
        if sz[i] == 0: break
        r, c = ndi.center_of_mass(mask, lab, i); s = lab == i
        lo, la = tr.transform(left + (c + .5) * S, top - (r + .5) * S)
        print(f"{lo:.4f} | {la:.4f} | {sz[i] * ha:.0f} ha | {np.nanmean(cs[s]):+.2f} cm | 1st half {np.nanmean(r1[s]) * total:+.2f} "
              f"2nd half {np.nanmean(r2[s]) * total:+.2f} | cropland {100 * crop[s].mean():.0f}%")

# ---- save and export ----
cohm = np.nanmean(np.stack([cohs[i] for i in good]), axis=0).astype(np.float32)
src = f"EPSG:{meta['epsg']}"; tfm = Affine(S, 0, left, 0, -S, top); bounds = (left, top - ny * S, left + nx * S, top)
with rasterio.open(os.path.join(OUT, "deformation.tif"), "w", driver="GTiff", height=ny, width=nx, count=2, dtype="float32",
                   crs=src, transform=tfm, compress="deflate", nodata=np.nan) as d:
    d.write(cs.astype(np.float32), 1); d.write(cohm, 2)
def warp(arr):
    t, w, hh = calculate_default_transform(src, "EPSG:3857", nx, ny, *bounds, dst_width=nx // 2, dst_height=ny // 2)
    out = np.zeros((arr.shape[0], hh, w), np.uint8)
    reproject(arr, out, src_transform=tfm, src_crs=src, dst_transform=t, dst_crs="EPSG:3857", resampling=Resampling.nearest)
    return np.moveaxis(out, 0, -1)
R = 3.0; z = np.clip(np.nan_to_num(cs) / R, -1, 1); fin = np.isfinite(cs)
rgba = np.stack([np.where(z < 0, 255, 255 * (1 - z)), 255 * (1 - np.abs(z)), np.where(z > 0, 255, 255 * (1 + z)),
                 np.where(fin, 255, 0)]).astype(np.uint8)            # red = away (sinking), blue = toward, white = none
Image.fromarray(warp(rgba), "RGBA").save(os.path.join(WEB, "deformation.png"))
g = (np.clip(np.nan_to_num(cohm), 0, 1) * 255).astype(np.uint8)
Image.fromarray(warp(np.stack([g, g, g, np.where(np.isfinite(cohm), 255, 0).astype(np.uint8)])), "RGBA").save(os.path.join(WEB, "coherence.png"))
sp = os.path.join(WEB, "summary.json"); sm = json.load(open(sp)) if os.path.exists(sp) else {}
sm["deformation"] = {"file": "deformation.png", "coherence_file": "coherence.png", "units": "cm along radar line of sight",
                     "color_scale_cm": [-R, R], "colors": "red = away from satellite, blue = toward, white = no motion",
                     "period": [names[good[0]].split("->")[0], names[good[-1]].split("->")[1]], "days_used": total,
                     "pairs_used": [names[i] for i in good], "noise_cm": round(sig, 2)}
json.dump(sm, open(sp, "w"), indent=1)
print("saved deformation.tif, web/deformation.png, web/coherence.png; summary.json updated")
