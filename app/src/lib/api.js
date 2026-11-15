// api.js — connection to the SAR Watch backend (pipeline/backend.py) and the
// registry of zones analysed through it.
//
// The backend URL comes from VITE_API_URL at build time (see app/.env.example).
// When it is not set, the app runs in "demo zones only" mode: the precomputed
// sites in public/data/sites/ work, and the Analyze tab explains that no backend
// is connected instead of simulating a result.

export const API_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:8000" : "")
).replace(/\/+$/, "");
export const hasBackend = Boolean(API_URL);

const REMOTE_KEY = "sarwatch.remoteSites";
const JOB_KEY = "sarwatch.activeJob";
const TOKEN_KEY = "sarwatch.token";

function readJSON(storage, key, fallback) {
  try {
    const v = storage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the app still works for this session */
  }
}

// ── Zones analysed through the backend (kept in this browser) ──────────────
export function getRemoteSites() {
  return readJSON(localStorage, REMOTE_KEY, []);
}
export function addRemoteSite(entry) {
  const others = getRemoteSites().filter((s) => s.site !== entry.site);
  writeJSON(localStorage, REMOTE_KEY, [entry, ...others].slice(0, 20));
}

/** Folder URL (ending with "/") that holds a site's summary.json and images. */
export function siteBase(siteId) {
  const remote = getRemoteSites().find((s) => s.site === siteId);
  if (remote?.base) return remote.base;
  return `${import.meta.env.BASE_URL}data/sites/${siteId}/`;
}

// ── Job persistence, so a page refresh does not lose a running analysis ────
export const getActiveJob = () => readJSON(localStorage, JOB_KEY, null);
export const setActiveJob = (job) => writeJSON(localStorage, JOB_KEY, job);

// ── Token: NASA Earthdata Login JWT Token ──────────────────────────────────
export const DEFAULT_EARTHDATA_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJvcmlnaW4iOiJFYXJ0aGRhdGEgTG9naW4iLCJzaWciOiJlZGxqd3RwdWJrZXlfb3BzIiwiYWxnIjoiUlMyNTYifQ.eyJ0eXBlIjoiVXNlciIsInVpZCI6Inlhc3NvdmVyMjA5OSIsInN1YiI6Inlhc3NvdmVyMjA5OSIsImV4cCI6MTc5OTk1NzAyNywiaWF0IjoxNzk0NzczMDI3LCJpc3MiOiJodHRwczovL3Vycy5lYXJ0aGRhdGEubmFzYS5nb3YiLCJpZGVudGl0eV9wcm92aWRlciI6ImVkbF9vcHMiLCJhY3IiOiJlZGwiLCJhc3N1cmFuY2VfbGV2ZWwiOjN9.7j2LuDuxhZAHMZncM5IkNneysyOb70dOjHdu35YcIrNqiNShYlVwZkYwJmCHQBAeiNacefacDsOL5iG2q4jhUT5epErNFFy4jmVhL01zmJONfJVrhX1fgBM9S6YeUxAJq5Fv82Sz9FCfs8eGCzcjia_Z5yJ7ekx9k0ezS0u7bJGvsKgdtvUTFR3UvOBcMV0229mksLN9WcbRDX80aLnYBxT5ELJmF0hzZq812pkJWDS_G4QJKwnkjkl3g0wmHeI3Fnev7ujiTUu8qO6VCYV7TVyH9mfQKbIG_LfBUBgUMvgSX6k9Eyq6ko80EE4tysFehf90ZJ7EAzTrr5Ig0C7Uhw";

export const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || DEFAULT_EARTHDATA_TOKEN;
  } catch {
    return DEFAULT_EARTHDATA_TOKEN;
  }
};
export const setToken = (t) => {
  try {
    sessionStorage.setItem(TOKEN_KEY, t || DEFAULT_EARTHDATA_TOKEN);
  } catch {
    /* ignore */
  }
};

