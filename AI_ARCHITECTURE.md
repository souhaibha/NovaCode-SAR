# AI architecture for "Dancing with the SARs"

NASA Space Apps Taroudant, AI model track. Written 2026-11-14.

## FINAL: multi-event detector (read this first, written 2026-11-15)

This replaces the plan below and supersedes section 0 where they differ. Section 0 describes the first, vegetation-only version on Souss.

### What it is
One pipeline, one learned model, plus a physics module:
- **Learned classifier** (gradient boosting, التعزيز الاشتقاقي) on NISAR L-band HH+HV time series: classes **stable, vegetation gain, vegetation loss, burned, flooded**.
- **Earthquake module** (physics, not learned): ground displacement from the NISAR interferogram (التداخل الراداري) spanning the quake, flagged where motion exceeds 3x the noise of a pre-event pair (and at least 6 cm). It is not a learned class because the only map of where the ground moved is the interferogram itself, so there is no independent label to learn from.

### Sites and data
| Site | Event | NISAR track/frame | Dates used | Labels (independent source) |
|---|---|---|---|---|
| Souss-Massa, Morocco | farming | 23/73 | 10 | Sentinel-2 NDVI change |
| Tonle Sap floodplain, Cambodia | flood, Sept 2026 | 83/8 | 10 | Sentinel-1 water (C-band), JRC permanent water removed |
| Ávila, Spain | wildfire, 22 Jul 2026 | 87/22 | 9 | Sentinel-2 burn index (dNBR > 0.27) |
| Northern Venezuela | M7.5 + M7.2 quakes, 24 Jun 2026 | 126/83 | 10 | none (physics module) |
| Ávila, test | same fire | 23/68 (unseen track) | 7 | same as Ávila |
| Cambodia, test | same flood | 148/82 (unseen track) | 6 | same as Cambodia |

### Features (site- and period-independent)
Per pixel, over whatever dates the period contains: change point (نقطة التغيّر) that maximizes the HH/HV change and the levels before/after it; strongest darkening/brightening against the pixel's own median and how long it lasted (separates a receding flood from a lasting burn scar); temporal spread and range; radar vegetation index; 5x5 smoothed change; slope; land cover. No fixed dates, no event date.

### Calibration
Class-balanced training made the first model call events far too often (Venezuela: 32% "vegetation gain"). Fixed with square-root class weighting plus a per-class confidence threshold (العتبة) tuned on one half of the held-out blocks and scored on the other half: gain 0.90, loss 0.85, burned 0.80, flooded 0.95. Below threshold a pixel stays stable.

### Measured results (never-trained-on areas)
| Event | Test | Precision | Recall | F1 |
|---|---|---|---|---|
| Burned | **unseen track 23 + unseen 5 km blocks** | 0.95 | 0.77 | **0.85** |
| Burned | Ávila held-out blocks | 0.93 | 0.81 | 0.87 |
| Flooded | **unseen track 148 + unseen 5 km blocks** | 0.82 | 0.43 | **0.56** |
| Flooded | Cambodia held-out blocks | 0.83 | 0.85 | 0.84 |
| Vegetation gain | Souss held-out blocks | 0.70 | 0.27 | 0.39 |
| Vegetation loss | Souss held-out blocks | 0.53 | 0.44 | 0.48 |
| Flooded | **new zone (Phnom Penh north), run through `analyze.py`, scored against Sentinel-1** | 0.04 | 0.09 | **0.06** |
| Earthquake | Venezuela, pair 22 Jun → 4 Jul | displacement up to ~39 cm (p99) vs 1.9 cm noise in the pre-event pair | | |

