/**
 * Recent analyses storage and active job tracking in localStorage.
 * Every localStorage call is wrapped in try/catch to gracefully handle
 * private browsing mode or storage quotas.
 */

const RECENT_KEY = "novacode_recent_analyses";
const ACTIVE_JOB_KEY = "novacode_active_job_id";

/**
 * Retrieve the list of recent analyses: Array<{ id, name, bbox, start, end, folder? }>
 */
export function getRecentAnalyses() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Save or update an analysis item in recent analyses.
 * Moves the item to the top and limits the list to 20 items.
 */
export function saveRecentAnalysis(item) {
  if (!item || !item.id) return;
  try {
    const list = getRecentAnalyses();
    const existing = list.find((x) => x.id === item.id);
    const updatedItem = {
      id: item.id,
      name: item.name || existing?.name || `Zone ${item.id.slice(-6)}`,
      bbox: item.bbox || existing?.bbox || null,
      start: item.start || existing?.start || null,
      end: item.end || existing?.end || null,
      folder: item.folder || existing?.folder || null,
      timestamp: item.timestamp || existing?.timestamp || Date.now(),
    };
    const filtered = list.filter((x) => x.id !== item.id);
    filtered.unshift(updatedItem);
    const capped = filtered.slice(0, 20);
    localStorage.setItem(RECENT_KEY, JSON.stringify(capped));
  } catch {
    // Gracefully ignore storage quota / sandbox exceptions
  }
}

/**
 * Clear all recent analyses from localStorage.
 */
export function clearRecentAnalyses() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Get active job ID currently in progress, if any.
 */
export function getActiveJobId() {
  try {
    return localStorage.getItem(ACTIVE_JOB_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Set or clear the active job ID in localStorage.
 */
export function setActiveJobId(id) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_JOB_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_JOB_KEY);
    }
  } catch {
    // Ignore
  }
}
