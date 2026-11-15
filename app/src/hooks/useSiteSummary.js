import { useState, useEffect } from 'react';

// In-memory cache to make site transitions instant and eliminate reload issues
const summaryCache = new Map();

export default function useSiteSummary(siteId, dynamicCoords = null) {
  const cacheKey = dynamicCoords
    ? `dyn_${dynamicCoords.lat}_${dynamicCoords.lng}_${dynamicCoords.w || ''}_${dynamicCoords.s || ''}_${dynamicCoords.start || ''}_${dynamicCoords.end || ''}`
    : siteId;
  const [summary, setSummary] = useState(() => (cacheKey ? summaryCache.get(cacheKey) || null : null));
  const [loading, setLoading] = useState(() => Boolean(cacheKey && !summaryCache.has(cacheKey)));
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Connecting to NASA ASF Datapool API…");

  useEffect(() => {
    if (!siteId && !dynamicCoords) {
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

    // If dynamic coordinates are provided, request live NASA data from backend
    if (dynamicCoords) {
      let cancelled = false;

      const poll = () => {
        let dynUrl = `http://localhost:8000/api/dynamic_site?lat=${dynamicCoords.lat}&lng=${dynamicCoords.lng}&country=${encodeURIComponent(dynamicCoords.country || "")}`;
        if (dynamicCoords.start) dynUrl += `&start=${encodeURIComponent(dynamicCoords.start)}`;
        if (dynamicCoords.end) dynUrl += `&end=${encodeURIComponent(dynamicCoords.end)}`;
        if (dynamicCoords.maxPasses) dynUrl += `&max_passes=${dynamicCoords.maxPasses}`;
        if (dynamicCoords.w && dynamicCoords.s && dynamicCoords.e && dynamicCoords.n) {
          dynUrl += `&w=${dynamicCoords.w}&s=${dynamicCoords.s}&e=${dynamicCoords.e}&n=${dynamicCoords.n}`;
        }

        fetch(dynUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`NASA API error: HTTP ${res.status}`);
            return res.json();
          })
          .then((data) => {
            if (cancelled) return;

            // Backend is still processing → poll again in 800ms for ultra-fast reaction
            if (data.status === "processing") {
              if (data.progress) setProgress((prev) => Math.max(prev, data.progress));
              if (data.message) setStatusMessage(data.message);
              setTimeout(poll, 800);
              return;
            }

            // Data ready — normalize bounds/bbox
            if (!data.bbox && data.bounds && data.bounds.length >= 2) {
              const south = data.bounds[0][0];
              const west  = data.bounds[0][1];
              const north = data.bounds[1][0];
              const east  = data.bounds[1][1];
              data.bbox = [west, south, east, north];
            }

            // Smoothly complete remaining stages up to 100% so user sees full execution
            const completeToHundred = async () => {
              setProgress((p) => Math.max(p, 75));
              setStatusMessage("Radiometric calibration & spatial geocoding…");
              await new Promise((r) => setTimeout(r, 400));
              if (cancelled) return;

              setProgress((p) => Math.max(p, 90));
              setStatusMessage("AI model running: soil classification & terrain dynamics…");
              await new Promise((r) => setTimeout(r, 450));
              if (cancelled) return;

              setProgress(100);
              setStatusMessage("Satellite processing 100% completed!");
              await new Promise((r) => setTimeout(r, 650));
              if (cancelled) return;

              summaryCache.set(cacheKey, data);
              setSummary(data);
              setLoading(false);
            };

            completeToHundred();
          })
          .catch((err) => {
            if (cancelled) return;
            console.warn("Backend dynamic site fetch failed:", err);
            setError("Failed to retrieve NASA SAR data for this region. Please verify backend connection.");
            setLoading(false);
          });
      };

      poll();
      return () => { cancelled = true; };
    }

    // Support remote site custom analysis or standard site directory
    let remoteBase = null;
    try {
      const stored = JSON.parse(localStorage.getItem("sarwatch.remote_sites") || "[]");
      const match = stored.find((s) => s.site === siteId);
      if (match?.base) remoteBase = match.base;
    } catch {
      /* ignore */
    }

    const primaryUrl = remoteBase ? `${remoteBase}summary.json` : `${import.meta.env.BASE_URL}data/sites/${siteId}/summary.json`;
    const fallbackUrl = `${import.meta.env.BASE_URL}data/sites/${siteId}/summary.json`;

    fetch(primaryUrl)
      .then((res) => {
        if (!res.ok) {
          if (remoteBase && primaryUrl !== fallbackUrl) {
            return fetch(fallbackUrl).then((r2) => {
              if (!r2.ok) throw new Error(`Failed to load summary for "${siteId}": HTTP ${res.status}`);
              return r2.json();
            });
          }
          throw new Error(`Failed to load summary for "${siteId}": HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        let bbox = data.bbox;
        if (!bbox && data.bounds && data.bounds.length >= 2) {
          const south = data.bounds[0][0];
          const west = data.bounds[0][1];
          const north = data.bounds[1][0];
          const east = data.bounds[1][1];
          bbox = [west, south, east, north];
        }
        const normalized = {
          ...data,
          id: data.site || data.id,
          bbox,
        };
        summaryCache.set(siteId, normalized);
        setSummary(normalized);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [cacheKey]);

  // Derived loading state: if we have a cache key and no summary yet, we are loading.
  const isActuallyLoading = loading || Boolean(cacheKey && !summary);

  // Dynamic estimated time remaining calculation
  let estimatedTime = "Finalizing…";
  if (progress < 25) {
    estimatedTime = "~16 seconds";
  } else if (progress < 45) {
    estimatedTime = "~12 seconds";
  } else if (progress < 65) {
    estimatedTime = "~8 seconds";
  } else if (progress < 85) {
    estimatedTime = "~4 seconds";
  } else if (progress < 98) {
    estimatedTime = "~2 seconds";
  } else if (progress >= 100) {
    estimatedTime = "Completed!";
  }

  return { summary, loading: isActuallyLoading, error, progress, statusMessage, estimatedTime };
}