**Why the new-zone flood test failed (measured, 2026-11-15).** The model flagged 39,756 ha; the Sentinel-1 reference 6,962 ha; overlap 651 ha. On the 15,805 ha the model called flooded but the reference called stable, Sentinel-1 shows no water before or after and no change (median dVV +0.3 dB), while NISAR HH drops 8.3 dB and HV 6.5 dB. Across *all* land in the zone NISAR darkens by about 3 dB (HH -9.7 → -12.6 dB) between July-August and September-October, while Sentinel-1 shows 0.0 dB change. A uniform 3 dB drop over every land type is not a plausible surface change, so the most likely cause is a radiometric inconsistency between those NISAR passes (the products are labelled provisional), with the straight edges in the flood map pointing the same way. Root cause not confirmed. The model learned "strong darkening = flood" and trusts NISAR's absolute change, so it inherits the inconsistency. Fix for future work: per-date radiometric normalization against stable targets, and more flood events in training.

- Stable pixels are correctly left alone 99% of the time after calibration.
- False alarms where nothing happened (Venezuela, fire/flood classes): burned 0.49%, flooded 0.02% of land.
- Flood on the unseen track: when it says flooded it is right 82% of the time, but it finds only 43% of labelled flood. Likely reasons: that track has only 6 dual-polarization dates (5 passes were HH-only) and only 2 after the flood, with the second one after the water started receding.
- Most important input: smoothed HV change, then slope, then smoothed HH change. **HV (cross-polarization, الاستقطاب المتقاطع) carries most of the signal.**

### Data-quality lessons
- The 7 Sep 2026 pass on track 23 is corrupted by radio interference (التداخل الراديوي) everywhere we looked (+7 to +10 dB).
- The product's interference score over-flags: several dates with huge scores have normal values. The pipeline now drops a date only if its median shifts by more than 1.5 dB or a polarization is missing.
- Some passes are HH-only (single polarization); they are dropped.
- Whole-scene brightening with normal interference scores (Ávila 6 and 18 Oct) fits rain-wet soil; excluded from change detection.

### Honest limitations
- Four events, one of each type: the unseen tests change the radar track and location, not the event. Generalization to other fires is untested; **flood detection did not transfer to a new zone** (Phnom Penh north, F1 0.06), most likely because of a scene-wide NISAR darkening that Sentinel-1 does not see.
- Automatic track choice in `analyze.py` can pick a frame whose catalogue footprint covers the zone but whose data does not; the run then stops with "Only N usable passes" and needs `--track`/`--frame`.
- Cambodia floods every year; the model detects inundation (الغمر), not whether it was abnormal.
- Earthquake direction (toward/away from the satellite) relies on an unverified sign convention. Low coherence (التماسك) in tropical vegetation and possible phase-unwrapping errors affect parts of the displacement map.
- Vegetation change only works on farmland (Souss); there are too few examples elsewhere.
- Detection, not forecasting.

### Code (on the Azure VM, `~`)
`site_stack.py` (download, crop, screen dates) → `labels.py` (context + labels) → `train_multi.py` (features, first model) → `calibrate.py` (weights, thresholds, final model `~/data/multi_model.joblib`) → `quake.py` (earthquake module) → `export_sites.py` (web/<site>/ + web/sites.json) → `analyze.py` (zone + period → map, the simulation).

## 0. UPDATE: what was actually built and measured (first version, Souss only)

Sections 1 to 11 below are the original plan. This section records what happened when we ran it on the Souss-Massa valley (Agadir to Aoulouz, Morocco). Where the two disagree, this section is right.

### Data
- NISAR L2 GCOV (backscatter, التشتت الراداري), track 23, frame 73, descending, L-band, HH + HV, 20 m, UTM 29N.
- 11 dates, 27 Jun to 6 Nov 2026. **7 Sep was excluded**: radio-frequency interference (التداخل الراديوي) made it +7 dB brighter over the whole valley; its interference likelihood was about 1,000 times the other dates. 10 dates used, averaged to 40 m.
- Context: ESA WorldCover (land cover, الغطاء الأرضي), Copernicus DEM (slope), Sentinel-2 NDVI (greenness index, مؤشر الخضرة), all from Microsoft Planetary Computer.
- NISAR L2 GUNW interferograms (التداخل الراداري), 8 consecutive pairs.

