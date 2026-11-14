import { useState, useEffect } from "react";

const BASE = import.meta.env.BASE_URL + "data/";

export function useManifest() {
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(BASE + "manifest.json")
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => {
        setManifest(raw);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return { manifest, loading, error };
}
