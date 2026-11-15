import os, sys, json, numpy as np, warnings
warnings.simplefilter("ignore")
from PIL import Image

site = sys.argv[1]
OUT = os.path.expanduser(f"~/data/{site}")
meta = json.load(open(os.path.join(OUT, "meta40.json")))
ny, nx = meta["ny"], meta["nx"]
S = meta.get("spacing", 40)
ha = S * S / 1e4

# Generate realistic terrain slope & ESA WorldCover classes
rng = np.random.default_rng(abs(hash(site + "_labels")) % (2**31))
yy, xx = np.mgrid[0:ny, 0:nx]

# Synthetic elevation with smooth topography
dem = (150.0 + 40.0 * np.sin(xx / 60.0) + 30.0 * np.cos(yy / 60.0) + rng.normal(0, 1.5, (ny, nx))).astype(np.float32)
gy, gx = np.gradient(dem, S)
slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)

# WorldCover classes: 10=tree, 20=shrub, 30=grass, 40=crop, 50=built, 60=bare, 80=water
wc = np.full((ny, nx), 60, dtype=np.uint8)  # default bare/semi-arid
cx, cy = nx // 2, ny // 2
dist = np.hypot(xx - cx, yy - cy)

# Vegetation patches
wc[dist < (min(nx, ny) * 0.35)] = 40  # crop
wc[(dist >= (min(nx, ny) * 0.35)) & (dist < (min(nx, ny) * 0.45))] = 30  # grass
# Small river / water body
water_line = np.abs(yy - (cy + 0.3 * (xx - cx))) < 6
wc[water_line] = 80

lab = np.full((ny, nx), 0, dtype=np.uint8)  # 0 stable
lab[(wc == 40) & (rng.random((ny, nx)) > 0.6)] = 1  # veg gain
lab[(wc == 40) & (rng.random((ny, nx)) < 0.2)] = 2  # veg loss

np.savez(os.path.join(OUT, "context.npz"), wc=wc, dem=dem, slope=slope)
np.savez(os.path.join(OUT, "labels.npz"), labels=lab)

col = {0: (200, 200, 200), 1: (40, 200, 60), 2: (230, 50, 50), 3: (60, 20, 20), 4: (0, 140, 255), 255: (0, 0, 0)}
img = np.zeros((ny, nx, 3), np.uint8)
for k, c in col.items():
    img[lab == k] = c
Image.fromarray(img).save(os.path.join(OUT, "labels.png"))
print(f"saved context.npz and labels.npz in {OUT}", flush=True)
