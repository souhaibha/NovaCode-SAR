import { useState, useRef, lazy, Suspense, Component } from "react";
import ZonePicker from "../components/ZonePicker";
import ZoneInfoCard from "../components/ZoneInfoCard";
import { nearestZone, NEAR_KM, getZoneCenter } from "../lib/geo";

// Lazy-load GlobeView so three.js is never loaded on the dashboard route
const GlobeView = lazy(() => import("../components/GlobeView"));

// ─── Single styling object for presentation redesign ──────────────────────
const STYLES = {
  container:
    "relative h-screen w-screen overflow-hidden bg-surface text-on-surface font-sans select-none",
  header:
    "absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4 pointer-events-none",
  headerLeft: "flex items-center gap-3.5 pointer-events-auto",
  logoBadge:
    "flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container-high border border-outline-variant/40 shadow-[0_0_16px_rgba(87,241,219,0.25)]",
  logoIcon: "material-symbols-outlined text-[22px] text-primary",
  brandTitle:
    "text-xl font-bold tracking-tight text-on-surface font-sans flex items-center gap-2",
  brandSubtitle:
    "hidden sm:inline-flex items-center rounded-full bg-surface-container-high px-2.5 py-0.5 text-[10px] font-mono tracking-widest uppercase text-primary border border-outline-variant/40",
  demoBadge:
    "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono font-medium tracking-wide text-amber-400 border border-amber-500/30",
  headerRight: "flex items-center gap-3 pointer-events-auto",
  overlayControls:
    "absolute top-20 left-6 right-6 z-20 flex flex-col md:flex-row items-start justify-between gap-4 pointer-events-none",
  pickerWrap: "pointer-events-auto w-full max-w-sm",
  cardWrap:
    "pointer-events-auto w-full max-w-sm self-end md:self-start transition-all duration-300",
  hintBar:
    "absolute bottom-5 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex items-center gap-2 rounded-full bg-surface-container-low/80 px-4 py-1.5 text-xs font-mono text-on-surface-variant backdrop-blur-md border border-outline-variant/30 shadow-lg",
  webglFallbackBanner:
    "absolute inset-x-6 top-20 z-10 rounded-2xl bg-surface-container-low/95 p-6 border border-outline-variant/40 shadow-2xl flex flex-col items-center text-center gap-3",
  fallbackIcon: "material-symbols-outlined text-4xl text-secondary",
  fallbackTitle: "text-base font-bold text-on-surface",
  fallbackText: "text-xs text-on-surface-variant max-w-md leading-relaxed",
  loadingOverlay:
    "flex h-full w-full items-center justify-center bg-surface text-on-surface font-mono text-sm",
};

// WebGL Error Boundary to catch Three.js / WebGL context errors gracefully
class GlobeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.warn("GlobeView rendering error:", error);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function isWebGLAvailable() {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch (e) {
    return false;
  }
}

