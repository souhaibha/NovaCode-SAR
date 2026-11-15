import { useState, useEffect } from "react";
import { getSites } from "../lib/api";

/**
 * Hook to retrieve the list of available sites.
 *
 * @returns {{ sites: Array, status: 'loading' | 'success' | 'error', error: string | null }}
 */
export function useSites() {
  const [sites, setSites] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setStatus("loading");
      setError(null);
      try {
        const data = await getSites();
        if (active) {
          setSites(Array.isArray(data) ? data : []);
          setStatus("success");
        }
      } catch (err) {
        if (active) {
          setError(err.message || String(err));
          setStatus("error");
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return { sites, status, error };
}
