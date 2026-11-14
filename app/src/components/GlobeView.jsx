import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import Globe from "react-globe.gl";
import { getZoneCenter } from "../lib/geo";

const BASE = import.meta.env.BASE_URL + "data/";

// Earth dark texture fallback from unpkg (cached by browser)
const EARTH_TEXTURE = "//unpkg.com/three-globe/example/img/earth-dark.jpg";
const EARTH_BUMP = "//unpkg.com/three-globe/example/img/earth-topology.png";

const GlobeView = forwardRef(function GlobeView(
  {
    zones = [],
    selectedZoneId,
    hoveredZoneId,
    cardOpen,
    onSelectZone,
    onHoverZone,
    onGlobeClick,
    onPolygonClick,
    onGeoError,
  },
  ref
) {
  const globeRef = useRef(null);
  const idleTimer = useRef(null);
  const isInteracting = useRef(false);

  const [countries, setCountries] = useState([]);
  const [hoveredPolygon, setHoveredPolygon] = useState(null);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 800,
    height: typeof window !== "undefined" ? window.innerHeight : 600,
  });

  // Expose pointOfView to parent via ref
  useImperativeHandle(ref, () => ({
    pointOfView: (pov, transitionMs = 1000) => {
      globeRef.current?.pointOfView(pov, transitionMs);
    },
    controls: () => globeRef.current?.controls(),
  }));

  // Track window resizing
  useEffect(() => {
    function handleResize() {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch country polygons ONLY from public/data/world.geojson
  useEffect(() => {
    let active = true;
    const url = `${BASE}world.geojson`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((geo) => {
        if (!active || !geo) return;
        setCountries(geo.features || []);
        onGeoError?.(null);
      })
      .catch((err) => {
        if (!active) return;
        console.warn("Failed to load country outlines:", err);
        setCountries([]);
        onGeoError?.(`Could not load country polygons: public/data/world.geojson (${err.message})`);
      });
    return () => {
      active = false;
    };
  }, [onGeoError]);

  // Check prefers-reduced-motion
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Configure auto-rotate with idle resume
  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;

    if (prefersReducedMotion) {
      controls.autoRotate = false;
      return;
    }

    controls.autoRotateSpeed = 0.4;

    if (cardOpen || isInteracting.current) {
      controls.autoRotate = false;
    } else {
      controls.autoRotate = true;
    }
  }, [cardOpen, prefersReducedMotion]);

  // Handle interaction pause & 5s idle resume
  const handleInteraction = () => {
    const controls = globeRef.current?.controls();
    if (!controls || prefersReducedMotion) return;

    isInteracting.current = true;
    controls.autoRotate = false;

    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      isInteracting.current = false;
      if (!cardOpen && controls) {
        controls.autoRotate = true;
      }
    }, 5000);
  };

  // Markers data for all zones
  const markers = useMemo(() => {
    return zones.map((z) => {
      const center = getZoneCenter(z);
      return {
        lat: center.lat,
        lng: center.lng,
        zone: z,
      };
    });
  }, [zones]);

  // Initial camera orientation
  useEffect(() => {
    if (globeRef.current) {
      // Default viewpoint over Atlantic / North-West Africa to see Morocco and surroundings
      globeRef.current.pointOfView({ lat: 30, lng: -10, altitude: 2.2 }, 0);
    }
  }, []);

  return (
    <div
      onPointerDown={handleInteraction}
      onWheel={handleInteraction}
      className="absolute inset-0 z-0 h-full w-full overflow-hidden bg-[#070e1c]"
    >
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#070e1c"
        globeImageUrl={EARTH_TEXTURE}
        bumpImageUrl={EARTH_BUMP}
        atmosphereColor="#57f1db"
        atmosphereAltitude={0.16}
        // Points / markers for zones
        pointsData={markers}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={(d) =>
          d.zone.id === selectedZoneId || d.zone.id === hoveredZoneId ? 0.05 : 0.02
        }
        pointRadius={(d) =>
          d.zone.id === selectedZoneId || d.zone.id === hoveredZoneId ? 0.9 : 0.55
        }
        pointColor={(d) =>
          d.zone.id === selectedZoneId || d.zone.id === hoveredZoneId
            ? "#57f1db"
            : "#3cddc7"
        }
        onPointClick={(d) => onSelectZone?.(d.zone)}
        onPointHover={(d) => onHoverZone?.(d ? d.zone : null)}
        // Pulsing rings around zones
        ringsData={markers}
        ringLat="lat"
        ringLng="lng"
        ringColor={(d) =>
          d.zone.id === selectedZoneId || d.zone.id === hoveredZoneId
            ? () => "#57f1db"
            : () => "rgba(87, 241, 219, 0.45)"
        }
        ringMaxRadius={(d) =>
          d.zone.id === selectedZoneId || d.zone.id === hoveredZoneId ? 6.0 : 3.8
        }
        ringPropagationSpeed={2.2}
        ringRepeatPeriod={1200}
        // Country polygons from world.geojson (Natural Earth Morocco POV)
        polygonsData={countries}
        polygonLabel={(feat) =>
          feat?.properties?.NAME
            ? `<div style="background: rgba(21, 27, 42, 0.95); color: #dce2f6; padding: 4px 8px; border-radius: 6px; font-family: sans-serif; font-size: 11px; border: 1px solid rgba(87, 241, 219, 0.3); font-weight: 600;">${feat.properties.NAME}</div>`
            : ""
        }
        polygonCapColor={(feat) =>
          feat === hoveredPolygon
            ? "rgba(87, 241, 219, 0.28)"
            : "rgba(21, 27, 42, 0.6)"
        }
        polygonSideColor={() => "rgba(7, 14, 28, 0.3)"}
        polygonStrokeColor={() => "rgba(60, 74, 70, 0.45)"}
        polygonAltitude={0.006}
        onPolygonHover={(feat) => setHoveredPolygon(feat || null)}
        onPolygonClick={(feat, event, coords) => {
          handleInteraction();
          const pt =
            coords && typeof coords.lat === "number"
              ? coords
              : event && typeof event.lat === "number"
              ? event
              : null;
          onPolygonClick?.(feat, pt);
        }}
        // Background globe click
        onGlobeClick={(coords, event) => {
          handleInteraction();
          const pt =
            coords && typeof coords.lat === "number"
              ? coords
              : event && typeof event.lat === "number"
              ? event
              : null;
          if (pt) onGlobeClick?.(pt);
        }}
      />
    </div>
  );
});

export default GlobeView;