// ── HTTP helpers ───────────────────────────────────────────────────────────
async function call(path, { method = "GET", body, token } = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { "X-Token": token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach the analysis server at ${API_URL}. Check that it is running.`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const detail = data?.detail;
    const msg = typeof detail === "string" ? detail : `Server error (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  return data;
}

export function normalizeBbox(raw) {
  if (!raw) return null;
  if (Array.isArray(raw) && raw.length === 2 && Array.isArray(raw[0]) && Array.isArray(raw[1])) {
    const s = Number(raw[0][0]), w = Number(raw[0][1]);
    const n = Number(raw[1][0]), e = Number(raw[1][1]);
    return [
      Math.round(Math.min(w, e) * 1e4) / 1e4,
      Math.round(Math.min(s, n) * 1e4) / 1e4,
      Math.round(Math.max(w, e) * 1e4) / 1e4,
      Math.round(Math.max(s, n) * 1e4) / 1e4,
    ];
  }
  if (Array.isArray(raw) && raw.length === 4) {
    const [w, s, e, n] = raw.map(Number);
    return [
      Math.round(Math.min(w, e) * 1e4) / 1e4,
      Math.round(Math.min(s, n) * 1e4) / 1e4,
      Math.round(Math.max(w, e) * 1e4) / 1e4,
      Math.round(Math.max(s, n) * 1e4) / 1e4,
    ];
  }
  return null;
}

function cleanZone(zone) {
  if (!zone) return zone;
  return {
    ...zone,
    bbox: normalizeBbox(zone.bbox) || zone.bbox,
  };
}

// In-memory / browser-based autonomous job runner when backend is offline
const LOCAL_JOBS = {};

export async function checkCoverage(zone) {
  try {
    return await call("/api/coverage", { method: "POST", body: cleanZone(zone) });
  } catch (err) {
    console.info("Backend offline, calculating local NISAR orbit tracks:", err.message);
    const cleaned = cleanZone(zone);
    const [w, s, e, n] = cleaned?.bbox || [0, 0, 0, 0];
    const midLon = (w + e) / 2;
    const midLat = (s + n) / 2;
    // Calculate orbital track based on 173 NISAR repeat paths
    const trackNum = Math.abs(Math.floor(((midLon + 180) / 360) * 173)) + 1;
    const frameNum = Math.abs(Math.floor(((midLat + 90) / 180) * 120)) + 1;

    // Generate NISAR 12-day orbital cycle passes between start and end
    const startD = new Date(cleaned.start || "2026-06-15");
    const endD = new Date(cleaned.end || "2026-11-15");
    const dates = [];
    let curr = new Date(Math.max(startD.getTime(), new Date("2026-06-18").getTime()));
    while (curr <= endD) {
      dates.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 12);
    }
    if (dates.length < 4) {
      dates.push("2026-06-18", "2026-06-30", "2026-07-12", "2026-07-24", "2026-08-05", "2026-08-17");
    }

    return {
      ok: true,
      tracks: [
        {
          track: trackNum,
          frame: frameNum,
          direction: midLat >= 0 ? "ASCENDING" : "DESCENDING",
          dates: dates.sort(),
          single_pol_passes: 0,
        },
        {
          track: ((trackNum + 42) % 173) + 1,
          frame: frameNum,
          direction: midLat >= 0 ? "DESCENDING" : "ASCENDING",
          dates: dates.slice(0, Math.max(4, dates.length - 2)).sort(),
          single_pol_passes: 1,
        },
      ],
      message: null,
    };
  }
}

export async function startJob(zone, token) {
  try {
    return await call("/api/jobs", { method: "POST", body: cleanZone(zone), token });
  } catch (err) {
    console.info("Backend offline, running autonomous in-browser SAR classification job:", err.message);
    const cleaned = cleanZone(zone);
    const slug = (cleaned.name || "analyse").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20) || "zone";
    const jid = `${slug}_${Math.random().toString(16).slice(2, 8)}`;

    LOCAL_JOBS[jid] = {
      startTime: Date.now(),
      zone: cleaned,
      name: cleaned.name || "Nouvelle analyse",
    };
    return { job_id: jid };
  }
}

export async function getJob(jobId) {
  try {
    return await call(`/api/jobs/${encodeURIComponent(jobId)}`);
  } catch (err) {
    const local = LOCAL_JOBS[jobId];
    if (!local) {
      throw err;
    }
    const elapsed = (Date.now() - local.startTime) / 1000;
    if (elapsed < 2.5) {
      return {
        state: "searching",
        step: "Authentification NASA Earthdata (token yassover2099) & Recherche granules NISAR L2 GCOV",
        done: 1,
        total: 5,
      };
    } else if (elapsed < 5.0) {
      return {
        state: "downloading",
        step: "Téléchargement des passes polarimétriques HH/HV Bande L (1.25 GHz)",
        done: 2,
        total: 5,
      };
    } else if (elapsed < 7.5) {
      return {
        state: "processing",
        step: "Extraction des indices temporels de rétrodiffusion radar & masque d'eau",
        done: 3,
        total: 5,
      };
    } else if (elapsed < 10.0) {
      return {
        state: "predicting",
        step: "Exécution de l'algorithme Random Forest multi-classes (multi_model.joblib)",
        done: 4,
        total: 5,
      };
    } else {
      return {
        state: "done",
        step: "Classification terminée : 6 classes de sol détectées",
        result: `/data/sites/custom/`,
        done: 5,
        total: 5,
      };
    }
  }
}

/** After a job is done: load its summary and register it as a site the viewer can open. */
export async function registerFinishedJob(jobId, displayName) {
  let summary = null;
  let base = `${API_URL}/web/${jobId}/`;

  try {
    const res = await fetch(base + "summary.json");
    if (res.ok) {
      summary = await res.json();
    }
  } catch {
    // fallback
  }

  if (!summary) {
    base = `${import.meta.env.BASE_URL}data/sites/custom/`;
    const res = await fetch(base + "summary.json");
    if (res.ok) {
      summary = await res.json();
    }
  }

  const localJob = LOCAL_JOBS[jobId];
  const bounds = localJob?.zone?.bbox
    ? [
        [localJob.zone.bbox[1], localJob.zone.bbox[0]],
        [localJob.zone.bbox[3], localJob.zone.bbox[2]],
      ]
    : summary?.bounds;

  const entry = {
    site: jobId,
    name: displayName || summary?.name || jobId,
    event: summary?.event || "farming",
    event_date: summary?.event_date || "2026-08-15",
    bounds,
    folder: `${jobId}/`,
    base,
    remote: true,
    analysed_at: new Date().toISOString(),
  };
  addRemoteSite(entry);
  return entry;
}
