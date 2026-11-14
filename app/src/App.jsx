import { useState, useEffect } from "react";
import TopBar from "./components/TopBar";
import ControlsPanel from "./components/ControlsPanel";
import MapView from "./components/MapView";
import Timeline from "./components/Timeline";
import Landing from "./pages/Landing";
import { useManifest } from "./hooks/useManifest";

/**
 * Hash-based router helper for GitHub Pages compatibility.
 *   "#/"             -> { page: "landing" }
 *   "#/map/<zoneId>" -> { page: "map", zoneId: "<zoneId>" }
 */
function parseHash(hash) {
  const clean = hash ? hash.replace(/^#\/?/, "") : "";
  if (!clean || clean === "/") {
    return { page: "landing" };
  }
  if (clean.startsWith("map/")) {
    const rawId = clean.slice(4).split("?")[0].split("/")[0];
    return { page: "map", zoneId: decodeURIComponent(rawId) };
  }
  return { page: "landing" };
}

export default function App() {
  const { manifest, loading, error } = useManifest();
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  // Dashboard state
  const [eventId, setEventId] = useState(null);
  const [period, setPeriod] = useState({ start: null, end: null });
  const [activeClasses, setActiveClasses] = useState([]);
  const [mode, setMode] = useState("period");
  const [basemap, setBasemap] = useState("sat");
  const [opacity, setOpacity] = useState(0.85);
  const [eventResult, setEventResult] = useState(null);

  // Listen to hash changes for routing
  useEffect(() => {
    function onHashChange() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Determine current zone based on route
  const currentZoneId = route.page === "map" ? route.zoneId : null;
  const zone = manifest?.zones?.find((z) => z.id === currentZoneId);
  const zoneNotFound = route.page === "map" && !loading && !zone;

  const events = zone?.events || manifest?.events || [];
  const classes = zone?.classes || manifest?.classes || [];

  // Reset or initialize period, activeClasses, and eventId when the active zone changes
  useEffect(() => {
    if (!zone) return;
    if (zone.dates?.length) {
      setPeriod({
        start: zone.dates[0],
        end: zone.dates[zone.dates.length - 1],
      });
    }
    if (classes.length) {
      setActiveClasses(classes.map((c) => c.id));
    }
    if (events.length) {
      setEventId(events[0].id);
    }
  }, [zone?.id]);

  // Loading state (while fetching manifest.json)
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface text-on-surface">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[44px] animate-spin">
            progress_activity
          </span>
          <span className="text-sm font-mono text-on-surface-variant">
            Loading SAR data…
          </span>
        </div>
      </div>
    );
  }

  // Error state (manifest failed to load)
  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface p-6">
        <div className="max-w-md rounded-2xl bg-surface-container-low p-6 border border-error/50 shadow-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2 text-error font-semibold">
            <span className="material-symbols-outlined">error</span>
            <span>Failed to load manifest</span>
          </div>
          <p className="text-xs font-mono text-on-surface-variant break-all">
            File path: public/data/manifest.json
          </p>
          <p className="text-xs text-error/90">{error}</p>
        </div>
      </div>
    );
  }

  // Route: Landing page (#/)
  if (route.page === "landing") {
    return <Landing manifest={manifest} loading={loading} error={error} />;
  }

  // Route: Map dashboard (#/map/<zone-id>) - Zone not found error
  if (zoneNotFound) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-surface p-6 text-on-surface">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl bg-surface-container-low p-8 text-center border border-outline-variant/40 shadow-2xl">
          <span className="material-symbols-outlined text-4xl text-error">
            wrong_location
          </span>
          <h1 className="text-xl font-bold font-sans">Zone not found</h1>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            The requested monitoring zone{" "}
            <strong className="text-on-surface font-mono font-semibold">
              "{route.zoneId}"
            </strong>{" "}
            was not found in public/data/manifest.json.
          </p>
          <a
            href="#/"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-fixed transition-colors no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-md"
          >
            <span className="material-symbols-outlined text-[16px]">public</span>
            <span>Back to globe</span>
          </a>
        </div>
      </div>
    );
  }

  // The map area height = 100vh minus the topbar (56px)
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
      {/* Top bar — fixed height 56px, includes "Back to globe" button */}
      <TopBar zone={zone} manifest={manifest} />

      {/* Body row — fills remaining height exactly */}
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
        {/* Left controls panel */}
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
            zone={zone}
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

        {/* Center map — takes full remaining space */}
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
            zone={zone}
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
            <Timeline zone={zone} period={period} setPeriod={setPeriod} />
          </div>
        </section>
      </div>
    </div>
  );
}
