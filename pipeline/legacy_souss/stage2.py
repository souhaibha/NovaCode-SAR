import os, json, numpy as np, warnings, datetime as dt
warnings.simplefilter("ignore")
from scipy import ndimage as ndi
from sklearn.ensemble import HistGradientBoostingClassifier as HGB
from sklearn.inspection import permutation_importance
import joblib, rasterio
from affine import Affine
from PIL import Image

OUT = os.path.expanduser("~/data/souss")
meta = json.load(open(os.path.join(OUT, "meta40.json")))
H = np.load(os.path.join(OUT, "H40.npy")); V = np.load(os.path.join(OUT, "V40.npy"))
s1 = np.load(os.path.join(OUT, "stage1.npz")); cx = np.load(os.path.join(OUT, "context.npz"))
dH, dV, eH, lH, eV, lV, mH, mV, sH, sV = (s1[k] for k in "dH dV eH lH eV lV mH mV sH sV".split())
wc, slope = cx["wc"], cx["slope"]; dN = cx["ndvi_late"] - cx["ndvi_early"]
ny, nx = dH.shape

# ---------- radar features ----------
d0 = dt.date.fromisoformat(meta["dates"][0])
days = np.array([(dt.date.fromisoformat(d) - d0).days for d in meta["dates"]], np.float32); dc = days - days.mean()
def series(A):
    A0 = np.nan_to_num(A - np.nanmean(A, axis=0))
    trend = (np.tensordot(dc, A0, axes=(0, 0)) / (dc ** 2).sum() * 30).astype(np.float32)   # dB per 30 days
    D = np.nan_to_num(np.diff(A, axis=0)); i = np.abs(D).argmax(axis=0)
    return trend, np.take_along_axis(D, i[None], 0)[0], i.astype(np.float32), np.nanmax(A, 0) - np.nanmin(A, 0)
tH, stH, iH, rH = series(H); tV, stV, iV, rV = series(V)
lin = lambda x: 10 ** (x / 10); rvi = lambda h, v: 4 * lin(v) / (lin(h) + lin(v))
sm = lambda a: ndi.uniform_filter(np.nan_to_num(a), 5)
feats = [("dHH", dH, "HH"), ("HH_early", eH, "HH"), ("HH_late", lH, "HH"), ("HH_median", mH, "HH"), ("HH_std", sH, "HH"),
         ("HH_range", rH, "HH"), ("HH_trend", tH, "HH"), ("HH_step", stH, "HH"), ("HH_step_date", iH, "HH"), ("dHH_5x5", sm(dH), "HH"),
         ("dHV", dV, "HV"), ("HV_early", eV, "HV"), ("HV_late", lV, "HV"), ("HV_median", mV, "HV"), ("HV_std", sV, "HV"),
         ("HV_range", rV, "HV"), ("HV_trend", tV, "HV"), ("HV_step", stV, "HV"), ("HV_step_date", iV, "HV"), ("dHV_5x5", sm(dV), "HV"),
         ("d_ratio_HH-HV", (lH - lV) - (eH - eV), "both"), ("RVI_early", rvi(eH, eV), "both"), ("RVI_late", rvi(lH, lV), "both"),
         ("dRVI", rvi(lH, lV) - rvi(eH, eV), "both"),
         ("slope", slope, "ctx"), ("landcover", wc.astype(np.float32), "ctx")]
names = [f[0] for f in feats]; grp = np.array([f[2] for f in feats])
F = np.stack([f[1] for f in feats]).astype(np.float32); Ff = F.reshape(len(feats), -1)
del H, V