### Pipeline
1. **Stage 1, change detection:** late (Oct-Nov) minus early (Jun-Jul) in dB, per pixel. Typical seasonal variation is about 0.6 dB, so a 3 dB threshold sits well above noise. Change is concentrated in irrigated parcels along the Souss river; mountains and bare plains are stable.
2. **Stage 2, classifier:** gradient boosting (التعزيز الاشتقاقي) on 24 radar features plus slope and land cover. Labels are weak labels (تسميات ضعيفة) from Sentinel-2 NDVI change (gain > +0.15, loss < -0.15, stable). Evaluated on held-out 5 km blocks (spatial split, to avoid data leakage تسرّب البيانات).
3. **Export:** 8-class change map (GeoTIFF + transparent PNG overlay), 10 radar frames (JPEG) for a time slider, coherence layer, `summary.json`.

### Measured results (held-out areas)
| | Gain P / R | Loss P / R | Mean F1 |
|---|---|---|---|
| 3 dB rule, all land | 0.27 / 0.38 | 0.29 / 0.37 | 0.321 |
| Model HH only | 0.52 / 0.27 | 0.39 / 0.28 | 0.341 |
| Model HV only | 0.58 / 0.36 | 0.41 / 0.34 | 0.408 |
| Model HH+HV | 0.57 / 0.38 | 0.41 / 0.32 | 0.408 |
| Model HH+HV+context | 0.56 / 0.39 | 0.43 / 0.34 | **0.420** |
| 3 dB rule, cropland | 0.45 / 0.52 | 0.42 / 0.46 | 0.460 |
| Model, cropland | 0.60 / 0.54 | 0.47 / 0.42 | **0.507** |

- The model's main gain over the rule is **precision**: roughly double for vegetation gain at the same recall (fewer false alarms).
- **Vegetation loss is the weak class**; on cropland the model is no better than the rule (F1 0.44 both).
- **HV is the informative polarization** (الاستقطاب): HV alone matches HH+HV; HH alone is clearly worse. Most important feature: HV temporal standard deviation.
- Scores are modest because labels come from optical data and about half of radar-visible changes have no optical counterpart (likely ploughing or irrigation: soil roughness and moisture, not greenness).

### Independent checks
- **Optical agreement:** on cropland, radar increases show NDVI gain in 45.7% of pixels and NDVI loss in 1.4%; radar decreases show loss in 44.7%, gain in 1.2%; radar-stable land is optically stable in 95.9%.
- **Coherence (التماسك)** from the 6 good interferogram pairs, median on cropland: stable 0.67, vegetation gain 0.53, vegetation loss 0.56, other flat-land change 0.61. Parcels the classifier flagged lost coherence, i.e. their surface was physically disturbed. Caveat: coherence comes from the same radar, so this confirms the change is real but is not independent of the sensor, and it cannot tell gain from loss.
- **Soil wetting on slopes (about 8,500 ha, mostly above 1,200 m):** HH rises about +3 dB, HV about flat, 43% of it between 1 and 13 Oct, stays elevated afterwards, coherence stays high (0.87, surface not disturbed). Consistent with early-October rain wetting the ground (ثابت العزل الكهربائي, dielectric constant). **Not yet confirmed against rainfall data**; label it "likely rain, unverified".

### What did not work (and why)
- **Flood and fire classes:** no flood or fire occurred in this valley in the NISAR archive window; there was nothing to learn.
- **Water extent change (reservoirs):** inland water sits at about -24 to -26 dB in HV, which is the sensor noise floor (مستوى الضجيج) and overlaps the darkest cropland. Thresholding cannot separate them. The reservoir-area numbers from the first attempt are artefacts of a 1 dB lower noise floor in autumn and must not be presented.
- **Ground deformation (subsidence, هبوط الأرض):** over 108 days the atmospheric phase noise (about 4 cm on stable land) exceeds any plausible subsidence; the combined map is large atmospheric blotches and flagged areas are symmetric (4,210 ha away vs 4,893 ha toward). The two pairs spanning 7 Sep are unusable (coherence 0.10). Dropped. A longer archive (a year or more) could revisit this with a time-series method.
- **Ocean edge:** wind-roughened sea produced a false "land became water" class; removed.

