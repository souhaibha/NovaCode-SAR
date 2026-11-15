import { useState, useEffect } from 'react';

export default function useSiteSummary(siteId) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!siteId) {
      setSummary(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSummary(null);

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
        setSummary({
          ...data,
          id: data.site || data.id,
          bbox,
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [siteId]);

  return { summary, loading, error };
}
