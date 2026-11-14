import { useState, useEffect, useCallback } from "react";

function getRouteFromHash() {
  const hash = window.location.hash;
  if (!hash || hash === "#" || hash === "#/") {
    return "/";
  }
  // Remove leading '#'
  return hash.slice(1);
}

/**
 * Lightweight hash-based router hook.
 * Route examples: "/" or "/map/gharb"
 */
export function useHashRoute() {
  const [route, setRoute] = useState(getRouteFromHash);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((path) => {
    const formatted = path.startsWith("#") ? path : "#" + (path.startsWith("/") ? path : "/" + path);
    if (window.location.hash === formatted) {
      setRoute(getRouteFromHash());
    } else {
      window.location.hash = formatted;
    }
  }, []);

  return { route, navigate };
}
