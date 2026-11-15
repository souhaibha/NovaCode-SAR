/**
 * Backend API seam.
 * Single place for API_BASE configuration and communication with the backend service.
 */

// Single place for the backend URL
const API_BASE = import.meta.env.VITE_API_BASE || null;

/**
 * Fetch available sites index.
 * Falls back to local static /data/web/sites.json when API_BASE is not configured.
 */
export async function getSites() {
  if (!API_BASE) {
    const base = import.meta.env.BASE_URL || "/";
    const localUrl = `${base}data/web/sites.json`.replace(/([^:]\/)\/+/g, "$1");
    const res = await fetch(localUrl);
    if (!res.ok) {
      throw new Error(`Failed to load sites index: HTTP ${res.status}`);
    }
    return res.json();
  }

  const res = await fetch(`${API_BASE}/api/sites`);
  if (!res.ok) {
    throw new Error(`API error loading sites: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Check satellite pass coverage for a bounding box and date range.
 * Throws when backend is not configured.
 */
export async function coverage(bbox, start, end) {
  if (!API_BASE) {
    throw new Error("Backend not configured");
  }

  const res = await fetch(`${API_BASE}/api/coverage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bbox, start, end }),
  });
  if (!res.ok) {
    throw new Error(`API error checking coverage: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Start a processing job.
 * Throws when backend is not configured.
 *
 * Note: POST /api/jobs needs X-Token and must go through a server-side proxy or a pasted token, decided later.
 */
export async function startJob(payload) {
  if (!API_BASE) {
    throw new Error("Backend not configured");
  }

  const res = await fetch(`${API_BASE}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`API error starting job: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Get job status and output info by id.
 * Throws when backend is not configured.
 */
export async function getJob(id) {
  if (!API_BASE) {
    throw new Error("Backend not configured");
  }

  const res = await fetch(`${API_BASE}/api/jobs/${id}`);
  if (!res.ok) {
    throw new Error(`API error fetching job: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Returns the base URL for a site's assets given its index entry.
 * @param {{ folder?: string, site?: string }} siteEntry - entry from sites.json
 */
export function siteBase(siteEntry) {
  const folder = siteEntry?.folder || (siteEntry?.site ? siteEntry.site + "/" : "");
  if (API_BASE) {
    return `${API_BASE}/web/${folder}`.replace(/([^:]\/)\/+/g, "$1");
  }
  const base = import.meta.env.BASE_URL || "/";
  return `${base}data/web/${folder}`.replace(/([^:]\/)\/+/g, "$1");
}

/**
 * Returns the folder URL/path of a finished job, so useSite(basePath) can open it
 * exactly like a demo site.
 */
export function resultBase(job) {
  if (!job) return "";
  const folder = job.folder || (job.id ? `${job.id}/` : "");
  if (API_BASE) {
    return `${API_BASE}/${folder}`.replace(/([^:]\/)\/+/g, "$1");
  }
  const base = import.meta.env.BASE_URL || "/";
  return `${base}data/web/${folder}`.replace(/([^:]\/)\/+/g, "$1");
}
