import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import L from "leaflet";
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
import ClickTooltip from "./ClickTooltip";
import SwipeDivider from "./SwipeDivider";
import { loadImageData, eventMask, buildColorToClass } from "../lib/eventMask";
import {
  latLngToPixel,
  classAtPixel,
  confidenceAt,
  fetchConfidence,
} from "../lib/pixelInfo";

const BASE = import.meta.env.BASE_URL + "data/";

const BASEMAP_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/**
 * Coordinate order:
 * Manifest bbox is [lon_min, lat_min, lon_max, lat_max].
 * Leaflet requires [[lat_min, lon_min], [lat_max, lon_max]] -> swapped here.
 */
function toBounds([lon_min, lat_min, lon_max, lat_max]) {
  return [
    [lat_min, lon_min],
    [lat_max, lon_max],
  ];
}

function fillTemplate(template, date) {
  if (!template || !date) return "";
  return BASE + template.replace("{date}", date);
}

// Special case definition for combined water change
const WATER_CHANGE_EVENT = {
  id: "water_change",
  label: "Water change",
  color: "#38BDF8",
  secondaryColor: "#F59E0B",
  isWaterChange: true,
};

// Resizes and fits bounds to prevent collapsed Leaflet layout
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

// ── Live scale bar ────────────────────────────────────────────────────────
// Web Mercator meters-per-pixel at zoom Z and latitude φ (WGS-84):
//   m/px = 156543.034 × cos(φ × π/180) / 2^Z
// We pick a 80-px target, round to a "nice" km value, then back-compute
// the exact pixel width so the bar always represents a clean distance.

const NICE_KM = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

function metersPerPixel(zoom, latDeg) {
  return (156543.034 * Math.cos((latDeg * Math.PI) / 180)) / Math.pow(2, zoom);
}

function computeScale(zoom, latDeg, targetPx = 80) {
  const mpp = metersPerPixel(zoom, latDeg);
  const rawKm = (mpp * targetPx) / 1000;
  // find the largest "nice" value that fits within rawKm
  const niceKm = NICE_KM.reduce((best, v) => (v <= rawKm ? v : best), NICE_KM[0]);
  const barPx = (niceKm * 1000) / mpp;
  const label = niceKm >= 1 ? `${niceKm} km` : `${niceKm * 1000} m`;
  return { barPx: Math.round(barPx), label };
}

/** Hook: returns live { barPx, label } updated on zoomend + moveend */
function useScaleBar(mapRef, fallbackLat) {
  const [scale, setScale] = useState(() =>
    computeScale(10, fallbackLat)
  );

  useEffect(() => {
    let raf;
    const trySubscribe = () => {
      const map = mapRef.current;
      if (!map) { raf = requestAnimationFrame(trySubscribe); return; }

      const sync = () => {
        const z = map.getZoom();
        const lat = map.getCenter().lat;
        setScale(computeScale(z, lat));
      };
      sync(); // immediate read once map is ready
      map.on("zoomend moveend", sync);
      return () => map.off("zoomend moveend", sync);
    };
    let cleanup = trySubscribe();
    return () => { cancelAnimationFrame(raf); cleanup?.(); };
  }, [mapRef, fallbackLat]);

  return scale;
}

