# SAR Watch: detecting surface events from NISAR radar

Built for the **NASA Space Apps Challenge 2026, Taroudant**, challenge *Dancing with the SARs*.

Pick a zone and a period. The system pulls NISAR L-band radar data (it sees through cloud, smoke and darkness), detects what changed on the ground, and labels it: **burned area, flooding, farming change** and, from radar interferometry, **earthquake ground motion**. The output is a set of map layers and radar frames that a web app can display with a time slider.

> **Detection, not forecasting.** The system maps what already happened inside the period you give it.

Team: `<team name>` · Licence: `<to be chosen by the team, e.g. MIT or Apache-2.0>`

## What it does, and how well (measured)

One pipeline handles four event types. They are not all equally reliable, and not all are learned. Every number below was measured on data the model was not trained on.

| Event | Method | Test | Result |
|---|---|---|---|
| **Fire** (Ávila, Spain, July 2026) | Learned classifier | Unseen radar track and unseen 5 km blocks | Precision 0.95, recall 0.77, **F1 0.85** |
| **Flood** (Tonle Sap, Cambodia, Sept 2026) | Learned classifier | Held-out 5 km blocks | F1 0.84 |
| | | Unseen radar track (same zone) | Precision 0.82, recall 0.43, F1 0.56 |
| | | **New zone** (Phnom Penh north), scored against Sentinel-1 | **F1 0.06 (does not transfer)** |
| **Farming change** (Souss, Morocco) | Learned classifier | Held-out blocks, farmland only | Gain F1 0.39, loss F1 0.48 |
| **Earthquake** (Venezuela, M7.5 and M7.2, 24 June 2026) | Physics (interferometry), not learned | Pair spanning the quake vs pair before it | Ground motion up to about 39 cm (99th percentile) against 1.9 cm noise |
| **No event** | Learned classifier | All sites | About 99% of unchanged pixels left alone; under 0.5% false fire or flood where none occurred |

### Honest limitations

- **Each learned class was trained on one event.** Fire transferred to a new radar view; flood did not transfer to a new zone (see below). Nothing here shows the model works on other fires or floods.
- **The flood failure in the new zone.** There the model flagged 39,756 ha against 6,962 ha in the Sentinel-1 reference, overlapping on 651 ha. Across all land in that zone NISAR darkened by about 3 dB between July-August and September-October while Sentinel-1 showed no change. A uniform drop over every land type is not a plausible surface change, so the most likely cause is a radiometric inconsistency between those NISAR passes (the products are labelled *provisional*). The root cause is not confirmed.
- **Cambodia floods every year.** The flood class detects inundation, not whether it was abnormal.
- **Earthquake is a physics module, not a learned class,** because the only map of where the ground moved is the interferogram itself, so there is no independent label to learn from. The direction of motion (toward or away from the satellite) relies on an unverified sign convention. Coherence is low in tropical vegetation, and phase-unwrapping errors may affect parts of the map.
- **Vegetation change** works on farmland only; elsewhere there were too few examples.
- **Automatic track choice** can pick a frame whose catalogue footprint covers the zone but whose data does not. The run then stops with "Only N usable passes" and needs `--track` and `--frame`.
- **NISAR coverage starts around 15 June 2026** in most places, so earlier events cannot be analysed.
- The radar products used for June to October 2026 are *provisional*; their calibration may change.

Full method, results and reasoning: [`docs/AI_ARCHITECTURE.md`](docs/AI_ARCHITECTURE.md) (Arabic terms in parentheses).

## How it works

```
NISAR L2 GCOV (HH, HV)   --->  screen bad dates (radio interference, HH-only passes, empty scenes)
 per date, 20 m -> 40 m         |
                                v
        features per pixel, over whatever dates the period contains:
        change point, strongest departure from the pixel's median and how long it lasted,
        temporal spread, radar vegetation index, smoothed change, slope, land cover
                                |
                                v
        gradient boosting classifier  --->  stable | vegetation gain | vegetation loss | burned | flooded
        (square-root class weights + per-class confidence thresholds: 0.90 / 0.85 / 0.80 / 0.95)

NISAR L2 GUNW interferograms  --->  ground displacement (cm) where it exceeds 3x the noise of a pre-event pair
```

Training labels come from independent satellites: Sentinel-2 NDVI change (farming), Sentinel-2 burn index dNBR above 0.27 (fire), Sentinel-1 water mapping with permanent water removed (flood).

