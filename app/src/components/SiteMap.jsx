import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, ImageOverlay, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useSite } from "../hooks/useSite";
import { visibleLegend } from "../lib/siteAdapter";

const TEAM_NAME = "TODO";
const BASEMAP_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const CSS = {
  container: "relative w-full h-full overflow-hidden bg-[#070e1c] text-[#dce2f6]",
  map: "w-full h-full bg-[#070e1c]",
  panel: "absolute top-4 left-4 z-[1000] p-3.5 rounded-xl bg-[#151b2a] border border-[rgba(60,74,70,0.5)] flex flex-col gap-3 max-w-xs text-xs font-sans select-none",
  legendBox: "p-2.5 rounded-lg bg-[#0c1321] border border-[rgba(60,74,70,0.3)] flex flex-col gap-1.5",
  timelinePanel: "absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2.5 rounded-xl bg-[#151b2a] border border-[rgba(60,74,70,0.5)] flex items-center gap-3 text-xs font-mono select-none max-w-[calc(100vw-32px)]",
  creditLine: "absolute bottom-1 right-2 z-[999] text-[10px] font-mono text-[#bacac5]/80 pointer-events-none select-none",
  button: "px-2 py-1 rounded bg-[#232a39] hover:bg-[#2e3544] text-[#dce2f6] border border-[rgba(60,74,70,0.4)] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#57f1db] flex items-center justify-center",
  toggleLabel: "flex items-center justify-between gap-3 text-xs cursor-pointer select-none",
  slider: "w-36 sm:w-56 accent-[#57f1db] cursor-pointer",
  opacitySlider: "w-full accent-[#57f1db] cursor-pointer mt-1",
  stateContainer: "flex flex-col items-center justify-center w-full h-full bg-[#070e1c] text-[#dce2f6] p-6 gap-3",
  card: "p-6 rounded-2xl bg-[#151b2a] border border-[rgba(60,74,70,0.5)] max-w-md text-center flex flex-col items-center gap-3",
};

function MapFitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, bounds]);
  return null;
}

