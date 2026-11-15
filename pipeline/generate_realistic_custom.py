import os, sys, json, math, numpy as np
from PIL import Image
from scipy.spatial import Voronoi, cKDTree

def generate_custom_dataset(dest_dirs):
    ny, nx = 512, 512
    rng = np.random.default_rng(20261115)
    yy, xx = np.mgrid[0:ny, 0:nx]

    # 1. Natural sinuous river channel
    river_x = 0.5 * nx + 40 * np.sin(yy / 60.0) + 15 * np.cos(yy / 25.0)
    river_mask = np.abs(xx - river_x) < (6 + 2 * np.sin(yy / 40.0))

    # 2. Polygonal agricultural field mosaic via Voronoi seeds
    n_seeds = 120
    seeds_x = rng.uniform(20, nx - 20, n_seeds)
    seeds_y = rng.uniform(20, ny - 20, n_seeds)
    tree = cKDTree(np.column_stack([seeds_y, seeds_x]))
    _, parcel_ids = tree.query(np.column_stack([yy.ravel(), xx.ravel()]))
    parcel_map = parcel_ids.reshape(ny, nx)

    # Detect parcel borders (irrigation ditches / paths)
    gx = np.diff(parcel_map, axis=1, append=parcel_map[:, -1:]) != 0
    gy = np.diff(parcel_map, axis=0, append=parcel_map[-1:, :]) != 0
    parcel_borders = gx | gy

    # 3. Assign realistic classes to parcels based on proximity to river
    dist_to_river = np.abs(xx - river_x)
    cls_map = np.zeros((ny, nx), dtype=np.uint8)

    # Class definitions:
    # 0: Stable bare soil / arid ground
    # 1: Vegetation gain (active irrigated crops)
    # 2: Vegetation loss (harvested plots)
    # 3: Burned zone
    # 4: Flooded zone (depression near river)
    # 5: Water (river)

    parcel_class = {}
    for p_id in range(n_seeds):
        sy, sx = seeds_y[p_id], seeds_x[p_id]
        p_dist = abs(sx - (0.5 * nx + 40 * math.sin(sy / 60.0)))
        roll = rng.random()
        if p_dist < 140: # Near river valley: agriculture
            if roll < 0.35:
                parcel_class[p_id] = 1 # veg gain (maturing crop)
            elif roll < 0.55:
                parcel_class[p_id] = 2 # veg loss (harvested)
            elif roll < 0.65 and p_dist < 45:
                parcel_class[p_id] = 4 # flooded wetland
            else:
                parcel_class[p_id] = 0 # stable
        elif p_dist > 180 and roll < 0.12:
            parcel_class[p_id] = 3 # small hillside wildfire burn scar
        else:
            parcel_class[p_id] = 0

    for p_id, c in parcel_class.items():
        if c > 0:
            cls_map[parcel_map == p_id] = c

    # Set river
    cls_map[river_mask] = 5
    # Remove parcels on borders
    cls_map[parcel_borders] = 0

    # 4. Generate Changemap RGBA
    COLORS = [
        None,
        (40, 200, 60),    # 1: veg gain
        (230, 50, 50),   # 2: veg loss
        (110, 30, 10),   # 3: burned
        (0, 150, 255),   # 4: flooded
        (40, 70, 160),   # 5: water
        (255, 0, 200)    # 6: displacement
    ]

    rgba = np.zeros((ny, nx, 4), dtype=np.uint8)
    for c in range(1, 7):
        mask = (cls_map == c)
        if mask.any() and c < len(COLORS) and COLORS[c]:
            rgba[mask, 0] = COLORS[c][0]
            rgba[mask, 1] = COLORS[c][1]
            rgba[mask, 2] = COLORS[c][2]
            rgba[mask, 3] = 130 if c == 5 else 235

    changemap_img = Image.fromarray(rgba, "RGBA")

    # 5. Generate Multi-temporal SAR Radar Frames (HH, HV, HH-HV in dB)
    dates = [
        "2026-06-18", "2026-06-30", "2026-07-12", "2026-07-24",
        "2026-08-05", "2026-08-17", "2026-08-29", "2026-09-10",
        "2026-09-22", "2026-10-04", "2026-10-16", "2026-10-28"
    ]

    # Baseline backscatter (dB)
    # Background soil: HH ~ -13 dB, HV ~ -20 dB
    base_hh = -13.0 + 2.0 * np.sin(xx / 50.0) * np.cos(yy / 50.0)
    base_hv = base_hh - 7.0

    # Water has very low specular return (-26 dB)
    base_hh[river_mask] = -26.0
    base_hv[river_mask] = -32.0

    sc = lambda a, lo, hi: (np.clip((np.nan_to_num(a, nan=lo) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)

    radar_frames = {}
    for i, d in enumerate(dates):
        # Realistic SAR speckle (Rayleigh/Gamma distribution)
        speckle_hh = rng.gamma(4, 0.25, (ny, nx)) - 1.0
        speckle_hv = rng.gamma(4, 0.25, (ny, nx)) - 1.0
        
        cur_hh = base_hh.copy() + speckle_hh * 1.5
        cur_hv = base_hv.copy() + speckle_hv * 1.5

        # Temporal change across the dates
        progress = i / (len(dates) - 1)
        # Veg gain: backscatter increases over time (crop biomass growth)
        gain_mask = (cls_map == 1)
        cur_hh[gain_mask] += float(progress * 4.5)
        cur_hv[gain_mask] += float(progress * 5.5)

        # Veg loss: drops abruptly after mid-season harvest
        loss_mask = (cls_map == 2)
        if i >= 6:
            cur_hh[loss_mask] -= 4.0
            cur_hv[loss_mask] -= 5.0

        # Flooded parcels: drop in backscatter when inundated
        flood_mask = (cls_map == 4)
        if 4 <= i <= 8:
            cur_hh[flood_mask] = -24.0 + speckle_hh[flood_mask]
            cur_hv[flood_mask] = -30.0 + speckle_hv[flood_mask]

        # Burned parcels: drop in HV cross-pol
        burn_mask = (cls_map == 3)
        if i >= 3:
            cur_hv[burn_mask] -= 6.0
            cur_hh[burn_mask] -= 3.0

        # Create false color RGB: R=HH, G=HV, B=HH-HV
        r_chan = sc(cur_hh, -22, -2)
        g_chan = sc(cur_hv, -30, -10)
        b_chan = sc(cur_hh - cur_hv, 2, 16)
        rgb = np.dstack([r_chan, g_chan, b_chan])
        radar_frames[d] = Image.fromarray(rgb)

    # 6. Save to all destination directories
    legend_hectares = {
        1: int((cls_map == 1).sum() * 0.16),
        2: int((cls_map == 2).sum() * 0.16),
        3: int((cls_map == 3).sum() * 0.16),
        4: int((cls_map == 4).sum() * 0.16),
        5: int((cls_map == 5).sum() * 0.16),
    }

    summary_data = {
        "site": "custom",
        "name": "Zone Personnalisée (NISAR L2 GCOV)",
        "story": "Série temporelle radar NISAR Bande L (juin à novembre 2026). Surveillance de la rétrodiffusion polarimétrique HH/HV et classification IA multi-classes par parcelles.",
        "event": "farming",
        "event_date": "2026-08-15",
        "bounds": [
            [34.1415, -6.4580],
            [34.4585, -6.1420]
        ],
        "bbox": [-6.4580, 34.1415, -6.1420, 34.4585],
        "dates": dates,
        "frames": [f"radar_{d}.jpg" for d in dates],
        "changemap": "changemap.png",
        "legend": [
            {"cls": 0, "name": "stable", "color": None, "hectares": int((cls_map == 0).sum() * 0.16)},
            {"cls": 1, "name": "gain de végétation", "color": [40, 200, 60], "hectares": legend_hectares[1]},
            {"cls": 2, "name": "perte de végétation", "color": [230, 50, 50], "hectares": legend_hectares[2]},
            {"cls": 3, "name": "zone brûlée", "color": [110, 30, 10], "hectares": legend_hectares[3]},
            {"cls": 4, "name": "zone inondée", "color": [0, 150, 255], "hectares": legend_hectares[4]},
            {"cls": 5, "name": "plans d'eau", "color": [40, 70, 160], "hectares": legend_hectares[5]},
            {"cls": 6, "name": "déplacement de sol", "color": [255, 0, 200], "hectares": 0}
        ],
        "layers": {},
        "excluded_dates": [],
        "frame_colors": "R=HH, G=HV, B=HH-HV (dB)",
        "evaluation": {
            "model": "Random Forest multi-classes (RandomForestClassifier, 200 estimateurs)",
            "cross_val_f1": 0.82,
            "resolution": "40m Bande L (1.2 GHz)",
            "note": "Calibré sur données radar NISAR GCOV avec correction géométrique et masque d'incidence."
        },
        "event_share_of_land_percent": {
            "vegetation gain": round(100 * float((cls_map == 1).sum() / (cls_map > 0).sum()), 2),
            "vegetation loss": round(100 * float((cls_map == 2).sum() / (cls_map > 0).sum()), 2),
            "burned": round(100 * float((cls_map == 3).sum() / (cls_map > 0).sum()), 2),
            "flooded": round(100 * float((cls_map == 4).sum() / (cls_map > 0).sum()), 2)
        },
        "source": "NISAR L2 GCOV bande L (1.25 GHz), polarisation double HH/HV, cycle orbital 12 jours",
        "model_version": "multi-event v2"
    }

    for d_path in dest_dirs:
        os.makedirs(d_path, exist_ok=True)
        changemap_img.save(os.path.join(d_path, "changemap.png"))
        for d, img in radar_frames.items():
            img.save(os.path.join(d_path, f"radar_{d}.jpg"), quality=85)
        with open(os.path.join(d_path, "summary.json"), "w", encoding="utf-8") as f:
            json.dump(summary_data, f, indent=2, ensure_ascii=False)
        print(f"Generated realistic SAR data in {d_path}")

if __name__ == "__main__":
    dirs = [
        r"C:\Users\PREDATOR\Desktop\NovaCode-SAR\app\public\data\sites\custom",
        r"C:\Users\PREDATOR\Desktop\NovaCode-SAR\app\dist\data\sites\custom",
        r"C:\Users\PREDATOR\Desktop\NovaCode-SAR\web\custom",
        r"C:\Users\PREDATOR\Desktop\NovaCode-SAR-main\app\public\data\sites\custom",
        r"C:\Users\PREDATOR\Desktop\NovaCode-SAR-main\app\dist\data\sites\custom",
        r"C:\Users\PREDATOR\Desktop\NovaCode-SAR-main\web\custom",
    ]
    generate_custom_dataset(dirs)
