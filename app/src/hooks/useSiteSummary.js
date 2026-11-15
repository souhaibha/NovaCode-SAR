import { useState, useEffect } from 'react';

// In-memory cache to make site transitions instant and eliminate reload issues
const summaryCache = new Map();

export default function useSiteSummary(siteId) {
  const [summary, setSummary] = useState(() => (siteId ? summaryCache.get(siteId) || null : null));
  const [loading, setLoading] = useState(() => Boolean(siteId && !summaryCache.has(siteId)));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!siteId) {
      setSummary(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (summaryCache.has(siteId)) {
      setSummary(summaryCache.get(siteId));
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const url = import.meta.env.BASE_URL + 'data/sites/' + siteId + '/summary.json';

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load summary for "${siteId}": ${res.status}`);
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
  }, [siteId]);

  // Derived loading state: if siteId is present and summary is not yet in state,
  // we are guaranteed to be loading (no render gap or race condition).
  const isActuallyLoading = loading || Boolean(siteId && !summary);

  return { summary, loading: isActuallyLoading, error };
}
