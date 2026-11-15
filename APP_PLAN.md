# SAR Watch: app plan

Handoff from the AI side to the app team. It says what the app should do, which files and API you get, and what you can build today without waiting for us.

> **Read this with `README.md` and `AI_ARCHITECTURE.md`.** The files and API below are what the code in this repository produces today.

## The product in one paragraph

A user picks a zone on a map and a period of time. The system pulls NISAR radar data for that zone (radar works through clouds and at night), detects what changed and labels each change: farming (vegetation gain or loss), burned area, flood, or earthquake ground motion. The app shows the result as a coloured map over the radar images, with a time slider and a legend with hectares per class. For demo zones it can also show the score against an independent reference.

**The model detects and classifies events that happened inside the chosen period. It does not forecast.** Use "detect" or "map" in the interface, never "predict the future".

## Status at a glance

| Piece | Status | What it means for you |
|---|---|---|
| Demo zones in `web/` | **Ready** | Six folders listed in `web/sites.json`: `souss` (farming), `cambodia` (flood), `avila` (fire), `venezuela75` (earthquake), plus `kampong_cham` (a user-run zone where nothing happened) and `phnom_penh_north` (a user-run flood zone where the model failed, see "What not to show"). Build the viewer and site picker on them now. |
| Multi-event model | **Ready** | One learned model for vegetation gain/loss, burned and flooded, plus an interferometry module for earthquake ground motion. Read classes from `summary.json`, never hard-code them. |
| Backend API (`pipeline/backend.py`) | **Written, not yet tested** | Implements the calls below. First task: start it and try every call. |
| Speed of a new analysis | **Measured once** | About 15 minutes for a 40 × 42 km zone with 8 radar passes. It depends on zone size, number of passes and NASA's download speed. Design for a job with progress, not an instant answer. |

## Phases

### Phase 1 · Viewer for one precomputed site (start now)
- Base map (Leaflet or MapLibre) with satellite or terrain tiles.
- Load `web/souss/summary.json`, then add the radar frame for the selected date and the change map as image overlays, using `bounds`.
- Time slider over `dates` that swaps the radar frame. A play button to animate it.
- Layer toggles: change map, radar frame, and any extra layers listed under `layers` in `summary.json` (displacement and fringes for the earthquake site). Opacity slider for the change map.
- Legend built from `legend`: colour, name, hectares. Hide classes with 0 ha and the `stable` class (it has no colour).
- An info panel showing `source`, `excluded_dates` and the date range.

### Phase 2 · Several sites (start now)
- A site picker driven by `web/sites.json`: each entry has `site`, `name`, `event`, `event_date`, `bounds` and `folder`.
- Zoom to each site's `bounds` when selected.
- A story card per site: text from `story`, scores from `evaluation`, and the share of land per event from `event_share_of_land_percent`, all in that site's `summary.json`.

### Phase 3 · Pick a zone and a period, run an analysis
- Draw a rectangle on the map. Show its size in km and block it above the limit (see Limits).
- Pick start and end dates. Block dates before **15 June 2026**.
- Call `coverage` first and tell the user before they wait if NISAR has nothing there.
- Start the job, then show progress (see the note under the API).
- When done, open the result exactly like a Phase 1 site: same files, same viewer.
- Keep a "recent analyses" list so finished zones reopen instantly.

### Phase 4 · Test mode for the demo
- For demo zones, show the model's map and the reference side by side (or with a swipe slider) and the score from `summary.json`'s `evaluation` field.

## Files you get per site

Every site and every finished analysis is one folder with the same layout. All images are already in Web Mercator, so they line up with standard web map tiles.

| File | What it is | How to show it |
|---|---|---|
| `summary.json` | Bounds, dates, file names, legend, scores, notes | Read first. Drives everything else. |
| `changemap.png` | Detected changes, transparent where nothing changed | Image overlay on top, opacity about 0.85 |
| `radar_YYYY-MM-DD.jpg` | Radar image for one date. Red = HH, green = HV, blue = HH−HV | Image overlay under the change map, swapped by the time slider |
| `displacement.png` (earthquake site only) | Ground motion in cm along the radar line of sight: red and blue are opposite directions, white is none. Scale in `layers.displacement.scale_cm` | Optional layer, off by default |
| `fringes.png` (earthquake site only) | Classic interferogram rainbow: each full colour cycle is about 12 cm of ground motion | Optional layer; strong visual for the earthquake story |

### Classes in the change map