### Honest limitations to state in the presentation
- Five months, one valley, one season: results are not tested on other regions or seasons.
- Labels are optical proxies, not ground truth from field surveys.
- NISAR products used are "provisional" for Jun-Oct 2026 dates (calibration may still change); two of the ten dates are the newer released version, and no jump between versions was visible.
- Interferogram sign convention (toward/away) was assumed, not checked against the product specification; irrelevant now that deformation is dropped.

## 1. Decision

**Do not build one model that detects everything, and do not build one deep model per incident. Build one shared change detector, followed by a small "what kind of change is it" classifier, plus a separate non-ML track for ground deformation.**

```
                        NISAR GCOV (HH, HV backscatter), time series per pixel
                                          |
                          [ shared preprocessing: dB, speckle filter, stack ]
                                          |
                  STAGE 1  generic change detector (no labels needed)
                           "did this pixel change, how much, which direction"
                                          |
                  STAGE 2  change-type attribution (small supervised model)
                           features: dHH, dHV, ratio, land cover, slope, rain
                           -> flood | vegetation loss (fire/clearing) | crop cycle | no event
                                          |
                                   map layers + confidence  --> the app

   NISAR GUNW (interferogram) --> displacement map, coherence drop   (separate track, physics only, no ML)
```

Scope for the hackathon: **two change types from backscatter (flood/water extent and vegetation loss), plus deformation as a display layer if time allows.** The challenge asks for "one or more types of surface change"; two done well beats five done badly.

## 2. Why not a single model for every incident

1. **The incidents do not share an input.** Floods, fires, deforestation and crops are seen in backscatter (الارتداد الراداري) amplitude. Earthquakes and subsidence (هبوط الأرض) are seen in interferometric phase (طور التداخل الراداري), which is a different NISAR product (GUNW, not GCOV), with different units (centimetres of motion, not brightness). Glacier motion uses a third product (offsets, ROFF/GOFF). One network cannot sensibly eat all three.
2. **No training set exists for it.** A single multi-class model needs labels (البيانات المرجعية) for every class, co-registered to L-band imagery. NISAR launched in July 2025, so the archive is roughly a year long and public labelled L-band datasets are close to none.
3. **Time scales differ.** A flood appears between two dates. Deforestation is a permanent step. Crops are a seasonal cycle. Subsidence is a slow trend over many months. One classifier with a fixed time window handles at most one of these well.
4. **Debugging.** When a single model is wrong you cannot tell which part failed. In 48 hours that matters more than accuracy.

## 3. Why not one specialised deep model per incident

1. Each one needs its own labelled data, training run and validation. That is three or four projects, not one.
2. Our machine has no GPU and 8 GB of RAM. Training several segmentation (التجزئة الدلالية) networks is not realistic locally.
3. Most of the work is identical across incidents: download, convert to dB, filter speckle (الضجيج الحُبيبي), build the time stack, find what changed. Separate models duplicate all of it.
4. Overlapping events (a burned area that later floods) produce conflicting outputs that need a merging rule anyway.

## 4. Why the two-stage hybrid works

SAR change is governed by a small set of physical mechanisms. The direction of change in each polarization (الاستقطاب) already tells you most of the answer, so the "AI" part can stay small.

| Event | What happens physically | Signature in L-band |
|---|---|---|
| Open-water flood | Smooth water reflects the pulse away, specular reflection (الانعكاس المرآوي) | HH and HV both drop sharply |
| Flooded forest or crops | Water + stems create double bounce (الارتداد المزدوج) | HH rises, HV roughly stable. L-band sees this under canopy; C-band mostly cannot |
| Fire, logging, clearing | Loss of volume scattering (التشتت الحجمي) from branches and leaves | HV drops and stays low |
| Crop growth and harvest | Biomass builds then is removed | HV rises and falls with the season |
| Rain on bare soil | Higher dielectric constant (ثابت العزل الكهربائي) | HH rises for a few days, then recovers |
| Earthquake, subsidence | Ground moves toward or away from the satellite | Phase change in GUNW; coherence (التماسك) loss where buildings collapsed |

