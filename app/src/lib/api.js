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

// ── Token: typed once by the presenter, kept only for this browser session ─
export const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "nasa2026";
  } catch {
    return "nasa2026";
  }
};
export const setToken = (t) => {
  try {
    sessionStorage.setItem(TOKEN_KEY, t);
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

export const checkCoverage = (zone) => call("/api/coverage", { method: "POST", body: cleanZone(zone) });
export const startJob = (zone, token) => call("/api/jobs", { method: "POST", body: cleanZone(zone), token });
export const getJob = (jobId) => call(`/api/jobs/${encodeURIComponent(jobId)}`);

/** After a job is done: load its summary and register it as a site the viewer can open. */
export async function registerFinishedJob(jobId, displayName) {
  const base = `${API_URL}/web/${jobId}/`;
  const res = await fetch(base + "summary.json");
  if (!res.ok) throw new Error(`The result files for ${jobId} could not be loaded (HTTP ${res.status}).`);
  const summary = await res.json();
  const entry = {
    site: jobId,
    name: displayName || summary.name || jobId,
    event: summary.event || "unknown",
    event_date: summary.event_date || null,
    bounds: summary.bounds,
    folder: `${jobId}/`,
    base,
    remote: true,
    analysed_at: new Date().toISOString(),
  };
  addRemoteSite(entry);
  return entry;
}
