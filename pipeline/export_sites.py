import os, json, shutil, numpy as np, warnings
warnings.simplefilter("ignore")
from rasterio.warp import calculate_default_transform, reproject, Resampling, transform_bounds
from rasterio.transform import array_bounds
from affine import Affine
from PIL import Image
D = os.path.expanduser("~/data"); WEB = "web"
CLASSES = ["stable", "vegetation gain", "vegetation loss", "burned", "flooded", "water", "earthquake ground displacement"]
COLORS = [None, (40, 200, 60), (230, 50, 50), (110, 30, 10), (0, 150, 255), (40, 70, 160), (255, 0, 200)]
SITES = {
 "souss": dict(name="Souss-Massa, Morocco", story="Irrigated farming in the Souss valley, June to November 2026: fields planted and harvested.",
               evaluation={"vegetation gain": dict(precision=.70, recall=.27, f1=.39), "vegetation loss": dict(precision=.53, recall=.44, f1=.48),
                           "tested_on": "held-out 5 km blocks"}),
 "cambodia": dict(name="Tonle Sap floodplain, Cambodia", story="Flooding appeared between 11 and 23 September 2026 and receded by late October.",
                  evaluation={"flooded": dict(precision=.83, recall=.85, f1=.84), "tested_on": "held-out 5 km blocks"}),
 "avila": dict(name="Ávila, Spain", story="Spain's largest recorded wildfire started on 22 to 23 July 2026; radar maps the burn scar through smoke and at night.",
               evaluation={"burned": dict(precision=.95, recall=.77, f1=.85), "tested_on": "unseen radar track (track 23) and unseen 5 km blocks"}),
 "venezuela75": dict(name="Northern Venezuela", story="M7.5 and M7.2 earthquakes on 24 June 2026; interferometry measures ground motion of tens of centimetres.",
                     evaluation={"earthquake": "physics module: displacement above 3x measured noise; not a learned class", "tested_on": "n/a"}),
}
import sys
if len(sys.argv) > 1:
    SITES = {s_: json.load(open(os.path.join(D, s_, "info.json"))) for s_ in sys.argv[1:]}
if os.path.isdir(os.path.join(WEB, "souss")) and not os.path.isdir(os.path.join(WEB, "souss_v1")):
    shutil.move(os.path.join(WEB, "souss"), os.path.join(WEB, "souss_v1"))