Stage 1 answers "where and how strongly". Stage 2 answers "which row of this table". Adding a new incident type later means adding a class to stage 2, not building a new system.

## 5. Stage 1: generic change detector

Unsupervised (التعلّم غير المُراقَب), so it needs no labels and works on day one.

- **Input:** per pixel, a time series (السلسلة الزمنية) of HH and HV in dB.
- **Baseline (الحالة المرجعية):** median and spread (MAD) of the dates before the event.
- **Score:** `z = (value_on_date - baseline_median) / baseline_spread`, separately for HH and HV. Keep the sign.
- **Decision:** threshold (العتبة) on |z|, then remove isolated pixels with a morphological filter and drop blobs under about 1 hectare.
- **With only two dates:** fall back to the log-ratio, which in dB is simply `after - before`.

Notes:
- Always work in dB (`10*log10`). Speckle is multiplicative, so differences in dB are stable and differences in linear power are not.
- Filter speckle before differencing: a 5x5 Lee filter, or better, average over time, which keeps the spatial detail.
- Compare only images from the same track and direction (ascending with ascending). Different incidence angles (زاوية السقوط) create false change.
- Mask steep slopes using the DEM. Radar shadow and layover (التراكب الراداري) look like water.

## 6. Stage 2: change-type attribution

A gradient boosting (التعزيز الاشتقاقي) classifier, LightGBM or scikit-learn's `HistGradientBoostingClassifier`, on per-pixel or per-blob features. It trains in seconds on CPU and gives feature importances that we can show the judges, which directly answers the challenge question "which polarizations highlight these changes".

Features:
- `dHH`, `dHV`, and their z-scores from stage 1
- HV/HH ratio before and after, and the radar vegetation index `RVI = 4*HV / (HH + HV)` in dual-pol form
- Persistence: is the change still there on the next date (separates flood from clearing, rain from fire)
- Land cover (الغطاء الأرضي) class before the event (ESA WorldCover)
- Slope and height above nearest drainage from Copernicus DEM
- Rainfall in the previous 3 and 10 days (Meteomatics API from the offers list)
- Blob size and shape if working per object

Classes: `flood`, `vegetation_loss`, `seasonal_crop`, `no_event`. The `no_event` class matters as much as the others: it is what absorbs rain-wet soil and other false alarms (إنذارات كاذبة).

**Fallback if labels are too thin:** replace the classifier with explicit rules from the table in section 4 (for example `dHH < -3 dB and dHV < -3 dB and slope < 5° -> flood`). This is a legitimate, explainable baseline, and I would build it first and keep it as the comparison point.

## 7. Deformation track (no ML)

NISAR GUNW products are already unwrapped interferograms (فكّ التفاف الطور done for us). Convert phase to line-of-sight displacement:

`displacement = phase * wavelength / (4 * pi)`, with the L-band wavelength (طول الموجة) of about 24 cm.

Mask pixels with low coherence, colour the result, and show it. A model would add nothing here and could only hide errors. If there is spare time, a simple coherence-drop map between a pre-event pair and a co-event pair is a good damage proxy.

## 8. Data

### Main input
| Data | Product | Use | Where |
|---|---|---|---|
| NISAR L-band backscatter | **L2 GCOV** (geocoded, terrain-corrected, HH + HV) | Stages 1 and 2 | ASF Vertex, `asf_search`, Earthdata |
| NISAR interferograms | **L2 GUNW** | Deformation track | Same |

