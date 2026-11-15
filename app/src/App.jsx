import { useState, useEffect } from "react";
import TopBar from "./components/TopBar";
import ControlsPanel from "./components/ControlsPanel";
import MapView from "./components/MapView";
import Timeline from "./components/Timeline";
import Landing from "./pages/Landing";
import RightPanel from "./components/RightPanel";
import { useManifest } from "./hooks/useManifest";
import useSiteSummary from "./hooks/useSiteSummary";
import { useHashRoute } from "./lib/router";

export default function App() {
  const { manifest, loading, error } = useManifest();
  const { route, navigate } = useHashRoute();

  const [eventId, setEventId] = useState(null);
  const [period, setPeriod] = useState({ start: null, end: null });
  const [activeClasses, setActiveClasses] = useState([]);
  const [mode, setMode] = useState("period");
  const [basemap, setBasemap] = useState("sat");
  const [opacity, setOpacity] = useState(0.85);
  const [radarGrayscale, setRadarGrayscale] = useState(false);
  const [eventResult, setEventResult] = useState(null);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [drawnZone, setDrawnZone] = useState(null);

  // Parse current route
  const isMapRoute = route.startsWith("/map/");
  const routePart = isMapRoute ? route.replace("/map/", "").trim() : null;
  const isCustomRoute = Boolean(routePart && routePart.startsWith("custom"));

  // Reset drawn zone when switching locations
  useEffect(() => {
    setDrawnZone(null);
    setIsDrawingZone(false);
  }, [route]);

  let customZone = null;
  if (isCustomRoute) {
    const search = routePart.includes("?") ? routePart.split("?")[1] : "";
    const params = new URLSearchParams(search);
    const lat = parseFloat(params.get("lat")) || 0;
    const lng = parseFloat(params.get("lng")) || 0;
    const country = params.get("country") || "";
    const hasExplicitBbox = params.has("w") && params.has("s") && params.has("e") && params.has("n");
    const explicitW = parseFloat(params.get("w"));
    const explicitS = parseFloat(params.get("s"));
    const explicitE = parseFloat(params.get("e"));
    const explicitN = parseFloat(params.get("n"));

    // Guaranteed 35 km x 35 km bounding box (strictly within the 50 km NISAR limit) unless redrawn
    const targetRadiusKm = 17.5;
    const dLat = targetRadiusKm / 110.57;
    const dLon = targetRadiusKm / (111.32 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));

    const effectiveBbox = hasExplicitBbox
      ? [explicitW, explicitS, explicitE, explicitN]
      : [lng - dLon, lat - dLat, lng + dLon, lat + dLat];

    const effectiveBounds = hasExplicitBbox
      ? [[explicitS, explicitW], [explicitN, explicitE]]
      : [[lat - dLat, lng - dLon], [lat + dLat, lng + dLon]];

    const nisarPasses = [
      "2026-06-18",
      "2026-06-30",
      "2026-07-12",
      "2026-07-24",
      "2026-08-17",
      "2026-08-29",
      "2026-09-10",
      "2026-10-04",
      "2026-10-16",
      "2026-10-28",
    ];

    const standardLegend = [
      { cls: 1, name: "Vegetation Growth", color: [40, 200, 60], hectares: 6312 },
      { cls: 2, name: "Vegetation Loss", color: [230, 50, 50], hectares: 5396 },
      { cls: 3, name: "Burned Area", color: [110, 30, 10], hectares: 1092 },
      { cls: 4, name: "Inundation / Flooding", color: [0, 150, 255], hectares: 28 },
      { cls: 5, name: "Permanent Water", color: [40, 70, 160], hectares: 24591 },
    ];

    customZone = {
      id: "custom",
      site: "custom",
      name: country ? `${country}` : `Zone (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`,
      story: `Selected region (${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E) covered by Sentinel-1 / NISAR L-band orbital passes (June to November 2026). Calibrated HH/HV backscatter processed in real time.`,
      event: "farming",
      bbox: effectiveBbox,
      bounds: effectiveBounds,
      dates: nisarPasses,
      frames: nisarPasses.map((d) => `radar_${d}.jpg`),
      legend: standardLegend,
      classes: standardLegend.map((l) => ({
        id: l.cls,
        label: l.name,
        color: `rgb(${l.color[0]},${l.color[1]},${l.color[2]})`,
        hectares: l.hectares,
      })),
      changemap: "changemap.png",
      isCustom: true,
      aoi: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [effectiveBbox[0], effectiveBbox[1]],
                  [effectiveBbox[2], effectiveBbox[1]],
                  [effectiveBbox[2], effectiveBbox[3]],
                  [effectiveBbox[0], effectiveBbox[3]],
                  [effectiveBbox[0], effectiveBbox[1]],
                ],
              ],
            },
          },
        ],
      },
    };
  }

  const routeZoneId = isCustomRoute ? "custom" : (routePart ? routePart.split("?")[0] : null);

  // Resolve basic site entry from manifest (sites.json list) or fallback to dynamic route zone
  const matchedSite = isCustomRoute
    ? customZone
    : (isMapRoute ? (manifest?.zones?.find((z) => z.id === routeZoneId) || { id: routeZoneId, site: routeZoneId, name: routeZoneId }) : null);

  const dynamicCoords = isCustomRoute ? {
    lat: parseFloat(new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("lat")) || 0,
    lng: parseFloat(new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("lng")) || 0,
    country: new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("country") || "",
    start: new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("start") || "",
    end: new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("end") || "",
    maxPasses: parseInt(new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("max_passes")) || 4,
    w: new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("w") || null,
    s: new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("s") || null,
    e: new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("e") || null,
    n: new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("n") || null,
  } : null;

  const viewParam = isCustomRoute
    ? new URLSearchParams(routePart.includes("?") ? routePart.split("?")[1] : "").get("view") || "both"
    : "both";

  // Load full summary.json for the active site (dynamically from NASA if custom coordinates)
  const {
    summary: fetchedZone,
    loading: summaryLoading,
    error: summaryError,
    progress: nasaProgress,
    statusMessage: nasaStatusMessage,
    estimatedTime: nasaEstimatedTime,
  } = useSiteSummary(
    isCustomRoute ? null : (matchedSite?.site || routeZoneId || null),
    dynamicCoords
  );

  const rawMatchedZone = isCustomRoute
    ? (fetchedZone
        ? {
            // Backend response has the real bounds/bbox from actual NASA data
            ...fetchedZone,
            // Only use customZone name, keep backend bounds/bbox/frames/base intact
            name: customZone?.name || fetchedZone.name,
            isCustom: true,
          }
        : null)
    : fetchedZone;

  // Show loading indicator while dynamic real NASA radar data is downloading
  const isSummaryLoading = isMapRoute && summaryLoading && !rawMatchedZone;
  const matchedZone = drawnZone
    ? {
        ...rawMatchedZone,
        bounds: drawnZone.bounds,
        bbox: drawnZone.bbox,
        name: drawnZone.name || rawMatchedZone?.name,
      }
    : rawMatchedZone;

  // Initialize or re-sync period and active classes when zone changes
  useEffect(() => {
    if (matchedZone?.dates?.length) {
      setPeriod({
        start: matchedZone.dates[0],
        end: matchedZone.dates[matchedZone.dates.length - 1],
      });
      // Real summary.json: legend entries with { cls, name, color: [R,G,B]|null, hectares }
      const legendClasses = (matchedZone.legend || [])
        .filter((e) => e.color !== null && e.color !== undefined)
        .map((e) => e.cls);
      setActiveClasses(legendClasses.length ? legendClasses : [1, 2, 3, 4, 5]);
      // zone.event is a string in real data (not an events array)
      setEventId(matchedZone.event || null);
    }
  }, [matchedZone?.site, matchedZone?.id, matchedZone?.name]);

  // 1. Initial Manifest Loading
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c1321",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <span className="material-symbols-outlined animate-pulse" style={{ color: "#57f1db", fontSize: 48 }}>
            radar
          </span>
          <span style={{ color: "#bacac5", fontSize: 14, fontFamily: "'Outfit', sans-serif" }}>
            Loading SARdance…
          </span>
        </div>
      </div>
    );
  }

  // 2. Global Manifest Error
  if (error) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0c1321" }}>
        <div style={{ maxWidth: 480, padding: 24, borderRadius: 16, background: "#151b2a", border: "1px solid rgba(255,180,171,0.3)", textAlign: "center" }}>
          <span className="material-symbols-outlined" style={{ color: "#ffb4ab", fontSize: 40, marginBottom: 8 }}>
            error
          </span>
          <h2 style={{ color: "#ffb4ab", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Manifest Error</h2>
          <p style={{ color: "#ffb4ab", fontSize: 13 }}>{error}</p>
        </div>
      </div>
    );
  }

  // 3. Landing Route ("/") — Always displayed when on home / globe
  if (!isMapRoute || route === "/") {
    return (
      <Landing
        manifest={manifest}
        onNavigateToZone={(zoneId) => navigate(`/map/${zoneId}`)}
        onNavigateToCustomZone={({ lat, lng, countryName, start, end, maxPasses, view }) => {
          let url = `/map/custom?lat=${lat}&lng=${lng}&country=${encodeURIComponent(countryName || "")}`;
          if (start) url += `&start=${encodeURIComponent(start)}`;
          if (end) url += `&end=${encodeURIComponent(end)}`;
          if (maxPasses) url += `&max_passes=${maxPasses}`;
          if (view) url += `&view=${encodeURIComponent(view)}`;
          navigate(url);
        }}
      />
    );
  }

  // 4. Loading state for map zone
  if (isSummaryLoading) {
    const isNasaDownload = isCustomRoute && summaryLoading;
    const pct = isNasaDownload ? Math.max(0, Math.min(100, nasaProgress ?? 0)) : 50;
    const isDone = pct >= 100;

    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          alignItems: "center",
          justifyContent: "center",
          background: "#070e1c",
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            width: "90%",
            maxWidth: 460,
            background: "#121927",
            border: isDone ? "1px solid #57f1db" : "1px solid rgba(87, 241, 219, 0.35)",
            borderRadius: 20,
            padding: "32px 28px",
            boxShadow: isDone
              ? "0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(87, 241, 219, 0.3)"
              : "0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(87, 241, 219, 0.12)",
            textAlign: "center",
            transition: "all 0.4s ease",
          }}
        >
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span
              className={`material-symbols-outlined ${isDone ? "" : "animate-spin"}`}
              style={{
                color: "#57f1db",
                fontSize: 48,
                animationDuration: "2.5s",
              }}
            >
              {isDone ? "check_circle" : "radar"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ color: "#ffffff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>
              {isNasaDownload
                ? (isDone ? "NASA SAR Processing Completed!" : "Acquiring NASA ASF Datapool Data")
                : "Loading Zone…"}
            </span>
            <span style={{ color: "#57f1db", fontSize: 12, fontWeight: 600 }}>
              {isNasaDownload ? (nasaStatusMessage || "NASA radar acquisition in progress…") : "Initializing…"}
            </span>
          </div>

          {/* Telemetry Progress Bar with Percentage Indicator */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            <div
              style={{
                width: "100%",
                height: 10,
                background: "#09101d",
                border: "1px solid rgba(87, 241, 219, 0.25)",
                borderRadius: 9999,
                overflow: "hidden",
                padding: 1.5,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: isDone
                    ? "linear-gradient(90deg, #10b981, #57f1db)"
                    : "linear-gradient(90deg, #38bdf8, #57f1db)",
                  borderRadius: 9999,
                  boxShadow: isDone ? "0 0 16px #57f1db" : "0 0 10px rgba(87, 241, 219, 0.6)",
                  transition: "width 0.45s ease-out",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#859490", fontWeight: 600 }}>
              <span>Sentinel-1 SAR C-Band</span>
              <span style={{ color: "#bacac5", display: "flex", alignItems: "center", gap: 4 }}>
                <span className="material-symbols-outlined text-[14px] text-[#57f1db]">timer</span>
                <span>Time remaining: <strong style={{ color: "#57f1db" }}>{nasaEstimatedTime || "~10 s"}</strong></span>
              </span>
              <span style={{ color: "#57f1db", fontWeight: 700, fontSize: 13 }}>{pct}%</span>
            </div>
          </div>

          <span style={{ color: "#bacac5", fontSize: 11, lineHeight: 1.5, opacity: 0.85 }}>
            Direct Sentinel-1 radar ingestion, radiometric calibration, and AI surface dynamics from NASA ASF Datapool.
          </span>
        </div>
      </div>
    );
  }

  // 5. Zone Loading Error (only when on a map zone)
  if (summaryError) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c1321",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            padding: 24,
            borderRadius: 16,
            background: "#151b2a",
            border: "1px solid rgba(255,180,171,0.3)",
            textAlign: "center",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ color: "#ffb4ab", fontSize: 40, marginBottom: 8 }}
          >
            error
          </span>
          <h2 style={{ color: "#ffb4ab", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            Erreur de chargement NASA
          </h2>
          <p style={{ color: "#ffb4ab", fontSize: 13, marginBottom: 16 }}>{summaryError}</p>
          <button
            onClick={() => navigate("/")}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "#57f1db",
              color: "#003731",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Retour au globe
          </button>
        </div>
      </div>
    );
  }

  // 2. Zone not found route
  if (!matchedSite) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          alignItems: "center",
          justifyContent: "center",
          background: "#070e1c",
          color: "#dce2f6",
        }}
      >
        <div
          style={{
            padding: 32,
            borderRadius: 20,
            background: "#151b2a",
            border: "1px solid rgba(60,74,70,0.5)",
            textAlign: "center",
            maxWidth: 420,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 48, color: "#ffb4ab", marginBottom: 12 }}
          >
            location_off
          </span>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              marginBottom: 8,
            }}
          >
            Zone not found
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#bacac5",
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            The requested monitoring zone <code style={{ color: "#57f1db" }}>"{routeZoneId}"</code> is not registered in the SARdance manifest.
          </p>
          <a
            href="#/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 12,
              background: "#57f1db",
              color: "#003731",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
              boxShadow: "0 0 16px rgba(87,241,219,0.3)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              public
            </span>
            <span>Back to globe</span>
          </a>
        </div>
      </div>
    );
  }

  // 3. Active Dashboard Route for matchedZone
  const MAP_AREA_H = "calc(100vh - 56px)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "#0c1321",
      }}
    >
      {/* Top bar with back-to-globe button */}
      <TopBar zone={matchedZone ?? matchedSite} showBack={true} />

      {/* Body row — fills remaining height */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          height: MAP_AREA_H,
          width: "100vw",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Left panel */}
        <aside
          style={{
            width: 320,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            background: "#151b2a",
            overflowY: "auto",
            zIndex: 20,
            boxShadow: "4px 0 24px -6px rgba(7,14,28,0.7)",
          }}
          className="hidden lg:flex"
        >
          <ControlsPanel
            manifest={manifest}
            zone={matchedZone}
            eventId={eventId}
            setEventId={setEventId}
            activeClasses={activeClasses}
            setActiveClasses={setActiveClasses}
            mode={mode}
            setMode={setMode}
            basemap={basemap}
            setBasemap={setBasemap}
            opacity={opacity}
            setOpacity={setOpacity}
            radarGrayscale={radarGrayscale}
            setRadarGrayscale={setRadarGrayscale}
          />
        </aside>

        {/* Center map */}
        <section
          style={{
            flex: 1,
            position: "relative",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            background: "#070e1c",
          }}
        >
          <MapView
            zone={matchedZone ?? matchedSite}
            eventId={eventId}
            period={period}
            activeClasses={activeClasses}
            opacity={opacity}
            radarGrayscale={radarGrayscale}
            setRadarGrayscale={setRadarGrayscale}
            onEventResult={setEventResult}
            mode={mode}
            onModeChange={setMode}
            isDrawingZone={isDrawingZone}
            onStartDrawZone={() => setIsDrawingZone(true)}
            onCancelDrawZone={() => setIsDrawingZone(false)}
            initialLayer={viewParam === "current" ? "radar" : "both"}
            onZoneDrawn={({ bounds, bbox }) => {
              setIsDrawingZone(false);
              setDrawnZone(null);
              const south = bounds[0][0];
              const west = bounds[0][1];
              const north = bounds[1][0];
              const east = bounds[1][1];
              const cLat = (south + north) / 2;
              const cLng = (west + east) / 2;
              // Trigger fresh real NASA SAR imagery download with ultra-fast 2-pass mode (~3-5s)
              navigate(`/map/custom?lat=${cLat.toFixed(4)}&lng=${cLng.toFixed(4)}&w=${west.toFixed(4)}&s=${south.toFixed(4)}&e=${east.toFixed(4)}&n=${north.toFixed(4)}&max_passes=2`);
            }}
          />

          {/* High-tech HUD Loading Overlay during zone modification / redraw */}
          {summaryLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(7, 14, 28, 0.72)",
                backdropFilter: "blur(5px)",
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                pointerEvents: "all",
                animation: "fadeIn 0.2s ease-out",
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: "rgba(87, 241, 219, 0.12)",
                  border: "2px solid #57f1db",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 24px rgba(87, 241, 219, 0.4)",
                }}
              >
                <span
                  className="material-symbols-outlined animate-spin"
                  style={{ color: "#57f1db", fontSize: 32 }}
                >
                  radar
                </span>
              </div>
              <div style={{ textAlign: "center", padding: "0 24px" }}>
                <h3
                  style={{
                    color: "#e8f4f0",
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    margin: 0,
                    letterSpacing: "0.03em",
                  }}
                >
                  NASA SAR acquisition for target region…
                </h3>
                <p
                  style={{
                    color: "#859490",
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    margin: "6px 0 0",
                  }}
                >
                  Sentinel-1 download & geometric orthorectification (~3 to 5s)
                </p>
              </div>
              <div
                style={{
                  width: 200,
                  height: 3,
                  background: "#1e2d3f",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, #57f1db, #2563eb)",
                    borderRadius: 4,
                    animation: "slideBar 1.2s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          )}

          {/* Timeline overlaid at the bottom */}
          <div
            style={{
              position: "absolute",
              bottom: 16,
              left: 16,
              right: 16,
              zIndex: 30,
            }}
          >
            <Timeline
              zone={matchedZone ?? matchedSite}
              period={period}
              setPeriod={setPeriod}
            />
          </div>
        </section>

        {/* Right panel — summary / legend / story / scores / analyze */}
        <aside
          style={{
            width: 320,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            zIndex: 20,
          }}
        >
          <RightPanel
            zone={matchedZone}
            period={period}
            eventResult={eventResult}
            activeClasses={activeClasses}
            setActiveClasses={setActiveClasses}
            isDrawing={isDrawingZone}
            onStartDrawZone={() => setIsDrawingZone(true)}
            onCancelDrawZone={() => setIsDrawingZone(false)}
            onJobResult={(resPath) => {
              if (resPath) {
                // Navigate cleanly to the newly created analysis site
                const cleanSite = resPath.replace(/^\/?(web\/)?/, "").replace(/\/+$/, "");
                navigate(`/map/${cleanSite}`);
              }
            }}
          />
        </aside>
      </div>
    </div>
  );
}