| Class id | Name | Colour (RGB) | Notes |
|---|---|---|---|
| 0 | stable | none (transparent) | |
| 1 | vegetation gain | 40, 200, 60 | Farmland only is reliable |
| 2 | vegetation loss | 230, 50, 50 | Farmland only is reliable |
| 3 | burned | 110, 30, 10 | |
| 4 | flooded | 0, 150, 255 | Inundation, not whether it was abnormal |
| 5 | water | 40, 70, 160 | Permanent water from land cover; drawn semi-transparent |
| 6 | earthquake ground displacement | 255, 0, 200 | Earthquake site only; from interferometry, not learned |

`web/souss_v1/` is the first, Souss-only map (with a soil-wetting class). The app should use `web/souss/`.

### `web/sites.json` (the site index)

```json
[
 {"site": "souss", "name": "Souss-Massa, Morocco", "event": "farming", "event_date": null, "bounds": [[30.20, -9.71], [30.90, -7.99]], "folder": "souss/"},
 {"site": "cambodia", "name": "Tonle Sap floodplain, Cambodia", "event": "flood", "event_date": "2026-09-27", "bounds": [[...], [...]], "folder": "cambodia/"},
 {"site": "avila", "name": "Ávila, Spain", "event": "fire", "event_date": "2026-07-22", "bounds": [[...], [...]], "folder": "avila/"},
 {"site": "venezuela75", "name": "Northern Venezuela", "event": "earthquake", "event_date": "2026-06-24", "bounds": [[...], [...]], "folder": "venezuela75/"}
]
```

User-run zones (made by `analyze.py` or the backend) are added to this file automatically, with `event: "unknown"`.

### A site's `summary.json` (Ávila, shortened)

```json
{
 "site": "avila", "name": "Ávila, Spain", "event": "fire", "event_date": "2026-07-22",
 "story": "Spain's largest recorded wildfire started on 22 to 23 July 2026; radar maps the burn scar through smoke and at night.",
 "bounds": [[south, west], [north, east]],
 "dates": ["2026-06-08", "..."], "frames": ["radar_2026-06-08.jpg", "..."],
 "changemap": "changemap.png",
 "legend": [
  {"cls": 0, "name": "stable", "color": null, "hectares": 0},
  {"cls": 3, "name": "burned", "color": [110,30,10], "hectares": 29670}
 ],
 "layers": {},
 "evaluation": {"burned": {"precision": 0.95, "recall": 0.77, "f1": 0.85},
                "tested_on": "unseen radar track (track 23) and unseen 5 km blocks"},
 "event_share_of_land_percent": {"vegetation gain": 0.01, "vegetation loss": 0.04, "burned": 9.64, "flooded": 0.0},
 "excluded_dates": ["2026-08-31", "2026-10-06", "2026-10-18"],
 "earthquake": null,
 "model_version": "multi-event v2"
}
```

On the earthquake site, `layers` holds `displacement` and `fringes` (file name, colours, scale) and `earthquake` holds the threshold, the noise level and the interferogram pair used.

### Minimal Leaflet example

```js
const sites = await (await fetch("web/sites.json")).json();   // site picker options
const base = "web/" + sites[0].folder;
const s = await (await fetch(base + "summary.json")).json();
const map = L.map("map").fitBounds(s.bounds);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
const radar  = L.imageOverlay(base + s.frames[0], s.bounds).addTo(map);
const change = L.imageOverlay(base + s.changemap, s.bounds, {opacity: 0.85}).addTo(map);
slider.oninput = e => radar.setUrl(base + s.frames[e.target.value]);   // slider max = s.frames.length - 1
```

## API for new analyses (`pipeline/backend.py`)

Written to match this description, but **never run yet**. Test each call before building on it. Until it works, serve these examples as static JSON files and build the interface against them.

| Call | Purpose |
|---|---|
| `GET /api/sites` | The site list (`web/sites.json`) |
| `POST /api/coverage` | Does NISAR cover this zone and period? Call before starting a job. |
| `POST /api/jobs` | Start an analysis. Needs the header `X-Token`. Returns a job id. |
| `GET /api/jobs/{id}` | State and progress. Poll every 5 to 10 seconds. |
| `GET /web/{id}/summary.json` | Result files, same layout as a site folder |

