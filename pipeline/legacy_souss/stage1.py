import os, json, numpy as np, warnings
from PIL import Image
from pyproj import Transformer
from scipy import ndimage as ndi
warnings.simplefilter("ignore")

OUT = os.path.expanduser("~/data/souss")
meta = json.load(open(os.path.join(OUT, "meta.json")))
BAD = {"2026-09-07"}                                   # radio interference
keep = [i for i, d in enumerate(meta["dates"]) if d not in BAD]
dates = [meta["dates"][i] for i in keep]
hh = np.load(os.path.join(OUT, "hh.npy"), mmap_mode="r")
hv = np.load(os.path.join(OUT, "hv.npy"), mmap_mode="r")

K = 2                                                  # 20 m -> 40 m
def block(a, k=K):
    a = np.asarray(a[:a.shape[0] // k * k, :a.shape[1] // k * k])
    return np.nanmean(a.reshape(a.shape[0] // k, k, a.shape[1] // k, k), axis=(1, 3))
H = np.stack([10 * np.log10(block(hh[i])) for i in keep]).astype(np.float32)
V = np.stack([10 * np.log10(block(hv[i])) for i in keep]).astype(np.float32)
np.save(os.path.join(OUT, "H40.npy"), H); np.save(os.path.join(OUT, "V40.npy"), V)
print("stack:", H.shape, "dates:", dates)

lin_mean_db = lambda a: 10 * np.log10(np.nanmean(10 ** (a / 10), axis=0))
eH, lH, eV, lV = lin_mean_db(H[:3]), lin_mean_db(H[-3:]), lin_mean_db(V[:3]), lin_mean_db(V[-3:])
dH, dV = lH - eH, lV - eV                              # seasonal change, dB
mH, mV = np.nanmedian(H, axis=0), np.nanmedian(V, axis=0)
sV = np.nanstd(V, axis=0); sH = np.nanstd(H, axis=0)
land = mH > -18                                        # excludes open water and very smooth surfaces
print(f"land pixels: {100 * land.mean():.1f}%  (pixel = {(20 * K) ** 2 / 1e4:.2f} ha)")

pc = lambda a: " ".join(f"{np.nanpercentile(a[land], q):+.2f}" for q in (1, 5, 50, 95, 99))
print("== SEASONAL CHANGE late-early, land, dB: p1 p5 p50 p95 p99 ==")
print("dHH", pc(dH)); print("dHV", pc(dV))
for name, a in (("dHH", dH), ("dHV", dV)):
    print(name, " ".join(f">{t:+d}dB:{100 * (a[land] > t).mean():.2f}%  <{-t:+d}dB:{100 * (a[land] < -t).mean():.2f}%"
                         for t in (2, 3, 5)))
print("== TEMPORAL STD, land, dB: p1 p5 p50 p95 p99 ==")
print("HH", pc(sH)); print("HV", pc(sV))

print("== PER-DATE ANOMALY vs pixel median: % of land beyond +-3 dB ==")
for t, d in enumerate(dates):
    a, b = (H[t] - mH)[land], (V[t] - mV)[land]
    print(d, f"HH +:{100 * (a > 3).mean():.2f} -:{100 * (a < -3).mean():.2f}",
          f"| HV +:{100 * (b > 3).mean():.2f} -:{100 * (b < -3).mean():.2f}",
          f"| median HH {np.nanmedian(a):+.2f} HV {np.nanmedian(b):+.2f}")

tr = Transformer.from_crs(meta["epsg"], 4326, always_xy=True)
def lonlat(r, c):
    x = meta["x0"] + (c * K + (K - 1) / 2) * meta["dx"]; y = meta["y0"] + (r * K + (K - 1) / 2) * meta["dy"]
    return tr.transform(x, y)
def blobs(mask, title, n=12):
    mask = ndi.binary_opening(np.nan_to_num(mask).astype(bool), structure=np.ones((3, 3)))
    lab, k = ndi.label(mask)
    sizes = np.bincount(lab.ravel()); sizes[0] = 0
    print(f"== {title}: {k} areas, {mask.sum() * (20 * K) ** 2 / 1e4:.0f} ha total ==")
    print("lon | lat | ha | dHH | dHV | HH_before | HV_before")
    for i in np.argsort(sizes)[::-1][:n]:
        if sizes[i] == 0: break
        r, c = ndi.center_of_mass(mask, lab, i); lo, la = lonlat(r, c); s = lab == i
        print(f"{lo:.4f} | {la:.4f} | {sizes[i] * (20 * K) ** 2 / 1e4:.0f} | {np.nanmean(dH[s]):+.1f} | "
              f"{np.nanmean(dV[s]):+.1f} | {np.nanmean(eH[s]):.1f} | {np.nanmean(eV[s]):.1f}")
blobs((dH > 3) | (dV > 3), "INCREASE > 3 dB (June-July -> Oct-Nov)")
blobs((dH < -3) | (dV < -3), "DECREASE > 3 dB (June-July -> Oct-Nov)")

np.savez(os.path.join(OUT, "stage1.npz"), dH=dH, dV=dV, sH=sH, sV=sV, mH=mH, mV=mV, eH=eH, lH=lH, eV=eV, lV=lV)
json.dump({**meta, "dates": dates, "K": K, "spacing": 20 * K}, open(os.path.join(OUT, "meta40.json"), "w"), indent=1)

sc = lambda a, lo, hi: np.clip((np.nan_to_num(a, nan=lo) - lo) / (hi - lo), 0, 1)
def save(name, arr):
    img = Image.fromarray((arr * 255).astype(np.uint8))
    for dest in (os.path.join(OUT, name), name): img.save(dest)
save("change_HH.png", np.dstack([sc(eH, -22, -2), sc(lH, -22, -2), sc(lH, -22, -2)]))   # red = decreased, cyan = increased
save("change_HV.png", np.dstack([sc(eV, -32, -10), sc(lV, -32, -10), sc(lV, -32, -10)]))
save("variability_HV.png", sc(sV, 0, 3))                                                # bright = changes a lot over time
print("saved change_HH.png, change_HV.png, variability_HV.png in", os.getcwd())
