/**
 * useSiteSummary — fetches and normalizes summary.json for a site entry.
 *
 * Accepts the index entry object { site, folder, bounds, ... } from sites.json.
 * Uses siteBase() so the path is consistent with api.js.
 *
 * Returns { summary, loading, error }
 *   summary has the full normalized shape from normalizeSummary() PLUS
 *   legacy fields that MapView expects (bbox, id, changemap, legend, etc.).
 */
import { useState, useEffect } from "react";
import { siteBase } from "../lib/api";
import { normalizeSummary } from "../lib/siteAdapter";

// In-memory cache (key = folder string)
const summaryCache = new Map();

export default function useSiteSummary(siteEntry) {
  const cacheKey = siteEntry?.folder || siteEntry?.site || null;

  const [summary, setSummary] = useState(() =>
    cacheKey ? summaryCache.get(cacheKey) || null : null
  );
  const [loading, setLoading] = useState(() =>
    Boolean(cacheKey && !summaryCache.has(cacheKey))
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cacheKey) {
      setSummary(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (summaryCache.has(cacheKey)) {
      setSummary(summaryCache.get(cacheKey));
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const base = siteBase(siteEntry);
    const url = base + "summary.json";

    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok)
          throw new Error(`Failed to load summary: HTTP ${res.status} (${url})`);
        const ct = res.headers.get("content-type");
        if (ct && ct.includes("text/html"))
          throw new Error(`Site summary not found`);
        return res.json();
      })
      .then((raw) => {
        // Normalize via siteAdapter (validates required fields, builds frame URLs, etc.)
        const normalized = normalizeSummary(raw, base);

        // Add legacy compatibility fields expected by MapView / App.jsx
        const south = normalized.bounds[0][0];
        const west  = normalized.bounds[0][1];
        const north = normalized.bounds[1][0];
        const east  = normalized.bounds[1][1];
        const bbox  = [west, south, east, north]; // [minLng, minLat, maxLng, maxLat]

        const full = {
          ...normalized,
          // Legacy fields
          bbox,
          id: normalized.id || cacheKey,
          site: normalized.id || cacheKey,
          // changemap filename (not URL) for MapView backward compat
          changemap: raw.changemap || null,
        };

        summaryCache.set(cacheKey, full);
        setSummary(full);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err.message || String(err));
        setLoading(false);
      });

    return () => controller.abort();
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isActuallyLoading = loading || Boolean(cacheKey && !summary);

  return { summary, loading: isActuallyLoading, error };
}
