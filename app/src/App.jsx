import { useState } from "react";
import TopBar from "./components/TopBar";
import ControlsPanel from "./components/ControlsPanel";
import MapView from "./components/MapView";
import Timeline from "./components/Timeline";
import { useManifest } from "./hooks/useManifest";

export default function App() {
  const { manifest, loading, error } = useManifest();

  const [zoneId, setZoneId] = useState("gharb");
  const [eventId, setEventId] = useState(null);
  const [period, setPeriod] = useState({ start: null, end: null });
  const [activeClasses, setActiveClasses] = useState([]);
  const [mode, setMode] = useState("period");
  const [basemap, setBasemap] = useState("sat");
  const [opacity, setOpacity] = useState(0.85);
  const [eventResult, setEventResult] = useState(null);

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", width: "100vw", alignItems: "center", justifyContent: "center", background: "#0c1321" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <span className="material-symbols-outlined animate-pulse" style={{ color: "#57f1db", fontSize: 48 }}>radar</span>
          <span style={{ color: "#bacac5", fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}>Loading SAR data…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0c1321" }}>
        <p style={{ color: "#ffb4ab", padding: 16 }}>Could not load manifest: {error}</p>
      </div>
    );
  }

  const zone = manifest.zones?.find((z) => z.id === zoneId) || manifest.zones?.[0];
  const events = zone?.events || manifest.events || [];
  const classes = zone?.classes || manifest.classes || [];

  // Init period & classes on first render after manifest loads
  if (period.start === null && zone?.dates?.length) {
    setPeriod({ start: zone.dates[0], end: zone.dates[zone.dates.length - 1] });
    if (classes.length) setActiveClasses(classes.map((c) => c.id));
    if (events.length) setEventId(events[0].id);
  }

  // The map area height = 100vh minus the topbar (56px)
  const MAP_AREA_H = "calc(100vh - 56px)";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden", background: "#0c1321" }}>
      {/* Top bar — fixed height 56px */}
      <TopBar zone={zone} />

      {/* Body row — fills remaining height exactly */}
      <div style={{ display: "flex", flexDirection: "row", height: MAP_AREA_H, width: "100vw", flex: 1, minHeight: 0, overflow: "hidden" }}>

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
          <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, zIndex: 30 }}>
            <Timeline zone={zone} period={period} setPeriod={setPeriod} />
          </div>
        </section>
      </div>
    </div>
  );
}
