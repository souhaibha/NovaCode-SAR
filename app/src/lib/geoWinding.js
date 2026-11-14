import { geoArea } from "d3-geo";

/**
 * Normalizes a GeoJSON feature's winding order.
 * In RFC 7946 GeoJSON, exterior rings should be counter-clockwise.
 * When wound clockwise, d3-geo considers the complement of the polygon (geoArea > 2*PI).
 * If inverted, this function reverses coordinate rings to restore correct interior orientation.
 */
export function normalizeFeature(feature) {
  if (!feature || !feature.geometry) return feature;
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

/**
 * Normalizes an array of GeoJSON features.
 */
export function normalizeFeatures(features) {
  if (!features || !Array.isArray(features)) return [];
  return features.map(normalizeFeature);
}
