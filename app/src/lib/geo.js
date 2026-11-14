/**
 * Pure geographic math functions for SARdance.
 * No React, no styling.
 */

export const NEAR_KM = 150;

/**
 * Great-circle distance between two points in km (WGS-84 sphere R = 6371 km).
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if (lat, lon) is inside a bounding box [lon_min, lat_min, lon_max, lat_max].
 */
export function isInsideBbox(lat, lon, bbox) {
  if (!bbox || bbox.length < 4) return false;
  const [w, s, e, n] = bbox;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/**
 * Distance from (lat, lon) to nearest point of bounding box [lon_min, lat_min, lon_max, lat_max].
 * Clamps coordinates to bbox limits, then computes haversine distance. Returns 0 if inside.
 */
export function distanceToBboxKm(lat, lon, bbox) {
  if (isInsideBbox(lat, lon, bbox)) return 0;
  const [w, s, e, n] = bbox;
  const clampedLon = Math.max(w, Math.min(e, lon));
  const clampedLat = Math.max(s, Math.min(n, lat));
  return haversineKm(lat, lon, clampedLat, clampedLon);
}

/**
 * Find the nearest zone from a list of manifest zones to a given coordinate.
 * Returns { zone, distanceKm, inside } or null if no zones.
 */
export function nearestZone(lat, lon, zones) {
  if (!zones || zones.length === 0) return null;
  let best = null;
  for (const zone of zones) {
    if (!zone.bbox) continue;
    const inside = isInsideBbox(lat, lon, zone.bbox);
    const dist = inside ? 0 : distanceToBboxKm(lat, lon, zone.bbox);
    if (!best || dist < best.distanceKm) {
      best = { zone, distanceKm: dist, inside };
    }
  }
  return best;
}

/**
 * Get zone center [lon, lat] object { lon, lng, lat }.
 * Falls back to bounding box midpoint if zone.center is omitted.
 */
export function getZoneCenter(zone) {
  if (!zone) return { lat: 0, lon: 0, lng: 0 };
  if (Array.isArray(zone.center) && zone.center.length >= 2) {
    return {
      lon: zone.center[0],
      lng: zone.center[0],
      lat: zone.center[1],
    };
  }
  const [w, s, e, n] = zone.bbox || [0, 0, 0, 0];
  const lon = (w + e) / 2;
  const lat = (s + n) / 2;
  return { lon, lng: lon, lat };
}

/**
 * Approximate area of bounding box [w, s, e, n] in km².
 */
export function bboxAreaKm2(bbox) {
  if (!bbox || bbox.length < 4) return 0;
  const [w, s, e, n] = bbox;
  const midLat = (s + n) / 2;
  const widthKm = haversineKm(midLat, w, midLat, e);
  const heightKm = haversineKm(s, (w + e) / 2, n, (w + e) / 2);
  return Math.round(widthKm * heightKm);
}

/**
 * Format lat/lon to human readable WGS-84 string (e.g. "34.35°N, 6.15°W").
 */
export function formatCoords(lat, lon) {
  if (typeof lat !== "number" || typeof lon !== "number") return "";
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
  return `${latStr}, ${lonStr}`;
}
