import os
TARGET = "cambodia_t148"
src = open(os.path.expanduser("~/calibrate.py")).read()
exec(src.split("for site in UNSEEN:")[0])          # retrains the held-out model and its thresholds
_, H, V, y, wc, slope = load(TARGET); print(TARGET, "dates used:", H.shape[0], flush=True)
Fs, _ = features(H, V, wc, slope); del H, V
P, pred = predict_site(m, Fs, t)
land = (wc > 0) & (wc != 80) & (P.sum(0) > 0)
k = land & (y < NC) & blocks(*y.shape)[0]
report(f"UNSEEN {TARGET}: unseen track and unseen 5 km blocks", pred[k], y[k])
print("predicted share of land:", " ".join(f"{CLASSES[c]} {100 * (pred[land] == c).mean():.2f}%" for c in range(NC)))
