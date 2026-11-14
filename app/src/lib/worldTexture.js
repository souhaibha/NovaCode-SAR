import { geoEquirectangular, geoPath } from "d3-geo";

/**
 * Builds a 2048x1024 equirectangular texture canvas from GeoJSON country features.
 * Colors are resolved dynamically from theme CSS variables via getComputedStyle.
 *
 * All fills are rendered in pass 1, followed by strokes in pass 2 (lineWidth = 2)
 * so boundaries are never covered by adjacent polygon fills.
 *
 * @param {Array} features - Array of normalized GeoJSON country features
 * @param {Object} options
 * @param {Array<string>|Set<string>} options.zoneCountryNames - Names of countries with active SAR zones
 * @returns {string} - Data URL ("image/png") for the baked globe texture
 */
export function buildWorldTexture(features, { zoneCountryNames = [] } = {}) {
  const width = 2048;
  const height = 1024;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Read theme tokens from documentElement
  const computed =
    typeof window !== "undefined" && window.getComputedStyle
      ? window.getComputedStyle(document.documentElement)
      : null;

  const getVar = (name, fallback) => {
    if (!computed) return fallback;
    const val = computed.getPropertyValue(name)?.trim();
    return val || fallback;
  };

  // Contrast hierarchy:
  // Ocean: deep lowest surface container
  // Land: elevated surface container (clearly lighter than ocean)
  // Supported zone: bright surface container (one step lighter than other land)
  // Stroke: prominent outline token with high visibility on the sphere
  const oceanColor = getVar("--color-surface-container-lowest", "#070e1c");
  const landColor = getVar("--color-surface-container-high", "#232a39");
  const activeLandColor = getVar("--color-surface-bright", "#323949");
  const strokeColor = getVar("--color-outline", "#859490");

  // 1. Fill ocean
  ctx.fillStyle = oceanColor;
  ctx.fillRect(0, 0, width, height);

  // 2. Set up equirectangular projection (maps to globe spherical UV coordinates)
  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2]);

  const path = geoPath(projection, ctx);

  const activeCountries = new Set(
    (zoneCountryNames || []).map((name) => String(name).toLowerCase())
  );

  if (features && Array.isArray(features)) {
    // Pass 1: Draw all country fills first
    for (const feature of features) {
      const name = feature?.properties?.NAME || "";
      const isSupported = activeCountries.has(name.toLowerCase());

      ctx.beginPath();
      path(feature);
      ctx.fillStyle = isSupported ? activeLandColor : landColor;
      ctx.fill();
    }

    // Pass 2: Draw all country strokes on top at lineWidth = 2
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeColor;
    for (const feature of features) {
      ctx.beginPath();
      path(feature);
      ctx.stroke();
    }
  }

  return canvas.toDataURL("image/png");
}
