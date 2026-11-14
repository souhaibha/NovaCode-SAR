// Pure functions for pixel and confidence lookups (no React, no styling)

const confidenceCache = new Map();

/**
 * Maps lat/lng to pixel coordinates and normalized 0..1 fractions inside the bounding box.
 * Returns null if (lat, lng) is strictly outside the bbox.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {[number, number, number, number]} bbox - [west, south, east, north]
 * @param {number} width - raster pixel width
 * @param {number} height - raster pixel height
 * @returns {{ x: number, y: number, fx: number, fy: number } | null}
 */
export function latLngToPixel(lat, lng, bbox, width, height) {
  if (!bbox || bbox.length < 4 || !width || !height) return null;
  const [west, south, east, north] = bbox;

  if (lat < south || lat > north || lng < west || lng > east) {
    return null;
  }

  const fx = (lng - west) / (east - west);
  const fy = (north - lat) / (north - south);

  // x: 0 at west, width-1 at east
  // y: 0 at north, height-1 at south
  const x = Math.min(width - 1, Math.max(0, Math.floor(fx * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(fy * height)));

  return { x, y, fx, fy };
}

/**
 * Returns the class ID at the given pixel coordinates.
 *
 * @param {ImageData} imageData
 * @param {number} x
 * @param {number} y
 * @param {Map<number, string> | Function} colorToClass
 * @returns {string | null}
 */
export function classAtPixel(imageData, x, y, colorToClass) {
  if (!imageData || x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
    return null;
  }

  const idx = (y * imageData.width + x) * 4;
  const data = imageData.data;
  const a = data[idx + 3];

  if (a < 50) return null;

  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];

  if (typeof colorToClass === "function") {
    return colorToClass(r, g, b, a);
  }

  const key = (r << 16) | (g << 8) | b;
  if (colorToClass instanceof Map) {
    return colorToClass.get(key) || null;
  }

  return null;
}

/**
 * Returns the confidence score (0..1) from the confidence grid for given (fx, fy) fractions.
 * Row 0 is the NORTH edge, column 0 is the WEST edge.
 *
 * @param {{ grid: number[][] }} confJson
 * @param {number} fx - fraction 0..1 from west to east
 * @param {number} fy - fraction 0..1 from north to south
 * @returns {number | null}
 */
export function confidenceAt(confJson, fx, fy) {
  if (!confJson || !Array.isArray(confJson.grid) || confJson.grid.length === 0) {
    return null;
  }

  const grid = confJson.grid;
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  if (rows === 0 || cols === 0) return null;

  const col = Math.min(cols - 1, Math.max(0, Math.floor(fx * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(fy * rows)));

  const val = grid[row]?.[col];
  return typeof val === "number" ? val : null;
}

/**
 * Fetches and caches the confidence JSON file by URL.
 *
 * @param {string} url
 * @returns {Promise<{ grid: number[][], bbox: number[] }>}
 */
export async function fetchConfidence(url) {
  if (!url) return null;
  if (confidenceCache.has(url)) {
    return confidenceCache.get(url);
  }

  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load confidence JSON at ${url} (HTTP ${res.status})`);
    }
    return res.json();
  })().catch((err) => {
    confidenceCache.delete(url);
    throw err;
  });

  confidenceCache.set(url, promise);
  return promise;
}
