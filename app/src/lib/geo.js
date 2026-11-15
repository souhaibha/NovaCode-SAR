/**
 * Pure geo calculation functions (no React, no external dependencies).
 */

export const NEAR_KM = 150;

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two points in km using Haversine formula.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Check if a point (lat, lon) is inside a bbox [lon_min, lat_min, lon_max, lat_max].
 */
export function isInsideBbox(lat, lon, bbox) {
  if (!bbox || bbox.length < 4) return false;
  const [lonMin, latMin, lonMax, latMax] = bbox;
  return lon >= lonMin && lon <= lonMax && lat >= latMin && lat <= latMax;
}

/**
 * Distance in km from a point (lat, lon) to a bbox [lon_min, lat_min, lon_max, lat_max].
 * Clamps lat/lon to bbox edges and computes haversine distance to clamped point (0 if inside).
 */
export function distanceToBboxKm(lat, lon, bbox) {
  if (!bbox || bbox.length < 4) return Infinity;
  const [lonMin, latMin, lonMax, latMax] = bbox;

  if (isInsideBbox(lat, lon, bbox)) {
    return 0;
  }

  const clampedLat = Math.max(latMin, Math.min(latMax, lat));
  const clampedLon = Math.max(lonMin, Math.min(lonMax, lon));

  return haversineKm(lat, lon, clampedLat, clampedLon);
}

/**
 * Find the nearest zone among a list of zones.
 * Returns { zone, distanceKm, inside }
 */
export function nearestZone(lat, lon, zones) {
  if (!zones || zones.length === 0) {
    return { zone: null, distanceKm: Infinity, inside: false };
  }

  let bestZone = null;
  let minDistance = Infinity;
  let isInside = false;

  for (const z of zones) {
    const inside = isInsideBbox(lat, lon, z.bbox);
    if (inside) {
      return { zone: z, distanceKm: 0, inside: true };
    }

    const dist = distanceToBboxKm(lat, lon, z.bbox);
    if (dist < minDistance) {
      minDistance = dist;
      bestZone = z;
    }
  }

  return {
    zone: bestZone,
    distanceKm: Math.round(minDistance),
    inside: isInside,
  };
}

/**
 * Size of a bbox in km, measured on the ground:
 * Accepts either [W, S, E, N] or [[S, W], [N, E]].
 */
export function bboxSizeKm(bbox) {
  if (!bbox) return null;
  let w, s, e, n;
  if (Array.isArray(bbox) && Array.isArray(bbox[0]) && bbox.length >= 2) {
    s = bbox[0][0];
    w = bbox[0][1];
    n = bbox[1][0];
    e = bbox[1][1];
  } else if (Array.isArray(bbox) && bbox.length >= 4) {
    [w, s, e, n] = bbox;
  } else {
    return null;
  }
  const latMid = (s + n) / 2;
  const wKm = haversineKm(latMid, w, latMid, e);
  const hKm = haversineKm(s, w, n, w);
  return { wKm: Math.round(wKm * 10) / 10, hKm: Math.round(hKm * 10) / 10 };
}

export const MAX_ZONE_KM = 50;
export const zoneTooLarge = (size) => Boolean(size && (size.wKm > MAX_ZONE_KM || size.hKm > MAX_ZONE_KM));
