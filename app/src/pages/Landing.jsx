import React, { useState, useRef, Suspense, lazy, useCallback } from "react";
import ZonePicker from "../components/ZonePicker";
import ZoneInfoCard from "../components/ZoneInfoCard";
import { nearestZone, NEAR_KM } from "../lib/geo";

const GlobeView = lazy(() => import("../components/GlobeView"));

// Single CSS definitions block for Landing page (solid backgrounds, no expensive backdrop-blur or heavy box-shadows)
const CSS = {
  container:
    "relative w-screen h-screen overflow-hidden bg-[#070e1c] text-[#dce2f6] flex flex-col font-sans select-none",
  header:
    "absolute top-0 left-0 right-0 z-30 flex flex-col md:flex-row items-center justify-between p-4 md:px-8 pointer-events-none gap-4",
  brandRow:
    "flex items-center gap-3 pointer-events-auto bg-[#151b2a] px-3.5 py-2 rounded-2xl border border-[rgba(60,74,70,0.5)]",
  logoBox:
    "w-9 h-9 rounded-xl flex items-center justify-center bg-[#232a39] border border-[rgba(60,74,70,0.4)] text-[#57f1db]",
  title: "text-lg font-bold tracking-tight text-[#dce2f6]",
  tagline:
    "hidden sm:inline-block px-2 py-0.5 rounded-full bg-[#232a39] text-[#57f1db] text-[10px] font-mono tracking-wider border border-[rgba(60,74,70,0.4)] uppercase",
  demoBadge:
    "px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider uppercase bg-[#ffb4ab]/15 text-[#ffb4ab] border border-[#ffb4ab]/30",
  pickerWrapper: "pointer-events-auto w-full md:w-96 flex justify-center",
  globeContainer: "w-full h-full relative z-10",
  loaderBox:
    "absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#070e1c] z-20 text-[#bacac5]",
  loaderIcon: "material-symbols-outlined text-[42px] text-[#57f1db] animate-spin",
  loaderText: "font-mono text-xs text-[#bacac5] tracking-wide",
  footerHint:
    "absolute bottom-4 left-6 z-20 pointer-events-none hidden sm:flex items-center gap-2 text-[11px] font-mono text-[#bacac5] bg-[#151b2a] px-3 py-1.5 rounded-lg border border-[rgba(60,74,70,0.4)]",
};

export default function Landing({ manifest, onNavigateToZone }) {
  const globeRef = useRef(null);

  const [selectedZone, setSelectedZone] = useState(null);
  const [clickInfo, setClickInfo] = useState(null);

  const zones = manifest?.zones || [];
  const sensor = manifest?.sensor || null;
  const isDemo = Boolean(manifest?.fake);

  // User selects zone from combobox
  const handlePickerSelect = useCallback(
    (zone) => {
      setSelectedZone(zone);
      setClickInfo(null);
      if (globeRef.current) {
        globeRef.current.flyTo(zone);
      }
    },
    []
  );

  // User clicks directly on a zone marker
  const handleMarkerSelect = useCallback(
    (zone) => {
      setSelectedZone(zone);
      setClickInfo(null);
      if (globeRef.current) {
        globeRef.current.flyTo(zone);
      }
    },
    []
  );

  // User clicks anywhere on globe / polygon
  const handleGlobeClick = useCallback(
    ({ lat, lng, countryName }) => {
      const nearest = nearestZone(lat, lng, zones);

      if (nearest.inside && nearest.zone) {
        // Clicked inside a supported zone bbox
        setSelectedZone(nearest.zone);
        setClickInfo(null);
        if (globeRef.current) {
          globeRef.current.flyTo(nearest.zone);
        }
      } else if (nearest.distanceKm <= NEAR_KM && nearest.zone) {
        // Within NEAR_KM
        setSelectedZone(null);
        setClickInfo({
          lat,
          lng,
          countryName,
          nearest,
          isNear: true,
        });
      } else {
        // Far away / no data here
        setSelectedZone(null);
        setClickInfo({
          lat,
          lng,
          countryName,
          nearest,
          isNear: false,
        });
      }
    },
    [zones]
  );

  const handleCloseCard = useCallback(() => {
    setSelectedZone(null);
    setClickInfo(null);
  }, []);

  const isCardOpen = Boolean(selectedZone || clickInfo);

  return (
    <div className={CSS.container}>
      {/* Top Header / Branding & Search */}
      <header className={CSS.header}>
        <div className={CSS.brandRow}>
          <div className={CSS.logoBox}>
            <span className="material-symbols-outlined text-[20px]">radar</span>
          </div>
          <span className={CSS.title}>SARdance</span>
          <span className={CSS.tagline}>Global SAR Change Monitor</span>
          {isDemo && <span className={CSS.demoBadge}>Demo data</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }} className="pointer-events-auto">
          <a
            href="#/analyze"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 14,
              background: "#57f1db",
              color: "#003731",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              textDecoration: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>crop_free</span>
            <span>Analyze a zone</span>
          </a>

          <div className={CSS.pickerWrapper}>
            <ZonePicker
              zones={zones}
              selectedId={selectedZone?.id}
              onSelect={handlePickerSelect}
            />
          </div>
        </div>
      </header>

      {/* 3D Globe with Lazy Loading */}
      <main className={CSS.globeContainer}>
        <Suspense
          fallback={
            <div className={CSS.loaderBox}>
              <span className={CSS.loaderIcon}>progress_activity</span>
              <span className={CSS.loaderText}>Initializing 3D Globe…</span>
            </div>
          }
        >
          <GlobeView
            ref={globeRef}
            zones={zones}
            selectedId={selectedZone?.id}
            isCardOpen={isCardOpen}
            onZoneSelect={handleMarkerSelect}
            onGlobeClick={handleGlobeClick}
          />
        </Suspense>
      </main>

      {/* Info Card Drawer / Dialog */}
      {isCardOpen && (
        <ZoneInfoCard
          zone={selectedZone}
          clickInfo={clickInfo}
          sensor={sensor}
          onClose={handleCloseCard}
          onOpenZone={(zoneId) => onNavigateToZone(zoneId)}
        />
      )}

      {/* Navigation hint */}
      <footer className={CSS.footerHint}>
        <span className="material-symbols-outlined text-[14px] text-[#57f1db]">
          touch_app
        </span>
        <span>Drag to rotate • Scroll to zoom • Click a zone to inspect</span>
      </footer>
    </div>
  );
}
