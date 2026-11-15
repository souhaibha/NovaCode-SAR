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
        // Normalize each site entry: compute bbox and center from bounds
        const zones = sites.map((s) => {
          let bbox = s.bbox;
          let center = s.center;
          if (!bbox && s.bounds && s.bounds.length >= 2) {
            const south = s.bounds[0][0];
            const west = s.bounds[0][1];
            const north = s.bounds[1][0];
            const east = s.bounds[1][1];
            bbox = [west, south, east, north]; // [minLng, minLat, maxLng, maxLat]
            center = [(west + east) / 2, (south + north) / 2]; // [lng, lat]
          }
          return {
            ...s,
            id: s.site || s.id,
            bbox,
            center,
          };
        });
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