## Repository layout

```
pipeline/            scripts of the final multi-event system (see "Running it")
pipeline/legacy_souss/  first, Souss-only version (kept for reference)
model/multi_model.joblib   trained classifier with its thresholds
web/                 map layers for the demo zones, plus sites.json (index)
docs/                AI_ARCHITECTURE.md and the run logs behind every number
```

`web/<site>/` holds `changemap.png`, `radar_<date>.jpg`, `summary.json` and, for the earthquake site, `displacement.png` and `fringes.png`. All images are in Web Mercator, so they line up with standard web map tiles. Read bounds, dates, legend (class, colour, hectares), scores and notes from `summary.json`; never hard-code the class list.

## Running it

**Known limitation:** the scripts were developed on one machine and expect to sit in the home directory (`~/site_stack.py`, ...) with data under `~/data`. They are not yet packaged as a library. The steps below follow that layout.

1. **Install**
   ```bash
   python -m venv sar && source sar/bin/activate
   pip install -r requirements.txt
   ```
2. **NASA Earthdata token.** Create a free account at urs.earthdata.nasa.gov, generate a token, and save it as `~/.edl_token` (`chmod 600`). Never commit it. NISAR downloads and searches use it.
3. **Place the files**
   ```bash
   mkdir -p ~/data && cp model/multi_model.joblib ~/data/
   cp pipeline/*.py ~
   ```
4. **Analyse a zone and a period** (zone at most 50 x 50 km, start 15 June 2026 or later):
   ```bash
   export SAR_WEB_ROOT=/path/where/web/should/be/written
   python ~/analyze.py --name my_zone --bbox WEST SOUTH EAST NORTH --start 2026-08-01 --end 2026-10-31
   # optional: --track N --frame M     force a radar track when the automatic choice is poor
   # optional: --earthquake-date YYYY-MM-DD   also run the interferometry module
   ```
   It searches NISAR, picks the best track (dual-polarization dates only), downloads and crops each pass, adds land cover and slope from Microsoft Planetary Computer, runs the model, and writes `web/my_zone/` and an entry in `web/sites.json`. Progress is written to `~/data/my_zone/status.json`. A 40 x 42 km zone with 8 passes took about 15 minutes.
5. **Score a zone against an independent reference** (test mode):
   ```bash
   python ~/score_zone.py my_zone flood 2026-09-27     # or: fire <date>
   ```

### Backend for the app

```bash
API_TOKEN=choose-a-secret uvicorn backend:app --host 0.0.0.0 --port 8000
```

| Call | Purpose |
|---|---|
| `GET /api/sites` | Demo sites (from `web/sites.json`) |
| `POST /api/coverage` | Does NISAR cover a zone and period? Returns tracks and dual-polarization dates |
| `POST /api/jobs` (header `X-Token`) | Start an analysis; returns a job id. One job at a time |
| `GET /api/jobs/{id}` | State and progress; on `done` it returns the result folder |
| `/web/...` | Result files |

Do not expose the backend to the internet without thinking it through: anyone with the address can read results, and anyone with the token can start jobs that download several GB.

### Reproducing the training

`train_multi.py` (features and first model) then `calibrate.py` (weights, thresholds, final model) read `~/data/<site>/` for `souss`, `cambodia`, `avila` (stacks from `site_stack.py`, context and labels from `labels.py`; the Souss stack came from the scripts in `legacy_souss/`). `eval_unseen.py` scores the other-track tests, `quake.py` runs the interferometry module and `export_sites.py` writes `web/`. NISAR data is free to re-download, which is why the radar stacks are not in this repository. Site definitions (zones, tracks, event dates) are at the top of `site_stack.py`.

## Data and credits

Please check each provider's current attribution wording before publishing.

- **NISAR** L2 GCOV and GUNW products (NASA/JPL and ISRO), distributed by the Alaska Satellite Facility DAAC. Provisional products for June to October 2026.
- **Copernicus Sentinel-1 and Sentinel-2** (ESA, European Commission), via Microsoft Planetary Computer.
- **ESA WorldCover 2021**, **Copernicus DEM GLO-30**, **JRC Global Surface Water** (European Commission JRC), via Microsoft Planetary Computer.
- **USGS earthquake catalogue** for the earthquake event dates.
- Event background from public news and Copernicus EMS reporting; event dates and extents were not independently verified beyond the labels described above.
