/**
 * MapView — P1 dashboard map.
 *
 * Renders:
 *  - Leaflet basemap (satellite)
 *  - Changemap overlay (class-filtered via offscreen canvas)
 *  - Credit line
 *  - Zoom / recenter / fullscreen buttons
 *  - Live scale bar
 *
 * Props:
 *  zone        — normalized summary from useSiteSummary (has .bounds, .changemapUrl, .legend, etc.)
 *  activeClasses — array of cls values (integers) that should be visible
 *  opacity     — changemap ImageOverlay opacity (0..1)
 *  siteBase    — base URL string for the site's assets (e.g. "/data/web/<folder>/")
 *  teamName    — string for credit line
 *
 * Not in this task: radar frames, date picker, swipe mode, tooltip, event mask.
 */
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, ImageOverlay, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { visibleLegend } from "../lib/siteAdapter";

const BASEMAP_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// ── Coordinate helpers ──────────────────────────────────────────────────────
// bounds from siteAdapter: [[south,west],[north,east]] (Leaflet order already)
function leafletBounds(bounds) {
  if (!bounds || !Array.isArray(bounds) || bounds.length < 2) return null;
  return bounds; // already Leaflet order
}

// ── Scale bar ───────────────────────────────────────────────────────────────
const NICE_KM = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
function mpp(zoom, lat) {
  return (156543.034 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}
function computeScale(zoom, lat, targetPx = 80) {
  const rawKm = (mpp(zoom, lat) * targetPx) / 1000;
  const niceKm = NICE_KM.reduce((best, v) => (v <= rawKm ? v : best), NICE_KM[0]);
  const barPx = (niceKm * 1000) / mpp(zoom, lat);
  const label = niceKm >= 1 ? `${niceKm} km` : `${niceKm * 1000} m`;
  return { barPx: Math.round(barPx), label };
}
function useScaleBar(mapRef, fallbackLat) {
  const [scale, setScale] = useState(() => computeScale(10, fallbackLat));
  useEffect(() => {
    let raf;
    const trySubscribe = () => {
      const map = mapRef.current;
      if (!map) { raf = requestAnimationFrame(trySubscribe); return; }
      const sync = () => setScale(computeScale(map.getZoom(), map.getCenter().lat));
      sync();
      map.on("zoomend moveend", sync);
      return () => map.off("zoomend moveend", sync);
    };
    let cleanup = trySubscribe();
    return () => { cancelAnimationFrame(raf); cleanup?.(); };
  }, [mapRef, fallbackLat]);
  return scale;
}

// ── Fit bounds on mount / zone change ───────────────────────────────────────
function MapFitBounds({ bounds }) {
  const map = useMap();
  const boundsKey = bounds ? bounds.map((p) => p.join(",")).join("|") : "";
  useEffect(() => {
    if (!bounds) return;
    const fit = () => { map.invalidateSize(); map.fitBounds(bounds, { padding: [30, 30] }); };
    fit();
    const t1 = setTimeout(fit, 100);
    const t2 = setTimeout(fit, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map, boundsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── Zoom / fullscreen buttons (outside MapContainer) ────────────────────────
function ZoomButtons({ mapRef, bounds }) {
  const ref = useRef(null);
  const [zoomInfo, setZoomInfo] = useState({ zoom: null, min: 0, max: Infinity });
  const [isFs, setIsFs] = useState(!!document.fullscreenElement);
  const fsOk = !!document.documentElement.requestFullscreen;

  useEffect(() => {
    let raf;
    const trySubscribe = () => {
      const map = mapRef.current;
      if (!map) { raf = requestAnimationFrame(trySubscribe); return; }
      const sync = () => setZoomInfo({ zoom: map.getZoom(), min: map.getMinZoom(), max: map.getMaxZoom() });
      sync();
      map.on("zoomend", sync);
      return () => map.off("zoomend", sync);
    };
    let cleanup = trySubscribe();
    return () => { cancelAnimationFrame(raf); cleanup?.(); };
  }, [mapRef]);

  useEffect(() => {
    const onFs = () => { setIsFs(!!document.fullscreenElement); setTimeout(() => mapRef.current?.invalidateSize(), 200); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [mapRef]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  const { zoom, min, max } = zoomInfo;
  const btns = [
    { icon: "add", label: "Zoom in", disabled: zoom !== null && zoom >= max, fn: () => mapRef.current?.zoomIn() },
    { icon: "remove", label: "Zoom out", disabled: zoom !== null && zoom <= min, fn: () => mapRef.current?.zoomOut() },
    { icon: "my_location", label: "Recenter", disabled: false, fn: () => bounds && mapRef.current?.fitBounds(bounds, { padding: [20, 20] }) },
    ...(fsOk ? [{ icon: isFs ? "fullscreen_exit" : "fullscreen", label: "Fullscreen", disabled: false, fn: () => !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen() }] : []),
  ];

  const btnStyle = (disabled) => ({
    width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent",
    color: disabled ? "#3d4a5e" : "#dce2f6", display: "flex", alignItems: "center",
    justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer",
    outline: "none", transition: "background 0.15s",
  });

  return (
    <div ref={ref} style={{ position:"absolute", top:16, right:16, zIndex:1000, display:"flex", flexDirection:"column", gap:4, padding:4, borderRadius:12, background:"rgba(21,27,42,0.92)", border:"1px solid rgba(60,74,70,0.35)" }}>
      {btns.map(({ icon, label, disabled, fn }) => (
        <button key={label} type="button" aria-label={label} title={label} disabled={disabled} onClick={fn} style={btnStyle(disabled)}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(87,241,219,0.12)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
        </button>
      ))}
    </div>
  );
}

// ── Canvas recolor (changemap pixel filter) ─────────────────────────────────
// Loads changemap.png once per URL into an offscreen canvas cache.
// On activeClasses change, zeroes alpha on pixels whose RGB matches a hidden class.
// Water class (always last visually) is semi-transparent at 180/255.
// Debounced 60 ms. Revokes previous object URL to free memory.

const imageDataCache = new Map(); // url → ImageData (original, never mutated)

async function loadOriginalImageData(url) {
  if (imageDataCache.has(url)) return imageDataCache.get(url);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        imageDataCache.set(url, imgData);
        resolve(imgData);
      } catch (e) {
        reject(e); // CORS / tainted canvas
      }
    };
    img.onerror = () => reject(new Error(`Failed to load changemap: ${url}`));
    img.src = url;
  });
}

function buildColorKey(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

function useFilteredChangemap(changemapUrl, legend, activeClasses) {
  const [blobUrl, setBlobUrl]       = useState(null);
  const [canvasBlocked, setBlocked] = useState(false);
  const prevBlobRef                 = useRef(null);
  const timerRef                    = useRef(null);

  useEffect(() => {
    if (!changemapUrl || !legend) {
      setBlobUrl(null);
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const visItems = visibleLegend(legend);
      if (!visItems.length) { setBlobUrl(null); return; }

      // If all classes active → use raw URL directly (no canvas needed)
      const allActive = visItems.every((item) => activeClasses.includes(item.cls));
      if (allActive) {
        if (prevBlobRef.current) { URL.revokeObjectURL(prevBlobRef.current); prevBlobRef.current = null; }
        setBlobUrl(changemapUrl);
        setBlocked(false);
        return;
      }

      // Build a set of RGB keys for active classes
      const activeKeys = new Set();
      visItems.forEach((item) => {
        if (activeClasses.includes(item.cls) && Array.isArray(item.color)) {
          activeKeys.add(buildColorKey(item.color[0], item.color[1], item.color[2]));
        }
      });

      let original;
      try {
        original = await loadOriginalImageData(changemapUrl);
      } catch {
        setBlocked(true);
        setBlobUrl(changemapUrl); // show unfiltered
        return;
      }

      // Copy the original pixel data
      const copy = new ImageData(
        new Uint8ClampedArray(original.data),
        original.width,
        original.height
      );
      const d = copy.data;
      const len = d.length;

      for (let i = 0; i < len; i += 4) {
        if (d[i + 3] === 0) continue;
        const key = buildColorKey(d[i], d[i + 1], d[i + 2]);
        if (!activeKeys.has(key)) {
          d[i + 3] = 0;
        }
        // Note: water semi-transparency is baked into the original PNG;
        // we keep whatever alpha the source has.
      }

      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width  = original.width;
      tmpCanvas.height = original.height;
      tmpCanvas.getContext("2d").putImageData(copy, 0, 0);

      tmpCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = url;
        setBlobUrl(url);
        setBlocked(false);
      }, "image/png");
    }, 60);

    return () => clearTimeout(timerRef.current);
  }, [changemapUrl, legend, activeClasses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke on unmount
  useEffect(() => () => { if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current); }, []);

  return { blobUrl, canvasBlocked };
}

// ── Main component ───────────────────────────────────────────────────────────
export default function MapView({ zone, activeClasses, opacity, siteBase, teamName }) {
  const mapRef = useRef(null);

  if (!zone) {
    return (
      <div style={{ display:"flex", height:"100%", width:"100%", alignItems:"center", justifyContent:"center", background:"#070e1c", color:"#bacac5", fontFamily:"'JetBrains Mono',monospace", fontSize:13 }}>
        <span className="material-symbols-outlined animate-spin" style={{ color:"#57f1db", fontSize:32, marginRight:8 }}>progress_activity</span>
        Loading map…
      </div>
    );
  }

  const bounds = useMemo(() => leafletBounds(zone.bounds), [zone.bounds]);
  const south = zone.bounds?.[0]?.[0] ?? 0;
  const west  = zone.bounds?.[0]?.[1] ?? 0;
  const north = zone.bounds?.[1]?.[0] ?? 0;
  const east  = zone.bounds?.[1]?.[1] ?? 0;
  const center = useMemo(() => [(south + north) / 2, (west + east) / 2], [south, north, west, east]);

  // changemapUrl: siteBase + changemap filename
  const changemapUrl = useMemo(() => {
    if (!zone.changemapUrl) return null;
    // normalized summary already has changemapUrl as full URL
    return zone.changemapUrl;
  }, [zone.changemapUrl]);

  const scaleBar = useScaleBar(mapRef, center[0]);

  const { blobUrl: filteredUrl, canvasBlocked } = useFilteredChangemap(
    changemapUrl,
    zone.legend,
    activeClasses ?? []
  );

  return (
    <div style={{ position:"relative", width:"100%", height:"100%", overflow:"hidden" }}>
      <MapContainer
        key={zone.id || zone.site || "map"}
        ref={mapRef}
        center={center}
        zoom={10}
        zoomControl={false}
        scrollWheelZoom
        style={{ width:"100%", height:"100%", background:"#070e1c" }}
      >
        <MapFitBounds bounds={bounds} />
        <TileLayer url={BASEMAP_URL} maxZoom={18} />

        {/* Changemap overlay */}
        {filteredUrl && bounds && (
          <ImageOverlay
            key={`changemap-${zone.id || zone.site}`}
            url={filteredUrl}
            bounds={bounds}
            opacity={opacity ?? 0.85}
            className="pixelated"
          />
        )}
      </MapContainer>

      {/* Controls outside MapContainer */}
      <ZoomButtons mapRef={mapRef} bounds={bounds} />

      {/* Canvas blocked note */}
      {canvasBlocked && (
        <div style={{ position:"absolute", top:16, left:"50%", transform:"translateX(-50%)", zIndex:1000, padding:"6px 14px", borderRadius:10, background:"rgba(21,27,42,0.95)", border:"1px solid rgba(255,180,171,0.4)", fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#ffb4ab", whiteSpace:"nowrap" }}>
          Class filter unavailable — changemap shown unfiltered (CORS)
        </div>
      )}

      {/* Scale bar */}
      <div style={{ position:"absolute", bottom:20, right:16, zIndex:500, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, padding:"5px 10px", borderRadius:8, background:"rgba(15,23,42,0.65)", border:"1px solid rgba(60,74,70,0.25)", opacity:0.8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:scaleBar.barPx, height:2, background:"rgba(220,226,246,0.8)", display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
            <div style={{ width:2, height:6, background:"rgba(220,226,246,0.8)" }} />
            <div style={{ width:2, height:6, background:"rgba(220,226,246,0.8)" }} />
          </div>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"rgba(220,226,246,0.9)" }}>{scaleBar.label}</span>
        </div>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:"rgba(133,148,144,0.8)" }}>
          {center[0].toFixed(3)}°N {Math.abs(center[1]).toFixed(3)}°{center[1] < 0 ? "W" : "E"} · WGS84
        </span>
      </div>

      {/* Credit line */}
      <div style={{ position:"absolute", bottom:4, left:"50%", transform:"translateX(-50%)", zIndex:500, fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"rgba(186,202,197,0.7)", pointerEvents:"none", whiteSpace:"nowrap" }}>
        NISAR (NASA-ISRO) radar, L-band. Processed by {teamName ?? "TODO"}.
      </div>
    </div>
  );
}
