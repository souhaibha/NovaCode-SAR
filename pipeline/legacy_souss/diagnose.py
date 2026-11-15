import os, json, glob, numpy as np, h5py, warnings
from PIL import Image
warnings.simplefilter("ignore")

RAW = os.path.expanduser("~/data/gcov"); OUT = os.path.expanduser("~/data/souss")
meta = json.load(open(os.path.join(OUT, "meta.json"))); dates = meta["dates"]
hh = np.load(os.path.join(OUT, "hh.npy"), mmap_mode="r")
hv = np.load(os.path.join(OUT, "hv.npy"), mmap_mode="r")

def block(a, k=6):
    a = np.asarray(a[:a.shape[0] // k * k, :a.shape[1] // k * k])
    return np.nanmean(a.reshape(a.shape[0] // k, k, a.shape[1] // k, k), axis=(1, 3))
H = 10 * np.log10(np.stack([block(hh[t]) for t in range(len(dates))]))   # (T, 648, 1363) dB
V = 10 * np.log10(np.stack([block(hv[t]) for t in range(len(dates))]))
Hm, Vm = np.nanmedian(H, axis=0), np.nanmedian(V, axis=0)

print("== PER-DATE DIFFERENCE FROM TIME-MEDIAN (dB): p5 / p50 / p95 ==")
for t, d in enumerate(dates):
    a, b = H[t] - Hm, V[t] - Vm
    print(d, "HH", *[f"{np.nanpercentile(a, q):+.2f}" for q in (5, 50, 95)],
          "| HV", *[f"{np.nanpercentile(b, q):+.2f}" for q in (5, 50, 95)])

t7 = dates.index("2026-09-07")
print("== 2026-09-07 HH DIFFERENCE BY REGION (3 rows north->south x 4 cols west->east) ==")
D = H[t7] - Hm
for rows in np.array_split(np.arange(D.shape[0]), 3):
    print("  ".join(f"{np.nanmedian(D[np.ix_(rows, cols)]):+6.2f}"
                    for cols in np.array_split(np.arange(D.shape[1]), 4)))

print("== METADATA PER DATE ==")
keys = {"scaleHH": "science/LSAR/GCOV/metadata/calibrationInformation/frequencyA/HH/scaleFactor",
        "rfiHH": "science/LSAR/GCOV/metadata/calibrationInformation/frequencyA/HH/rfiLikelihood",
        "rfiHV": "science/LSAR/GCOV/metadata/calibrationInformation/frequencyA/HV/rfiLikelihood",
        "acqBW": "science/LSAR/GCOV/metadata/sourceData/swaths/frequencyA/acquiredRangeBandwidth",
        "procBW": "science/LSAR/GCOV/metadata/sourceData/swaths/frequencyA/processedRangeBandwidth",
        "mixed": "science/LSAR/identification/isMixedMode",
        "joint": "science/LSAR/identification/isJointObservation",
        "exception": "science/LSAR/identification/hasInputDataException",
        "rfiMitig": "science/LSAR/GCOV/metadata/processingInformation/parameters/rfiMitigationApplied",
        "noiseCorr": "science/LSAR/GCOV/metadata/processingInformation/parameters/noiseCorrectionApplied",
        "sw": "science/LSAR/GCOV/metadata/processingInformation/algorithms/softwareVersion"}
for d in dates:
    hits = glob.glob(os.path.join(RAW, f"*GCOV*_023_D_073_*_{d.replace('-', '')}T*.h5"))
    if not hits:
        print(d, "file not found"); continue
    out = []
    with h5py.File(hits[0], "r") as f:
        for k, p in keys.items():
            try:
                v = f[p][()]
                v = v.decode() if isinstance(v, bytes) else v
                out.append(f"{k}={v:.4g}" if isinstance(v, float) else f"{k}={v}")
            except Exception:
                out.append(f"{k}=?")
        try:
            out.append("looks=%.2f" % f["science/LSAR/GCOV/grids/frequencyA/numberOfLooks"].attrs["mean_value"])
        except Exception:
            pass
    print(d, os.path.basename(hits[0])[30:44], " ".join(out))

sc = lambda a, lo, hi: np.clip((a - lo) / (hi - lo), 0, 1)
def save(name, arr):
    img = Image.fromarray((np.nan_to_num(arr) * 255).astype(np.uint8))
    for dest in (os.path.join(OUT, name), name):
        img.save(dest)
rgb = lambda h, v: np.dstack([sc(h, -22, -2), sc(v, -32, -10), sc(h - v, 2, 16)])
save("quicklook.png", rgb(Hm, Vm))                 # typical state: R=HH G=HV B=HH-HV
save("quicklook_0907.png", rgb(H[t7], V[t7]))      # the odd date, same colour scale
save("diff_0907.png", sc(D, -10, 10))              # grey = no change, white = +10 dB, black = -10 dB
print("saved quicklook.png, quicklook_0907.png, diff_0907.png in", os.getcwd())
