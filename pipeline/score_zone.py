import os, sys, json, subprocess, numpy as np
name, event, edate = sys.argv[1:4]; p = os.path.expanduser(f"~/data/{name}")
for n in ("meta.json", "meta40.json"):
    m = json.load(open(os.path.join(p, n))); m["event"] = event; m["event_date"] = edate; json.dump(m, open(os.path.join(p, n), "w"), indent=1)
subprocess.run([sys.executable, os.path.expanduser("~/labels.py"), name], check=True)
y = np.load(os.path.join(p, "labels.npz"))["labels"]; pred = np.load(os.path.join(p, "pred.npy")); wc = np.load(os.path.join(p, "context.npz"))["wc"]
CL = ["stable", "vegetation gain", "vegetation loss", "burned", "flooded"]; k = (y < 5) & (wc != 80)
print(f"== TEST MODE {name}: model map vs independent reference ({event}) ==  class | n | precision | recall | F1")
for c in range(5):
    t = k & (y == c)
    if not t.any(): continue
    tp = (t & (pred == c)).sum(); pp = (k & (pred == c)).sum(); P = tp / max(pp, 1); R = tp / t.sum()
    print(f"   {CL[c]:16} {t.sum():8d} | {P:.2f} | {R:.2f} | {2 * P * R / max(P + R, 1e-9):.2f}")
