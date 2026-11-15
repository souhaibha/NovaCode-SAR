import React, { useState, useRef, Suspense, lazy, useCallback } from "react";
import ZonePicker from "../components/ZonePicker";
import ZoneInfoCard from "../components/ZoneInfoCard";
import { nearestZone, NEAR_KM } from "../lib/geo";

const GlobeView = lazy(() => import("../components/GlobeView"));
const SolarSystemView = lazy(() => import("../components/SolarSystemView"));

// Single CSS definitions block for Landing page
const CSS = {
  container:
    "relative w-screen h-screen overflow-hidden bg-black text-[#dce2f6] flex flex-col font-sans select-none",
  header:
    "absolute top-0 left-0 right-0 z-30 flex flex-col md:flex-row items-center justify-between p-4 md:px-8 pointer-events-none gap-4",
  brandRow:
    "flex items-center gap-3 pointer-events-auto bg-[#0a101d]/85 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-[rgba(60,74,70,0.5)] shadow-xl",
  logoBox:
    "w-9 h-9 rounded-xl flex items-center justify-center bg-[#1c2637] border border-[rgba(60,74,70,0.4)] text-[#57f1db]",
  title: "text-lg font-bold tracking-tight text-[#dce2f6]",
  tagline:
    "hidden sm:inline-block px-2 py-0.5 rounded-full bg-[#1c2637] text-[#57f1db] text-[10px] font-mono tracking-wider border border-[rgba(60,74,70,0.4)] uppercase",
  demoBadge:
    "px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider uppercase bg-[#ffb4ab]/15 text-[#ffb4ab] border border-[#ffb4ab]/30",
  pickerWrapper: "pointer-events-auto w-full md:w-96 flex justify-center",
  globeContainer: "w-full h-full relative z-10",
  loaderBox:
    "absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#02050e] z-20 text-[#bacac5]",
  loaderIcon: "material-symbols-outlined text-[42px] text-[#57f1db] animate-spin",
  loaderText: "font-mono text-xs text-[#bacac5] tracking-wide",
  footerHint:
    "absolute bottom-4 left-6 z-20 pointer-events-none hidden sm:flex items-center gap-2 text-[11px] font-mono text-[#bacac5] bg-[#0a101d]/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[rgba(60,74,70,0.4)] shadow-lg",
};

