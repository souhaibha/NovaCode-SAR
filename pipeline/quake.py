import os, sys, json, re, numpy as np, h5py, warnings
warnings.simplefilter("ignore")
import asf_search as asf
from PIL import Image
site = sys.argv[1] if len(sys.argv) > 1 else "venezuela75"
OUT = os.path.expanduser(f"~/data/{site}"); RAW = os.path.join(OUT, "raw_gunw"); os.makedirs(RAW, exist_ok=True)
meta = json.load(open(os.path.join(OUT, "meta.json"))); S = meta["spacing"]; ny, nx = meta["ny"], meta["nx"]
left = meta["x0"] - abs(meta["dx"]) / 2; top = meta["y0"] + abs(meta["dy"]) / 2
xc = left + (np.arange(nx) + .5) * S; yc = top - (np.arange(ny) + .5) * S
EV = meta["event_date"].replace("-", ""); W, Sb, Eb, N = meta["bbox_lonlat"]; ha = S * S / 1e4
G = "science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram"
K = -(299792458 / 1229e6) / (4 * np.pi) * 100            # cm per radian (sign convention assumed)
session = asf.ASFSession().auth_with_token(open(os.path.expanduser("~/.edl_token")).read().strip())

res = asf.search(dataset="NISAR", processingLevel="GUNW", maxResults=3000,
                 intersectsWith=f"POLYGON(({W} {Sb},{Eb} {Sb},{Eb} {N},{W} {N},{W} {Sb}))")
pairs = {}
for r in res:
    p = r.properties
    m = re.search(r"_(\d{8})T\d+_\d{8}T\d+_(\d{8})T\d+_\d{8}T\d+_", p.get("fileName", ""))
    if p.get("processingLevel") != "GUNW" or not m: continue
    k = (p.get("pathNumber"), p.get("frameNumber"), *m.groups())
    if k not in pairs or (p.get("processingDate") or "") > (pairs[k].properties.get("processingDate") or ""): pairs[k] = r
co = sorted(k for k in pairs if k[2] < EV < k[3])
print("pairs spanning the event:", [f"track {k[0]} frame {k[1]} {k[2]}->{k[3]}" for k in co], flush=True)

def fetch(r):
    p = r.properties; path = os.path.join(RAW, p["fileName"])
    if not os.path.exists(path): asf.download_url(p["url"], path=RAW, session=session)
    return path
def read(path):
    with h5py.File(path, "r") as f:
        if int(f[G + "/projection"][()]) != meta["epsg"]: return None
        g = G + "/HH" if "xCoordinates" in f[G + "/HH"] else G
        x = f[g + "/xCoordinates"][:]; y = f[g + "/yCoordinates"][:]
        fx = (xc - x[0]) / (x[1] - x[0]); fy = (yc - y[0]) / (y[1] - y[0])
        inx = (fx >= 0) & (fx <= len(x) - 1); iny = (fy >= 0) & (fy <= len(y) - 1)
        if not inx.any() or not iny.any(): return None
        ix = np.clip(np.round(fx).astype(int), 0, len(x) - 1); iy = np.clip(np.round(fy).astype(int), 0, len(y) - 1)
        r = slice(iy[iny].min(), iy[iny].max() + 1); c = slice(ix[inx].min(), ix[inx].max() + 1)
        def get(n):
            a = f[G + "/HH/" + n][r, c].astype(np.float32)
            o = a[np.ix_(np.clip(iy - r.start, 0, a.shape[0] - 1), np.clip(ix - c.start, 0, a.shape[1] - 1))]
            o[~iny, :] = np.nan; o[:, ~inx] = np.nan; return o
        return dict(ph=get("unwrappedPhase"), coh=get("coherenceMagnitude"), cc=get("connectedComponents"),
                    ion=get("ionospherePhaseScreen"))

best, best_key, best_score = None, None, -1
print("pair | site covered % | median coherence | score")
for k in co:
    path = fetch(pairs[k]); d = read(path); os.remove(path)
    if d is None: print(k, "different projection or no overlap"); continue
    cov = np.isfinite(d["coh"]).mean(); mc = float(np.nanmedian(d["coh"])); sc = cov * mc
    print(f"track {k[0]} frame {k[1]} {k[2]}->{k[3]} | {100 * cov:.0f} | {mc:.2f} | {sc:.2f}", flush=True)
    if sc > best_score: best, best_key, best_score = d, k, sc