export default function Landing({ manifest, loading, error }) {
  const globeRef = useRef(null);

  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [hoveredZoneId, setHoveredZoneId] = useState(null);
  const [cardData, setCardData] = useState(null);
  const [hasWebGL] = useState(() => isWebGLAvailable());

  const zones = manifest?.zones || [];

  // Handler: Selecting a zone (via picker or direct globe click)
  const handleSelectZone = (zone) => {
    if (!zone) return;
    setSelectedZoneId(zone.id);
    setCardData({
      type: "zone",
      zone,
    });

    // Fly camera smoothly to zone center (1000ms transition)
    const center = getZoneCenter(zone);
    globeRef.current?.pointOfView(
      {
        lat: center.lat,
        lng: center.lng,
        altitude: 1.5,
      },
      1000
    );
  };

  // Handler: Click anywhere on the globe or country polygon
  const handleLocationClick = ({ lat, lng }, countryName = null) => {
    if (typeof lat !== "number" || typeof lng !== "number") return;

    const result = nearestZone(lat, lng, zones);
    if (!result) return;

    const { zone, distanceKm, inside } = result;

    if (inside) {
      // Direct click inside the zone bounds
      setSelectedZoneId(zone.id);
      setCardData({
        type: "zone",
        zone,
        clickedCoords: { lat, lng },
        countryName,
      });
    } else if (distanceKm <= NEAR_KM) {
      // Near supported zone
      setCardData({
        type: "near",
        zone,
        distanceKm,
        clickedCoords: { lat, lng },
        countryName,
      });
    } else {
      // Far from any monitored zone
      setCardData({
        type: "far",
        zone,
        distanceKm,
        clickedCoords: { lat, lng },
        countryName,
      });
    }
  };

  // Handler: Click on country polygon
  const handlePolygonClick = (feature, { lat, lng }) => {
    const countryName =
      feature?.properties?.NAME || feature?.properties?.ADMIN || null;
    handleLocationClick({ lat, lng }, countryName);
  };

  // WebGL Fallback UI when 3D acceleration is missing
  const fallbackUI = (
    <div className={STYLES.webglFallbackBanner}>
      <span className={STYLES.fallbackIcon}>public_off</span>
      <h2 className={STYLES.fallbackTitle}>3D Globe Acceleration Unavailable</h2>
      <p className={STYLES.fallbackText}>
        WebGL is not supported or is currently disabled in your browser. You can still search, inspect, and launch all supported SAR monitoring zones using the zone selector above.
      </p>
    </div>
  );

  if (loading) {
    return (
      <div className={STYLES.loadingOverlay}>
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[44px] animate-spin">
            progress_activity
          </span>
          <span>Loading SAR Earth observation data…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface p-6">
        <div className="max-w-md rounded-2xl bg-surface-container-low p-6 border border-error/50 shadow-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2 text-error font-semibold">
            <span className="material-symbols-outlined">error</span>
            <span>Failed to load manifest</span>
          </div>
          <p className="text-xs font-mono text-on-surface-variant break-all">
            File: public/data/manifest.json
          </p>
          <p className="text-xs text-error/90">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={STYLES.container}>
      {/* 3D Globe Canvas (Background) */}
      {hasWebGL ? (
        <GlobeErrorBoundary fallback={fallbackUI}>
          <Suspense
            fallback={
              <div className={STYLES.loadingOverlay}>
                <span className="material-symbols-outlined text-primary text-[32px] animate-spin">
                  progress_activity
                </span>
              </div>
            }
          >
            <GlobeView
              ref={globeRef}
              zones={zones}
              selectedZoneId={selectedZoneId}
              hoveredZoneId={hoveredZoneId}
              cardOpen={Boolean(cardData)}
              onSelectZone={handleSelectZone}
              onHoverZone={(z) => setHoveredZoneId(z?.id || null)}
              onGlobeClick={handleLocationClick}
              onPolygonClick={handlePolygonClick}
            />
          </Suspense>
        </GlobeErrorBoundary>
      ) : (
        fallbackUI
      )}

      {/* Top Header */}
      <header className={STYLES.header}>
        <div className={STYLES.headerLeft}>
          <div className={STYLES.logoBadge}>
            <span className={STYLES.logoIcon}>radar</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={STYLES.brandTitle}>SARdance</span>
            <span className={STYLES.brandSubtitle}>Earth Observation</span>
            {manifest?.fake && (
              <span className={STYLES.demoBadge} title="Demonstration dataset">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Demo data
              </span>
            )}
          </div>
        </div>

        <div className={STYLES.headerRight}>
          {/* Quick zone badge */}
          <span className="hidden md:inline-flex text-xs font-mono text-outline">
            {zones.length} active zone{zones.length > 1 ? "s" : ""}
          </span>
        </div>
      </header>

      {/* Floating Controls Overlay: Zone Combobox & Info Card */}
      <div className={STYLES.overlayControls}>
        <div className={STYLES.pickerWrap}>
          <ZonePicker
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelectZone={handleSelectZone}
          />
        </div>

        {cardData && (
          <div className={STYLES.cardWrap}>
            <ZoneInfoCard
              cardData={cardData}
              onClose={() => setCardData(null)}
              manifestSensor={manifest?.sensor}
            />
          </div>
        )}
      </div>

      {/* Hint footer bar */}
      <div className={STYLES.hintBar}>
        <span className="material-symbols-outlined text-[16px] text-primary">
          explore
        </span>
        <span>Drag to rotate • Scroll to zoom • Click any region or zone marker</span>
      </div>
    </div>
  );
}
