import { useEffect, useRef } from "react";

// Single styling block for the entire component (solid background, no backdrop-blur or heavy shadows over canvas)
const CSS = {
  container:
    "absolute bottom-6 right-6 z-[1000] w-[340px] max-w-[calc(100vw-32px)] rounded-2xl bg-[#151b2a] border border-[rgba(60,74,70,0.5)] p-5 text-[#dce2f6] flex flex-col gap-4 outline-none",
  header: "flex items-start justify-between gap-3",
  titleBox: "flex flex-col gap-1 min-w-0",
  title: "text-lg font-bold text-[#dce2f6] truncate tracking-tight font-sans",
  subtitle: "text-xs font-mono text-[#bacac5] flex items-center gap-1.5",
  closeBtn:
    "w-7 h-7 rounded-lg flex items-center justify-center text-[#bacac5] hover:text-[#dce2f6] hover:bg-[#232a39] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#57f1db] shrink-0",
  badgeRow: "flex flex-wrap items-center gap-2",
  badgeEventType:
    "px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-[rgba(87,241,219,0.15)] text-[#57f1db] border border-[rgba(87,241,219,0.3)]",
  badgeSensor:
    "px-2 py-0.5 rounded-full text-[10px] font-mono text-[#bacac5] bg-[#232a39] border border-[rgba(60,74,70,0.4)]",
  gridDetails:
    "grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#0c1321] border border-[rgba(60,74,70,0.3)] text-xs font-mono",
  gridItemLabel: "text-[10px] text-[#bacac5] uppercase tracking-wider block",
  gridItemValue: "text-xs text-[#dce2f6] font-semibold mt-0.5 truncate",
  description:
    "text-xs leading-relaxed text-[#bacac5] max-h-24 overflow-y-auto pr-1",
  btnPrimary:
    "w-full py-2.5 px-4 rounded-xl bg-[#57f1db] text-[#003731] font-bold text-sm text-center flex items-center justify-center gap-2 hover:bg-[#78f5e3] active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
  btnSecondary:
    "w-full py-2 px-4 rounded-xl bg-[#232a39] text-[#57f1db] border border-[rgba(87,241,219,0.3)] font-semibold text-xs text-center flex items-center justify-center gap-2 hover:bg-[#2c3547] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#57f1db]",
  noticeBox:
    "p-3 rounded-xl bg-[#19202e] border border-[rgba(255,180,171,0.25)] text-xs text-[#dce2f6] flex flex-col gap-2",
  noticeTitle: "font-semibold flex items-center gap-1.5 text-[#ffb4ab]",
  coordsText: "font-mono text-[11px] text-[#bacac5]",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

function computeAreaKm2(bbox) {
  if (!bbox || bbox.length < 4) return null;
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const midLat = ((latMin + latMax) / 2 * Math.PI) / 180;
  const widthKm = Math.abs(lonMax - lonMin) * 111.32 * Math.cos(midLat);
  const heightKm = Math.abs(latMax - latMin) * 110.574;
  const area = widthKm * heightKm;
  return Math.round(area);
}

export default function ZoneInfoCard({
  zone,
  clickInfo,
  sensor,
  onClose,
  onOpenZone,
  onOpenCustomZone,
}) {
  const cardRef = useRef(null);

  // Esc key listener and focus management
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    cardRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Case 1: Exact supported zone
  if (zone) {
    const areaKm2 = computeAreaKm2(zone.bbox);
    const dates = zone.dates || [];
    const dateRange =
      dates.length > 0
        ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`
        : null;

    return (
      <div
        ref={cardRef}
        role="dialog"
        aria-label={`Zone details for ${zone.name}`}
        tabIndex={-1}
        className={CSS.container}
      >
        <div className={CSS.header}>
          <div className={CSS.titleBox}>
            <h2 className={CSS.title}>{zone.name}</h2>
            {zone.country && (
              <span className={CSS.subtitle}>
                <span className="material-symbols-outlined text-[14px]">public</span>
                {zone.country}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={CSS.closeBtn}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Badges */}
        <div className={CSS.badgeRow}>
          {zone.event_type && (
            <span className={CSS.badgeEventType}>
              {zone.event_type}
            </span>
          )}
          {sensor && (
            <span className={CSS.badgeSensor}>
              {sensor}
            </span>
          )}
        </div>

        {/* Details Grid */}
        <div className={CSS.gridDetails}>
          {dateRange && (
            <div className="col-span-2">
              <span className={CSS.gridItemLabel}>Observed Period</span>
              <span className={CSS.gridItemValue}>{dateRange}</span>
            </div>
          )}
          {dates.length > 0 && (
            <div>
              <span className={CSS.gridItemLabel}>Acquisitions</span>
              <span className={CSS.gridItemValue}>{dates.length} SAR passes</span>
            </div>
          )}
          {areaKm2 != null && (
            <div>
              <span className={CSS.gridItemLabel}>Coverage</span>
              <span className={CSS.gridItemValue}>~{areaKm2.toLocaleString()} km²</span>
            </div>
          )}
        </div>

        {/* Description */}
        {zone.description && (
          <p className={CSS.description}>{zone.description}</p>
        )}

        {/* Action Button */}
        <button
          type="button"
          onClick={() => onOpenZone(zone.id)}
          className={CSS.btnPrimary}
        >
          <span>Open dashboard</span>
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    );
  }

  // Case 2: Clicked on any custom point on the globe
  const nearest = clickInfo?.nearest?.zone;
  const lat = clickInfo?.lat;
  const lng = clickInfo?.lng;
  const countryName = clickInfo?.countryName;

  const displayTitle = countryName
    ? `${countryName}`
    : `Zone (${lat != null ? lat.toFixed(2) : 0}°, ${lng != null ? lng.toFixed(2) : 0}°)`;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Location details"
      tabIndex={-1}
      className={CSS.container}
    >
      <div className={CSS.header}>
        <div className={CSS.titleBox}>
          <h2 className={CSS.title}>{displayTitle}</h2>
          {lat != null && lng != null && (
            <span className={CSS.coordsText}>
              {lat.toFixed(2)}°N, {lng.toFixed(2)}°E
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={CSS.closeBtn}
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className={CSS.noticeBox}>
        <div className={CSS.noticeTitle}>
          <span className="material-symbols-outlined text-[16px]">radar</span>
          <span>Prêt pour analyse radar NISAR</span>
        </div>
        <p className="leading-relaxed text-[#dce2f6]">
          {countryName ? `Région de ${countryName}. ` : ""}
          Vous pouvez explorer cette zone en haute résolution et lancer une détection de changements par satellite radar.
        </p>
      </div>

      {/* Primary Action: Open this custom region on the map and launch analysis */}
      <button
        type="button"
        onClick={() => {
          if (onOpenCustomZone) {
            onOpenCustomZone({ lat, lng, countryName });
          } else {
            onOpenZone("souss");
          }
        }}
        className={CSS.btnPrimary}
      >
        <span>Analyser cette zone sur la carte</span>
        <span className="material-symbols-outlined text-[18px]">travel_explore</span>
      </button>

      {/* Secondary option if near a precomputed demo site */}
      {nearest && (
        <button
          type="button"
          onClick={() => onOpenZone(nearest.id)}
          className={CSS.btnSecondary}
        >
          <span>Voir le site démo le plus proche ({nearest.name})</span>
          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
        </button>
      )}
    </div>
  );
}
