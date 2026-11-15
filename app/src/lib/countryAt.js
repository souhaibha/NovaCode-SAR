import { geoBounds, geoContains, geoCentroid, geoDistance } from "d3-geo";
import { normalizeFeature, normalizeFeatures } from "./geoWinding";

const cache = new WeakMap();
let globalFeatures = null;

// Preload world.geojson at module level for instant availability
if (typeof window !== "undefined") {
  const base = (import.meta.env?.BASE_URL || "/") + "data/world.geojson";
  fetch(base)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.features) {
        globalFeatures = normalizeFeatures(data.features);
      }
    })
    .catch(() => {});
}

function getIndexedFeatures(features) {
  if (cache.has(features)) {
    return cache.get(features);
  }

  const indexed = features.map((f) => {
    const norm = normalizeFeature(f);
    let centroid = null;
    try {
      centroid = geoCentroid(norm);
    } catch {
      centroid = null;
    }
    return {
      feature: norm,
      bounds: geoBounds(norm),
      centroid,
      name: norm.properties?.NAME || null,
    };
  });

  cache.set(features, indexed);
  return indexed;
}

// Ocean / Sea identification for offshore or deep maritime points
function identifyOcean(lat, lng) {
  if (lat >= 30 && lat <= 46 && lng >= -6 && lng <= 36) return "Mer Méditerranée";
  if (lat >= 12 && lat <= 30 && lng >= 32 && lng <= 56) return "Mer Rouge / Golfe Persique";
  if (lat >= 66) return "Océan Arctique";
  if (lat <= -60) return "Océan Austral";
  if (lng >= -70 && lng <= 20) return lat >= 0 ? "Océan Atlantique Nord" : "Océan Atlantique Sud";
  if (lng >= 20 && lng <= 145 && lat <= 30) return "Océan Indien";
  return lat >= 0 ? "Océan Pacifique Nord" : "Océan Pacifique Sud";
}

/**
 * Identify country at (lat, lng) using d3-geo geoContains with an antimeridian-aware bounding box prefilter.
 * @param {Array} features - Array of GeoJSON country features
 * @param {number} lat - Latitude in degrees
 * @param {number} lng - Longitude in degrees
 * @returns {string|null} - Country name (e.g. "United States", "Algeria") or ocean basin
 */
export function countryAt(features, lat, lng) {
  const targetFeatures =
    features && Array.isArray(features) && features.length > 0
      ? features
      : globalFeatures;

  if (lat == null || lng == null) {
    return null;
  }

  if (!targetFeatures || targetFeatures.length === 0) {
    return identifyOcean(lat, lng);
  }

  const indexed = getIndexedFeatures(targetFeatures);
  const point = [lng, lat];

  // Pass 1: Exact polygon containment with antimeridian-safe bounding box
  for (const item of indexed) {
    const [[w, s], [e, n]] = item.bounds;
    // When a country crosses the 180° antimeridian (e.g. USA, Russia, New Zealand), w > e
    const lngInside = w <= e ? (lng >= w && lng <= e) : (lng >= w || lng <= e);
    const latInside = lat >= s && lat <= n;

    if (lngInside && latInside) {
      if (geoContains(item.feature, point)) {
        return item.name;
      }
    }
  }

  // Pass 2: Coastal waters / territorial sea within ~600 km of nearest land centroid
  let nearestCountry = null;
  let minDistanceRad = Infinity;

  for (const item of indexed) {
    if (!item.centroid || isNaN(item.centroid[0]) || isNaN(item.centroid[1])) continue;
    try {
      const distRad = geoDistance(point, item.centroid);
      if (distRad < minDistanceRad) {
        minDistanceRad = distRad;
        nearestCountry = item.name;
      }
    } catch {
      // Continue
    }
  }

  // 0.10 radian ~ 637 km (coastal/shelf zone)
  if (minDistanceRad < 0.10 && nearestCountry) {
    return nearestCountry;
  }

  // Pass 3: Deep ocean / sea basin
  return identifyOcean(lat, lng);
}
