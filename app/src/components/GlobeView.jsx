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
import { buildWorldTexture } from "../lib/worldTexture";
import { countryAt } from "../lib/countryAt";

const BASE = import.meta.env.BASE_URL + "data/";

// Single CSS definitions block
const CSS = {
  container: "relative w-full h-full overflow-hidden select-none",
  fallback:
    "flex flex-col items-center justify-center h-full w-full p-6 text-center bg-[#070e1c] text-[#dce2f6]",
  fallbackCard:
    "max-w-md p-6 rounded-2xl bg-[#151b2a] border border-[rgba(60,74,70,0.5)] flex flex-col items-center gap-3",
  fallbackIcon: "material-symbols-outlined text-[48px] text-[#57f1db]",
  fallbackTitle: "text-lg font-bold font-sans",
  fallbackText: "text-xs font-mono text-[#bacac5] leading-relaxed",
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

// 1x1 flat ocean fallback texture until baked texture is ready
function createFlatOceanTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  const computed = window.getComputedStyle
    ? window.getComputedStyle(document.documentElement)
    : null;
  ctx.fillStyle =
    computed?.getPropertyValue("--color-surface-container-lowest")?.trim() ||
    "#070e1c";
  ctx.fillRect(0, 0, 2, 2);
  return canvas.toDataURL("image/png");
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
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [textureUrl, setTextureUrl] = useState(() => createFlatOceanTexture());

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

  // Zone country names list for baked texture highlight
  const zoneCountryNames = useMemo(() => {
    return zones
      .map((z) => z.country)
      .filter(Boolean);
  }, [zones]);

  // Load world.geojson and bake 2048x1024 texture once
  useEffect(() => {
    let active = true;
    fetch(`${BASE}world.geojson`)
      .then((res) => {
        if (!res.ok) throw new Error("world.geojson missing");
        return res.json();
      })
      .then((data) => {
        if (!active || !data?.features) return;
        rawFeaturesRef.current = data.features;
        const bakedUrl = buildWorldTexture(data.features, {
          zoneCountryNames,
        });
        if (active && bakedUrl) {
          setTextureUrl(bakedUrl);
        }
      })
      .catch((err) => {
        console.warn("World texture loading skipped, using flat globe:", err);
      });
    return () => {
      active = false;
    };
  }, [zoneCountryNames]);

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

  // Expose flyTo imperative method
  useImperativeHandle(ref, () => ({
    flyTo: (zone) => {
      if (!globeEl.current || !zone) return;
      const lat = zone.center
        ? zone.center[1]
        : (zone.bbox[1] + zone.bbox[3]) / 2;
      const lng = zone.center
        ? zone.center[0]
        : (zone.bbox[0] + zone.bbox[2]) / 2;
      globeEl.current.pointOfView({ lat, lng, altitude: 1.6 }, 1000);
    },
  }));

  // Stable precomputed points data with attribute names
  const pointsData = useMemo(() => {
    return zones.map((z) => {
      const lat = z.center ? z.center[1] : (z.bbox[1] + z.bbox[3]) / 2;
      const lng = z.center ? z.center[0] : (z.bbox[0] + z.bbox[2]) / 2;
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

  return (
    <div ref={containerRef} className={CSS.container}>
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#070e1c"
        globeImageUrl={textureUrl}
        showAtmosphere={false}
        rendererConfig={{ powerPreference: "high-performance" }}
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