export default function Landing({ manifest, onNavigateToZone, onNavigateToCustomZone }) {
  const globeRef = useRef(null);

  const [mainView, setMainView] = useState("earth"); // "earth" | "solar"
  const [selectedZone, setSelectedZone] = useState(null);
  const [clickInfo, setClickInfo] = useState(null);

  const zones = manifest?.zones || [];
  const sensor = manifest?.sensor || null;
  const isDemo = Boolean(manifest?.fake);

  const prefetchSite = useCallback((zoneId) => {
    if (!zoneId || zoneId === "custom") return;
    const url = `${import.meta.env.BASE_URL}data/sites/${zoneId}/summary.json`;
    fetch(url, { cache: "force-cache" }).catch(() => {});
  }, []);

  // User selects zone from combobox
  const handlePickerSelect = useCallback(
    (zone) => {
      setSelectedZone(zone);
      setClickInfo(null);
      prefetchSite(zone?.site || zone?.id);
      if (globeRef.current) {
        globeRef.current.flyTo(zone);
      }
    },
    [prefetchSite]
  );

  // User clicks directly on a zone marker
  const handleMarkerSelect = useCallback(
    (zone) => {
      setSelectedZone(zone);
      setClickInfo(null);
      prefetchSite(zone?.site || zone?.id);
      if (globeRef.current) {
        globeRef.current.flyTo(zone);
      }
    },
    [prefetchSite]
  );

  // User clicks anywhere on globe / polygon
  const handleGlobeClick = useCallback(
    ({ lat, lng, countryName }) => {
      if (globeRef.current) {
        globeRef.current.flyTo({ lat, lng });
      }

      const nearest = nearestZone(lat, lng, zones);

      if (nearest.inside && nearest.zone) {
        // Clicked inside a supported zone bbox
        setSelectedZone(nearest.zone);
        setClickInfo(null);
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
        // Far away / custom point on globe
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
      {/* Top Header / Branding, View Switcher & Search */}
      <header className={CSS.header}>
        <div className="flex flex-wrap items-center gap-3 pointer-events-auto">
          <div className={CSS.brandRow}>
            <div className={CSS.logoBox}>
              <span className="material-symbols-outlined text-[20px]">radar</span>
            </div>
            <span className={CSS.title}>SARdance</span>
            <span className={CSS.tagline}>Global SAR Change Monitor</span>
            {isDemo && <span className={CSS.demoBadge}>Demo data</span>}
          </div>

          {/* Mode Switcher: Globe Terrestre vs Système Solaire */}
          <div className="flex items-center gap-1 p-1 bg-[#0a101d]/85 backdrop-blur-md rounded-2xl border border-[rgba(60,74,70,0.5)] shadow-xl">
            <button
              type="button"
              onClick={() => {
                setMainView("earth");
                handleCloseCard();
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                mainView === "earth"
                  ? "bg-[#1c293d] text-[#57f1db] font-semibold border border-[rgba(87,241,219,0.3)] shadow-sm"
                  : "text-[#8e9eb0] hover:text-[#dce2f6] hover:bg-[#151f30]/50"
              }`}
              title="Afficher la Terre et les zones d'observation radar SAR"
            >
              <span className="material-symbols-outlined text-[16px]">public</span>
              <span>Globe Terrestre</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMainView("solar");
                handleCloseCard();
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                mainView === "solar"
                  ? "bg-[#1c293d] text-[#57f1db] font-semibold border border-[rgba(87,241,219,0.3)] shadow-sm"
                  : "text-[#8e9eb0] hover:text-[#dce2f6] hover:bg-[#151f30]/50"
              }`}
              title="Explorer le Système Solaire en 3D temps réel"
            >
              <span className="material-symbols-outlined text-[16px]">wb_sunny</span>
              <span>Système Solaire</span>
            </button>
          </div>
        </div>

        {mainView === "earth" && (
          <div className={CSS.pickerWrapper}>
            <ZonePicker
              zones={zones}
              selectedId={selectedZone?.id}
              onSelect={handlePickerSelect}
            />
          </div>
        )}
      </header>

      {/* 3D View with Lazy Loading: Globe View or Solar System View */}
      <main className={CSS.globeContainer}>
        <Suspense
          fallback={
            <div className={CSS.loaderBox}>
              <span className={CSS.loaderIcon}>progress_activity</span>
              <span className={CSS.loaderText}>
                {mainView === "earth" ? "Initialisation du Globe 3D…" : "Chargement du Système Solaire…"}
              </span>
            </div>
          }
        >
          {mainView === "earth" ? (
            <GlobeView
              ref={globeRef}
              zones={zones}
              selectedId={selectedZone?.id}
              isCardOpen={isCardOpen}
              onZoneSelect={handleMarkerSelect}
              onGlobeClick={handleGlobeClick}
            />
          ) : (
            <SolarSystemView onSwitchToEarth={() => setMainView("earth")} />
          )}
        </Suspense>
      </main>

      {/* Info Card Drawer / Dialog for Earth zones */}
      {mainView === "earth" && isCardOpen && (
        <ZoneInfoCard
          zone={selectedZone}
          clickInfo={clickInfo}
          sensor={sensor}
          onClose={handleCloseCard}
          onOpenZone={(zoneId) => onNavigateToZone(zoneId)}
          onOpenCustomZone={(customData) => onNavigateToCustomZone && onNavigateToCustomZone(customData)}
        />
      )}

      {/* Navigation hint for Earth Globe */}
      {mainView === "earth" && (
        <footer className={CSS.footerHint}>
          <span className="material-symbols-outlined text-[14px] text-[#57f1db]">
            touch_app
          </span>
          <span>Glisser pour pivoter • Molette pour zoomer • Cliquer pour inspecter</span>
        </footer>
      )}
    </div>
  );
}
