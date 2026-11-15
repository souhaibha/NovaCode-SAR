import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import Globe from "react-globe.gl";
import { countryAt } from "../lib/countryAt";
import { normalizeFeatures } from "../lib/geoWinding";

const BASE = import.meta.env.BASE_URL + "data/";
const TEXTURES_DIR = import.meta.env.BASE_URL + "textures/";

const TEXTURES = {
  earthRealistic: `${TEXTURES_DIR}earth-blue-marble.jpg`,
  earthNight: `${TEXTURES_DIR}earth-night.jpg`,
  earthTopology: `${TEXTURES_DIR}earth-topology.png`,
  nightSky: `${TEXTURES_DIR}night-sky.png`,
};

// Single CSS definitions block
const CSS = {
  container: "relative w-full h-full overflow-hidden select-none bg-[#02050e]",
  fallback:
    "flex flex-col items-center justify-center h-full w-full p-6 text-center bg-[#070e1c] text-[#dce2f6]",
  fallbackCard:
    "max-w-md p-6 rounded-2xl bg-[#151b2a] border border-[rgba(60,74,70,0.5)] flex flex-col items-center gap-3",
  fallbackIcon: "material-symbols-outlined text-[48px] text-[#57f1db]",
  fallbackTitle: "text-lg font-bold font-sans",
  fallbackText: "text-xs font-mono text-[#bacac5] leading-relaxed",
  modeToggle:
    "absolute bottom-4 right-6 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-[#0b1322]/85 backdrop-blur-md border border-[rgba(60,74,70,0.5)] shadow-lg text-xs font-mono text-[#bacac5]",
  modeBtn:
    "px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5 text-[11px]",
  modeBtnActive:
    "bg-[#1c293d] text-[#57f1db] font-semibold border border-[rgba(87,241,219,0.3)] shadow-sm",
  modeBtnInactive:
    "text-[#8e9eb0] hover:text-[#dce2f6] hover:bg-[#151f30]/60",
};

// Check WebGL availability
function checkWebGLSupport() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// Module-level stable ring accessors
const getRingLat = (d) => d.lat;
const getRingLng = (d) => d.lng;
const getRingColor = () => (t) =>
  `rgba(87, 241, 219, ${Math.max(0, 1 - t)})`;
const getRingMaxRadius = (d) => (d.isHighlighted ? 8 : 5);
const getRingPropagationSpeed = (d) => (d.isHighlighted ? 2.5 : 1.5);
const getRingRepeatPeriod = (d) => (d.isHighlighted ? 1000 : 1600);

