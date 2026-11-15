/**
 * Backend API seam.
 * Single place for API_BASE configuration and communication with the backend service.
 */

// Single place for the backend URL
const API_BASE = import.meta.env.VITE_API_BASE || null;

// Visible in the built site, throwaway token only; never commit a real token.
const API_TOKEN = import.meta.env.VITE_API_TOKEN || null;

// Dev mock enabled ONLY by VITE_API_MOCK=1; off by default and absent in production
export const IS_MOCK = import.meta.env.VITE_API_MOCK === "1";

// In-memory store for mock jobs
const mockJobStore = new Map();

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
 * Throws when backend is not configured and mock is off.
 */
export async function coverage(bbox, start, end) {
  if (IS_MOCK) {
    // Dev mock: return 2 fake tracks
    return Promise.resolve({
      ok: true,
      tracks: [
        {
          track: 23,
          frame: 73,
          direction: "descending",
          dates: [
            "2026-06-27", "2026-07-09", "2026-07-21", "2026-08-02",
            "2026-08-14", "2026-08-26", "2026-09-07", "2026-09-19",
            "2026-10-01", "2026-10-13",
          ],
          count: 10,
        },
        {
          track: 87,
          frame: 22,
          direction: "ascending",
          dates: [
            "2026-06-20", "2026-07-02", "2026-07-14", "2026-07-26",
            "2026-08-07", "2026-08-19", "2026-08-31", "2026-09-12",
          ],
          count: 8,
        },
      ],
    });
  }

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
 * Sends header X-Token from import.meta.env.VITE_API_TOKEN when set.
 * (visible in the built site, throwaway token only; never commit a real token).
 * Throws when backend is not configured and mock is off.
 */
export async function startJob(payload) {
  if (IS_MOCK) {
    const mockId = `job-sim-${Date.now().toString(36)}`;
    mockJobStore.set(mockId, {
      id: mockId,
      created: Date.now(),
      payload,
    });
    return Promise.resolve({ ok: true, id: mockId });
  }

  if (!API_BASE) {
    throw new Error("Backend not configured");
  }

  const headers = { "Content-Type": "application/json" };
  if (API_TOKEN) {
    headers["X-Token"] = API_TOKEN;
  }

  const res = await fetch(`${API_BASE}/api/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`API error starting job: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Get job status and output info by id.
 * Dev mock steps through queued, searching, downloading, processing, predicting, done on timers.
 * Result points at the first site in sites.json.
 */
export async function getJob(id) {
  if (IS_MOCK) {
    const job = mockJobStore.get(id) || { created: Date.now() - 15000 };
    const elapsed = Date.now() - job.created;
    let status = "queued";
    if (elapsed > 12000) status = "done";
    else if (elapsed > 9000) status = "predicting";
    else if (elapsed > 6000) status = "processing";
    else if (elapsed > 3500) status = "downloading";
    else if (elapsed > 1500) status = "searching";

    let firstFolder = "souss/";
    try {
      const sites = await getSites();
      if (sites?.[0]?.folder) firstFolder = sites[0].folder;
    } catch {
      // fallback
    }

    return Promise.resolve({
      id,
      status,
      folder: status === "done" ? firstFolder : null,
      result: status === "done" ? { folder: firstFolder } : null,
    });
  }

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
  const folder = job.folder || (job.result?.folder ? job.result.folder : job.id ? `${job.id}/` : "");
  if (API_BASE) {
    return `${API_BASE}/${folder}`.replace(/([^:]\/)\/+/g, "$1");
  }
  const base = import.meta.env.BASE_URL || "/";
  return `${base}data/web/${folder}`.replace(/([^:]\/)\/+/g, "$1");
}