GCOV is the right starting product: it is already geocoded and radiometrically terrain corrected (التصحيح الراديومتري للتضاريس), so no SAR processing is needed. Avoid RSLC/GSLC (complex data, heavy processing). Files are HDF5; read with `h5py` or `xarray`, and read windows, not whole files, because of the 8 GB of RAM.

**First thing to verify, before anything else:** open Vertex and check how many NISAR GCOV dates actually exist over the chosen area, and in which polarizations. The architecture needs at least 2 dates and works well from about 6. I have not checked coverage for any specific area, and it decides the study site.

### Supplement and labels
| Purpose | Dataset | Note |
|---|---|---|
| Longer history, more dates, pre-2025 events | **Sentinel-1 RTC** on Planetary Computer | C-band, VV/VH. The same pipeline runs on it. Comparing C-band with L-band is one of the challenge's suggested considerations |
| Flood labels | **Sen1Floods11** (hand-labelled, Sentinel-1) ; optical water masks from Sentinel-2 / HLS (NDWI/MNDWI) on near dates | Sen1Floods11 is C-band, usable for pretraining only |
| Permanent water, to separate flood from lake | JRC Global Surface Water | Planetary Computer |
| Burned-area labels | MODIS MCD64A1 burned area, FIRMS active fires, Sentinel-2 dNBR | |
| Forest-loss labels | Hansen Global Forest Change, RADD alerts | |
| Land cover | ESA WorldCover 10 m | Planetary Computer |
| Terrain | Copernicus DEM 30 m | Planetary Computer |
| Rainfall | Meteomatics API | 1,000 queries/day, so query a coarse grid, not per pixel |

Labels made from optical imagery are imperfect (clouds during floods, date mismatch). Treat them as weak labels (تسميات ضعيفة): sample training pixels only from the confident interior of each mask, away from edges.

### Study area
The data availability check decides, but two candidates:
- **Souss-Massa (home ground):** reservoir extent (Abdelmoumen, Aoulouz dams), irrigated agriculture cycles, drought. Strong local story, which the challenge explicitly rewards. The September 2023 Al Haouz earthquake predates NISAR, so it could only be shown with Sentinel-1.
- **A site with a clear event inside the NISAR era** (a large flood or wildfire since late 2025): easier to get a dramatic before/after and clean labels.

A reasonable plan is both: train and validate on the event site, then run the same model on Souss-Massa to demonstrate that it transfers.

## 9. Evaluation

- Metrics per class: IoU (نسبة التقاطع إلى الاتحاد), precision, recall, F1. Plain accuracy is misleading because most pixels are "no change".
- **Split by space, not randomly.** Neighbouring pixels are nearly identical, so a random split leaks (تسرّب البيانات) and inflates scores. Hold out whole tiles, or better, a whole second event.
- Report the rule-based baseline next to the trained model. If the model does not beat the rules, ship the rules.
- Give the app a confidence value per pixel (classifier probability), not only a hard class.

## 10. What I would skip, and when to reconsider

| Option | Verdict | Reason |
|---|---|---|
| U-Net trained from scratch on NISAR | Skip | Not enough L-band labels, no GPU |
| U-Net fine-tuned (الضبط الدقيق) from Sen1Floods11 | Optional stretch, flood only | C-band to L-band shift is real; needs Colab or Azure GPU. Only worth it if stage 2 flood edges look poor |
| Geospatial foundation models (نماذج أساسية) such as Prithvi, Clay, TerraMind | Skip for now | Trained mainly on optical or C-band data; heavy to run; hard to justify in 48 h. Worth one line in "future work" |
| Deep learning for deformation | Skip | The physics already gives the answer |
| LLM that writes a plain-language explanation of each detected change | Good cheap add-on for the app | It sits on top of the model output and does not replace the detector |

## 11. Build order

1. Check NISAR coverage and fix the study area and event dates.
2. Loader: GCOV window -> dB -> speckle filter -> aligned stack (`xarray`).
3. Stage 1 z-score change map. This alone is already a demo.
4. Rule-based attribution from the signature table.
5. Collect weak labels, train the gradient boosting classifier, compare with rules on a held-out area.
6. Export results as Cloud-Optimized GeoTIFF or map tiles for the app team.
7. Stretch: GUNW displacement layer, Sentinel-1 C-band vs L-band comparison, U-Net for floods.

