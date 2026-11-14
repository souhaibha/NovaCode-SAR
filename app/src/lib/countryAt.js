import { geoBounds, geoContains } from "d3-geo";
import { normalizeFeature } from "./geoWinding";

const cache = new WeakMap();

function getIndexedFeatures(features) {
  if (cache.has(features)) {
    return cache.get(features);
  }

  const indexed = features.map((f) => {
    const norm = normalizeFeature(f);
    return {
      feature: norm,
      bounds: geoBounds(norm),
      name: norm.properties?.NAME || null,
    };
  });

  cache.set(features, indexed);
  return indexed;
}

/**
 * Identify country at (lat, lng) using d3-geo geoContains with a bounding-box prefilter.
 * @param {Array} features - Array of GeoJSON country features
 * @param {number} lat - Latitude in degrees
 * @param {number} lng - Longitude in degrees
 * @returns {string|null} - Country name or null if offshore/unmatched
 */
export function countryAt(features, lat, lng) {
  if (!features || !Array.isArray(features) || lat == null || lng == null) {
    return null;
  }

  const indexed = getIndexedFeatures(features);
  const point = [lng, lat];

  for (const item of indexed) {
    const [[w, s], [e, n]] = item.bounds;
    // Bounding box prefilter
    if (lng >= w && lng <= e && lat >= s && lat <= n) {
      if (geoContains(item.feature, point)) {
        return item.name;
      }
    }
  }

  return null;
}