# ---------- labels from Sentinel-2 NDVI change, spatial hold-out ----------
land = (wc > 0) & (wc != 80) & np.isfinite(dN) & np.isfinite(dH) & np.isfinite(dV)
y = np.zeros((ny, nx), np.uint8); y[dN > .15] = 1; y[dN < -.15] = 2            # 0 stable, 1 gain, 2 loss
clean = (np.abs(dN) <= .05) | (np.abs(dN) > .15)                               # training drops ambiguous pixels
B = 128                                                                        # 5 km blocks, 1 in 4 held out
test = ((np.arange(ny)[:, None] // B + np.arange(nx)[None, :] // B) % 4) == 0
rs = np.random.default_rng(0)
idx = np.flatnonzero((land & ~test & clean).ravel()); yt = y.ravel()[idx]
st = idx[yt == 0]; keep = rs.choice(st, min(len(st), 2_000_000), replace=False)
idx = np.concatenate([keep, idx[yt != 0]]); ytr = y.ravel()[idx]
w = np.where(ytr == 0, len(st) / len(keep), 1.0)                               # restore true class balance
Xtr = Ff[:, idx].T
ite = np.flatnonzero((land & test).ravel()); Xte = Ff[:, ite].T; yte = y.ravel()[ite]
print(f"train px {len(idx)} (gain {(ytr == 1).sum()}, loss {(ytr == 2).sum()}) | test px {len(ite)} "
      f"(gain {(yte == 1).sum()}, loss {(yte == 2).sum()})")

def score(pred, true):
    out = []
    for c in (1, 2):
        tp = ((pred == c) & (true == c)).sum(); fp = ((pred == c) & (true != c)).sum(); fn = ((pred != c) & (true == c)).sum()
        p, r = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
        out.append((p, r, 2 * p * r / max(p + r, 1e-9), tp / max(tp + fp + fn, 1)))
    return out
def show(name, pred, true):
    s = score(pred, true)
    print(f"{name:22} gain P={s[0][0]:.2f} R={s[0][1]:.2f} F1={s[0][2]:.2f} IoU={s[0][3]:.2f} | "
          f"loss P={s[1][0]:.2f} R={s[1][1]:.2f} F1={s[1][2]:.2f} IoU={s[1][3]:.2f} | meanF1={(s[0][2] + s[1][2]) / 2:.3f}")

inc, dec = (dH > 3) | (dV > 3), (dH < -3) | (dV < -3)
rule = np.zeros((ny, nx), np.uint8); rule[inc] = 1; rule[dec] = 2
print("== HELD-OUT TEST, all land ==")
show("rule 3 dB", rule.ravel()[ite], yte)
models = {}
for name, groups in (("model HH only", ["HH"]), ("model HV only", ["HV"]), ("model HH+HV", ["HH", "HV", "both"]),
                     ("model HH+HV+context", ["HH", "HV", "both", "ctx"])):
    cols = np.flatnonzero(np.isin(grp, groups))
    m = HGB(max_iter=200, learning_rate=0.1, random_state=0).fit(Xtr[:, cols], ytr, sample_weight=w)
    models[name] = (m, cols); show(name, m.predict(Xte[:, cols]), yte)
model, cols = models["model HH+HV+context"]
crop = wc.ravel()[ite] == 40
print("== HELD-OUT TEST, cropland only ==")
show("rule 3 dB", rule.ravel()[ite][crop], yte[crop]); show("model HH+HV+context", model.predict(Xte[crop][:, cols]), yte[crop])
pr = model.predict_proba(Xte[:, cols])
print("== PRECISION / RECALL BY PROBABILITY THRESHOLD (full model, all land) ==")
for c, nm in ((1, "gain"), (2, "loss")):
    for t in (.3, .5, .7, .9):
        k = pr[:, c] > t; tp = (k & (yte == c)).sum()
        print(f"{nm} p>{t}: P={tp / max(k.sum(), 1):.2f} R={tp / max((yte == c).sum(), 1):.2f}", end=" | ")
    print()
sub = rs.choice(len(ite), min(150_000, len(ite)), replace=False)
pi = permutation_importance(model, Xte[sub][:, cols], yte[sub], scoring="f1_macro", n_repeats=3, random_state=0)
print("== FEATURE IMPORTANCE (drop in macro-F1 when shuffled) ==")
for j in np.argsort(pi.importances_mean)[::-1][:12]:
    print(f"{names[cols[j]]:16} {pi.importances_mean[j]:.4f}")

# ---------- full map ----------
pg = np.zeros((ny, nx), np.float32); pl = np.zeros((ny, nx), np.float32)
for r0 in range(0, ny, 256):
    p = model.predict_proba(F[cols, r0:r0 + 256].reshape(len(cols), -1).T)
    pg[r0:r0 + 256] = p[:, 1].reshape(-1, nx); pl[r0:r0 + 256] = p[:, 2].reshape(-1, nx)
cls = np.zeros((ny, nx), np.uint8)
cls[inc | dec] = 3; cls[pg >= .5] = 1; cls[pl >= .5] = 2; cls[wc == 80] = 4
labels = {0: "stable", 1: "vegetation gain", 2: "vegetation loss", 3: "other surface change", 4: "water"}
ha = (meta["spacing"] ** 2) / 1e4
print("== FINAL MAP ==")
for c, nm in labels.items():
    print(f"{nm:22} {(cls == c).sum() * ha:10.0f} ha  {100 * (cls == c).mean():.2f}%")
wcn = {10: "trees", 20: "shrub", 30: "grass", 40: "cropland", 50: "built", 60: "bare"}
print("other surface change by land cover:", " ".join(f"{n}:{100 * ((cls == 3) & (wc == c)).sum() / max((cls == 3).sum(), 1):.0f}%"
                                                         for c, n in wcn.items()))
tfm = Affine(meta["spacing"], 0, meta["x0"] - abs(meta["dx"]) / 2, 0, -meta["spacing"], meta["y0"] + abs(meta["dy"]) / 2)
kw = dict(driver="GTiff", height=ny, width=nx, dtype="uint8", crs=f"EPSG:{meta['epsg']}", transform=tfm, compress="deflate")
with rasterio.open(os.path.join(OUT, "changemap.tif"), "w", count=1, **kw) as d:
    d.write(cls, 1)
with rasterio.open(os.path.join(OUT, "probability.tif"), "w", count=2, **kw) as d:
    d.write((pg * 100).astype(np.uint8), 1); d.write((pl * 100).astype(np.uint8), 2)
g = (np.clip((np.nan_to_num(mH, nan=-22) + 22) / 20, 0, 1) * 200).astype(np.uint8); rgb = np.dstack([g, g, g])
for c, col in ((1, (40, 200, 60)), (2, (230, 50, 50)), (3, (250, 200, 40)), (4, (40, 90, 220))):
    rgb[cls == c] = col
for dest in (os.path.join(OUT, "changemap.png"), "changemap.png"):
    Image.fromarray(rgb).save(dest)
joblib.dump({"model": model, "features": [names[j] for j in cols]}, os.path.join(OUT, "stage2_model.joblib"))
print("saved changemap.tif, probability.tif, changemap.png, stage2_model.joblib in", OUT)
