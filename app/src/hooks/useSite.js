import { useState, useEffect } from "react";
import { normalizeSummary } from "../lib/siteAdapter";

/**
 * Hook to fetch and normalize summary.json for a specific site folder.
 *
 * @param {string} basePath - Base folder path for the site assets
 * @returns {{ site: Object | null, status: 'idle' | 'loading' | 'success' | 'error', error: string | null }}
 */
export function useSite(basePath) {
  const [site, setSite] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!basePath) {
      setSite(null);
      setStatus("idle");
      setError(null);
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setError(null);

    const cleanBase = basePath.endsWith("/") ? basePath : basePath + "/";
    const summaryUrl = cleanBase + "summary.json";

    fetch(summaryUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load site summary: HTTP ${res.status}`);
        }
        const ct = res.headers.get("content-type");
        if (ct && ct.includes("text/html")) {
          throw new Error(`Site summary not found`);
        }
        return res.json();
      })
      .then((raw) => {
        const normalized = normalizeSummary(raw, cleanBase);
        setSite(normalized);
        setStatus("success");

        // Preload radar frames only after summary successfully loads
        if (Array.isArray(normalized.frames)) {
          normalized.frames.forEach((frame) => {
            if (frame.url) {
              const img = new Image();
              img.src = frame.url;
            }
          });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err.message || String(err));
        setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [basePath]);

  return { site, status, error };
}
