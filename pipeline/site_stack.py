import os, sys, json, time, numpy as np, h5py, warnings
warnings.simplefilter("ignore")
import asf_search as asf
from pyproj import Transformer
from PIL import Image

SITES = {   # bbox = (west, south, east, north)
 "cambodia":     dict(bbox=(104.4, 12.1, 105.4, 13.1), track=83,  frame=8,  start="2026-06-01", end="2026-11-14", event="flood",      event_date="2026-09-27"),
 "cambodia_t148":dict(bbox=(104.4, 12.1, 105.4, 13.1), track=148, frame=82, start="2026-06-01", end="2026-11-14", event="flood",      event_date="2026-09-27"),
 "avila":        dict(bbox=(-5.1, 40.2, -4.4, 40.65),  track=87,  frame=22, start="2026-06-01", end="2026-10-31", event="fire",       event_date="2026-07-22"),
 "avila_t23":    dict(bbox=(-5.1, 40.2, -4.4, 40.65),  track=23,  frame=68, start="2026-06-01", end="2026-10-31", event="fire",       event_date="2026-07-22"),
 "venezuela75":  dict(bbox=(-67.6, 10.3, -66.7, 10.75),track=126, frame=83, start="2026-05-01", end="2026-10-31", event="earthquake", event_date="2026-06-24"),
 "venezuela72":  dict(bbox=(-68.9, 10.1, -68.2, 10.6), track=54,  frame=83, start="2026-05-01", end="2026-10-31", event="earthquake", event_date="2026-06-24"),
}
site = sys.argv[1]; keep_raw = "--keep-raw" in sys.argv
cfg = SITES[site] if site in SITES else json.load(open(os.path.expanduser(f"~/data/{site}/config.json")))
OUT = os.path.expanduser(f"~/data/{site}"); RAW = os.path.join(OUT, "raw"); os.makedirs(RAW, exist_ok=True)
G = "science/LSAR/GCOV/grids/frequencyA"; W, S, E, N = cfg["bbox"]
session = asf.ASFSession().auth_with_token(open(os.path.expanduser("~/.edl_token")).read().strip())

# ---- 1. one GCOV per date on the chosen track/frame ----
wkt = f"POLYGON(({W} {S},{E} {S},{E} {N},{W} {N},{W} {S}))"
res = asf.search(dataset="NISAR", processingLevel="GCOV", intersectsWith=wkt, maxResults=3000)
by_date = {}
for r in res:
    p = r.properties
    if p.get("processingLevel") != "GCOV" or p.get("pathNumber") != cfg["track"] or p.get("frameNumber") != cfg["frame"]:
        continue
    d = (p.get("startTime") or "")[:10]
    _m = __import__("re").search(r"_\d{4}_([A-Z]{2})[A-Z]{2}_", p.get("fileName", ""))
    if _m and _m.group(1) not in ("DH", "QP", "QD"): continue
    if cfg["start"] <= d <= cfg["end"] and (d not in by_date or (p.get("processingDate") or "") > (by_date[d].properties.get("processingDate") or "")):
        by_date[d] = r
dates = sorted(by_date)
print(f"== {site}: {cfg['event']} on {cfg['event_date']} | track {cfg['track']} frame {cfg['frame']} | {len(dates)} dates:", dates, flush=True)
if len(dates) < 4: sys.exit("too few dates, stopping")

def fetch(r):
    p = r.properties; name = p["fileName"]; path = os.path.join(RAW, name)
    want = (p.get("bytes") or {}).get(name, {}).get("bytes")
    if os.path.exists(path) and want and os.path.getsize(path) != want: os.remove(path)
    for k in range(3):
        if os.path.exists(path): return path
        try: asf.download_url(p["url"], path=RAW, session=session)
        except Exception as e: print("   download retry", k + 1, repr(e)[:150], flush=True); time.sleep(15)
    if not os.path.exists(path): raise RuntimeError("download failed: " + name)
    return path

