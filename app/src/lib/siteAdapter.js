/**
 * Generic site summary adapter and coordinate order converters.
 * Works for any site folder — no site-specific names, dates, or layers.
 */

/**
 * Normalizes a raw summary.json object into a consistent shape.
 *
 * @param {Object} raw - Raw parsed JSON from summary.json
 * @param {string} basePath - Base URL/folder path where the site assets live
 * @returns {Object} Normalized site object
 */
export function normalizeSummary(raw, basePath = "") {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid summary data: expected an object");
  }

  // Validate required fields
  if (!raw.bounds || !Array.isArray(raw.bounds) || raw.bounds.length !== 2) {
    throw new Error(
      "Missing or invalid 'bounds' in summary: expected [[south, west], [north, east]]"
    );
  }
  if (!Array.isArray(raw.dates) || raw.dates.length === 0) {
    throw new Error(
      "Missing or invalid 'dates' in summary: expected non-empty array"
    );
  }
  if (!Array.isArray(raw.frames) || raw.frames.length === 0) {
    throw new Error(
      "Missing or invalid 'frames' in summary: expected non-empty array"
    );
  }
  if (raw.frames.length !== raw.dates.length) {
    throw new Error(
      `Mismatched frames and dates length: ${raw.frames.length} frames vs ${raw.dates.length} dates`
    );
  }
  if (!raw.changemap || typeof raw.changemap !== "string") {
    throw new Error(
      "Missing or invalid 'changemap' in summary: expected file path string"
    );
  }
  if (!Array.isArray(raw.legend)) {
    throw new Error("Missing or invalid 'legend' in summary: expected array");
  }

  // Ensure basePath ends with a trailing slash if provided
  const cleanBase = basePath
    ? basePath.endsWith("/")
      ? basePath
      : basePath + "/"
    : "";

  // Normalize frames to array of { date, url }
  const frames = raw.frames.map((frameFile, idx) => ({
    date: raw.dates[idx],
    url: cleanBase + frameFile,
  }));

  // Normalize layers object ({ key: { file, ...rest } }) into array of [{ key, url, ...rest }]
  const layers = Object.entries(raw.layers || {}).map(([key, val]) => {
    const isObj = typeof val === "object" && val !== null;
    const file = isObj ? val.file : String(val);
    const rest = isObj ? { ...val } : {};
    delete rest.file;
    return {
      key,
      url: cleanBase + file,
      ...rest,
    };
  });

  return {
    basePath: cleanBase,
    id: raw.site || raw.id || "",
    name: raw.name || "",
    story: raw.story ?? null,
    event: raw.event ?? null,
    eventDate: raw.event_date ?? raw.eventDate ?? null,
    bounds: raw.bounds, // [[south, west], [north, east]] Leaflet order
    dates: raw.dates,
    frames,
    changemapUrl: cleanBase + raw.changemap,
    legend: raw.legend, // Entries use "cls" key; color may be null
    layers, // Array of [{ key, url, ...rest }]
    frameColors: raw.frame_colors ?? raw.frameColors ?? null,
    excludedDates: raw.excluded_dates ?? raw.excludedDates ?? [],
    source: raw.source ?? null,
    evaluation: raw.evaluation ?? null,
    eventShare: raw.event_share_of_land_percent ?? raw.eventShare ?? null,
    earthquake: raw.earthquake ?? null,
  };
}

/**
 * Filter legend entries: hides items where hectares === 0 or color === null.
 *
 * @param {Array} legend - Full legend list from summary
 * @returns {Array} Filtered list of visible legend items
 */
export function visibleLegend(legend) {
  if (!Array.isArray(legend)) return [];
  return legend.filter((item) => item.hectares !== 0 && item.color !== null);
}

/**
 * Converts API bbox [lon_min, lat_min, lon_max, lat_max] to Leaflet bounds [[lat_min, lon_min], [lat_max, lon_max]].
 */
export function bboxToBounds(bbox) {
  if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
    throw new Error(
      "Invalid bbox: expected [lon_min, lat_min, lon_max, lat_max]"
    );
  }
  const [lonMin, latMin, lonMax, latMax] = bbox;
  return [
    [latMin, lonMin],
    [latMax, lonMax],
  ];
}

/**
 * Converts Leaflet bounds [[south, west], [north, east]] to API bbox [lon_min, lat_min, lon_max, lat_max].
 */
export function boundsToBbox(bounds) {
  if (
    !bounds ||
    !Array.isArray(bounds) ||
    bounds.length !== 2 ||
    !Array.isArray(bounds[0]) ||
    !Array.isArray(bounds[1]) ||
    bounds[0].length !== 2 ||
    bounds[1].length !== 2
  ) {
    throw new Error(
      "Invalid bounds: expected [[south, west], [north, east]]"
    );
  }
  const [[south, west], [north, east]] = bounds;
  return [west, south, east, north];
}