```
POST /api/coverage
{"bbox": [104.7, 11.7, 105.1, 12.08], "start": "2026-07-15", "end": "2026-11-10"}
→ {"ok": true,
   "tracks": [{"track": 83, "frame": 7, "direction": "ASCENDING", "single_pol_passes": 0,
               "dates": ["2026-07-25","2026-08-18","2026-08-30","2026-09-11","2026-09-23","2026-10-05","2026-10-17","2026-10-29"]}],
   "message": null}
→ {"ok": false, "tracks": [], "message": "No NISAR track has at least 4 dual-polarization passes over this zone in this period."}

POST /api/jobs        (header X-Token: ...)
{"bbox": [105.45, 11.7, 105.85, 12.08], "start": "2026-07-15", "end": "2026-11-10", "name": "Kampong Cham",
 "track": 155, "frame": 8, "earthquake_date": null}              // name, track, frame, earthquake_date are optional
→ {"job_id": "kampong_cham_a1b2c3"}

GET /api/jobs/kampong_cham_a1b2c3
→ {"state": "downloading", "step": "Reading 8 radar passes from track 155 frame 8", "done": 0, "total": 8, "message": null}
→ {"state": "done", "step": "Analysis ready in web/kampong_cham_a1b2c3/", "result": "/web/kampong_cham_a1b2c3/"}
→ {"state": "failed", "message": "Only 3 usable passes after removing bad dates; at least 4 are needed."}
```

Notes for the interface:

- **Job states, in order:** `queued`, `searching`, `downloading`, `processing`, `predicting`, `done`, or `failed` at any point. Show `message` to the user when present; the messages are written to be read as they are.
- **Progress is by stage, not by pass.** `done` and `total` are set once, at the start of downloading (`0` of the number of passes). Use a stage-based progress bar. A per-pass bar needs `site_stack.py` to update `status.json` after each date; that is a good improvement to make.
- **Errors:** `400` with a readable message for an invalid zone or dates, `401` for a missing or wrong `X-Token`, `409` if another analysis is already running (one at a time, because of disk and CPU).
- **`track` and `frame`:** the automatic choice can pick a frame whose catalogue footprint covers the zone but whose data does not. The job then fails with "Only N usable passes". Use the tracks returned by `coverage` to let the user (or the app) retry with a different one.
- **Jobs are not kept across a server restart,** but finished results stay on disk under `web/{id}/`. Each job also leaves working data in `~/data/{id}/`, a few hundred MB.
- CORS is open (`*`) for development. Restrict it before deploying, and do not expose the backend publicly without thinking it through: anyone with the token can start jobs that download several GB.

## Limits the interface should enforce

| Rule | Value | Why |
|---|---|---|
| Maximum zone size | 50 × 50 km | Keeps a job short |
| Earliest start date | 15 June 2026 | NISAR systematic coverage begins around then in most places |
| Latest end date | Today | No future data |
| Minimum usable passes | 4 | Needs dates before and after a change |
| Detectable classes | Those in the legend | Say what it can detect, so users do not expect landslides or oil spills |

## Wording for the interface

- Button: **Analyze zone**. While running, show the step text from the job status. Done: "Analysis ready".
- Class names exactly as in `legend`.
- Explain colours once in a help panel: on radar frames, green means vegetation volume (HV), red means rough or bright surfaces (HH).
- Credit the data on every map: "NISAR (NASA-ISRO) radar, L-band. Processed by `<team name>`."

## What not to show

- **Flood detection did not transfer to a new zone.** On `phnom_penh_north` the model's flood map and the Sentinel-1 reference barely overlap (F1 0.06). If you show that zone, show it as the failure case, next to the reference. The reason is explained in `AI_ARCHITECTURE.md`.
- **`kampong_cham` is a zone where no flood happened.** It shows the pipeline running end to end and not inventing floods; it is not a test of flood detection.
- **No direction (uplift or sinking) for the earthquake motion.** The sign convention is not verified yet; say "ground moved by up to about 39 cm".
- **No reservoir area figures and no ground-sinking map for Souss.** We tested both and the radar data could not support them.
- **No claim that analyses run instantly.** Demo zones are precomputed; new zones run as a job.
- **No accuracy number other than those in `summary.json`.**
- **Vegetation gain and loss are only reliable on farmland.**

## Ready-to-build checklist

- [ ] Viewer loads `web/souss/summary.json` and shows the radar frame plus the change map at the right place.
- [ ] Time slider and play button over the radar frames.
- [ ] Legend generated from `legend`, hiding zero-hectare classes and `stable`.
- [ ] Layer toggles and change-map opacity.
- [ ] Site picker driven by `web/sites.json`.
- [ ] Earthquake site: displacement and fringes layers.
- [ ] Backend started and every call tried (see `README.md`).
- [ ] Zone drawing with size limit, date pickers with the 15 June 2026 floor.
- [ ] Coverage check, job start and stage-based progress working.
- [ ] Result of a finished job opens in the same viewer.
- [ ] Works on a phone screen.

## Who to ask

The AI side (radar processing, model, backend) is owned by `<AI lead name or contact>`. Send questions about files, classes or the API there; changes to the contract will be announced before they happen.
