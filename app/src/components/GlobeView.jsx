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

const BASE = import.meta.env.BASE_URL + "data/";

// Single CSS definitions block
const CSS = {
  container: "relative w-full h-full overflow-hidden select-none",
  fallback:
    "flex flex-col items-center justify-center h-full w-full p-6 text-center bg-[#070e1c] text-[#dce2f6]",
  fallbackCard:
    "max-w-md p-6 rounded-2xl bg-[#151b2a] border border-[rgba(60,74,70,0.5)] shadow-2xl flex flex-col items-center gap-3",
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
    hoverZoneId,
    isCardOpen = false,
    onZoneSelect,
    onGlobeClick,
    onHoverZone,
  },
  ref
) {
  const globeEl = useRef();
  const containerRef = useRef();

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [countries, setCountries] = useState([]);
  const [hoverPolygon, setHoverPolygon] = useState(null);

  // Resize handler
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || window.innerWidth,
          height: containerRef.current.clientHeight || window.innerHeight,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Fetch optional world polygons
  useEffect(() => {
    let active = true;
    fetch(`${BASE}world.geojson`)
      .then((res) => {
        if (!res.ok) throw new Error("No world.geojson");
        return res.json();
      })
      .then((data) => {
        if (active && data?.features) {
          setCountries(data.features);
        }
      })
      .catch(() => {
        // Fallback: polygon-less globe
      });
    return () => {
      active = false;
    };
  }, []);

  // Configure auto-rotate with prefers-reduced-motion and idle-resume
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
    controls.autoRotateSpeed = 0.35;

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

  // Points data from manifest zones
  const pointsData = useMemo(() => {
    return zones.map((z) => {
      const lat = z.center ? z.center[1] : (z.bbox[1] + z.bbox[3]) / 2;
      const lng = z.center ? z.center[0] : (z.bbox[0] + z.bbox[2]) / 2;
      return {
        ...z,
        lat,
        lng,
      };
    });
  }, [zones]);

  // Rings data for active/hovered zones
  const ringsData = useMemo(() => {
    return pointsData.map((p) => ({
      ...p,
      isHighlighted: p.id === selectedId || p.id === hoverZoneId,
    }));
  }, [pointsData, selectedId, hoverZoneId]);

  const handleGlobeClick = useCallback(
    ({ lat, lng }) => {
      const countryName = hoverPolygon?.properties?.NAME || null;
      onGlobeClick({ lat, lng, countryName });
    },
    [hoverPolygon, onGlobeClick]
  );

  const handlePolygonClick = useCallback(
    (polygon, event, { lat, lng }) => {
      const countryName = polygon?.properties?.NAME || null;
      onGlobeClick({ lat, lng, countryName });
    },
    [onGlobeClick]
  );

  return (
    <div ref={containerRef} className={CSS.container}>
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#070e1c"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        atmosphereColor="#57f1db"
        atmosphereAltitude={0.15}
        // Country polygons
        polygonsData={countries}
        polygonAltitude={(d) => (d === hoverPolygon ? 0.03 : 0.005)}
        polygonCapColor={(d) =>
          d === hoverPolygon
            ? "rgba(87, 241, 219, 0.18)"
            : "rgba(21, 27, 42, 0.55)"
        }
        polygonSideColor={() => "rgba(7, 14, 28, 0.4)"}
        polygonStrokeColor={() => "rgba(60, 74, 70, 0.45)"}
        onPolygonHover={setHoverPolygon}
        onPolygonClick={handlePolygonClick}
        // Zone points
        pointsData={pointsData}
        pointLat="lat"
        pointLng="lng"
        pointColor={(d) =>
          d.id === selectedId || d.id === hoverZoneId ? "#57f1db" : "#38bdf8"
        }
        pointAltitude={(d) =>
          d.id === selectedId || d.id === hoverZoneId ? 0.06 : 0.03
        }
        pointRadius={(d) =>
          d.id === selectedId || d.id === hoverZoneId ? 0.9 : 0.5
        }
        onPointClick={(point) => onZoneSelect(point)}
        onPointHover={(point) => onHoverZone?.(point ? point.id : null)}
        // Pulsing rings
        ringsData={ringsData}
        ringLat="lat"
        ringLng="lng"
        ringColor={() => (t) => `rgba(87, 241, 219, ${Math.max(0, 1 - t)})`}
        ringMaxRadius={(d) => (d.isHighlighted ? 9 : 5)}
        ringPropagationSpeed={(d) => (d.isHighlighted ? 3 : 1.5)}
        ringRepeatPeriod={(d) => (d.isHighlighted ? 900 : 1600)}
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
