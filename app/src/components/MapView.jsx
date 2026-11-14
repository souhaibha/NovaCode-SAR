import { useEffect, useRef, useState, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  GeoJSON,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import MapControls from "./MapControls";

const BASE = import.meta.env.BASE_URL + "data/";

const BASEMAP_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function toBounds([w, s, e, n]) {
  return [
    [s, w],
    [n, e],
  ];
}

function fillTemplate(template, date) {
  if (!template || !date) return "";
  return BASE + template.replace("{date}", date);
}

function parseHex(hex) {
  if (!hex) return [0, 0, 0];
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) || 0,
    parseInt(h.substring(2, 4), 16) || 0,
    parseInt(h.substring(4, 6), 16) || 0,
  ];
}

// Staggered resize and fitBounds to prevent collapsed Leaflet layout
function MapResizerAndFitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [30, 30] });
    };

    fit();
    const t1 = setTimeout(fit, 80);
    const t2 = setTimeout(fit, 250);
    const t3 = setTimeout(fit, 600);

    const container = map.getContainer();
    let ro = null;
    if (typeof ResizeObserver !== "undefined" && container) {
      ro = new ResizeObserver(() => {
        map.invalidateSize();
      });
      ro.observe(container);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (ro) ro.disconnect();
    };
  }, [map, bounds]);
  return null;
}

// Custom map zoom/nav buttons
function ZoomButtons() {
  const map = useMap();
  return (
    <div
      className="absolute top-4 right-4 z-[1000] flex flex-col gap-1.5 p-1 rounded-xl"
      style={{
        background: "rgba(21, 27, 42, 0.92)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(60, 74, 70, 0.35)",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
      }}
    >
      {[
        { icon: "add", title: "Zoom In", fn: () => map.zoomIn() },
        { icon: "remove", title: "Zoom Out", fn: () => map.zoomOut() },
        {
          icon: "my_location",
          title: "Center",
          fn: () => {
            const bounds = map.options?._bounds;
            if (bounds) map.fitBounds(bounds, { padding: [30, 30] });
            else map.setView(map.getCenter(), 10);
          },
        },
        {
          icon: "fullscreen",
          title: "Fullscreen",
          fn: () => {
            const el = document.documentElement;
            if (!document.fullscreenElement) el.requestFullscreen?.();
            else document.exitFullscreen?.();
          },
        },
      ].map(({ icon, title, fn }) => (
        <button
          key={icon}
          title={title}
          onClick={fn}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-surface-container-high"
          style={{ color: "#dce2f6" }}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </button>
      ))}
    </div>
  );
}