function formatDate(str) {
  if (!str) return "";
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  const [y, m, d] = parts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[parseInt(m, 10) - 1] || m} ${y}`;
}

function toRgbString(color) {
  if (!color) return "transparent";
  if (Array.isArray(color)) return `rgb(${color.join(",")})`;
  return color;
}

export default function SiteMap({ basePath, onSiteChange, onDateChange, onOpacityChange }) {
  const { site, status, error } = useSite(basePath);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [showRadar, setShowRadar] = useState(true);
  const [showChange, setShowChange] = useState(true);
  const [changeOpacity, setChangeOpacity] = useState(0.85);
  const [extraLayersVisible, setExtraLayersVisible] = useState({});
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setSelectedDateIndex(0);
    setIsPlaying(false);
    if (site?.layers) {
      const initial = {};
      site.layers.forEach((l) => { initial[l.key] = false; });
      setExtraLayersVisible(initial);
    } else {
      setExtraLayersVisible({});
    }
  }, [site?.id]);

  useEffect(() => { onSiteChange?.(site); }, [site, onSiteChange]);
  useEffect(() => { onDateChange?.(site?.dates?.[selectedDateIndex] || null); }, [site, selectedDateIndex, onDateChange]);
  useEffect(() => { onOpacityChange?.(changeOpacity); }, [changeOpacity, onOpacityChange]);

  useEffect(() => {
    if (!isPlaying || !site?.frames?.length) return;
    const interval = setInterval(() => {
      setSelectedDateIndex((prev) => {
        if (prev >= site.frames.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, site?.frames?.length]);

  const handlePlayToggle = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!isPlaying && selectedDateIndex >= (site?.frames?.length || 1) - 1) setSelectedDateIndex(0);
    setIsPlaying((prev) => !prev);
  };

  const handleToggleLayer = (key) =>
    setExtraLayersVisible((prev) => ({ ...prev, [key]: !prev[key] }));

  if (status === "loading") {
    return (
      <div className={CSS.stateContainer}>
        <div className={CSS.card}>
          <span className="material-symbols-outlined text-[32px] text-[#57f1db]">radar</span>
          <p className="font-mono text-xs text-[#bacac5]">Loading site data…</p>
        </div>
      </div>
    );
  }

  if (status === "error" || !site) {
    return (
      <div className={CSS.stateContainer}>
        <div className={CSS.card}>
          <span className="material-symbols-outlined text-[32px] text-[#ffb4ab]">error</span>
          <p className="font-bold text-sm text-[#ffb4ab]">Site Load Error</p>
          <p className="font-mono text-xs text-[#bacac5] break-all">{error || "Unable to read site summary."}</p>
        </div>
      </div>
    );
  }

  const currentFrame = site.frames[selectedDateIndex];
  const currentDate  = site.dates[selectedDateIndex];
  const activeLegend = visibleLegend(site.legend);

  return (
    <div className={CSS.container}>
      <MapContainer
        center={[(site.bounds[0][0] + site.bounds[1][0]) / 2, (site.bounds[0][1] + site.bounds[1][1]) / 2]}
        zoom={10}
        zoomControl={false}
        scrollWheelZoom
        className={CSS.map}
      >
        <MapFitBounds bounds={site.bounds} />
        <TileLayer url={BASEMAP_URL} maxZoom={18} />

        {showRadar && currentFrame && (
          <ImageOverlay key={`radar-${currentFrame.url}`} url={currentFrame.url} bounds={site.bounds} opacity={1} className="pixelated" />
        )}
        {showChange && site.changemapUrl && (
          <ImageOverlay key={`change-${site.changemapUrl}`} url={site.changemapUrl} bounds={site.bounds} opacity={changeOpacity} className="pixelated" />
        )}
        {site.layers.map((layer) =>
          !extraLayersVisible[layer.key] ? null : (
            <ImageOverlay key={`extra-${layer.key}`} url={layer.url} bounds={site.bounds} opacity={0.85} className="pixelated" />
          )
        )}
      </MapContainer>

      {/* Controls panel */}
      <div className={CSS.panel}>
        <div className="font-bold text-sm truncate">{site.name}</div>
        <div className="flex flex-col gap-2 pt-1 border-t border-[rgba(60,74,70,0.3)]">
          <label className={CSS.toggleLabel}>
            <span>Radar Frame</span>
            <input type="checkbox" checked={showRadar} onChange={(e) => setShowRadar(e.target.checked)} className="accent-[#57f1db] cursor-pointer" />
          </label>
          <label className={CSS.toggleLabel}>
            <span>Changemap</span>
            <input type="checkbox" checked={showChange} onChange={(e) => setShowChange(e.target.checked)} className="accent-[#57f1db] cursor-pointer" />
          </label>
          {showChange && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-[#bacac5]">
                <span>Change Opacity</span><span>{Math.round(changeOpacity * 100)}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" value={changeOpacity} onChange={(e) => setChangeOpacity(parseFloat(e.target.value))} className={CSS.opacitySlider} />
            </div>
          )}
          {site.layers.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-[rgba(60,74,70,0.3)]">
              <span className="text-[10px] uppercase font-mono text-[#bacac5] tracking-wider">Extra Layers</span>
              {site.layers.map((layer) => (
                <label key={layer.key} className={CSS.toggleLabel}>
                  <span className="capitalize">{layer.key}</span>
                  <input type="checkbox" checked={Boolean(extraLayersVisible[layer.key])} onChange={() => handleToggleLayer(layer.key)} className="accent-[#57f1db] cursor-pointer" />
                </label>
              ))}
            </div>
          )}
        </div>
        {activeLegend.length > 0 && (
          <div className={CSS.legendBox}>
            <span className="text-[10px] uppercase font-mono text-[#bacac5] tracking-wider">Classes</span>
            <div className="grid grid-cols-1 gap-1">
              {activeLegend.map((item) => (
                <div key={item.cls} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: toRgbString(item.color) }} />
                  <span className="truncate text-[11px]">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timeline bar */}
      {site.frames.length > 0 && (
        <div className={CSS.timelinePanel}>
          <button type="button" onClick={handlePlayToggle} className={CSS.button} aria-label={isPlaying ? "Pause" : "Play"}>
            <span className="material-symbols-outlined text-[18px]">{isPlaying ? "pause" : "play_arrow"}</span>
          </button>
          <input type="range" min={0} max={site.frames.length - 1} step={1} value={selectedDateIndex}
            onChange={(e) => { setIsPlaying(false); setSelectedDateIndex(parseInt(e.target.value, 10)); }}
            className={CSS.slider} aria-label="Select date frame" />
          <span className="text-xs font-semibold whitespace-nowrap min-w-24 text-right text-[#57f1db]">
            {formatDate(currentDate)}
          </span>
        </div>
      )}

      <div className={CSS.creditLine}>
        NISAR (NASA-ISRO) radar, L-band. Processed by {TEAM_NAME}.
      </div>
    </div>
  );
}
