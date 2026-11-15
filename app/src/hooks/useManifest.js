import { useState, useEffect } from "react";

const BASE = import.meta.env.BASE_URL + "data/";

/**
 * useManifest — backward-compat hook.
 * Now loads data/sites.json (list of sites) instead of the legacy manifest.json.
 * Returns { manifest, loading, error } where manifest has shape:
 *   { zones: [...sites] }  — zones mirrors the sites array so existing consumers work.
 */
export function useManifest() {
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(BASE + "sites.json")
      .then((r) => {
        if (!r.ok) throw new Error(`sites.json HTTP ${r.status}`);
        return r.json();
      })
      .then((sites) => {
        // Normalize each site entry so existing code that reads zone.id still works.
        // sites.json uses { site, name, event, bounds, folder } — expose site as id.
        const zones = sites.map((s) => ({
          ...s,
          id: s.site, // backward-compat alias
        }));
        setManifest({ zones, sites });
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return { manifest, loading, error };
}
