import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from "react";
import ZonePicker from "../components/ZonePicker";
import ZoneInfoCard from "../components/ZoneInfoCard";
import worldCountries from "../lib/countries.json";

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
    "hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-[#232a39] text-[#57f1db] text-[10px] font-sans font-semibold tracking-wider border border-[rgba(60,74,70,0.4)] uppercase",
  pickerWrapper: "pointer-events-auto w-full md:w-96 flex justify-center",
  globeContainer: "w-full h-full relative z-10",
  loaderBox:
    "absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#070e1c] z-20 text-[#bacac5]",
  loaderIcon: "material-symbols-outlined text-[42px] text-[#57f1db] animate-spin",
  loaderText: "font-sans text-xs text-[#bacac5] tracking-wide",
  footerHint:
    "absolute bottom-4 left-6 z-20 pointer-events-none hidden sm:flex items-center gap-2 text-[11px] font-sans text-[#bacac5] bg-[#151b2a] px-3 py-1.5 rounded-lg border border-[rgba(60,74,70,0.4)]",
};

export default function Landing({ manifest, onNavigateToZone, onNavigateToCustomZone }) {
  const globeRef = useRef(null);

  const [clickInfo, setClickInfo] = useState(null);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const sensor = manifest?.sensor || "NISAR / Sentinel-1";

  // Live ticking date/time ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentDate.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const formattedTime = currentDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });

  // User selects city, region or country from search box
  const handlePickerSelect = useCallback((place) => {
    if (globeRef.current && place.lat != null && place.lng != null) {
      globeRef.current.flyTo({ lat: place.lat, lng: place.lng });
    }
    const displayName = place.subtitle
      ? `${place.name} (${place.subtitle})`
      : place.name;
    setClickInfo({
      lat: place.lat,
      lng: place.lng,
      countryName: displayName,
      isNear: false,
    });
  }, []);

  // User clicks directly on globe
  const handleGlobeClick = useCallback(({ lat, lng, countryName }) => {
    if (globeRef.current) {
      globeRef.current.flyTo({ lat, lng });
    }
    setClickInfo({
      lat,
      lng,
      countryName,
      isNear: false,
    });
  }, []);

  const handleCloseCard = useCallback(() => {
    setClickInfo(null);
  }, []);

  const isCardOpen = Boolean(clickInfo);

  return (
    <div className={CSS.container}>
      {/* Top Header / Branding & Search & Live Date */}
      <header className={CSS.header}>
        <div className={CSS.brandRow}>
          <div className={CSS.logoBox}>
            <span className="material-symbols-outlined text-[20px]">radar</span>
          </div>
          <span className={CSS.title}>SARdance</span>
          <span className={CSS.tagline}>Global SAR Change Monitor</span>
        </div>

        <div className={CSS.pickerWrapper}>
          <ZonePicker
            zones={worldCountries}
            selectedId={clickInfo?.countryName}
            onSelect={handlePickerSelect}
          />
        </div>

        {/* Live Date & Orbit Telemetry Pill */}
        <div className="hidden lg:flex items-center gap-3 bg-[#151b2a] border border-[rgba(87,241,219,0.3)] px-3.5 py-1.5 rounded-2xl shadow-lg pointer-events-auto shrink-0 font-sans">
          <span className="w-2 h-2 rounded-full bg-[#57f1db] shadow-[0_0_8px_#57f1db] animate-pulse" />
          <div className="flex flex-col text-right">
            <span className="text-xs font-bold text-[#ffffff] capitalize tracking-tight font-sans">
              {formattedDate}
            </span>
            <span className="text-[10px] font-semibold text-[#57f1db] tracking-wider font-sans">
              {formattedTime} UTC • Sentinel-1 Active
            </span>
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
            zones={[]}
            selectedId={null}
            isCardOpen={isCardOpen}
            onZoneSelect={null}
            onGlobeClick={handleGlobeClick}
          />
        </Suspense>
      </main>

      {/* Info Card Drawer / Dialog */}
      {isCardOpen && (
        <ZoneInfoCard
          zone={null}
          clickInfo={clickInfo}
          sensor={sensor}
          onClose={handleCloseCard}
          onOpenZone={(zoneId) => onNavigateToZone(zoneId)}
          onOpenCustomZone={(customData) => onNavigateToCustomZone && onNavigateToCustomZone(customData)}
        />
      )}

      {/* Navigation hint */}
      <footer className={CSS.footerHint}>
        <span className="material-symbols-outlined text-[14px] text-[#57f1db]">
          touch_app
        </span>
        <span>Click anywhere on Earth or search a location to launch NASA satellite SAR analysis</span>
      </footer>
    </div>
  );
}
