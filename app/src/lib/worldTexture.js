import { geoEquirectangular, geoPath } from "d3-geo";

/**
 * Builds a 2048x1024 equirectangular texture canvas from GeoJSON country features.
 * Colors are resolved dynamically from theme CSS variables via getComputedStyle.
 *
 * @param {Array} features - Array of GeoJSON country features
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
  const computed = typeof window !== "undefined" && window.getComputedStyle
    ? window.getComputedStyle(document.documentElement)
    : null;

  const getVar = (name, fallback) => {
    if (!computed) return fallback;
    const val = computed.getPropertyValue(name)?.trim();
    return val || fallback;
  };

  const oceanColor = getVar("--color-surface-container-lowest", "#070e1c");
  const landColor = getVar("--color-surface-container-low", "#151b2a");
  const activeLandColor = getVar("--color-surface-container-high", "#232a39");
  const strokeColor = getVar("--color-outline-variant", "#3c4a46");

  // 1. Fill ocean
  ctx.fillStyle = oceanColor;
  ctx.fillRect(0, 0, width, height);

  // 2. Set up equirectangular projection (matches globe spherical UV mapping)
  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2]);

  const path = geoPath(projection, ctx);

  const activeCountries = new Set(
    (zoneCountryNames || []).map((name) => String(name).toLowerCase())
  );

  // 3. Draw country polygons onto texture
  if (features && Array.isArray(features)) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = strokeColor;

    for (const feature of features) {
      const name = feature?.properties?.NAME || "";
      const isSupported = activeCountries.has(name.toLowerCase());

      ctx.beginPath();
      path(feature);
      ctx.fillStyle = isSupported ? activeLandColor : landColor;
      ctx.fill();
      ctx.stroke();
    }
  }

  return canvas.toDataURL("image/png");
}
