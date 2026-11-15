import os, json, numpy as np, h5py, asf_search as asf
from pyproj import Transformer

W, S, E, N = -9.7, 30.2, -8.0, 30.9            # Souss-Massa valley, lon/lat
RAW = os.path.expanduser("~/data/gcov"); OUT = os.path.expanduser("~/data/souss")
os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)
G = "science/LSAR/GCOV/grids/frequencyA"

# ---- 1. find one GCOV per date on track 23 ----
session = asf.ASFSession().auth_with_token(open(os.path.expanduser("~/.edl_token")).read().strip())
res = asf.search(dataset="NISAR", processingLevel="GCOV",
                 intersectsWith="POINT(-8.877 30.470)", maxResults=1000)
by_date = {}
for r in res:
    p = r.properties
    if p.get("processingLevel") != "GCOV" or p.get("pathNumber") != 23:
        continue
    d = p["startTime"][:10]
    if d not in by_date or p.get("processingDate", "") > by_date[d].properties.get("processingDate", ""):
        by_date[d] = r
dates = sorted(by_date)
print("dates:", len(dates), dates)

# ---- 2. download (skips complete files) ----
paths = []
for d in dates:
    p = by_date[d].properties
    name = p["fileName"]; path = os.path.join(RAW, name)
    want = (p.get("bytes") or {}).get(name, {}).get("bytes")
    if os.path.exists(path) and want and os.path.getsize(path) != want:
        print("incomplete, re-downloading", name); os.remove(path)
    if not os.path.exists(path):
        print("downloading", d, flush=True)
        asf.download_url(p["url"], path=RAW, session=session)
    paths.append(path)

# ---- 3. define the crop window on the grid of the first file ----
tr = Transformer.from_crs(4326, 32629, always_xy=True)
xs, ys = tr.transform([W, E, W, E], [S, S, N, N])
with h5py.File(paths[0], "r") as f:
    x = f[G + "/xCoordinates"][:]; y = f[G + "/yCoordinates"][:]
    dx = float(f[G + "/xCoordinateSpacing"][()]); dy = float(f[G + "/yCoordinateSpacing"][()])
X0 = x[np.abs(x - min(xs)).argmin()]; Y0 = y[np.abs(y - max(ys)).argmin()]
nx = int(round((max(xs) - min(xs)) / abs(dx))); ny = int(round((max(ys) - min(ys)) / abs(dy)))
print(f"crop: {ny} rows x {nx} cols, origin x={X0} y={Y0}, spacing {dx} {dy}")

T = len(paths)
hh = np.lib.format.open_memmap(os.path.join(OUT, "hh.npy"), "w+", np.float32, (T, ny, nx))
hv = np.lib.format.open_memmap(os.path.join(OUT, "hv.npy"), "w+", np.float32, (T, ny, nx))
hh[:] = np.nan; hv[:] = np.nan

# ---- 4. crop each date ----
print("date | grid_shift_px | valid_% | HH_median_dB | HV_median_dB | crid")
for t, (d, path) in enumerate(zip(dates, paths)):
    with h5py.File(path, "r") as f:
        x = f[G + "/xCoordinates"][:]; y = f[G + "/yCoordinates"][:]
        fx = (X0 - x[0]) / dx; fy = (Y0 - y[0]) / dy
        ix, iy = int(round(fx)), int(round(fy))
        a0, a1 = max(ix, 0), min(ix + nx, len(x))
        b0, b1 = max(iy, 0), min(iy + ny, len(y))
        if a1 > a0 and b1 > b0:
            m = f[G + "/mask"][b0:b1, a0:a1]
            bad = (m == 0) | (m == 255)
            for name, dst in (("HHHH", hh), ("HVHV", hv)):
                a = f[G + "/" + name][b0:b1, a0:a1]
                a[bad | ~(a > 0)] = np.nan
                dst[t, b0 - iy:b1 - iy, a0 - ix:a1 - ix] = a
    sh, sv = hh[t, ::8, ::8], hv[t, ::8, ::8]
    print(d, f"{fx - ix:+.3f},{fy - iy:+.3f}", f"{100 * np.isfinite(sh).mean():.1f}",
          f"{10 * np.log10(np.nanmedian(sh)):.2f}", f"{10 * np.log10(np.nanmedian(sv)):.2f}",
          by_date[d].properties.get("crid"), sep=" | ")
hh.flush(); hv.flush()

json.dump({"dates": dates, "epsg": 32629, "x0": float(X0), "y0": float(Y0), "dx": dx, "dy": dy,
           "ny": ny, "nx": nx, "track": 23, "frame": 73, "units": "gamma0 linear power",
           "bbox_lonlat": [W, S, E, N]}, open(os.path.join(OUT, "meta.json"), "w"), indent=1)

# ---- 5. quicklook: time-mean, 6x6 block average, R=HH G=HV B=HH/HV ----
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import warnings; warnings.simplefilter("ignore")
def block(a, k=6):
    a = a[:a.shape[0] // k * k, :a.shape[1] // k * k]
    return np.nanmean(a.reshape(a.shape[0] // k, k, a.shape[1] // k, k), axis=(1, 3))
mh = 10 * np.log10(block(np.nanmean(hh, axis=0))); mv = 10 * np.log10(block(np.nanmean(hv, axis=0)))
sc = lambda a, lo, hi: np.clip((a - lo) / (hi - lo), 0, 1)
rgb = np.nan_to_num(np.dstack([sc(mh, -22, -2), sc(mv, -32, -10), sc(mh - mv, 2, 16)]))
for dest in (os.path.join(OUT, "quicklook.png"), "quicklook.png"):
    plt.imsave(dest, rgb)
print("saved quicklook.png in", OUT, "and in", os.getcwd())
print("stack files:", {f: f"{os.path.getsize(os.path.join(OUT, f)) / 2**30:.2f} GB" for f in os.listdir(OUT)})
