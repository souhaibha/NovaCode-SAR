import os, json, numpy as np, warnings, joblib
warnings.simplefilter("ignore")
from scipy import ndimage as ndi
from sklearn.ensemble import HistGradientBoostingClassifier as HGB
from sklearn.inspection import permutation_importance
D = os.path.expanduser("~/data")
CLASSES = ["stable", "vegetation gain", "vegetation loss", "burned", "flooded"]; NC = len(CLASSES)
TRAIN = ["souss", "cambodia", "avila"]; UNSEEN = ["avila_t23", "cambodia_t148", "venezuela75"]
rs = np.random.default_rng(0)

def load(site):
    p = os.path.join(D, site); meta = json.load(open(os.path.join(p, "meta40.json")))
    keep = [i for i, d in enumerate(meta["dates"]) if d not in set(meta.get("bad_dates", []))]
    H = np.asarray(np.load(os.path.join(p, "H40.npy"), mmap_mode="r")[keep], np.float32)
    V = np.asarray(np.load(os.path.join(p, "V40.npy"), mmap_mode="r")[keep], np.float32)
    c = np.load(os.path.join(p, "context.npz")); wc, slope = c["wc"], c["slope"]
    if site == "souss":
        dN = c["ndvi_late"] - c["ndvi_early"]; y = np.full(wc.shape, 255, np.uint8)
        y[np.abs(dN) <= .05] = 0; y[dN > .15] = 1; y[dN < -.15] = 2
    else:
        f = os.path.join(p, "labels.npz"); y = np.load(f)["labels"] if os.path.exists(f) else np.full(wc.shape, 255, np.uint8)
    y[wc == 80] = 255
    return meta, H, V, y, wc, slope

def features(H, V, wc, slope):
    T = H.shape[0]; F = {}
    for nm, A in (("HH", H), ("HV", V)):
        med = np.nanmedian(A, 0); dev = A - med
        F[nm + "_median"] = med; F[nm + "_std"] = np.nanstd(A, 0); F[nm + "_range"] = np.nanmax(A, 0) - np.nanmin(A, 0)
        F[nm + "_min_dev"] = np.nanmin(dev, 0); F[nm + "_max_dev"] = np.nanmax(dev, 0)
        F[nm + "_frac_below3"] = (dev < -3).sum(0) / T; F[nm + "_frac_above3"] = (dev > 3).sum(0) / T
    fin = np.isfinite(H) & np.isfinite(V); n = fin.astype(np.float32)
    cH = np.cumsum(np.where(fin, H, 0), 0); cV = np.cumsum(np.where(fin, V, 0), 0); cn = np.cumsum(n, 0)
    shp = H.shape[1:]; best = np.zeros(shp, np.float32); bdH, bdV, bH0, bH1, bV0, bV1 = (np.full(shp, np.nan, np.float32) for _ in range(6))
    for k in range(2, T - 1):
        nb = cn[k - 1]; na = cn[-1] - nb; ok = (nb >= 2) & (na >= 2)
        h0 = cH[k - 1] / np.maximum(nb, 1); h1 = (cH[-1] - cH[k - 1]) / np.maximum(na, 1)
        v0 = cV[k - 1] / np.maximum(nb, 1); v1 = (cV[-1] - cV[k - 1]) / np.maximum(na, 1)
        sc = np.hypot(h1 - h0, v1 - v0) * np.sqrt(nb * na / np.maximum(nb + na, 1)); up = ok & (sc > best)
        best[up] = sc[up]; bdH[up] = (h1 - h0)[up]; bdV[up] = (v1 - v0)[up]
        bH0[up] = h0[up]; bH1[up] = h1[up]; bV0[up] = v0[up]; bV1[up] = v1[up]
    sm = lambda a: ndi.uniform_filter(np.nan_to_num(a), 5)
    F.update(cp_dHH=bdH, cp_dHV=bdV, cp_score=best, cp_HH_before=bH0, cp_HH_after=bH1, cp_HV_before=bV0, cp_HV_after=bV1,
             cp_dratio=bdH - bdV, cp_dHH_5x5=sm(bdH), cp_dHV_5x5=sm(bdV), HHminusHV_median=F["HH_median"] - F["HV_median"],
             RVI_median=4 * 10 ** (F["HV_median"] / 10) / (10 ** (F["HH_median"] / 10) + 10 ** (F["HV_median"] / 10)),
             slope=slope, landcover=wc.astype(np.float32))
    names = list(F); return np.stack([F[k].astype(np.float32) for k in names]), names

def prf(pred, true):
    rows = []
    for c in range(NC):
        if (true == c).sum() == 0: continue
        tp = ((pred == c) & (true == c)).sum(); p = tp / max((pred == c).sum(), 1); r = tp / max((true == c).sum(), 1)
        rows.append((CLASSES[c], (true == c).sum(), p, r, 2 * p * r / max(p + r, 1e-9)))
    return rows
def report(title, pred, true):
    print(f"== {title} ==  class | n | precision | recall | F1")
    rows = prf(pred, true)
    for r in rows: print(f"   {r[0]:16} {r[1]:9d} | {r[2]:.2f} | {r[3]:.2f} | {r[4]:.2f}")
    ev = [r[4] for r in rows if r[0] != "stable"]
    if ev: print(f"   mean F1 over event classes: {np.mean(ev):.3f}")
    cm = np.zeros((NC, NC), int)
    for t, p in zip(true, pred): pass
    for c in range(NC):
        if (true == c).any(): print(f"   true {CLASSES[c]:16} -> predicted:", " ".join(f"{CLASSES[j][:6]}:{100 * ((pred == j) & (true == c)).sum() / (true == c).sum():.0f}%" for j in range(NC)))

