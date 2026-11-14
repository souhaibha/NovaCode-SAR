// Pure functions for event mask pixel computation (no React)

const imageCache = new Map();

/**
 * Converts a hex color string (#RRGGBB) to [r, g, b].
 * Falls back to #FF5A5F [255, 90, 95] if missing or invalid.
 *
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  if (!hex) return [255, 90, 95];
  const h = hex.replace("#", "");
  if (h.length !== 6) return [255, 90, 95];
  return [
    parseInt(h.substring(0, 2), 16) || 255,
    parseInt(h.substring(2, 4), 16) || 90,
    parseInt(h.substring(4, 6), 16) || 95,
  ];
}

/**
 * Loads a PNG into a canvas with imageSmoothingEnabled = false and returns ImageData.
 * Caches by url so each date is loaded only once.
 *
 * @param {string} url - The URL of the image to load
 * @returns {Promise<ImageData>}
 */
export async function loadImageData(url) {
  if (imageCache.has(url)) {
    return imageCache.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        imageCache.delete(url);
        reject(new Error(`Failed to create 2D canvas context for ${url}`));
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(data);
    };
    img.onerror = () => {
      imageCache.delete(url);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });

  imageCache.set(url, promise);
  return promise;
}

/**
 * Maps the integer (r<<16 | g<<8 | b) to the class id.
 *
 * @param {Array<{ id: string, color: string }>} classes
 * @returns {Map<number, string>}
 */
export function buildColorToClass(classes) {
  const map = new Map();
  if (!classes || !Array.isArray(classes)) return map;

  for (const c of classes) {
    if (!c.color || !c.id) continue;
    const h = c.color.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    const key = (r << 16) | (g << 8) | b;
    map.set(key, c.id);
  }

  return map;
}

/**
 * Computes event mask pixels and transition counts between start and end classification images.
 * Paints pixels with event.color (alpha ~200), falling back to #FF5A5F.
 * Special case: if event.id === "water_change", draws both new_water (light blue #38BDF8)
 * and water_lost (orange #F59E0B) on the same overlay and tracks their pixels separately.
 *
 * @param {ImageData} imgStart - ImageData of the start classification PNG
 * @param {ImageData} imgEnd - ImageData of the end classification PNG
 * @param {{ id: string, color?: string, from?: string[], to?: string[] }} event - The active event definition
 * @param {Array<{ id: string, color: string }>} classes - Classes list from manifest
 * @returns {{ mask: ImageData, pixels: number, transitions: Record<string, number>, newWaterPixels?: number, waterLostPixels?: number }}
 */
export function eventMask(imgStart, imgEnd, event, classes) {
  const w = Math.min(imgStart.width, imgEnd.width);
  const h = Math.min(imgStart.height, imgEnd.height);

  const mask = new ImageData(w, h);
  const outData = mask.data;

  const colorMap = buildColorToClass(classes);

  // Palette fallback for subtle edge anti-aliasing variations
  const palette = (classes || []).map((c) => {
    const h = c.color.replace("#", "");
    return {
      id: c.id,
      r: parseInt(h.substring(0, 2), 16) || 0,
      g: parseInt(h.substring(2, 4), 16) || 0,
      b: parseInt(h.substring(4, 6), 16) || 0,
    };
  });

  const sData = imgStart.data;
  const eData = imgEnd.data;

  const isWaterChange = event?.id === "water_change";

  // Standard event RGB (or fallback #FF5A5F)
  const [standardR, standardG, standardB] = hexToRgb(event?.color || "#FF5A5F");

  // Colors for "water_change" special case:
  // light blue #38BDF8 for gained, orange #F59E0B for lost
  const [gainedR, gainedG, gainedB] = hexToRgb("#38BDF8");
  const [lostR, lostG, lostB] = hexToRgb("#F59E0B");

  const fromSet = new Set(event?.from || []);
  const toSet = new Set(event?.to || []);

  let pixels = 0;
  let newWaterPixels = 0;
  let waterLostPixels = 0;
  const transitions = {};

  function matchClass(r, g, b, a) {
    if (a < 50) return null;
    const key = (r << 16) | (g << 8) | b;
    const direct = colorMap.get(key);
    if (direct) return direct;

    let bestId = null;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const dist = (r - p.r) ** 2 + (g - p.g) ** 2 + (b - p.b) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = p.id;
      }
    }
    return bestId;
  }

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const sa = sData[idx + 3];
    const ea = eData[idx + 3];

    if (sa < 50 || ea < 50) {
      outData[idx + 3] = 0;
      continue;
    }

    const startClass = matchClass(sData[idx], sData[idx + 1], sData[idx + 2], sa);
    const endClass = matchClass(eData[idx], eData[idx + 1], eData[idx + 2], ea);

    if (!startClass || !endClass) {
      outData[idx + 3] = 0;
      continue;
    }

    if (isWaterChange) {
      // Gained water: from [sol_nu, vegetation] -> to [eau]
      const isNewWater =
        (startClass === "sol_nu" || startClass === "vegetation") &&
        endClass === "eau";

      // Lost water: from [eau] -> to [sol_nu]
      const isWaterLost = startClass === "eau" && endClass === "sol_nu";

      if (isNewWater) {
        outData[idx] = gainedR;
        outData[idx + 1] = gainedG;
        outData[idx + 2] = gainedB;
        outData[idx + 3] = 200;
        pixels++;
        newWaterPixels++;
        const transKey = `${startClass}_to_${endClass}`;
        transitions[transKey] = (transitions[transKey] || 0) + 1;
      } else if (isWaterLost) {
        outData[idx] = lostR;
        outData[idx + 1] = lostG;
        outData[idx + 2] = lostB;
        outData[idx + 3] = 200;
        pixels++;
        waterLostPixels++;
        const transKey = `${startClass}_to_${endClass}`;
        transitions[transKey] = (transitions[transKey] || 0) + 1;
      } else {
        outData[idx + 3] = 0;
      }
    } else {
      if (fromSet.has(startClass) && toSet.has(endClass)) {
        outData[idx] = standardR;
        outData[idx + 1] = standardG;
        outData[idx + 2] = standardB;
        outData[idx + 3] = 200;

        pixels++;
        const transKey = `${startClass}_to_${endClass}`;
        transitions[transKey] = (transitions[transKey] || 0) + 1;
      } else {
        outData[idx + 3] = 0;
      }
    }
  }

  return {
    mask,
    pixels,
    transitions,
    newWaterPixels: isWaterChange ? newWaterPixels : undefined,
    waterLostPixels: isWaterChange ? waterLostPixels : undefined,
  };
}
