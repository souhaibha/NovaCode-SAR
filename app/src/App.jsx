import { useState, useEffect, useCallback, useRef } from "react";
import TopBar from "./components/TopBar";
import ControlsPanel from "./components/ControlsPanel";
import MapView from "./components/MapView";
import Timeline from "./components/Timeline";
import Landing from "./pages/Landing";
import RightPanel from "./components/RightPanel";
import SiteViewerRoute from "./components/SiteViewerRoute";
import { useSites } from "./hooks/useSites";
import useSiteSummary from "./hooks/useSiteSummary";
import { useHashRoute } from "./lib/router";
import { siteBase } from "./lib/api";
import { visibleLegend } from "./lib/siteAdapter";

// ── Constant ──────────────────────────────────────────────────────────────────
const TEAM_NAME = "TODO";

export default function App() {
  const { sites, status: sitesStatus, error: sitesError } = useSites();
  const { route, navigate } = useHashRoute();

  const [activeClasses, setActiveClasses] = useState([]);
  const [opacity, setOpacity] = useState(0.85);

  // Radar display & filter states
  const [radarOpacity, setRadarOpacity] = useState(1.0);
  const [radarFilter, setRadarFilter] = useState("composite");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [extraLayersVisible, setExtraLayersVisible] = useState({});

  // Single view timeline states
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const singleDateIndexRef = useRef(0);
  const [pickedDate, setPickedDate] = useState(null);

  // P3 Compare mode (split view) states
  const [isCompare, setIsCompare] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [beforeIndex, setBeforeIndex] = useState(0);
  const [afterIndex, setAfterIndex] = useState(1);
  const [pickedBeforeDate, setPickedBeforeDate] = useState(null);
  const [pickedAfterDate, setPickedAfterDate] = useState(null);

  // ── Route parsing ───────────────────────────────────────────────────────────
  const isSiteRoute = route.startsWith("/site/");
  const routeSiteId = isSiteRoute ? route.replace("/site/", "").trim() : null;
  const isMapRoute = route.startsWith("/map/");
  const routeMapId  = isMapRoute  ? route.replace("/map/",  "").trim() : null;

  // ── Resolve site entry for #/map/<id> ───────────────────────────────────────
  const matchedEntry = isMapRoute && sites.length > 0
    ? (sites.find((s) => s.site === routeMapId) || { site: routeMapId, folder: routeMapId + "/" })
    : null;

  // ── Load full summary.json ──────────────────────────────────────────────────
  const { summary: matchedZone, loading: summaryLoading, error: summaryError } = useSiteSummary(matchedEntry);

  // ── Sync activeClasses, reset frame and layers when zone changes ─────────────
  useEffect(() => {
    if (!matchedZone) return;
    const vis = visibleLegend(matchedZone.legend || []);
    setActiveClasses(vis.map((e) => e.cls));
    setSelectedFrameIndex(0);
    singleDateIndexRef.current = 0;
    setPickedDate(null);
    setExtraLayersVisible({});
    setIsCompare(false);
    setBeforeIndex(0);
    setAfterIndex(Math.min(1, (matchedZone.dates?.length || 1) - 1));
    setPickedBeforeDate(null);
    setPickedAfterDate(null);
    setSplit(0.5);
  }, [matchedZone?.id]);

  // Keep singleDateIndexRef in sync with single view changes
  useEffect(() => {
    if (!isCompare) {
      singleDateIndexRef.current = selectedFrameIndex;
    }
  }, [selectedFrameIndex, isCompare]);

  // ── Requirement 3: Toggle compare mode & return to single view with same date ──
  const handleToggleCompare = useCallback(() => {
    setIsCompare((prev) => {
      if (!prev) {
        // Entering compare: save single date index and initialize before/after
        singleDateIndexRef.current = selectedFrameIndex;
        setBeforeIndex(0);
        setAfterIndex(Math.max(1, selectedFrameIndex || 1));
        setPickedBeforeDate(null);
        setPickedAfterDate(null);
        setSplit(0.5);
        return true;
      } else {
        // Leaving compare: return to single view with the same date
        const returnIndex = singleDateIndexRef.current;
        setSelectedFrameIndex(returnIndex);
        setPickedDate(null);
        return false;
      }
    });
  }, [selectedFrameIndex]);

  // ── Global loading gate ─────────────────────────────────────────────────────
  const isLoadingSites = sitesStatus === "loading";
  const isSummaryLoading = isMapRoute && Boolean(matchedEntry) && !summaryError && summaryLoading;

  if (isLoadingSites || isSummaryLoading) {
    return (
      <div style={{ display:"flex", height:"100vh", width:"100vw", alignItems:"center", justifyContent:"center", background:"#0c1321" }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
          <span className="material-symbols-outlined animate-pulse" style={{ color:"#57f1db", fontSize:48 }}>radar</span>
          <span style={{ color:"#bacac5", fontSize:14, fontFamily:"'JetBrains Mono',monospace" }}>
            Loading SAR data…
          </span>
        </div>
      </div>
    );
  }

  // ── Sites index error ───────────────────────────────────────────────────────
  if (sitesStatus === "error") {
    return (
      <div style={{ display:"flex", height:"100vh", alignItems:"center", justifyContent:"center", background:"#0c1321" }}>
        <div style={{ maxWidth:480, padding:24, borderRadius:16, background:"#151b2a", border:"1px solid rgba(255,180,171,0.3)", textAlign:"center" }}>
          <span className="material-symbols-outlined" style={{ color:"ffb4ab", fontSize:40, marginBottom:8 }}>error</span>
          <h2 style={{ color:"#ffb4ab", fontSize:16, fontWeight:700, marginBottom:8 }}>Data Load Failure</h2>
          <p style={{ color:"#bacac5", fontSize:12, fontFamily:"'JetBrains Mono',monospace", marginBottom:8 }}>
            {import.meta.env.BASE_URL}data/web/sites.json
          </p>
          <p style={{ color:"#ffb4ab", fontSize:13 }}>{sitesError}</p>
        </div>
      </div>
    );
  }

  // ── 0. /site/<id> route (SiteMap standalone) ────────────────────────────────
  if (isSiteRoute) {
    return <SiteViewerRoute siteId={routeSiteId} />;
  }

  // ── 1. Landing ("/") ────────────────────────────────────────────────────────
  if (!isMapRoute || route === "/") {
    return (
      <Landing
        manifest={{ zones: sites.map((s) => ({ ...s, id: s.site })) }}
        onNavigateToZone={(zoneId) => navigate(`/map/${zoneId}`)}
      />
    );
  }

  // ── 2. #/map/<id> — not found or summary error ─────────────────────────────
  const notFound = !matchedZone && (Boolean(summaryError) || sitesStatus === "success");
  if (notFound) {
    return (
      <div style={{ display:"flex", height:"100vh", width:"100vw", alignItems:"center", justifyContent:"center", background:"#070e1c", color:"#dce2f6" }}>
        <div style={{ padding:32, borderRadius:20, background:"#151b2a", border:"1px solid rgba(60,74,70,0.5)", textAlign:"center", maxWidth:420 }}>
          <span className="material-symbols-outlined" style={{ fontSize:48, color:"#ffb4ab", marginBottom:12 }}>location_off</span>
          <h2 style={{ fontSize:20, fontWeight:700, fontFamily:"'Plus Jakarta Sans', sans-serif", marginBottom:8 }}>Site not found</h2>
          <p style={{ fontSize:13, color:"#bacac5", marginBottom:16, lineHeight:1.5 }}>
            {summaryError
              ? <>Could not load <code style={{ color:"#57f1db" }}>{routeMapId}</code>: {summaryError}</>
              : <>No site matching <code style={{ color:"#57f1db" }}>"{routeMapId}"</code>.</>}
          </p>
          <a href="#/" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 20px", borderRadius:12, background:"#57f1db", color:"#003731", fontWeight:700, fontSize:13, textDecoration:"none" }}>
            <span className="material-symbols-outlined" style={{ fontSize:18 }}>public</span>
            <span>Back to globe</span>
          </a>
        </div>
      </div>
    );
  }

  // ── 3. Active dashboard ─────────────────────────────────────────────────────
  const base = siteBase(matchedEntry);
  const MAP_AREA_H = "calc(100vh - 56px)";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", width:"100vw", overflow:"hidden", background:"#0c1321" }}>
      {/* Top bar */}
      <TopBar
        zone={matchedZone}
        showBack
        sites={sites}
        onNavigate={(id) => navigate(`/map/${id}`)}
      />

      {/* Body row */}
      <div style={{ display:"flex", flexDirection:"row", height:MAP_AREA_H, width:"100vw", flex:1, minHeight:0, overflow:"hidden" }}>

        {/* Left panel — class filters, opacity, radar controls, compare toggle */}
        <aside style={{ width:300, flexShrink:0, display:"flex", flexDirection:"column", height:"100%", background:"#151b2a", overflowY:"auto", zIndex:20, borderRight:"1px solid rgba(60,74,70,0.3)" }} className="hidden lg:flex">
          <ControlsPanel
            zone={matchedZone}
            activeClasses={activeClasses}
            setActiveClasses={setActiveClasses}
            opacity={opacity}
            setOpacity={setOpacity}
            radarOpacity={radarOpacity}
            setRadarOpacity={setRadarOpacity}
            radarFilter={radarFilter}
            setRadarFilter={setRadarFilter}
            brightness={brightness}
            setBrightness={setBrightness}
            contrast={contrast}
            setContrast={setContrast}
            isCompare={isCompare}
            onToggleCompare={handleToggleCompare}
            extraLayersVisible={extraLayersVisible}
            setExtraLayersVisible={setExtraLayersVisible}
            siteBase={base}
          />
        </aside>

        {/* Center map */}
        <section style={{ flex:1, position:"relative", height:"100%", minWidth:0, minHeight:0, overflow:"hidden", background:"#070e1c" }}>
          <MapView
            zone={matchedZone}
            isCompare={isCompare}
            split={split}
            onSplitChange={setSplit}
            selectedFrameIndex={selectedFrameIndex}
            beforeIndex={beforeIndex}
            afterIndex={afterIndex}
            radarOpacity={radarOpacity}
            radarFilter={radarFilter}
            brightness={brightness}
            contrast={contrast}
            extraLayersVisible={extraLayersVisible}
            activeClasses={activeClasses}
            opacity={opacity}
            siteBase={base}
            teamName={TEAM_NAME}
          />

          {/* Timeline bar overlaid at bottom of map (hidden if < 2 frames) */}
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 600,
              width: "calc(100% - 32px)",
              maxWidth: 780,
              pointerEvents: "auto",
            }}
          >
            <Timeline
              dates={matchedZone?.dates || []}
              isCompare={isCompare}
              onToggleCompare={handleToggleCompare}
              selectedIndex={selectedFrameIndex}
              onSelectIndex={setSelectedFrameIndex}
              pickedDate={pickedDate}
              onPickedDateChange={setPickedDate}
              beforeIndex={beforeIndex}
              onSelectBeforeIndex={setBeforeIndex}
              pickedBeforeDate={pickedBeforeDate}
              onPickedBeforeDateChange={setPickedBeforeDate}
              afterIndex={afterIndex}
              onSelectAfterIndex={setAfterIndex}
              pickedAfterDate={pickedAfterDate}
              onPickedAfterDateChange={setPickedAfterDate}
            />
          </div>
        </section>

        {/* Right panel */}
        <aside className="hidden lg:flex">
          <RightPanel zone={matchedZone} onJobResult={() => {}} />
        </aside>
      </div>
    </div>
  );
}
