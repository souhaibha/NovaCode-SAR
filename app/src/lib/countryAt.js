import { geoArea, geoBounds, geoContains } from "d3-geo";

function normalizeFeature(feature) {
  if (!feature || !feature.geometry) return feature;
  // If the polygon ring is wound clockwise, d3-geo considers the rest of the sphere interior.
  // In that case, geoArea > 2 * PI (hemisphere), so reverse coordinate rings to fix.
  if (geoArea(feature) > 2 * Math.PI) {
    const geom = feature.geometry;
    if (geom.type === "Polygon") {
      return {
        ...feature,
        geometry: {
          ...geom,
          coordinates: geom.coordinates.map((r) => r.slice().reverse()),
        },
      };
    } else if (geom.type === "MultiPolygon") {
      return {
        ...feature,
        geometry: {
          ...geom,
          coordinates: geom.coordinates.map((poly) =>
            poly.map((r) => r.slice().reverse())
          ),
        },
      };
    }
  }
  return feature;
}

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