# ---- 2. crop window on the first file's grid ----
first = fetch(by_date[dates[0]])
with h5py.File(first, "r") as f:
    epsg = int(f[G + "/projection"][()]); x = f[G + "/xCoordinates"][:]; y = f[G + "/yCoordinates"][:]
    dx = float(f[G + "/xCoordinateSpacing"][()]); dy = float(f[G + "/yCoordinateSpacing"][()])
tr = Transformer.from_crs(4326, epsg, always_xy=True); t = np.linspace(0, 1, 21)
X, Y = tr.transform(np.r_[W + (E - W) * t, np.full(21, E), E - (E - W) * t, np.full(21, W)],
                    np.r_[np.full(21, S), S + (N - S) * t, np.full(21, N), N - (N - S) * t])
c0 = max(int(np.floor((X.min() - x[0]) / dx)), 0); c1 = min(int(np.ceil((X.max() - x[0]) / dx)), len(x))
r0 = max(int(np.floor((Y.max() - y[0]) / dy)), 0); r1 = min(int(np.ceil((Y.min() - y[0]) / dy)), len(y))
nx = (c1 - c0) // 2 * 2; ny = (r1 - r0) // 2 * 2; X0, Y0 = float(x[c0]), float(y[r0])
print(f"EPSG:{epsg} | crop {ny} x {nx} px at 20 m -> {ny // 2} x {nx // 2} at 40 m", flush=True)
T = len(dates)
H = np.lib.format.open_memmap(os.path.join(OUT, "H40.npy"), "w+", np.float32, (T, ny // 2, nx // 2)); H[:] = np.nan
V = np.lib.format.open_memmap(os.path.join(OUT, "V40.npy"), "w+", np.float32, (T, ny // 2, nx // 2)); V[:] = np.nan
blk = lambda a: np.nanmean(a.reshape(ny // 2, 2, nx // 2, 2), axis=(1, 3))

# ---- 3. read each date, then delete the raw file ----
info = []
for i, d in enumerate(dates):
    path = fetch(by_date[d]); row = dict(date=d, shift=np.nan, rfiHH=np.nan, rfiHV=np.nan)
    with h5py.File(path, "r") as f:
        if int(f[G + "/projection"][()]) != epsg:
            print(d, "different projection, skipped", flush=True); info.append(row); continue
        x = f[G + "/xCoordinates"][:]; y = f[G + "/yCoordinates"][:]
        fx, fy = (X0 - x[0]) / dx, (Y0 - y[0]) / dy; ix, iy = int(round(fx)), int(round(fy))
        row["shift"] = float(max(abs(fx - ix), abs(fy - iy)))
        a0, a1, b0, b1 = max(ix, 0), min(ix + nx, len(x)), max(iy, 0), min(iy + ny, len(y))
        hh = np.full((ny, nx), np.nan, np.float32); hv = hh.copy()
        if a1 > a0 and b1 > b0:
            m = f[G + "/mask"][b0:b1, a0:a1]; bad = (m == 0) | (m == 255)
            for nm, dst in (("HHHH", hh), ("HVHV", hv)):
                if nm not in f[G]:
                    print("   ", d, "has no", nm, "(single-polarization pass), left empty", flush=True); continue
                v = f[G + "/" + nm][b0:b1, a0:a1].astype(np.float32); v[bad | ~(v > 0)] = np.nan
                dst[b0 - iy:b1 - iy, a0 - ix:a1 - ix] = v
        for pol in ("HH", "HV"):
            try: row["rfi" + pol] = float(f[f"science/LSAR/GCOV/metadata/calibrationInformation/frequencyA/{pol}/rfiLikelihood"][()])
            except Exception: pass
    H[i] = 10 * np.log10(blk(hh)); V[i] = 10 * np.log10(blk(hv)); H.flush(); V.flush()
    if not keep_raw: os.remove(path)
    info.append(row); print(f"   {d} done ({i + 1}/{T})", flush=True)

# ---- 4. screen dates ----
s = (slice(None), slice(None, None, 4), slice(None, None, 4)); h, v = np.asarray(H[s]), np.asarray(V[s])
mh, mv = np.nanmedian(h, 0), np.nanmedian(v, 0)
print("date | valid% | HH med dB | HV med dB | dHH vs median | dHV vs median | rfiHH | rfiHV | grid shift | "
      "% px HH<-3dB | % px HV<-3dB | % px HH>+3dB | flag")
bad_dates = []
for i, row in enumerate(info):
    a, b = h[i] - mh, v[i] - mv; val = np.isfinite(h[i])
    dh, dv = np.nanmedian(a), np.nanmedian(b)
    flag = (not val.any()) or val.mean() < .5 or np.isfinite(v[i]).mean() < .5 or abs(dh) > 1.5 or abs(dv) > 1.5
    if flag: bad_dates.append(row["date"])
    print(f"{row['date']} | {100 * val.mean():.0f} | {np.nanmedian(h[i]):.2f} | {np.nanmedian(v[i]):.2f} | {dh:+.2f} | {dv:+.2f} | "
          f"{row['rfiHH']:.3g} | {row['rfiHV']:.3g} | {row['shift']:.3f} | {100 * np.nanmean(a < -3):.2f} | "
          f"{100 * np.nanmean(b < -3):.2f} | {100 * np.nanmean(a > 3):.2f} | {'BAD' if flag else ''}")

meta = dict(site=site, **{k: cfg[k] for k in ("event", "event_date", "track", "frame", "start", "end")}, bbox_lonlat=list(cfg["bbox"]),
            dates=dates, bad_dates=bad_dates, epsg=epsg, x0=X0, y0=Y0, dx=dx, dy=dy, spacing=40, K=2, ny=ny // 2, nx=nx // 2,
            units="dB of gamma0", info=info)
for nm in ("meta.json", "meta40.json"): json.dump(meta, open(os.path.join(OUT, nm), "w"), indent=1)

# ---- 5. images: before vs after the event ----
good = [i for i, d in enumerate(dates) if d not in bad_dates]
bef = [i for i in good if dates[i] < cfg["event_date"]]; aft = [i for i in good if dates[i] > cfg["event_date"]]
db = lambda A, ids: 10 * np.log10(np.nanmean(10 ** (np.asarray(A[ids]) / 10), axis=0))
sc = lambda a, lo, hi: (np.clip((np.nan_to_num(a, nan=lo) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
def save(name, arr):
    for dest in (os.path.join(OUT, name), name): Image.fromarray(arr).save(dest)
mH, mV = db(H, good), db(V, good)
save(f"{site}_quicklook.png", np.dstack([sc(mH, -22, -2), sc(mV, -32, -10), sc(mH - mV, 2, 16)]))
if bef and aft:
    bH, aH, bV, aV = db(H, bef), db(H, aft), db(V, bef), db(V, aft)
    save(f"{site}_change_HH.png", np.dstack([sc(bH, -22, -2), sc(aH, -22, -2), sc(aH, -22, -2)]))
    save(f"{site}_change_HV.png", np.dstack([sc(bV, -32, -10), sc(aV, -32, -10), sc(aV, -32, -10)]))
    dH, dV = aH - bH, aV - bV
    print(f"== before {len(bef)} dates vs after {len(aft)} dates: % valid px | HH -3dB {100 * np.nanmean(dH < -3):.2f} "
          f"+3dB {100 * np.nanmean(dH > 3):.2f} | HV -3dB {100 * np.nanmean(dV < -3):.2f} +3dB {100 * np.nanmean(dV > 3):.2f}")
else:
    print("not enough dates on both sides of the event date for change images")
print("saved", OUT, "| images in", os.getcwd())