Compute: steps 1 to 6 run on the laptop CPU if we stay within a study area of a few thousand pixels per side and read by window. Use Google Colab or the Azure credit only for the U-Net stretch goal.




echo "eyJ0eXAiOiJKV1QiLCJvcmlnaW4iOiJFYXJ0aGRhdGEgTG9naW4iLCJzaWciOiJlZGxqd3RwdWJrZXlfb3BzIiwiYWxnIjoiUlMyNTYifQ.eyJ0eXBlIjoiVXNlciIsInVpZCI6ImFoYWJlbGxhIiwic3ViIjoiYWhhYmVsbGEiLCJleHAiOjE3OTk4NjU0NzgsImlhdCI6MTc5NDY4MTQ3OCwiaXNzIjoiaHR0cHM6Ly91cnMuZWFydGhkYXRhLm5hc2EuZ292IiwiaWRlbnRpdHlfcHJvdmlkZXIiOiJlZGxfb3BzIiwiYWNyIjoiZWRsIiwiYXNzdXJhbmNlX2xldmVsIjozfQ.F7NHELvVzvZdlLwqB2ZctrN3CxGH7msqU1DAQGM5muRYCMdmNGJTckU3Gi1j1OF0hftKUJe1gEonElow1E78RsRYSHZmvNnFaZPhKzV3zaYlCX7jBrOItmyf_fXN2keGQv3YIjfEf0SBcRD1ntQUkQV6W2f4D4dqBoOqCLlDPF4eIQkJ2jgEgbXXtsmOli-FRkg0p3B6zpRl3VA4kU1XjqNzlyp46ehY3eARtdAgupUMTwMJG9HHGFi3E1XlBISqwFCfDHjZ7nT-fyf2u5VFyzXK3AYBfFkPL8sb7V1-_c6MtUyh4OSnJnjIc21l_lGv2TZ4jvBrFi1FgacY5VRGlw" > ~/.netrc
chmod 600 ~/.netrc

echo "eyJ0eXAiOiJKV1QiLCJvcmlnaW4iOiJFYXJ0aGRhdGEgTG9naW4iLCJzaWciOiJlZGxqd3RwdWJrZXlfb3BzIiwiYWxnIjoiUlMyNTYifQ.eyJ0eXBlIjoiVXNlciIsInVpZCI6ImFoYWJlbGxhIiwic3ViIjoiYWhhYmVsbGEiLCJleHAiOjE3OTk4NjYxMDIsImlhdCI6MTc5NDY4MjEwMiwiaXNzIjoiaHR0cHM6Ly91cnMuZWFydGhkYXRhLm5hc2EuZ292IiwiaWRlbnRpdHlfcHJvdmlkZXIiOiJlZGxfb3BzIiwiYWNyIjoiZWRsIiwiYXNzdXJhbmNlX2xldmVsIjozfQ.Fji9Rdq2_aaHur5n55mgnn6GpEyon9mv7LAEAVhbSNy3N8SYAvwPvncu01NHzKxzk6Q30YE1q-Nc5ayW42Ux83xoRyIoU0MbFa19FEDFMS8PQRB9uXlo5L3GTHT8CcJ9t7eQtonFBB7Nmpq2iaang4nuzP4RcON3m1XHg6VB1RCrypAW0I2k1swYVBAjC5Ly7bOzz_9VFSaIcAfFZriTT-zGNojpqqen_QZ_Uf0YijzBpE_l-CGQRnB_4aZUu1I5lbQauu1HjLR03taZmFVvLtdbPbyLkUIlJKHQ6MJD3wNfUIme0dtYcWwcpx4TZK21Ii-dmBEtzCxfCB2tEjnSFA" > ~/.edl_token
chmod 600 ~/.edl_token