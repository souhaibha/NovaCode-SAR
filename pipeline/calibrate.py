import os, json, numpy as np, warnings, joblib
warnings.simplefilter("ignore")
src = open(os.path.expanduser("~/train_multi.py")).read()
exec(src.split("Xtr, ytr, Xte, yte, ste, names")[0])          # reuse imports, load(), features(), report()
names = joblib.load(os.path.join(D, "multi_model.joblib"))["features"]
key = [names.index("cp_dHH"), names.index("HH_median"), names.index("HV_median")]
rs = np.random.default_rng(1); EV = range(1, NC)

def labels_only(site):
    p = os.path.join(D, site); c = np.load(os.path.join(p, "context.npz")); wc = c["wc"]
    if site == "souss":
        dN = c["ndvi_late"] - c["ndvi_early"]; y = np.full(wc.shape, 255, np.uint8)
        y[np.abs(dN) <= .05] = 0; y[dN > .15] = 1; y[dN < -.15] = 2
    else:
        f = os.path.join(p, "labels.npz"); y = np.load(f)["labels"] if os.path.exists(f) else np.full(wc.shape, 255, np.uint8)
    y[wc == 80] = 255; return y, wc
def blocks(ny, nx):
    br = np.arange(ny)[:, None] // 128; bc = np.arange(nx)[None, :] // 128; test = ((br + bc) % 4) == 0
    return test, test & (br % 2 == 0), test & (br % 2 == 1)        # all held-out, tuning half, scoring half
def take(Ff, y, mask, cap):
    idx = np.flatnonzero(mask.ravel())
    if len(idx) > cap: idx = rs.choice(idx, cap, replace=False)
    return Ff[:, idx].T, y.ravel()[idx]

Xtr, ytr, Xtu, ytu, Xev, yev, sev = [], [], [], [], [], [], []
for site in TRAIN:
    Fs = np.load(os.path.join(D, site, "feat.npy"), mmap_mode="r"); y, wc = labels_only(site); ny, nx = y.shape
    Ff = np.asarray(Fs).reshape(len(names), -1); valid = np.all(np.isfinite(np.asarray(Fs[key])), 0) & (wc > 0) & (wc != 80)
    test, tune, score = blocks(ny, nx)
    for c in range(NC):
        X, yy = take(Ff, y, valid & ~test & (y == c), 150_000)
        if len(yy): Xtr.append(X); ytr.append(yy)
    X, yy = take(Ff, y, valid & tune & (y < NC), 400_000); Xtu.append(X); ytu.append(yy)
    X, yy = take(Ff, y, valid & score & (y < NC), 400_000); Xev.append(X); yev.append(yy); sev += [site] * len(yy)
    print(site, "loaded", flush=True)
Xtr, ytr, Xtu, ytu, Xev, yev, sev = map(np.concatenate, (Xtr, ytr, Xtu, ytu, Xev, yev)) + (np.array(sev),) if False else \
    (np.concatenate(Xtr), np.concatenate(ytr), np.concatenate(Xtu), np.concatenate(ytu), np.concatenate(Xev), np.concatenate(yev), np.array(sev))
wfun = lambda y: (len(y) / (NC * np.maximum(np.bincount(y, minlength=NC), 1)))[y] ** 0.5      # milder (square-root) balancing
m = HGB(max_iter=300, learning_rate=0.1, max_leaf_nodes=63, random_state=0).fit(Xtr, ytr, sample_weight=wfun(ytr))

def decide(P, t):
    ev = np.where(P[:, 1:] >= t[1:], P[:, 1:], -1); best = ev.argmax(1)
    return np.where(ev.max(1) >= 0, best + 1, 0)
Ptu = m.predict_proba(np.nan_to_num(Xtu)); t = np.full(NC, .99)
print("== THRESHOLDS chosen on the tuning half (best F1 per class) ==")
for c in EV:
    if (ytu == c).sum() == 0: continue
    best = (0, .99)
    for th in np.arange(.3, .96, .05):
        pr = Ptu[:, c] >= th; tp = (pr & (ytu == c)).sum(); p = tp / max(pr.sum(), 1); r = tp / max((ytu == c).sum(), 1)
        f = 2 * p * r / max(p + r, 1e-9)
        if f > best[0]: best = (f, th)
    t[c] = best[1]; print(f"   {CLASSES[c]:16} threshold {t[c]:.2f} (tuning F1 {best[0]:.2f})")
Pev = m.predict_proba(np.nan_to_num(Xev))
report("SCORING HALF, before (plain argmax)", Pev.argmax(1), yev)
report("SCORING HALF, after (thresholds)", decide(Pev, t), yev)
for site in TRAIN: report(f"scoring half, {site}, after", decide(Pev[sev == site], t), yev[sev == site])

def predict_site(model, Fs, t):
    nf, ny, nx = Fs.shape; P = np.zeros((NC, ny, nx), np.uint8); pred = np.zeros((ny, nx), np.uint8)
    for r0 in range(0, ny, 256):
        X = np.asarray(Fs[:, r0:r0 + 256]).reshape(nf, -1).T; ok = np.all(np.isfinite(X[:, key]), 1)
        p = np.zeros((len(X), NC), np.float32)
        if ok.any(): p[ok] = model.predict_proba(np.nan_to_num(X[ok]))
        d = decide(p, t); d[~ok] = 0
        P[:, r0:r0 + 256] = (p.T.reshape(NC, -1, nx) * 100).astype(np.uint8); pred[r0:r0 + 256] = d.reshape(-1, nx)
    return P, pred

for site in UNSEEN:
    p = os.path.join(D, site)
    if not os.path.exists(os.path.join(p, "context.npz")): print("skip", site); continue
    _, H, V, y, wc, slope = load(site); Fs, _ = features(H, V, wc, slope); del H, V; np.save(os.path.join(p, "feat.npy"), Fs)
    P, pred = predict_site(m, Fs, t); land = (wc > 0) & (wc != 80) & (P.sum(0) > 0)
    k = land & (y < NC)
    if site.split("_")[0] in TRAIN: k &= blocks(*y.shape)[0]
    if k.sum(): report(f"UNSEEN {site}, after thresholds", pred[k], y[k])
    print(f"== UNSEEN {site}: predicted share of land:", " ".join(f"{CLASSES[c]} {100 * (pred[land] == c).mean():.2f}%" for c in range(NC)), flush=True)

Xa = np.concatenate([Xtr, np.nan_to_num(Xtu), np.nan_to_num(Xev)]); ya = np.concatenate([ytr, ytu, yev])
mf = HGB(max_iter=300, learning_rate=0.1, max_leaf_nodes=63, random_state=0).fit(Xa, ya, sample_weight=wfun(ya))
joblib.dump({"model": mf, "features": names, "classes": CLASSES, "thresholds": t.tolist()}, os.path.join(D, "multi_model.joblib"))
ha = lambda s: json.load(open(os.path.join(D, s, "meta40.json")))["spacing"] ** 2 / 1e4
for site in TRAIN + UNSEEN:
    f = os.path.join(D, site, "feat.npy")
    if not os.path.exists(f): continue
    P, pred = predict_site(mf, np.load(f, mmap_mode="r"), t)
    np.save(os.path.join(D, site, "proba.npy"), P); np.save(os.path.join(D, site, "pred.npy"), pred)
    print(f"final -> {site}:", " ".join(f"{CLASSES[c]} {(pred == c).sum() * ha(site):.0f} ha" for c in EV))
print("saved multi_model.joblib with thresholds", np.round(t, 2).tolist())
