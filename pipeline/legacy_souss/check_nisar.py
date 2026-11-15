import collections, shutil, subprocess, os, requests

# --- machine ---
print("== MACHINE ==")
print("cpus:", os.cpu_count())
print(subprocess.run("free -g | head -2", shell=True, capture_output=True, text=True).stdout)
print("disk free GB:", shutil.disk_usage(os.path.expanduser("~")).free // 2**30)
print("gpu:", subprocess.run("nvidia-smi -L", shell=True, capture_output=True, text=True).stdout or "none")

# Souss-Massa: Agadir -> Taroudant -> Aoulouz (west, south, east, north)
W, S, E, N = -9.7, 30.2, -8.0, 30.9
WKT = f"POLYGON(({W} {S},{E} {S},{E} {N},{W} {N},{W} {S}))"

# --- 1. which NISAR collections exist, and how many granules ---
print("== CMR COLLECTIONS ==")
CMR = "https://cmr.earthdata.nasa.gov/search"
r = requests.get(f"{CMR}/collections.json", params={
    "short_name": "NISAR*", "options[short_name][pattern]": "true", "page_size": 200}, timeout=60)
for c in r.json()["feed"]["entry"]:
    def hits(extra):
        h = requests.get(f"{CMR}/granules.json", params={
            "collection_concept_id": c["id"], "page_size": 0, **extra}, timeout=60)
        return h.headers.get("CMR-Hits")
    print(f'{c["short_name"]:28} v{c.get("version_id","?"):6} '
          f'{c.get("time_start","?")[:10]} -> {c.get("time_end","now")[:10]} '
          f'global={hits({})} souss={hits({"bounding_box": f"{W},{S},{E},{N}"})}')

# --- 2. detail over Souss-Massa via ASF ---
print("== ASF SEARCH, SOUSS-MASSA ==")
try:
    import asf_search as asf
    print("asf_search", asf.__version__)
    res = asf.search(dataset="NISAR", intersectsWith=WKT, maxResults=5000)
    print("results:", len(res))
    groups = collections.defaultdict(list)
    for x in res:
        p = x.properties
        key = (p.get("processingLevel"), p.get("flightDirection"),
               p.get("pathNumber"), p.get("frameNumber"), str(p.get("polarization")))
        groups[key].append((p.get("startTime") or "")[:10])
    print("level | direction | track | frame | pol | n_dates | first | last")
    for k, d in sorted(groups.items(), key=lambda kv: str(kv[0])):
        d = sorted(set(d))
        print(*k, len(d), d[0], d[-1], sep=" | ")
    if res:
        print("== ONE EXAMPLE RECORD ==")
        for k, v in res[0].properties.items():
            print(f"  {k}: {v}")
except Exception as e:
    print("ASF search failed:", repr(e))
