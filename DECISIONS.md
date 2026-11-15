# Decisions Log

## 2026-11-15 — Dev B (Side Panels, Content, Mock Service)
- **Legend panel filtering**: Hide `stable` class (`color: null`) and zero-hectare classes (`hectares === 0`). Auto-format hectares to km² when $\ge 100\text{ ha}$ ($100\text{ ha} = 1\text{ km}^2$).
- **Legend qualifiers**: Retained exact qualifier in “soil wetting on slopes (likely rain, unverified)” as mandated by data lead.
- **Sensor wording**: Enforced exact wording `NISAR L-band HH/HV` across all badges, story cards, and help sections.
- **Removed invented values**: Purged all placeholder/Stitch values (“92% CONF”, “Δσ°”, orbit numbers, “Peak at T-3”). All data displayed is derived strictly from `summary.json`.
- **Help panel**: Authored static guide explaining NISAR polarimetry: Red = HH (rough/built), Green = HV (vegetation canopy volume), Blue = HH−HV dB (contrast/bare soil/water), plus day/night/cloud-penetrating microwave explanation.
- **Story card per site**: Narrative, event category badge, and event detection date populated dynamically from `summary.json`.
- **Phase 3 Analysis UI**: Built against static JSON mocks (`coverage_ok.json`, `coverage_no.json`, `job_created.json`, `job_downloading.json`, `job_processing.json`, `job_done.json`, `job_failed.json`). Enforced 15 June 2026 earliest date floor, max 50 × 50 km zone size, status messages matching exact specs ("Reading radar pass 4 of 7", "Analysis ready"), and persistent recent analyses list.
- **Phase 4 Evaluation scores**: Dynamic display for model evaluation metrics (precision, recall, F1 per class and test set notes) populated when present in `summary.json`.
- **Chart.js**: Skipped in favor of real `summary.json` evaluation & legend metrics, adhering to guidelines.
- **Shared style tokens**: All panels adhere to `index.css` theme tokens (`#151b2a`, `#19202e`, `#070e1c`, `#57f1db`, `#dce2f6`, `#bacac5`, `#859490`).
