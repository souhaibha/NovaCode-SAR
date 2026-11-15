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
        setSummary(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [siteId]);

  return { summary, loading, error };
}