sc = lambda a, lo, hi: (np.clip((np.nan_to_num(a, nan=lo) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
index = []
for site, info in SITES.items():
    p = os.path.join(D, site)
    if not os.path.exists(os.path.join(p, "pred.npy")): print("skip", site); continue
    meta = json.load(open(os.path.join(p, "meta40.json"))); S = meta["spacing"]
    pred = np.load(os.path.join(p, "pred.npy")); ny, nx = pred.shape; wc = np.load(os.path.join(p, "context.npz"))["wc"]
    cls = pred.copy(); cls[wc == 80] = 5; quake = None; los = None
    if os.path.exists(os.path.join(p, "quake.npz")):
        Q = np.load(os.path.join(p, "quake.npz")); los, coh = Q["los_co"], Q["coh_co"]
        noise = float(np.nanstd(Q["los_pre"])); th = max(3 * noise, 6.0) if np.isfinite(noise) else 6.0
        cls[np.isfinite(los) & (np.abs(los) > th) & (cls == 0)] = 6
        quake = dict(threshold_cm=round(th, 1), noise_cm=round(noise, 2), p99_abs_cm=round(float(np.nanpercentile(np.abs(los), 99)), 1),
                     pair=meta.get("quake", {}).get("coseismic"), note="line-of-sight motion; direction depends on an unverified sign convention")
    src = f"EPSG:{meta['epsg']}"; left = meta["x0"] - abs(meta["dx"]) / 2; top = meta["y0"] + abs(meta["dy"]) / 2
    tfm = Affine(S, 0, left, 0, -S, top); bnds = (left, top - ny * S, left + nx * S, top)
    def warp(arr, method, scale=1):
        t, w, h = calculate_default_transform(src, "EPSG:3857", nx, ny, *bnds, dst_width=nx // scale, dst_height=ny // scale)
        out = np.zeros((arr.shape[0], h, w), np.uint8)
        reproject(arr, out, src_transform=tfm, src_crs=src, dst_transform=t, dst_crs="EPSG:3857", resampling=method)
        b = transform_bounds("EPSG:3857", "EPSG:4326", *array_bounds(h, w, t))
        return np.moveaxis(out, 0, -1), [[b[1], b[0]], [b[3], b[2]]]
    out = os.path.join(WEB, site); os.makedirs(out, exist_ok=True)
    rgba = np.zeros((4, ny, nx), np.uint8)
    for c, col in enumerate(COLORS):
        if col:
            for i in range(3): rgba[i][cls == c] = col[i]
            rgba[3][cls == c] = 110 if c == 5 else 255
    img, bb = warp(rgba, Resampling.nearest); Image.fromarray(img, "RGBA").save(os.path.join(out, "changemap.png"))
    bad = set(meta.get("bad_dates", [])); keep = [(i, d) for i, d in enumerate(meta["dates"]) if d not in bad]
    H = np.load(os.path.join(p, "H40.npy"), mmap_mode="r"); V = np.load(os.path.join(p, "V40.npy"), mmap_mode="r"); frames = []
    for i, d in keep:
        h, v = np.asarray(H[i]), np.asarray(V[i])
        img, _ = warp(np.stack([sc(h, -22, -2), sc(v, -32, -10), sc(h - v, 2, 16), np.where(np.isfinite(h), 255, 0).astype(np.uint8)]), Resampling.average, 2)
        Image.fromarray(np.ascontiguousarray(img[..., :3])).save(os.path.join(out, f"radar_{d}.jpg"), quality=82); frames.append(f"radar_{d}.jpg")
    layers = {}
    if los is not None:
        fin = np.isfinite(los); R = max(5.0, quake["p99_abs_cm"]); z = np.clip(np.nan_to_num(los) / R, -1, 1)
        dimg = np.stack([np.where(z < 0, 255, 255 * (1 - z)), 255 * (1 - np.abs(z)), np.where(z > 0, 255, 255 * (1 + z)), fin * 255]).astype(np.uint8)
        img, _ = warp(dimg, Resampling.nearest); Image.fromarray(img, "RGBA").save(os.path.join(out, "displacement.png"))
        hh = np.mod(np.nan_to_num(los), 12.2) / 12.2 * 6; k = np.floor(hh).astype(int) % 6; f = hh - np.floor(hh)
        vv = np.clip(np.nan_to_num(coh), .2, 1); q = vv * (1 - f); t = vv * f; o = 0 * vv
        rgb = np.select([(k == n)[..., None] for n in range(6)], [np.stack(c, -1) for c in [(vv, t, o), (q, vv, o), (o, vv, t), (o, q, vv), (t, o, vv), (vv, o, q)]])
        fimg = np.concatenate([(rgb * 255).astype(np.uint8), (fin * 255).astype(np.uint8)[..., None]], -1)
        img, _ = warp(np.moveaxis(fimg, -1, 0), Resampling.nearest); Image.fromarray(img, "RGBA").save(os.path.join(out, "fringes.png"))
        layers = {"displacement": dict(file="displacement.png", colors="red/blue = motion away/toward radar (sign unverified), white = none",
                                       scale_cm=[-round(R, 1), round(R, 1)]),
                  "fringes": dict(file="fringes.png", meaning="each full colour cycle = about 12 cm of ground motion")}
    land = (wc > 0) & (wc != 80); ha = S * S / 1e4
    legend = [dict(cls=c, name=CLASSES[c], color=COLORS[c], hectares=round(float((cls == c).sum() * ha))) for c in range(len(CLASSES))]
    summary = dict(site=site, name=info["name"], story=info["story"], event=meta.get("event", "farming"), event_date=meta.get("event_date"),
                   bounds=bb, dates=[d for _, d in keep], frames=frames, changemap="changemap.png", legend=legend, layers=layers,
                   excluded_dates=sorted(bad), frame_colors="R=HH, G=HV, B=HH-HV (dB)", evaluation=info["evaluation"], earthquake=quake,
                   event_share_of_land_percent={CLASSES[c]: round(100 * float((cls[land] == c).mean()), 2) for c in range(1, 5)},
                   source=f"NISAR L2 GCOV track {meta.get('track', 23)} frame {meta.get('frame', 73)}, L-band, 40 m", model_version="multi-event v2")
    json.dump(summary, open(os.path.join(out, "summary.json"), "w"), indent=1)
    index.append(dict(site=site, name=info["name"], event=summary["event"], event_date=summary["event_date"], bounds=bb, folder=f"{site}/"))
    print(f"{site}: {len(frames)} frames |", " ".join(f"{l['name']} {l['hectares']} ha" for l in legend[1:] if l["hectares"]),
          "|", summary["event_share_of_land_percent"], flush=True)
_f = os.path.join(WEB, "sites.json"); _old = json.load(open(_f)) if os.path.exists(_f) else []
_new = [x for x in _old if x["site"] not in {i["site"] for i in index}] + index
json.dump(_new, open(_f, "w"), indent=1)
print("web total MB:", round(sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(WEB) for f in fs) / 2**20, 1))
