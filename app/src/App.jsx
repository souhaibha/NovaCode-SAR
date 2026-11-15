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
  const [eventResult, setEventResult] = useState(null);

  // Parse current route
  const isMapRoute = route.startsWith("/map/");
  const routeZoneId = isMapRoute ? route.replace("/map/", "").trim() : null;

  // Resolve basic site entry from manifest (sites.json list)
  // zones[] entries have id = s.site (aliased in useManifest)
  const matchedSite = isMapRoute
    ? manifest?.zones?.find((z) => z.id === routeZoneId)
    : null;

  // Load full summary.json for the active site
  const { summary: matchedZone, loading: summaryLoading } = useSiteSummary(
    matchedSite?.site ?? null
  );

  // Initialize or re-sync period and active classes when zone changes
  useEffect(() => {
    if (matchedZone?.dates?.length) {
      setPeriod({
        start: matchedZone.dates[0],
        end: matchedZone.dates[matchedZone.dates.length - 1],
      });
      // Real summary.json: legend entries with { cls, name, color: [R,G,B]|null, hectares }
      const legendClasses = (matchedZone.legend || [])
        .filter((e) => e.color !== null && e.color !== undefined && e.hectares > 0)
        .map((e) => e.cls);
      setActiveClasses(legendClasses.length ? legendClasses : []);
      // zone.event is a string in real data (not an events array)
      setEventId(matchedZone.event || null);
    }
  }, [matchedZone?.site]);

  // Loading state (manifest or summary for current site)
  if (loading || (isMapRoute && matchedSite && summaryLoading)) {
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            className="material-symbols-outlined animate-pulse"
            style={{ color: "#57f1db", fontSize: 48 }}
          >
            radar
          </span>
          <span
            style={{
              color: "#bacac5",
              fontSize: 14,
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            Loading SAR data…
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
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
            Data Load Failure
          </h2>
          <p
            style={{
              color: "#bacac5",
              fontSize: 12,
              fontFamily: "'JetBrains Mono',monospace",
              marginBottom: 8,
              wordBreak: "break-all",
            }}
          >
            File path: {import.meta.env.BASE_URL}data/sites.json
          </p>
          <p style={{ color: "#ffb4ab", fontSize: 13 }}>{error}</p>
        </div>
      </div>
    );
  }

  // 1. Landing route ("/")
  if (!isMapRoute || route === "/") {
    return (
      <Landing
        manifest={manifest}
        onNavigateToZone={(zoneId) => navigate(`/map/${zoneId}`)}
      />
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
            onEventResult={setEventResult}
            mode={mode}
            onModeChange={setMode}
          />

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
        <aside className="hidden lg:flex">
          <RightPanel
            zone={matchedZone}
            onJobResult={(resPath) => {
              if (resPath && resPath.includes("souss")) {
                navigate("/map/souss");
              }
            }}
          />
        </aside>
      </div>
    </div>
  );
}