// Custom map zoom/nav buttons.
// Rendered OUTSIDE MapContainer — receives mapRef from parent.
// mapRef.current is the Leaflet map instance (react-leaflet v4 MapContainer ref).
function ZoomButtons({ mapRef, bounds }) {
  const containerRef = useRef(null);

  // Reactive zoom / min / max — updated on every zoomend
  const [zoomInfo, setZoomInfo] = useState({ zoom: null, min: 0, max: Infinity });
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const fsSupported = !!document.documentElement.requestFullscreen;

  // Subscribe to Leaflet events once the map instance is ready
  useEffect(() => {
    // Poll until the map is ready (MapContainer ref fills asynchronously)
    let raf;
    const trySubscribe = () => {
      const map = mapRef.current;
      if (!map) { raf = requestAnimationFrame(trySubscribe); return; }

      const sync = () =>
        setZoomInfo({ zoom: map.getZoom(), min: map.getMinZoom(), max: map.getMaxZoom() });
      sync(); // initial read
      map.on("zoomend", sync);
      return () => map.off("zoomend", sync);
    };
    let cleanup = trySubscribe();
    return () => { cancelAnimationFrame(raf); cleanup?.(); };
  }, [mapRef]);

  // Fullscreen icon toggle + map resize
  useEffect(() => {
    const onFs = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => mapRef.current?.invalidateSize(), 200);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [mapRef]);

  // Stop clicks/scroll on the panel from bubbling to the map
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  const { zoom, min, max } = zoomInfo;
  const atMax = zoom !== null && zoom >= max;
  const atMin = zoom !== null && zoom <= min;

  const buttons = [
    {
      icon: "add",
      ariaLabel: "Zoom in",
      title: "Zoom in",
      disabled: atMax,
      fn: () => mapRef.current?.zoomIn(),
    },
    {
      icon: "remove",
      ariaLabel: "Zoom out",
      title: "Zoom out",
      disabled: atMin,
      fn: () => mapRef.current?.zoomOut(),
    },
    {
      icon: "my_location",
      ariaLabel: "Recenter on zone",
      title: "Recenter on zone",
      disabled: false,
      fn: () => {
        const map = mapRef.current;
        if (!map) return;
        if (bounds) map.fitBounds(bounds, { padding: [20, 20] });
        else map.setView(map.getCenter(), map.getZoom());
      },
    },
    ...(fsSupported
      ? [
          {
            icon: isFullscreen ? "fullscreen_exit" : "fullscreen",
            ariaLabel: "Toggle fullscreen",
            title: "Toggle fullscreen",
            disabled: false,
            fn: () => {
              if (!document.fullscreenElement)
                document.documentElement.requestFullscreen();
              else document.exitFullscreen();
            },
          },
        ]
      : []),
  ];

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 4,
        borderRadius: 12,
        background: "rgba(21, 27, 42, 0.92)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(60, 74, 70, 0.35)",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
      }}
    >
      {buttons.map(({ icon, ariaLabel, title, disabled, fn }) => (
        <button
          key={ariaLabel}
          type="button"
          aria-label={ariaLabel}
          title={title}
          disabled={disabled}
          onClick={fn}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "#dce2f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.3 : 1,
            transition: "background 0.15s",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.outline = "2px solid #57f1db")}
          onBlur={(e) => (e.currentTarget.style.outline = "none")}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(87,241,219,0.12)"; }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
        </button>
      ))}
    </div>
  );
}