Xtr, ytr, Xte, yte, ste, names = [], [], [], [], [], None
for site in TRAIN:
    meta, H, V, y, wc, slope = load(site); Fs, names = features(H, V, wc, slope); del H, V
    np.save(os.path.join(D, site, "feat.npy"), Fs)
    ny, nx = y.shape; Ff = Fs.reshape(len(names), -1)
    test = (((np.arange(ny)[:, None] // 128) + (np.arange(nx)[None, :] // 128)) % 4) == 0
    valid = np.all(np.isfinite(Fs[[names.index("cp_dHH"), names.index("HH_median"), names.index("HV_median")]]), 0) & (wc > 0) & (wc != 80)
    print(f"{site}: grid {ny}x{nx} | labelled px:", {CLASSES[c]: int((valid & (y == c)).sum()) for c in range(NC) if (valid & (y == c)).any()}, flush=True)
    for c in range(NC):
        idx = np.flatnonzero((valid & ~test & (y == c)).ravel())
        if len(idx): idx = rs.choice(idx, min(len(idx), 150_000), replace=False); Xtr.append(Ff[:, idx].T); ytr.append(np.full(len(idx), c, np.uint8))
    idx = np.flatnonzero((valid & test & (y < NC)).ravel())
    if len(idx) > 600_000: idx = rs.choice(idx, 600_000, replace=False)
    Xte.append(Ff[:, idx].T); yte.append(y.ravel()[idx]); ste += [site] * len(idx)
Xtr, ytr, Xte, yte, ste = np.concatenate(Xtr), np.concatenate(ytr), np.concatenate(Xte), np.concatenate(yte), np.array(ste)
cnt = np.bincount(ytr, minlength=NC); w = (len(ytr) / (NC * np.maximum(cnt, 1)))[ytr]
print("training samples per class:", dict(zip(CLASSES, cnt.tolist())), flush=True)
m = HGB(max_iter=300, learning_rate=0.1, max_leaf_nodes=63, random_state=0).fit(Xtr, ytr, sample_weight=w)
pt = m.predict(Xte)
report("HELD-OUT 5 km BLOCKS, all training sites", pt, yte)
for site in TRAIN: report(f"held-out blocks: {site}", pt[ste == site], yte[ste == site])
sub = rs.choice(len(yte), min(120_000, len(yte)), replace=False)
pi = permutation_importance(m, Xte[sub], yte[sub], scoring="f1_macro", n_repeats=3, random_state=0)
print("== FEATURE IMPORTANCE (drop in macro-F1) ==", ", ".join(f"{names[j]} {pi.importances_mean[j]:.3f}" for j in np.argsort(pi.importances_mean)[::-1][:12]))

def predict(model, Fs):
    nf, ny, nx = Fs.shape; P = np.zeros((NC, ny, nx), np.uint8)
    for r0 in range(0, ny, 256):
        X = Fs[:, r0:r0 + 256].reshape(nf, -1).T; ok = np.all(np.isfinite(X[:, [names.index("cp_dHH"), names.index("HH_median")]]), 1)
        p = np.zeros((len(X), NC), np.float32)
        if ok.any(): p[ok] = model.predict_proba(np.nan_to_num(X[ok]))
        P[:, r0:r0 + 256] = (p.T.reshape(NC, -1, nx) * 100).astype(np.uint8)
    return P

for site in UNSEEN:
    if not os.path.exists(os.path.join(D, site, "context.npz")): print(f"== UNSEEN {site}: no stack/context yet, skipped"); continue
    meta, H, V, y, wc, slope = load(site); Fs, _ = features(H, V, wc, slope); del H, V
    np.save(os.path.join(D, site, "feat.npy"), Fs)
    P = predict(m, Fs); pred = P.argmax(0); land = (wc > 0) & (wc != 80) & (P.sum(0) > 0)
    k = land & (y < NC)
    if site.split('_')[0] in TRAIN:
        ny, nx = y.shape; k &= (((np.arange(ny)[:, None] // 128) + (np.arange(nx)[None, :] // 128)) % 4) == 0
        print(f'   {site}: same area as a training site, scored only on its held-out blocks')
    if k.sum(): report(f"UNSEEN {site} (model never saw this track/zone)", pred[k], y[k])
    print(f"== UNSEEN {site}: predicted share of land:", " ".join(f"{CLASSES[c]} {100 * (pred[land] == c).mean():.2f}%" for c in range(NC)))

mf = HGB(max_iter=300, learning_rate=0.1, max_leaf_nodes=63, random_state=0)
Xa = np.concatenate([Xtr, np.nan_to_num(Xte)]); ya = np.concatenate([ytr, yte]); ca = np.bincount(ya, minlength=NC)
mf.fit(Xa, ya, sample_weight=(len(ya) / (NC * np.maximum(ca, 1)))[ya])
joblib.dump({"model": mf, "features": names, "classes": CLASSES}, os.path.join(D, "multi_model.joblib"))
for site in TRAIN + UNSEEN:
    f = os.path.join(D, site, "feat.npy")
    if not os.path.exists(f): continue
    P = predict(mf, np.load(f)); np.save(os.path.join(D, site, "proba.npy"), P); np.save(os.path.join(D, site, "pred.npy"), P.argmax(0).astype(np.uint8))
    print(f"final model -> {site}: saved pred.npy, proba.npy")
print("saved", os.path.join(D, "multi_model.joblib"))