// Error Boundary for WebGL/Three.js render failures
class GlobeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err) {
    console.warn("GlobeView error caught by boundary:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={CSS.fallback}>
          <div className={CSS.fallbackCard}>
            <span className={CSS.fallbackIcon}>public_off</span>
            <h3 className={CSS.fallbackTitle}>3D Globe Unavailable</h3>
            <p className={CSS.fallbackText}>
              Your browser or graphics environment encountered an issue rendering
              the 3D globe. Please use the zone search above to navigate directly.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const GlobeInner = forwardRef(function GlobeInner(
  {
    zones = [],
    selectedId,
    isCardOpen = false,
    onZoneSelect,
    onGlobeClick,
  },
  ref
) {
  const globeEl = useRef();
  const containerRef = useRef();
  const rawFeaturesRef = useRef([]);

  const [hoverZoneId, setHoverZoneId] = useState(null);
  const [textureMode, setTextureMode] = useState("realistic");
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Cap renderer pixel ratio at 1.5
  useEffect(() => {
    const globe = globeEl.current;
    if (!globe) return;
    try {
      const renderer = globe.renderer();
      if (renderer) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      }
    } catch {
      // Ignore
    }
  }, []);

  // Pause / resume animation on tab visibilitychange
  useEffect(() => {
    const handleVisibility = () => {
      const globe = globeEl.current;
      if (!globe) return;
      if (document.hidden) {
        globe.pauseAnimation?.();
      } else {
        globe.resumeAnimation?.();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Debounced window resize handler
  useEffect(() => {
    let timeoutId = null;
    const updateSize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (containerRef.current) {
          setDimensions({
            width: containerRef.current.clientWidth || window.innerWidth,
            height: containerRef.current.clientHeight || window.innerHeight,
          });
        }
      }, 100);
    };
    window.addEventListener("resize", updateSize);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // Load world.geojson for country identification on click
  useEffect(() => {
    let active = true;
    fetch(`${BASE}world.geojson`)
      .then((res) => {
        if (!res.ok) throw new Error("world.geojson missing");
        return res.json();
      })
      .then((data) => {
        if (!active || !data?.features) return;
        rawFeaturesRef.current = normalizeFeatures(data.features);
      })
      .catch((err) => {
        console.warn("World geojson lookup loading skipped:", err);
      });
    return () => {
      active = false;
    };
  }, []);

  // Auto-rotate with prefers-reduced-motion check and idle-resume
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const globe = globeEl.current;
    if (!globe) return;

    const controls = globe.controls();
    if (!controls) return;

    if (prefersReducedMotion || isCardOpen) {
      controls.autoRotate = false;
      return;
    }

    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;

    let idleTimeout = null;

    const handlePointerDown = () => {
      controls.autoRotate = false;
      if (idleTimeout) clearTimeout(idleTimeout);
    };

    const handlePointerUp = () => {
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        if (!isCardOpen && !prefersReducedMotion) {
          controls.autoRotate = true;
        }
      }, 5000);
    };

    const domEl = containerRef.current;
    if (domEl) {
      domEl.addEventListener("pointerdown", handlePointerDown);
      domEl.addEventListener("pointerup", handlePointerUp);
    }

    return () => {
      if (idleTimeout) clearTimeout(idleTimeout);
      if (domEl) {
        domEl.removeEventListener("pointerdown", handlePointerDown);
        domEl.removeEventListener("pointerup", handlePointerUp);
      }
    };
  }, [isCardOpen]);

  // Safe helper to extract center { lat, lng } from zone (supports center, bbox, or bounds)
  const getZoneLatLng = (z) => {
    if (!z) return { lat: 0, lng: 0 };
    if (z.center) return { lat: z.center[1], lng: z.center[0] };
    if (z.bbox && z.bbox.length >= 4) {
      return {
        lat: (z.bbox[1] + z.bbox[3]) / 2,
        lng: (z.bbox[0] + z.bbox[2]) / 2,
      };
    }
    if (z.bounds && z.bounds.length >= 2) {
      return {
        lat: (z.bounds[0][0] + z.bounds[1][0]) / 2,
        lng: (z.bounds[0][1] + z.bounds[1][1]) / 2,
      };
    }
    return { lat: 0, lng: 0 };
  };

  // Expose flyTo imperative method
  useImperativeHandle(ref, () => ({
    flyTo: (zoneOrCoords) => {
      if (!globeEl.current || !zoneOrCoords) return;
      let lat = 0;
      let lng = 0;
      if (typeof zoneOrCoords.lat === "number" && typeof zoneOrCoords.lng === "number") {
        lat = zoneOrCoords.lat;
        lng = zoneOrCoords.lng;
      } else {
        const coords = getZoneLatLng(zoneOrCoords);
        lat = coords.lat;
        lng = coords.lng;
      }
      globeEl.current.pointOfView({ lat, lng, altitude: 1.4 }, 1000);
    },
  }));

  // Stable precomputed points data with attribute names
  const pointsData = useMemo(() => {
    return zones.map((z) => {
      const { lat, lng } = getZoneLatLng(z);
      const isHighlighted = z.id === selectedId || z.id === hoverZoneId;
      return {
        ...z,
        lat,
        lng,
        color: isHighlighted ? "#57f1db" : "#38bdf8",
        altitude: isHighlighted ? 0.05 : 0.02,
        radius: isHighlighted ? 0.8 : 0.5,
      };
    });
  }, [zones, selectedId, hoverZoneId]);

  // Stable rings data
  const ringsData = useMemo(() => {
    return pointsData.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      isHighlighted: p.id === selectedId || p.id === hoverZoneId,
    }));
  }, [pointsData, selectedId, hoverZoneId]);

  // Handle globe click with fast cached countryAt lookup
  const handleGlobeClick = useCallback(
    ({ lat, lng }) => {
      const countryName = countryAt(rawFeaturesRef.current, lat, lng);
      onGlobeClick({ lat, lng, countryName });
    },
    [onGlobeClick]
  );

  const handlePointHover = useCallback((point) => {
    const nextId = point ? point.id : null;
    setHoverZoneId((prev) => (prev === nextId ? prev : nextId));
  }, []);

  const activeGlobeImage =
    textureMode === "night" ? TEXTURES.earthNight : TEXTURES.earthRealistic;

  return (
    <div ref={containerRef} className={CSS.container}>
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#000003"
        backgroundImageUrl={TEXTURES.nightSky}
        globeImageUrl={activeGlobeImage}
        bumpImageUrl={TEXTURES.earthTopology}
        showAtmosphere={true}
        atmosphereColor="#3a86ff"
        atmosphereAltitude={0.16}
        rendererConfig={{ powerPreference: "high-performance", antialias: true }}
        // Zone points using stable string attribute accessors
        pointsData={pointsData}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude="altitude"
        pointRadius="radius"
        onPointClick={onZoneSelect}
        onPointHover={handlePointHover}
        // Pulsing rings with module-level accessors
        ringsData={ringsData}
        ringLat={getRingLat}
        ringLng={getRingLng}
        ringColor={getRingColor}
        ringMaxRadius={getRingMaxRadius}
        ringPropagationSpeed={getRingPropagationSpeed}
        ringRepeatPeriod={getRingRepeatPeriod}
        // Interaction
        onGlobeClick={handleGlobeClick}
      />

      {/* Realistic Earth / Night mode switcher floating over space */}
      <div className={CSS.modeToggle}>
        <button
          type="button"
          onClick={() => setTextureMode("realistic")}
          className={`${CSS.modeBtn} ${
            textureMode === "realistic" ? CSS.modeBtnActive : CSS.modeBtnInactive
          }`}
          title="Terre vue satellite réelle (Blue Marble)"
        >
          <span className="material-symbols-outlined text-[14px]">public</span>
          <span>Terre réelle</span>
        </button>
        <button
          type="button"
          onClick={() => setTextureMode("night")}
          className={`${CSS.modeBtn} ${
            textureMode === "night" ? CSS.modeBtnActive : CSS.modeBtnInactive
          }`}
          title="Terre vue de nuit (Lumières des villes)"
        >
          <span className="material-symbols-outlined text-[14px]">dark_mode</span>
          <span>Vue nuit</span>
        </button>
      </div>
    </div>
  );
});

export default forwardRef(function GlobeView(props, ref) {
  const isWebGL = useMemo(() => checkWebGLSupport(), []);

  if (!isWebGL) {
    return (
      <div className={CSS.fallback}>
        <div className={CSS.fallbackCard}>
          <span className={CSS.fallbackIcon}>public_off</span>
          <h3 className={CSS.fallbackTitle}>3D Globe Requires WebGL</h3>
          <p className={CSS.fallbackText}>
            WebGL is not supported or is disabled in your browser. Use the zone
            picker above to explore radar datasets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <GlobeErrorBoundary>
      <GlobeInner ref={ref} {...props} />
    </GlobeErrorBoundary>
  );
});