if best is None: sys.exit("no usable pair spanning the event")
pre_keys = sorted(k for k in pairs if k[:2] == best_key[:2] and k[3] <= EV)
print("chosen:", best_key, "| pre-event pairs on that track:", [f"{k[2]}->{k[3]}" for k in pre_keys[-3:]])
pre = None
for k in reversed(pre_keys[-3:]):
    path = fetch(pairs[k]); d = read(path); os.remove(path)
    if d is not None and np.nanmedian(d["coh"]) > .3: pre, pre_key = d, k; break
    print("pre-event pair", k, "too incoherent, trying an earlier one")

def los(d, use_ion):
    ph = d["ph"] - d["ion"] if use_ion else d["ph"].copy()
    v = d["cc"][(d["cc"] > 0) & (d["cc"] < 65535)]
    ok = np.isfinite(ph) & (d["coh"] > .3) & (d["cc"] == (np.bincount(v.astype(int)).argmax() if v.size else 1))
    l = K * ph; l[~ok] = np.nan; return l - np.nanmedian(l)
use_ion = True
if pre is not None:
    use_ion = np.nanstd(los(pre, True)) < np.nanstd(los(pre, False))
    lp = los(pre, use_ion)
    print(f"pre-event pair {pre_key[2]}->{pre_key[3]}: noise (std) {np.nanstd(lp):.2f} cm | ionosphere removed: {use_ion}")
lc = los(best, use_ion)
pc = lambda a: " ".join(f"{np.nanpercentile(a, q):+.1f}" for q in (1, 5, 50, 95, 99))
print(f"== DISPLACEMENT across the quake, cm along line of sight (p1 p5 p50 p95 p99): {pc(lc)}")
print(f"valid {100 * np.isfinite(lc).mean():.0f}% | area moved >5 cm: {(np.abs(lc) > 5).sum() * ha:.0f} ha | >10 cm: {(np.abs(lc) > 10).sum() * ha:.0f} ha")
dcoh = (pre["coh"] - best["coh"]) if pre is not None else np.full((ny, nx), np.nan, np.float32)
print(f"== COHERENCE: before {np.nanmedian(pre['coh']) if pre is not None else float('nan'):.2f}, across quake {np.nanmedian(best['coh']):.2f} | "
      f"area with drop >0.3: {(dcoh > .3).sum() * ha:.0f} ha | >0.5: {(dcoh > .5).sum() * ha:.0f} ha")

np.savez(os.path.join(OUT, "quake.npz"), los_co=lc, los_pre=lp if pre is not None else np.full_like(lc, np.nan),
         coh_co=best["coh"], coh_pre=pre["coh"] if pre is not None else np.full_like(lc, np.nan), dcoh=dcoh)
meta["quake"] = dict(coseismic=f"track {best_key[0]} frame {best_key[1]} {best_key[2]}->{best_key[3]}",
                     pre_event=f"{pre_key[2]}->{pre_key[3]}" if pre is not None else None, ionosphere_removed=bool(use_ion))
json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=1)

fin = np.isfinite(lc); R = max(5.0, float(np.nanpercentile(np.abs(lc), 99)))
z = np.clip(np.nan_to_num(lc) / R, -1, 1)
disp = np.stack([np.where(z < 0, 255, 255 * (1 - z)), 255 * (1 - np.abs(z)), np.where(z > 0, 255, 255 * (1 + z))], -1)
disp[~fin] = 40
h = np.mod(np.nan_to_num(lc), 12.2) / 12.2 * 6; i = np.floor(h).astype(int) % 6; fr = h - np.floor(h)
v = np.clip(np.nan_to_num(best["coh"]), .2, 1); q = v * (1 - fr); t = v * fr
rgb = np.select([(i == n)[..., None] for n in range(6)], [np.stack(c, -1) for c in
      [(v, t, 0 * v), (q, v, 0 * v), (0 * v, v, t), (0 * v, q, v), (t, 0 * v, v), (v, 0 * v, q)]])
rgb[~fin] = .15
g = (np.clip(np.nan_to_num(best["coh"]), 0, 1) * 200).astype(np.uint8); dc = np.stack([g, g, g], -1); dc[dcoh > .3] = (230, 40, 40)
for name, arr in ((f"{site}_displacement.png", disp.astype(np.uint8)), (f"{site}_fringes.png", (rgb * 255).astype(np.uint8)),
                  (f"{site}_coherence_loss.png", dc)):
    for dest in (os.path.join(OUT, name), name): Image.fromarray(arr).save(dest)
print("saved quake.npz and images; colour scale for displacement: +-", round(R, 1), "cm")
