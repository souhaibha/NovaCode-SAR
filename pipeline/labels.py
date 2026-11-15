import os, sys, json, math, numpy as np, warnings
warnings.simplefilter("ignore")
from PIL import Image
from scipy.spatial import cKDTree

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

# Natural sinuous river channel
river_x = 0.5 * nx + 40 * np.sin(yy / 60.0) + 15 * np.cos(yy / 25.0)
river_mask = np.abs(xx - river_x) < (6 + 2 * np.sin(yy / 40.0))
wc[river_mask] = 80

# Polygonal agricultural field mosaic via Voronoi seeds
n_seeds = max(30, int(nx * ny / 2000))
seeds_x = rng.uniform(10, nx - 10, n_seeds)
seeds_y = rng.uniform(10, ny - 10, n_seeds)
tree = cKDTree(np.column_stack([seeds_y, seeds_x]))
_, parcel_ids = tree.query(np.column_stack([yy.ravel(), xx.ravel()]))
parcel_map = parcel_ids.reshape(ny, nx)

# Allocate agricultural crops and pastures near river
for p_id in range(n_seeds):
    sy, sx = seeds_y[p_id], seeds_x[p_id]
    p_dist = abs(sx - (0.5 * nx + 40 * math.sin(sy / 60.0)))
    roll = rng.random()
    if p_dist < (0.35 * nx):
        if roll < 0.65:
            wc[parcel_map == p_id] = 40  # crop
        else:
            wc[parcel_map == p_id] = 30  # grass / shrub

wc[river_mask] = 80

lab = np.full((ny, nx), 0, dtype=np.uint8)  # 0 stable
# Assign realistic parcel-level vegetation gain and loss
for p_id in range(n_seeds):
    p_mask = (parcel_map == p_id) & (wc == 40)
    if p_mask.any():
        roll = rng.random()
        if roll < 0.35:
            lab[p_mask] = 1  # veg gain
        elif roll < 0.55:
            lab[p_mask] = 2  # veg loss

np.savez(os.path.join(OUT, "context.npz"), wc=wc, dem=dem, slope=slope)
np.savez(os.path.join(OUT, "labels.npz"), labels=lab)

col = {0: (200, 200, 200), 1: (40, 200, 60), 2: (230, 50, 50), 3: (60, 20, 20), 4: (0, 140, 255), 255: (0, 0, 0)}
img = np.zeros((ny, nx, 3), np.uint8)
for k, c in col.items():
    img[lab == k] = c
Image.fromarray(img).save(os.path.join(OUT, "labels.png"))
print(f"saved context.npz and labels.npz in {OUT}", flush=True)
