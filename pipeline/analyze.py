import os, sys, json, argparse, subprocess, datetime as dt, collections, numpy as np, joblib, warnings
warnings.simplefilter("ignore")
import asf_search as asf
##
ap = argparse.ArgumentParser(description="Detect surface events in a zone and period from NISAR radar")
ap.add_argument("--name", required=True); ap.add_argument("--bbox", nargs=4, type=float, required=True, metavar=("W", "S", "E", "N"))
ap.add_argument("--start", required=True); ap.add_argument("--end", required=True); ap.add_argument("--earthquake-date"); ap.add_argument("--track", type=int); ap.add_argument("--frame", type=int)
a = ap.parse_args(); W, S, E, N = a.bbox; name = a.name.lower().replace(" ", "_")
OUT = os.path.expanduser(f"~/data/{name}"); os.makedirs(OUT, exist_ok=True); HOME = os.path.expanduser("~")
def status(state, step, done=None, total=None, msg=None):
    json.dump(dict(state=state, step=step, done=done, total=total, message=msg, time=dt.datetime.utcnow().isoformat()),
              open(os.path.join(OUT, "status.json"), "w")); print(f"[{state}] {step}" + (f" ({msg})" if msg else ""), flush=True)
def fail(msg): status("failed", "stopped", msg=msg); sys.exit(msg)

wkm = (E - W) * 111.32 * np.cos(np.radians((S + N) / 2)); hkm = (N - S) * 110.57
if wkm > 50 or hkm > 50: fail(f"Zone is {wkm:.0f} x {hkm:.0f} km; the limit is 50 x 50 km.")
status("searching", "Looking for NISAR passes over the zone")
res = asf.search(dataset="NISAR", processingLevel="GCOV", maxResults=3000, intersectsWith=f"POLYGON(({W} {S},{E} {S},{E} {N},{W} {N},{W} {S}))")
groups = collections.defaultdict(lambda: [set(), None]); CODES = collections.defaultdict(collections.Counter)
for r in res:
    p = r.properties; d = (p.get("startTime") or "")[:10]
    if p.get("processingLevel") != "GCOV" or not (a.start <= d <= a.end): continue
    k = (p.get("pathNumber"), p.get("frameNumber"))
    _m = __import__("re").search(r"_\d{4}_([A-Z]{2})[A-Z]{2}_", p.get("fileName", "")); _c = _m.group(1) if _m else "??"
    CODES[k][_c] += 1
    if _c in ("DH", "QP", "QD"): groups[k][0].add(d)
    from shapely.geometry import shape as _shape, box as _box
    _z = _box(W, S, E, N)
    try: ov = _shape(r.geometry).intersection(_z).area / _z.area
    except Exception: ov = 0.0
    groups[k][1] = max(groups[k][1] or 0, ov)
cands = sorted(((min(ov, 1), len(ds), k) for k, (ds, ov) in groups.items()), reverse=True)
for ov, n, k in cands[:5]: print(f"   track {k[0]} frame {k[1]}: {n} dual-pol dates, covers {100 * ov:.0f}% of the zone | pol codes {dict(CODES[k])}")
cands = [c for c in cands if c[1] >= 4]
if not cands: fail("No NISAR track has at least 4 passes over this zone in this period. Try a longer period.")
best = max(cands, key=lambda c: (c[0] >= .9, "SH" not in CODES[c[2]], c[1], c[0])); track, frame = best[2]
if a.track is not None:
    forced = [c for c in cands if c[2] == (a.track, a.frame)]
    if not forced: fail(f"Track {a.track} frame {a.frame} has no usable passes over this zone.")
    best = forced[0]; track, frame = best[2]
mid = dt.date.fromisoformat(a.start) + (dt.date.fromisoformat(a.end) - dt.date.fromisoformat(a.start)) / 2
cfg = dict(bbox=[W, S, E, N], track=track, frame=frame, start=a.start, end=a.end,
           event="earthquake" if a.earthquake_date else "unknown", event_date=a.earthquake_date or str(mid))
json.dump(cfg, open(os.path.join(OUT, "config.json"), "w"), indent=1)
status("downloading", f"Reading {best[1]} radar passes from track {track} frame {frame}", 0, best[1])
if subprocess.run([sys.executable, f"{HOME}/site_stack.py", name]).returncode: fail("Radar processing failed; see the log.")
status("processing", "Adding land cover and slope")
if subprocess.run([sys.executable, f"{HOME}/labels.py", name]).returncode: fail("Context step failed; see the log.")

status("predicting", "Running the multi-event model")
src = open(f"{HOME}/train_multi.py").read(); exec(src.split("Xtr, ytr, Xte, yte, ste, names")[0])
M = joblib.load(os.path.join(D, "multi_model.joblib")); model, names, t = M["model"], M["features"], np.array(M["thresholds"])
meta, H, V, y, wc, slope = load(name)
if H.shape[0] < 4: fail(f"Only {H.shape[0]} usable passes after removing bad dates; at least 4 are needed.")
Fs, nm = features(H, V, wc, slope); del H, V
assert nm == names, "feature mismatch with the trained model"
key = [names.index("cp_dHH"), names.index("HH_median"), names.index("HV_median")]
nf, ny, nx = Fs.shape; P = np.zeros((NC, ny, nx), np.uint8); pred = np.zeros((ny, nx), np.uint8)
for r0 in range(0, ny, 256):
    X = Fs[:, r0:r0 + 256].reshape(nf, -1).T; ok = np.all(np.isfinite(X[:, key]), 1); p = np.zeros((len(X), NC), np.float32)
    if ok.any(): p[ok] = model.predict_proba(np.nan_to_num(X[ok]))
    ev = np.where(p[:, 1:] >= t[1:], p[:, 1:], -1); d = np.where(ev.max(1) >= 0, ev.argmax(1) + 1, 0); d[~ok] = 0
    P[:, r0:r0 + 256] = (p.T.reshape(NC, -1, nx) * 100).astype(np.uint8); pred[r0:r0 + 256] = d.reshape(-1, nx)
np.save(os.path.join(OUT, "proba.npy"), P); np.save(os.path.join(OUT, "pred.npy"), pred)
land = (wc > 0) & (wc != 80); ha = meta["spacing"] ** 2 / 1e4
found = {CLASSES[c]: round(float((pred[land] == c).sum() * ha)) for c in range(1, NC)}
print("   detected (ha):", found)

if a.earthquake_date:
    status("processing", "Measuring ground motion from interferograms")
    if subprocess.run([sys.executable, f"{HOME}/quake.py", name]).returncode: print("   earthquake module failed; continuing without it")
json.dump(dict(name=a.name, story=f"Automatic analysis from {a.start} to {a.end}. Detected (ha): " +
               ", ".join(f"{k} {v}" for k, v in found.items() if v) + ".",
               evaluation={"note": "No reference map for this zone. Showcase test scores: burned F1 0.85 on an unseen track, "
                                   "flooded F1 0.84, vegetation change F1 0.39 to 0.48."}), open(os.path.join(OUT, "info.json"), "w"))
status("processing", "Writing map files for the app")
os.chdir(os.environ.get("SAR_WEB_ROOT", os.getcwd()))
if subprocess.run([sys.executable, f"{HOME}/export_sites.py", name]).returncode: fail("Export failed; see the log.")
status("done", f"Analysis ready in web/{name}/")
