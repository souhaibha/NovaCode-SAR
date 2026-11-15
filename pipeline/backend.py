"""SAR Watch backend: lets the app start NISAR zone analyses and follow their progress.

Run from the folder that contains analyze.py and the other pipeline scripts (the home directory):
    export SAR_WEB_ROOT=/folder/that/contains/web
    API_TOKEN=choose-a-secret uvicorn backend:app --host 0.0.0.0 --port 8000

Needs the Earthdata token in ~/.edl_token and the model in ~/data/multi_model.joblib.
NOT YET TESTED: try every call before building on it (see docs/APP_PLAN.md).
"""
import os, re, sys, json, uuid, math, shutil, subprocess, collections, datetime as dt
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import asf_search as asf

HOME = os.path.expanduser("~")
BASE = os.environ.get("SAR_WEB_ROOT", os.getcwd())
WEB = os.path.join(BASE, "web")
PUBLIC_SITES = os.path.join(BASE, "app", "public", "data", "sites")
TOKEN = os.environ.get("API_TOKEN", "")

app = FastAPI(title="NISAR event detector")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])  # restrict before deploying
os.makedirs(WEB, exist_ok=True)
os.makedirs(PUBLIC_SITES, exist_ok=True)
app.mount("/web", StaticFiles(directory=WEB), name="web")

JOBS = {}