// A6: Map click handler for pixel class and confidence inspection
function MapClickHandler({
  zone,
  startDate,
  endDate,
  selectedEvent,
  classes,
  colorToClass,
  onPointSelect,
  setClickedPoint,
  setPointError,
}) {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;
      const bbox = zone?.bbox;
      if (!bbox) return;

      const [west, south, east, north] = bbox;
      // Ignore clicks outside the zone bounding box
      if (lat < south || lat > north || lng < west || lng > east) {
        return;
      }

      if (!endDate || !zone?.layers?.classification) return;

      setPointError?.(null);

      const endClassificationUrl = fillTemplate(zone.layers.classification, endDate);
      let endImg;
      try {
        endImg = await loadImageData(endClassificationUrl);
      } catch (err) {
        setPointError?.(`Failed to load image: ${endClassificationUrl}`);
        return;
      }

      const px = latLngToPixel(lat, lng, bbox, endImg.width, endImg.height);
      if (!px) return;

      const endClassId = classAtPixel(endImg, px.x, px.y, colorToClass);
      const endClassObj = classes.find((c) => c.id === endClassId) || null;

      // Confidence for end date
      let confEnd = null;
      if (zone.confidence) {
        const confEndUrl = fillTemplate(zone.confidence, endDate);
        try {
          const confEndJson = await fetchConfidence(confEndUrl);
          confEnd = confidenceAt(confEndJson, px.fx, px.fy);
        } catch (err) {
          // If confidence file fails, confEnd remains null (do not invent)
        }
      }

      // If an event is active and start < end: check start date class & event membership
      let startClassObj = null;
      let inEvent = false;
      let finalConfidence = confEnd;

      const hasActiveEvent =
        Boolean(selectedEvent) && Boolean(startDate) && Boolean(endDate) && startDate < endDate;

      if (hasActiveEvent) {
        const startClassificationUrl = fillTemplate(
          zone.layers.classification,
          startDate
        );
        let startImg;
        try {
          startImg = await loadImageData(startClassificationUrl);
        } catch (err) {
          setPointError?.(`Failed to load image: ${startClassificationUrl}`);
          return;
        }

        const startPx = latLngToPixel(lat, lng, bbox, startImg.width, startImg.height);
        const startClassId = startPx
          ? classAtPixel(startImg, startPx.x, startPx.y, colorToClass)
          : null;

        startClassObj = classes.find((c) => c.id === startClassId) || null;

        // Check if clicked pixel belongs to the active event
        if (startClassId && endClassId) {
          if (selectedEvent.id === "water_change") {
            const isGained =
              (startClassId === "sol_nu" || startClassId === "vegetation") &&
              endClassId === "eau";
            const isLost = startClassId === "eau" && endClassId === "sol_nu";
            inEvent = isGained || isLost;
          } else if (selectedEvent.from && selectedEvent.to) {
            inEvent =
              selectedEvent.from.includes(startClassId) &&
              selectedEvent.to.includes(endClassId);
          }
        }

        // Confidence: the LOWER of the two dates' confidence values
        let confStart = null;
        if (zone.confidence) {
          const confStartUrl = fillTemplate(zone.confidence, startDate);
          try {
            const confStartJson = await fetchConfidence(confStartUrl);
            confStart = confidenceAt(confStartJson, px.fx, px.fy);
          } catch (err) {
            // Leave confStart as null
          }
        }

        if (typeof confStart === "number" && typeof confEnd === "number") {
          finalConfidence = Math.min(confStart, confEnd);
        } else if (typeof confEnd === "number") {
          finalConfidence = confEnd;
        } else if (typeof confStart === "number") {
          finalConfidence = confStart;
        } else {
          finalConfidence = null;
        }
      }

      const pointResult = {
        latlng: { lat, lng },
        endClass: endClassObj,
        startClass: startClassObj,
        inEvent,
        confidence: finalConfidence,
        eventLabel: hasActiveEvent ? selectedEvent.label : null,
      };

      setClickedPoint(pointResult);
      onPointSelect?.(pointResult);
    },
  });

  return null;
}

/**
 * SwipeClipHandler — subscribes to Leaflet map events and re-runs clip math
 * on every move/zoom so the clip-path stays locked to the raster image.
 */
function SwipeClipHandler({ applyClip }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const events = ["move", "zoom", "zoomend", "moveend", "resize"];
    events.forEach((e) => map.on(e, applyClip));
    return () => events.forEach((e) => map.off(e, applyClip));
  }, [map, applyClip]);
  return null;
}