// Map Click & Hover Inspector
function MapInspector({
  zone,
  period,
  eventId,
  cachedPixels,
  confidenceCache,
  setTooltip,
  setCoords,
}) {
  useMapEvents({
    mousemove: (e) => {
      setCoords?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    mouseout: () => {
      setCoords?.(null);
    },
    click: async (e) => {
      const { lat, lng } = e.latlng;
      const bbox = zone?.bbox;
      if (!bbox) return;
      const [w, s, east, n] = bbox;

      // Click outside bbox closes tooltip
      if (lat < s || lat > n || lng < w || lng > east) {
        setTooltip(null);
        return;
      }

      const endDate = period?.end || zone?.dates?.[zone.dates.length - 1];
      const startDate = period?.start || zone?.dates?.[0];

      // Sample class from cached classification image of endDate
      let detectedClass = null;
      let isEventPixel = false;
      const endPx = cachedPixels.current[endDate];
      const startPx = cachedPixels.current[startDate];

      if (endPx) {
        const pxX = Math.floor(((lng - w) / (east - w)) * endPx.width);
        const pxY = Math.floor(((n - lat) / (n - s)) * endPx.height);
        const clampedX = Math.max(0, Math.min(endPx.width - 1, pxX));
        const clampedY = Math.max(0, Math.min(endPx.height - 1, pxY));
        const idx = (clampedY * endPx.width + clampedX) * 4;

        const er = endPx.data.data[idx];
        const eg = endPx.data.data[idx + 1];
        const eb = endPx.data.data[idx + 2];
        const ea = endPx.data.data[idx + 3];

        if (ea > 50 && zone.classes) {
          let bestD = Infinity;
          zone.classes.forEach((c) => {
            const [cr, cg, cb] = parseHex(c.color);
            const d = (er - cr) ** 2 + (eg - cg) ** 2 + (eb - cb) ** 2;
            if (d < bestD) {
              bestD = d;
              detectedClass = c;
            }
          });
        }

        // Check if event pixel
        const ev = zone.events?.find((x) => x.id === eventId);
        if (ev && startPx && detectedClass) {
          const sr = startPx.data.data[idx];
          const sg = startPx.data.data[idx + 1];
          const sb = startPx.data.data[idx + 2];
          const sa = startPx.data.data[idx + 3];
          if (sa > 50) {
            let startBestD = Infinity;
            let startClass = null;
            zone.classes.forEach((c) => {
              const [cr, cg, cb] = parseHex(c.color);
              const d = (sr - cr) ** 2 + (sg - cg) ** 2 + (sb - cb) ** 2;
              if (d < startBestD) {
                startBestD = d;
                startClass = c;
              }
            });
            if (
              startClass &&
              ev.from.includes(startClass.id) &&
              ev.to.includes(detectedClass.id)
            ) {
              isEventPixel = true;
            }
          }
        }
      }

      // Fetch confidence grid
      async function getConf(date) {
        if (!date) return null;
        if (confidenceCache.current[date]) return confidenceCache.current[date];
        try {
          const r = await fetch(fillTemplate(zone.confidence, date));
          if (r.ok) {
            const d = await r.json();
            confidenceCache.current[date] = d;
            return d;
          }
        } catch {}
        return null;
      }

      let confidence = null;
      const confEndData = await getConf(endDate);
      const confStartData = eventId ? await getConf(startDate) : null;

      function sampleGrid(confData) {
        if (!confData?.grid?.length) return null;
        const g = confData.grid;
        const rows = g.length;
        const cols = g[0].length;
        const col = Math.floor(((lng - w) / (east - w)) * cols);
        const row = Math.floor(((n - lat) / (n - s)) * rows);
        const cClamped = Math.max(0, Math.min(cols - 1, col));
        const rClamped = Math.max(0, Math.min(rows - 1, row));
        return g[rClamped][cClamped];
      }

      const valEnd = sampleGrid(confEndData);
      const valStart = sampleGrid(confStartData);

      if (eventId && valEnd !== null && valStart !== null) {
        // For an event, show the lower confidence of the two dates
        confidence = Math.min(valStart, valEnd);
      } else {
        confidence = valEnd;
      }

      setTooltip({
        lat,
        lng,
        className: detectedClass?.label || "Classification",
        classColor: detectedClass?.color || "#57f1db",
        isEvent: isEventPixel,
        eventLabel: zone.events?.find((x) => x.id === eventId)?.label,
        confidence,
        date: endDate,
      });
    },
  });
  return null;
}

export default function MapView(props) {
  // If props are missing, MapView maintains its own internal state
  const isStandalone =
    !props.zone ||
    props.eventId === undefined ||
    !props.period ||
    !props.activeClasses ||
    props.opacity === undefined;

  const [loadedZone, setLoadedZone] = useState(null);
  const [internalEventId, setInternalEventId] = useState(null);
  const [internalPeriod, setInternalPeriod] = useState({ start: null, end: null });
  const [internalActiveClasses, setInternalActiveClasses] = useState([]);
  const [internalOpacity, setInternalOpacity] = useState(0.85);

  // If zone prop is missing, fetch manifest.json
  useEffect(() => {
    if (!props.zone && !loadedZone) {
      fetch(`${BASE}manifest.json`)
        .then((r) => r.json())
        .then((m) => {
          const z = m.zones?.[0];
          if (z) {
            setLoadedZone(z);
            setInternalPeriod({
              start: z.dates?.[0] || null,
              end: z.dates?.[z.dates.length - 1] || null,
            });
            setInternalEventId(z.events?.[0]?.id || null);
            setInternalActiveClasses(z.classes?.map((c) => c.id) || []);
          }
        })
        .catch(() => {});
    }
  }, [props.zone, loadedZone]);

  const zone = props.zone || loadedZone;

  // Effective values: use props if given, otherwise internal state
  const eventId = props.eventId !== undefined ? props.eventId : internalEventId;
  const period = props.period || internalPeriod;
  const activeClasses = props.activeClasses || internalActiveClasses;
  const opacity = props.opacity !== undefined ? props.opacity : internalOpacity;
  const onEventResult = props.onEventResult;

  const [coords, setCoords] = useState(null);
  const [aoi, setAoi] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [eventDataUrl, setEventDataUrl] = useState(null);

  const cachedPixels = useRef({});
  const confidenceCache = useRef({});

  // Fetch AOI GeoJSON
  useEffect(() => {
    if (zone?.aoi) {
      fetch(`${BASE}${zone.aoi}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setAoi)
        .catch(() => {});
    }
  }, [zone?.aoi]);

  const classes = useMemo(() => zone?.classes || [], [zone?.classes]);
  const events = useMemo(() => zone?.events || [], [zone?.events]);
  const selectedEvent = useMemo(
    () => events.find((e) => e.id === eventId) || null,
    [events, eventId]
  );

  const dates = zone?.dates || [];
  const startDate = period?.start || dates[0] || "";
  const endDate = period?.end || dates[dates.length - 1] || "";

  // Helper to load classification PNG and extract pixel data
  const loadClassificationPixels = async (date) => {
    if (!date || !zone?.layers?.classification) return null;
    if (cachedPixels.current[date]) return cachedPixels.current[date];

    const url = fillTemplate(zone.layers.classification, date);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        cachedPixels.current[date] = {
          data,
          width: canvas.width,
          height: canvas.height,
        };
        resolve(cachedPixels.current[date]);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  // Pre-load current date pixels
  useEffect(() => {
    if (endDate) loadClassificationPixels(endDate);
    if (startDate) loadClassificationPixels(startDate);
  }, [startDate, endDate, zone?.layers?.classification]);

  // A5: Event layer computed in browser from classification PNGs
  useEffect(() => {
    if (
      !selectedEvent ||
      !selectedEvent.from ||
      !selectedEvent.to ||
      !startDate ||
      !endDate ||
      startDate === endDate ||
      !zone?.layers?.classification
    ) {
      setEventDataUrl(null);
      onEventResult?.(null);
      return;
    }

    let isCancelled = false;

    async function computeEventLayer() {
      const [startPx, endPx] = await Promise.all([
        loadClassificationPixels(startDate),
        loadClassificationPixels(endDate),
      ]);

      if (!startPx || !endPx || isCancelled) return;

      const w = Math.min(startPx.width, endPx.width);
      const h = Math.min(startPx.height, endPx.height);

      const colorMap = classes.map((c) => ({
        id: c.id,
        rgb: parseHex(c.color),
      }));

      function matchClass(r, g, b, a) {
        if (a < 50) return null;
        let bestId = null;
        let bestDist = Infinity;
        for (let i = 0; i < colorMap.length; i++) {
          const [cr, cg, cb] = colorMap[i].rgb;
          const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestId = colorMap[i].id;
          }
        }
        return bestId;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const out = ctx.createImageData(w, h);

      let pixelCount = 0;
      const sData = startPx.data.data;
      const eData = endPx.data.data;

      for (let i = 0; i < w * h; i++) {
        const idx = i * 4;
        const sr = sData[idx];
        const sg = sData[idx + 1];
        const sb = sData[idx + 2];
        const sa = sData[idx + 3];

        const er = eData[idx];
        const eg = eData[idx + 1];
        const eb = eData[idx + 2];
        const ea = eData[idx + 3];

        const sClass = matchClass(sr, sg, sb, sa);
        const eClass = matchClass(er, eg, eb, ea);

        if (
          sClass &&
          eClass &&
          selectedEvent.from.includes(sClass) &&
          selectedEvent.to.includes(eClass)
        ) {
          // Highlight event pixels with #FF5A5F
          out.data[idx] = 255;
          out.data[idx + 1] = 90;
          out.data[idx + 2] = 95;
          out.data[idx + 3] = 230;
          pixelCount++;
        } else {
          out.data[idx + 3] = 0;
        }
      }

      if (isCancelled) return;

      ctx.putImageData(out, 0, 0);
      const url = canvas.toDataURL("image/png");
      setEventDataUrl(url);

      const areaKm2 = pixelCount * (zone.pixel_area_km2 || 0.038765);
      onEventResult?.({
        pixelCount,
        areaKm2,
        event: selectedEvent,
        startDate,
        endDate,
      });
    }

    computeEventLayer();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedEvent,
    startDate,
    endDate,
    classes,
    zone?.layers?.classification,
    zone?.pixel_area_km2,
    onEventResult,
  ]);

  if (!zone) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#070e1c] text-on-surface-variant font-mono text-sm">
        <span className="material-symbols-outlined text-primary text-[32px] animate-spin mr-2">
          progress_activity
        </span>
        Loading map zone…
      </div>
    );
  }

  const bounds = toBounds(zone.bbox);
  const center = [
    (zone.bbox[1] + zone.bbox[3]) / 2,
    (zone.bbox[0] + zone.bbox[2]) / 2,
  ];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <MapContainer
        center={center}
        zoom={10}
        style={{
          width: "100%",
          height: "100%",
          background: "#070e1c",
          cursor: "crosshair",
        }}
        zoomControl={false}
        scrollWheelZoom
      >
        <MapResizerAndFitBounds bounds={bounds} />
        <TileLayer url={BASEMAP_URL} maxZoom={18} />

        {/* 1. Base classification overlay for end date */}
        {endDate && zone.layers?.classification && (
          <ImageOverlay
            key={`class-${endDate}`}
            url={fillTemplate(zone.layers.classification, endDate)}
            bounds={bounds}
            opacity={opacity}
            className="pixelated"
          />
        )}

        {/* 2. Extra ImageOverlays per checked class mask (A4) */}
        {activeClasses?.map((clsId) => {
          const maskTemplate = zone.layers?.[`mask_${clsId}`];
          if (!maskTemplate || !endDate) return null;
          return (
            <ImageOverlay
              key={`mask-${clsId}-${endDate}`}
              url={fillTemplate(maskTemplate, endDate)}
              bounds={bounds}
              opacity={opacity}
              className="pixelated"
            />
          );
        })}

        {/* 3. Event layer overlay (A5) */}
        {eventDataUrl && (
          <ImageOverlay
            key={`event-${selectedEvent?.id}-${startDate}-${endDate}`}
            url={eventDataUrl}
            bounds={bounds}
            opacity={0.92}
            className="pixelated"
          />
        )}

        {/* AOI GeoJSON boundary */}
        {aoi && (
          <GeoJSON
            data={aoi}
            style={{
              color: "#2DD4BF",
              weight: 2,
              fillOpacity: 0,
              dashArray: "4 3",
            }}
          />
        )}

        <MapInspector
          zone={zone}
          period={period}
          eventId={eventId}
          cachedPixels={cachedPixels}
          confidenceCache={confidenceCache}
          setTooltip={setTooltip}
          setCoords={setCoords}
        />

        <div className="leaflet-top leaflet-right">
          <ZoomButtons />
        </div>
      </MapContainer>

      {/* Standalone Control Box (shown when any prop is missing) */}
      {isStandalone && (
        <MapControls
          zone={zone}
          eventId={eventId}
          setEventId={setInternalEventId}
          period={period}
          setPeriod={setInternalPeriod}
          activeClasses={activeClasses}
          setActiveClasses={setInternalActiveClasses}
          opacity={opacity}
          setOpacity={setInternalOpacity}
        />
      )}

      {/* Cartographic Legend */}
      <div className="absolute bottom-28 left-5 z-[500] flex items-end gap-3 pointer-events-none">
        <div
          className="pointer-events-auto flex flex-col gap-2 p-3 rounded-xl min-w-[200px]"
          style={{
            background: "rgba(21, 27, 42, 0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(60, 74, 70, 0.4)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-outline font-bold uppercase tracking-wider">
              Classification Legend
            </span>
            <span className="font-mono text-[9px] text-primary">
              NISAR L-Band
            </span>
          </div>

          {selectedEvent && (
            <div className="flex items-center gap-2 p-1.5 rounded-lg bg-[#19202e] border border-[#FF5A5F]/40 shadow-xs">
              <span
                className="w-3.5 h-3.5 rounded shadow-[0_0_8px_#FF5A5F]"
                style={{ backgroundColor: "#FF5A5F", flexShrink: 0 }}
              />
              <span className="font-bold text-[12px] text-on-surface">
                Event: {selectedEvent.label}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-0.5">
            {classes.map((cls) => {
              const isActive = activeClasses?.includes(cls.id) ?? true;
              return (
                <div
                  key={cls.id}
                  className="flex items-center gap-1.5 transition-opacity"
                  style={{ opacity: isActive ? 1 : 0.4 }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: cls.color, flexShrink: 0 }}
                  />
                  <span className="text-[11px] text-on-surface-variant truncate">
                    {cls.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scale & Coordinate Datum */}
        <div
          className="pointer-events-auto flex flex-col gap-1 px-3 py-2 rounded-xl"
          style={{
            background: "rgba(21, 27, 42, 0.9)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(60, 74, 70, 0.3)",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-14 h-1 bg-on-surface flex justify-between items-end">
              <div className="w-0.5 h-2 bg-on-surface" />
              <div className="w-0.5 h-2 bg-on-surface" />
            </div>
            <span className="font-mono text-[10px] text-on-surface font-semibold">
              ~10 km
            </span>
          </div>
          <span className="font-mono text-[9px] text-outline">
            {coords
              ? `${coords.lat.toFixed(2)}°N ${Math.abs(coords.lng).toFixed(2)}°W`
              : `${center[0].toFixed(2)}°N ${Math.abs(center[1]).toFixed(2)}°W`}{" "}
            • WGS84
          </span>
        </div>
      </div>

      {/* Click Tooltip */}
      {tooltip && (
        <div
          className="absolute z-[1000] pointer-events-none"
          style={{
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -100%)",
          }}
        >
          <div
            className="w-64 p-3 rounded-xl pointer-events-auto"
            style={{
              background: "rgba(21, 27, 42, 0.97)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(60, 74, 70, 0.5)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div className="flex items-start justify-between gap-1 mb-1.5">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-on-surface">
                  {zone.name} Point
                </span>
                <span className="font-mono text-[10px] text-outline">
                  {tooltip.lat.toFixed(3)}°N, {Math.abs(tooltip.lng).toFixed(3)}°W
                </span>
              </div>
              <button
                className="text-on-surface-variant hover:text-on-surface"
                onClick={() => setTooltip(null)}
              >
                <span className="material-symbols-outlined text-[14px]">
                  close
                </span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-[#19202e] mb-2">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: tooltip.isEvent ? "#FF5A5F" : tooltip.classColor }}
              />
              <span className="text-xs font-semibold text-on-surface">
                {tooltip.isEvent ? `Event: ${tooltip.eventLabel}` : tooltip.className}
              </span>
              {tooltip.confidence !== null && (
                <span className="ml-auto font-mono text-[11px] text-primary flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[13px]">
                    verified
                  </span>
                  {(tooltip.confidence * 100).toFixed(0)}% Conf.
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant pt-1">
              <span>Sensor: NISAR L-Band</span>
              <span className="text-primary">{tooltip.date}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