@app.get("/data/sites/{site_id}/{filename}")
def serve_site_file(site_id: str, filename: str):
    """Dynamically serve any file from app/public/data/sites/{site_id}/{filename}.
    Unlike StaticFiles, this works for directories created after server startup."""
    if not re.fullmatch(r"[a-zA-Z0-9_\-\.]+", site_id) or not re.fullmatch(r"[a-zA-Z0-9_\-\.]+", filename):
        raise HTTPException(400, "Invalid path")
    file_path = os.path.join(PUBLIC_SITES, site_id, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(404, f"Not found: {site_id}/{filename}")
    return FileResponse(file_path)


class Zone(BaseModel):
    bbox: list[float]
    start: str
    end: str
    name: str | None = None
    earthquake_date: str | None = None
    track: int | None = None
    frame: int | None = None


def check(z: Zone):
    if len(z.bbox) != 4:
        raise HTTPException(400, "bbox must be [west, south, east, north]")
    W, S, E, N = z.bbox
    if not (-180 <= W < E <= 180 and -90 <= S < N <= 90):
        raise HTTPException(400, "bbox values are out of order or out of range")
    try:
        s, e = dt.date.fromisoformat(z.start), dt.date.fromisoformat(z.end)
    except ValueError:
        raise HTTPException(400, "dates must look like 2026-08-01")
    if s >= e:
        raise HTTPException(400, "start must be before end")
    if s < dt.date(2026, 6, 15):
        raise HTTPException(400, "NISAR coverage starts around 15 June 2026 in most places")
    w = (E - W) * 111.32 * math.cos(math.radians((S + N) / 2))
    h = (N - S) * 110.57
    if w > 50 or h > 50:
        raise HTTPException(400, f"Zone is {w:.0f} x {h:.0f} km; the limit is 50 x 50 km")


@app.get("/api/sites")
def sites():
    f = os.path.join(WEB, "sites.json")
    return json.load(open(f)) if os.path.exists(f) else []


PASSES_CACHE = {}

@app.get("/api/satellite_passes")
def satellite_passes(lat: float, lng: float):
    cache_key = f"{round(lat, 2)}_{round(lng, 2)}"
    if cache_key in PASSES_CACHE:
        return PASSES_CACHE[cache_key]

    targetRadiusKm = 17.5
    dLat = targetRadiusKm / 110.57
    cos_lat = max(0.15, math.cos(math.radians(lat)))
    dLon = targetRadiusKm / (111.32 * cos_lat)
    w, s, e, n = lng - dLon, lat - dLat, lng + dLon, lat + dLat
    wkt = f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"

    try:
        res = asf.search(intersectsWith=wkt, platform="Sentinel-1", processingLevel="GRD_HD", maxResults=30)
        dates = sorted(list(set([r.properties.get("startTime", "")[:10] for r in res if r.properties.get("browse")])))
        result = {"ok": True, "dates": dates}
        PASSES_CACHE[cache_key] = result
        return result
    except Exception as err:
        return {"ok": False, "dates": [], "error": str(err)}


@app.get("/api/dynamic_site")
def dynamic_site(
    lat: float,
    lng: float,
    country: str = "",
    start: str = None,
    end: str = None,
    max_passes: int = 4,
    w: float = None,
    s: float = None,
    e: float = None,
    n: float = None
):
    """Dynamically fetches real NASA SAR radar data for any clicked or drawn bounding box."""
    if w is not None and s is not None and e is not None and n is not None:
        bbox = [round(float(w), 4), round(float(s), 4), round(float(e), 4), round(float(n), 4)]
        slug_w = f"{abs(w):.2f}".replace(".", "_")
        slug_s = f"{abs(s):.2f}".replace(".", "_")
        slug_e = f"{abs(e):.2f}".replace(".", "_")
        slug_n = f"{abs(n):.2f}".replace(".", "_")
        site_id = f"zone_d_{slug_w}_{slug_s}_{slug_e}_{slug_n}"
    else:
        targetRadiusKm = 17.5
        dLat = targetRadiusKm / 110.57
        cos_lat = max(0.15, math.cos(math.radians(lat)))
        dLon = targetRadiusKm / (111.32 * cos_lat)
        bbox = [round(lng - dLon, 4), round(lat - dLat, 4), round(lng + dLon, 4), round(lat + dLat, 4)]
        slug_lat = f"{abs(lat):.2f}".replace(".", "_") + ("s" if lat < 0 else "n")
        slug_lng = f"{abs(lng):.2f}".replace(".", "_") + ("w" if lng < 0 else "e")
        site_id = f"zone_{slug_lat}_{slug_lng}"
    
    # If custom date range specified, include in unique site slug
    date_suffix = ""
    if start and end:
        s_tag = start.replace("-", "")[-4:]
        e_tag = end.replace("-", "")[-4:]
        date_suffix = f"_{s_tag}_{e_tag}"
    site_id = f"{site_id}{date_suffix}"
    
    dest_public = os.path.join(BASE, "app", "public", "data", "sites", site_id)
    dest_dist = os.path.join(BASE, "app", "dist", "data", "sites", site_id)
    dest_web = os.path.join(WEB, site_id)
    summary_path = os.path.join(dest_public, "summary.json")
    lock_path = os.path.join(dest_public, ".processing")

    # --- Case 1: Already cached → return instantly ---
    if os.path.exists(summary_path):
        with open(summary_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            data["site"] = site_id
            data["id"] = site_id
            data["folder"] = f"{site_id}/"
            data["base"] = f"http://localhost:8000/data/sites/{site_id}/"
            data["status"] = "ready"
            return JSONResponse(content=data, media_type="application/json; charset=utf-8")

    # --- Case 2: Already being processed in background → tell frontend to wait ---
    if os.path.exists(lock_path):
        progress_pct = 35
        progress_msg = "NASA radar acquisition in progress…"
        try:
            with open(lock_path, "r", encoding="utf-8") as lf:
                txt = lf.read().strip()
                if txt.startswith("{"):
                    info = json.loads(txt)
                    progress_pct = info.get("pct", 35)
                    progress_msg = info.get("step", progress_msg)
        except Exception:
            pass
        return JSONResponse(content={
            "status": "processing",
            "site": site_id,
            "progress": progress_pct,
            "message": progress_msg
        })

    # --- Case 3: Not cached → start background thread and return immediately ---
    os.makedirs(dest_public, exist_ok=True)
    with open(lock_path, "w", encoding="utf-8") as lf:
        json.dump({"pct": 0, "step": "Connecting to NASA ASF Datapool API…"}, lf)

    def _download_in_background():
        try:
            try:
                from pipeline.generate_real_nasa_sar import generate_real_nasa_dataset
            except ImportError:
                from generate_real_nasa_sar import generate_real_nasa_dataset
            generate_real_nasa_dataset(
                bbox, site_id, [dest_public, dest_dist, dest_web],
                start_date=start, end_date=end, max_passes=max_passes,
                lock_file=lock_path
            )
        except Exception as e:
            print(f"[ERROR] Background NASA download failed for {site_id}: {e}")
        finally:
            try:
                with open(lock_path, "w", encoding="utf-8") as lf:
                    json.dump({"pct": 100, "step": "Satellite processing completed successfully!"}, lf)
                import time
                time.sleep(0.8)
            except Exception:
                pass
            if os.path.exists(lock_path):
                os.remove(lock_path)

    import threading
    t = threading.Thread(target=_download_in_background, daemon=True)
    t.start()

    return JSONResponse(content={
        "status": "processing",
        "site": site_id,
        "progress": 0,
        "message": "Connecting to NASA ASF Datapool API…"
    })


@app.post("/api/coverage")
def coverage(z: Zone):
    check(z)
    W, S, E, N = z.bbox
    res = asf.search(dataset="NISAR", processingLevel="GCOV", maxResults=3000,
                     intersectsWith=f"POLYGON(({W} {S},{E} {S},{E} {N},{W} {N},{W} {S}))")
    g = collections.defaultdict(lambda: {"dates": set(), "single_pol": 0, "direction": None})
    for r in res:
        p = r.properties
        d = (p.get("startTime") or "")[:10]
        if p.get("processingLevel") != "GCOV" or not (z.start <= d <= z.end):
            continue
        k = (p.get("pathNumber"), p.get("frameNumber"))
        g[k]["direction"] = p.get("flightDirection")
        m = re.search(r"_\d{4}_([A-Z]{2})[A-Z]{2}_", p.get("fileName", ""))
        if m and m.group(1) in ("DH", "QP", "QD"):
            g[k]["dates"].add(d)
        else:
            g[k]["single_pol"] += 1
    tracks = sorted([dict(track=k[0], frame=k[1], direction=v["direction"], dates=sorted(v["dates"]),
                          single_pol_passes=v["single_pol"]) for k, v in g.items()],
                    key=lambda t: -len(t["dates"]))
    ok = any(len(t["dates"]) >= 4 for t in tracks)
    return dict(ok=ok, tracks=tracks,
                message=None if ok else "No NISAR track has at least 4 dual-polarization passes over this zone in this period.")


def running():
    return [j for j, v in JOBS.items() if v["proc"].poll() is None]


@app.post("/api/jobs")
def start_job(z: Zone, x_token: str = Header(default="")):
    check(z)
    if (z.track is None) != (z.frame is None):
        raise HTTPException(400, "give both track and frame, or neither")
    if running():
        raise HTTPException(409, f"Another analysis is running ({running()[0]}). Try again when it finishes.")
    slug = re.sub(r"[^a-z0-9]+", "_", (z.name or "zone").lower()).strip("_")[:30] or "zone"
    jid = f"{slug}_{uuid.uuid4().hex[:6]}"
    cmd = [sys.executable, os.path.join(HOME, "analyze.py"), "--name", jid, "--bbox", *map(str, z.bbox),
           "--start", z.start, "--end", z.end]
    if z.earthquake_date:
        cmd += ["--earthquake-date", z.earthquake_date]
    if z.track is not None:
        cmd += ["--track", str(z.track), "--frame", str(z.frame)]
    os.makedirs(os.path.join(HOME, "data", jid), exist_ok=True)
    log = open(os.path.join(HOME, "data", jid, "analyze.log"), "w")
    JOBS[jid] = {"proc": subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, cwd=BASE), "name": z.name}
    return {"job_id": jid}


@app.get("/api/jobs/{jid}")
def job(jid: str):
    if not re.fullmatch(r"[a-z0-9_]+", jid):
        raise HTTPException(400, "bad job id")
    f = os.path.join(HOME, "data", jid, "status.json")
    if not os.path.exists(f):
        if jid in JOBS:
            return {"state": "queued", "step": "Starting", "done": None, "total": None, "message": None}
        raise HTTPException(404, "unknown job")
    s = json.load(open(f))
    if s.get("state") == "done":
        s["result"] = f"/web/{jid}/"
        # Auto-sync to public/data/sites and dist/data/sites for direct map preview
        try:
            web_src = os.path.join(WEB, jid)
            if os.path.isdir(web_src):
                for dest_base in [
                    os.path.join(BASE, "app", "public", "data", "sites", jid),
                    os.path.join(BASE, "app", "dist", "data", "sites", jid)
                ]:
                    os.makedirs(dest_base, exist_ok=True)
                    for item in os.listdir(web_src):
                        s_item = os.path.join(web_src, item)
                        d_item = os.path.join(dest_base, item)
                        if os.path.isfile(s_item):
                            shutil.copy2(s_item, d_item)
        except Exception:
            pass
    if jid in JOBS and JOBS[jid]["proc"].poll() not in (None, 0) and s.get("state") != "failed":
        s.update(state="failed", message="The analysis stopped unexpectedly; see the server log.")
    return s