export default function MapView(props) {
  // If props are missing, MapView maintains its own internal state (standalone mode)
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

  // A7: Swipe mode — effective mode from props or internal fallback
  const mode = props.mode !== undefined ? props.mode : "period";

  // A7: Swipe divider position (0..1) and overlay refs
  const [split, setSplit] = useState(0.5);
  const startOverlayRef = useRef(null);
  const endOverlayRef = useRef(null);
  const mapContainerRef = useRef(null);

  // Leaflet map instance ref — set via MapContainer ref prop
  const mapRef = useRef(null);

  // If zone prop is missing, fetch manifest.json automatically
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

  // Effective state: prefer props, fall back to standalone state
  const eventId = props.eventId !== undefined ? props.eventId : internalEventId;
  const period = props.period || internalPeriod;
  const activeClasses = props.activeClasses || internalActiveClasses;
  const opacity = props.opacity !== undefined ? props.opacity : internalOpacity;
  const onEventResult = props.onEventResult;
  const onPointSelect = props.onPointSelect;

  const [aoi, setAoi] = useState(null);
  const [eventDataUrl, setEventDataUrl] = useState(null);
  const [eventStats, setEventStats] = useState(null);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [eventError, setEventError] = useState(null);

  // A6 State: Clicked pixel point & error
  const [clickedPoint, setClickedPoint] = useState(null);
  const [pointError, setPointError] = useState(null);

  // Fetch AOI GeoJSON boundary
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

  // Fast integer color to class map for pixel sampling
  const colorToClass = useMemo(() => buildColorToClass(classes), [classes]);

  // Selected event (handling water_change special case)
  const selectedEvent = useMemo(() => {
    if (!eventId) return null;
    if (eventId === "water_change") return WATER_CHANGE_EVENT;
    return events.find((e) => e.id === eventId) || null;
  }, [events, eventId]);

  const dates = zone?.dates || [];
  const startDate = period?.start || dates[0] || "";
  const endDate = period?.end || dates[dates.length - 1] || "";

  // Check if zone manifest has dedicated per-class mask files
  const hasMaskLayers = useMemo(() => {
    return classes.some((cls) => Boolean(zone?.layers?.[`mask_${cls.id}`]));
  }, [classes, zone?.layers]);

  // Check if date selection is valid: start must be strictly before end
  const isInvalidDateRange = Boolean(
    startDate && endDate && startDate >= endDate
  );

  // Clear clicked point when zone, dates, or event change
  useEffect(() => {
    setClickedPoint(null);
    setPointError(null);
  }, [zone?.id, startDate, endDate, eventId]);

  // ── A7: Clip math ──────────────────────────────────────────────────────
  // dividerX = left edge of map container + split fraction of its width (screen px).
  // Start image: clip its right side so only pixels left of dividerX show.
  // End   image: clip its left  side so only pixels right of dividerX show.
  const applyClip = useCallback(() => {
    const startEl = startOverlayRef.current?.getElement?.();
    const endEl   = endOverlayRef.current?.getElement?.();
    const mapEl   = mapContainerRef.current;
    if (!startEl || !endEl || !mapEl) return;

    const mapRect  = mapEl.getBoundingClientRect();
    const dividerX = mapRect.left + split * mapRect.width;

    const sr = startEl.getBoundingClientRect();
    startEl.style.clipPath = `inset(0 ${Math.max(0, sr.right  - dividerX)}px 0 0)`;

    const er = endEl.getBoundingClientRect();
    endEl.style.clipPath   = `inset(0 0 0 ${Math.max(0, dividerX - er.left)}px)`;
  }, [split]);

  // Re-apply clip whenever split changes (while in swipe mode)
  useEffect(() => {
    if (mode === "swipe") applyClip();
  }, [split, mode, applyClip]);

  // Clean up clipPath on both overlays when leaving swipe mode
  useEffect(() => {
    if (mode !== "swipe") {
      startOverlayRef.current?.getElement?.()
        && (startOverlayRef.current.getElement().style.clipPath = "");
      endOverlayRef.current?.getElement?.()
        && (endOverlayRef.current.getElement().style.clipPath = "");
    }
  }, [mode]);
  // ─────────────────────────────────────────────────────────────────────────

  // Compute event layer mask and transitions via eventMask.js
  useEffect(() => {
    // If start >= end, show no event layer
    if (isInvalidDateRange || !selectedEvent || !startDate || !endDate || !zone?.layers?.classification) {
      setEventDataUrl(null);
      setEventStats(null);
      setLoadingEvent(false);
      setEventError(null);
      onEventResult?.(null);
      return;
    }

    let isCancelled = false;
    setLoadingEvent(true);
    setEventError(null);

    async function runComputation() {
      const startUrl = fillTemplate(zone.layers.classification, startDate);
      const endUrl = fillTemplate(zone.layers.classification, endDate);

      try {
        let imgStart;
        try {
          imgStart = await loadImageData(startUrl);
        } catch (err) {
          throw new Error(`Failed to load start classification file: ${startUrl}`);
        }

        let imgEnd;
        try {
          imgEnd = await loadImageData(endUrl);
        } catch (err) {
          throw new Error(`Failed to load end classification file: ${endUrl}`);
        }

        if (isCancelled) return;

        // Pure pixel computation from eventMask.js
        const { mask, pixels, transitions, newWaterPixels, waterLostPixels } = eventMask(
          imgStart,
          imgEnd,
          selectedEvent,
          classes
        );

        if (isCancelled) return;

        // Render mask to offscreen canvas and convert to data URL for ImageOverlay
        const canvas = document.createElement("canvas");
        canvas.width = mask.width;
        canvas.height = mask.height;
        const ctx = canvas.getContext("2d");
        ctx.putImageData(mask, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");

        // Calculate surface areas in km2 from pixel_area_km2
        const pixelArea = zone.pixel_area_km2 || 0.0387653;
        const km2 = pixels * pixelArea;

        const transKm2 = {};
        for (const [key, count] of Object.entries(transitions)) {
          transKm2[key] = count * pixelArea;
        }

        const isWaterChange = selectedEvent.id === "water_change";
        const new_water_km2 = isWaterChange ? (newWaterPixels || 0) * pixelArea : undefined;
        const water_lost_km2 = isWaterChange ? (waterLostPixels || 0) * pixelArea : undefined;

        const statsResult = {
          pixels,
          km2,
          new_water_km2,
          water_lost_km2,
          transitions: transKm2,
          event: selectedEvent,
          startDate,
          endDate,
        };

        setEventDataUrl(dataUrl);
        setEventStats(statsResult);
        setLoadingEvent(false);

        // Emit onEventResult (with separate km2 for water_change)
        if (isWaterChange) {
          onEventResult?.({
            pixels,
            km2,
            new_water_km2,
            water_lost_km2,
            transitions: transKm2,
          });
        } else {
          onEventResult?.({
            pixels,
            km2,
            transitions: transKm2,
          });
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Event layer computation error:", err);
          setEventError(err.message || String(err));
          setEventDataUrl(null);
          setEventStats(null);
          setLoadingEvent(false);
          onEventResult?.(null);
        }
      }
    }

    runComputation();

    return () => {
      isCancelled = true;
    };
  }, [
    isInvalidDateRange,
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

  // Bounds for Leaflet (lat/lon swapped from manifest lon/lat bbox).
  // Memoized on the four numeric values so the reference stays stable across
  // re-renders triggered by scale-bar / zoom state updates.
  // Without this, every setScale() re-render creates a new array → MapResizerAndFitBounds
  // sees a changed dep → calls fitBounds() again → map snaps back.
  const [bx0, bx1, bx2, bx3] = zone.bbox;
  const bounds = useMemo(
    () => toBounds(zone.bbox),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bx0, bx1, bx2, bx3]
  );
  const center = useMemo(
    () => [(bx1 + bx3) / 2, (bx0 + bx2) / 2],
    [bx0, bx1, bx2, bx3]
  );

  const activeColor = selectedEvent?.color || "#FF5A5F";

  // Live scale bar — updates on every zoomend + moveend
  const scaleBar = useScaleBar(mapRef, center[0]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={10}
        style={{
          width: "100%",
          height: "100%",
          background: "#070e1c",
          cursor: mode === "swipe" ? "ew-resize" : "crosshair",
        }}
        zoomControl={false}
        scrollWheelZoom
      >
        <MapResizerAndFitBounds bounds={bounds} />
        <TileLayer url={BASEMAP_URL} maxZoom={18} />

        {/* A7: Swipe mode — two classification overlays clipped around the divider.
            Hidden in period mode; period layers hidden in swipe mode. */}
        {mode === "swipe" && !isInvalidDateRange && zone.layers?.classification && (
          <>
            <SwipeClipHandler applyClip={applyClip} />
            {/* Start-date image: clipped on the right → shows LEFT of divider */}
            <ImageOverlay
              ref={startOverlayRef}
              key={`swipe-start-${startDate}`}
              url={fillTemplate(zone.layers.classification, startDate)}
              bounds={bounds}
              opacity={opacity}
              className="pixelated"
              eventHandlers={{
                add: () => requestAnimationFrame(applyClip),
              }}
            />
            {/* End-date image: clipped on the left → shows RIGHT of divider */}
            <ImageOverlay
              ref={endOverlayRef}
              key={`swipe-end-${endDate}`}
              url={fillTemplate(zone.layers.classification, endDate)}
              bounds={bounds}
              opacity={opacity}
              className="pixelated"
              eventHandlers={{
                add: () => requestAnimationFrame(applyClip),
              }}
            />
          </>
        )}

        {/* Class layers — hidden in swipe mode (A4) */}
        {mode !== "swipe" && (hasMaskLayers
          ? activeClasses?.map((clsId) => {
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
            })
          : activeClasses?.length > 0 &&
            endDate &&
            zone.layers?.classification && (
              <ImageOverlay
                key={`class-${endDate}`}
                url={fillTemplate(zone.layers.classification, endDate)}
                bounds={bounds}
                opacity={opacity}
                className="pixelated"
              />
            ))}

        {/* Event layer — hidden in swipe mode */}
        {mode !== "swipe" && eventDataUrl && (
          <ImageOverlay
            key={`event-${selectedEvent?.id}-${startDate}-${endDate}`}
            url={eventDataUrl}
            bounds={bounds}
            opacity={0.92}
            className="pixelated"
          />
        )}

        {/* 4. AOI GeoJSON boundary outline */}
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

        {/* A6: Map Click Inspector — disabled in swipe mode */}
        {mode !== "swipe" && (
          <MapClickHandler
            zone={zone}
            startDate={startDate}
            endDate={endDate}
            selectedEvent={selectedEvent}
            classes={classes}
            colorToClass={colorToClass}
            onPointSelect={onPointSelect}
            setClickedPoint={setClickedPoint}
            setPointError={setPointError}
          />
        )}

        {/* A6: Click Tooltip Popup — disabled in swipe mode */}
        {mode !== "swipe" && (
          <ClickTooltip
            point={clickedPoint}
            onClose={() => setClickedPoint(null)}
          />
        )}

        <div className="leaflet-top leaflet-right" />
      </MapContainer>

      {/* Zoom / Recenter / Fullscreen buttons — outside MapContainer so absolute
          positioning resolves against the outer wrapper div, not Leaflet's control div */}
      <ZoomButtons mapRef={mapRef} bounds={bounds} />

      {/* A7: Swipe Divider — rendered outside MapContainer so it overlays the full map area */}
      {mode === "swipe" && !isInvalidDateRange && (
        <SwipeDivider
          split={split}
          onSplitChange={setSplit}
          mapContainerRef={mapContainerRef}
          startDate={startDate}
          endDate={endDate}
        />
      )}

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

      {/* Date Validation Alert */}
      {isInvalidDateRange && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-xl bg-[#19202e]/95 border border-[#ffb4ab]/50 shadow-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#ffb4ab]">
            warning
          </span>
          <span className="text-xs font-medium text-[#ffb4ab]">
            Pick a start date earlier than the end date
          </span>
        </div>
      )}

      {/* Loading & Error States */}
      {loadingEvent && !isInvalidDateRange && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-3.5 py-1.5 rounded-full bg-[#151b2a]/95 border border-[#57f1db]/40 shadow-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-primary animate-spin">
            progress_activity
          </span>
          <span className="text-xs font-mono text-on-surface">
            Computing event change layer…
          </span>
        </div>
      )}

      {(eventError || pointError) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] max-w-md px-4 py-2.5 rounded-xl bg-red-950/95 border border-red-500/50 shadow-xl flex items-start gap-2">
          <span className="material-symbols-outlined text-[18px] text-red-400 mt-0.5 shrink-0">
            error
          </span>
          <div className="text-xs text-red-200">
            <span className="font-bold block">Error</span>
            <span className="font-mono text-[11px] break-all">{eventError || pointError}</span>
          </div>
          <button
            onClick={() => {
              setEventError(null);
              setPointError(null);
            }}
            className="text-red-300 hover:text-white ml-2"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* Event Result Badge with event.color */}
      {eventStats && selectedEvent && !isInvalidDateRange && (
        <div
          className="absolute top-4 left-5 z-[500] flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#151b2a]/95 border shadow-lg"
          style={{ borderColor: `${activeColor}80` }}
        >
          {selectedEvent.id === "water_change" ? (
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_#38BDF8]"
                style={{ backgroundColor: "#38BDF8" }}
              />
              <span
                className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_#F59E0B]"
                style={{ backgroundColor: "#F59E0B" }}
              />
            </div>
          ) : (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: activeColor,
                boxShadow: `0 0 8px ${activeColor}`,
              }}
            />
          )}

          <span className="font-bold text-xs text-on-surface">
            {selectedEvent.id === "water_change"
              ? `Event: Water change (+${(eventStats.new_water_km2 || 0).toFixed(2)} km² / -${(eventStats.water_lost_km2 || 0).toFixed(2)} km²)`
              : `Event: ${selectedEvent.label} - ${eventStats.km2.toFixed(2)} km²`}
          </span>
        </div>
      )}

      {/* Classification Legend (Bottom-Left, positioned cleanly above timeline) */}
      <div className="absolute bottom-28 left-5 z-[500] pointer-events-none">
        <div
          className="pointer-events-auto flex flex-col gap-2 p-3 rounded-xl min-w-[210px]"
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
            <span className="font-mono text-[9px] text-primary font-semibold">
              NISAR L-Band
            </span>
          </div>

          {/* Active Event in Legend with its specific color */}
          {selectedEvent && (
            <div
              className="flex items-center gap-2 p-1.5 rounded-lg bg-[#19202e] border shadow-xs"
              style={{ borderColor: `${activeColor}60` }}
            >
              {selectedEvent.id === "water_change" ? (
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className="w-3 h-3 rounded shadow-[0_0_8px_#38BDF8]"
                    style={{ backgroundColor: "#38BDF8" }}
                    title="Gained water (#38BDF8)"
                  />
                  <span
                    className="w-3 h-3 rounded shadow-[0_0_8px_#F59E0B]"
                    style={{ backgroundColor: "#F59E0B" }}
                    title="Lost water (#F59E0B)"
                  />
                </div>
              ) : (
                <span
                  className="w-3.5 h-3.5 rounded"
                  style={{
                    backgroundColor: activeColor,
                    boxShadow: `0 0 8px ${activeColor}`,
                    flexShrink: 0,
                  }}
                />
              )}
              <span className="font-bold text-[12px] text-on-surface">
                {selectedEvent.id === "water_change" ? (
                  <span>
                    Event: Water change (
                    <span style={{ color: "#38BDF8" }}>+gain</span> /{" "}
                    <span style={{ color: "#F59E0B" }}>-lost</span>)
                  </span>
                ) : (
                  `Event: ${selectedEvent.label}`
                )}
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
                  style={{ opacity: isActive ? 1 : 0.35 }}
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
      </div>

      {/* Échelle / Scale & Coordinates (Far Right with lower opacity / discreet footprint) */}
      <div
        className="absolute bottom-28 right-5 z-[500] pointer-events-auto flex flex-col items-end gap-1 px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-100"
        style={{
          background: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(60, 74, 70, 0.25)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.25)",
          opacity: 0.75,
        }}
      >
        <div className="flex items-center gap-2">
          {/* Bar width is driven by scaleBar.barPx — the exact pixel count for scaleBar.label */}
          <div
            style={{ width: scaleBar.barPx, height: 2, background: "rgba(220,226,246,0.8)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}
          >
            <div style={{ width: 2, height: 6, background: "rgba(220,226,246,0.8)" }} />
            <div style={{ width: 2, height: 6, background: "rgba(220,226,246,0.8)" }} />
          </div>
          <span className="font-mono text-[9px] text-on-surface/90 font-medium">
            {scaleBar.label}
          </span>
        </div>
        <span className="font-mono text-[8.5px] text-outline/80">
          {center[0].toFixed(2)}°N {Math.abs(center[1]).toFixed(2)}°W • WGS84
        </span>
      </div>
    </div>
  );
}
