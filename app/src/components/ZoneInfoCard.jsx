import { useState, useEffect, useRef } from "react";
import SatelliteCalendarPicker from "./SatelliteCalendarPicker";

// Single styling block for the entire component (solid background, no backdrop-blur or heavy shadows over canvas)
const CSS = {
  container:
    "absolute bottom-6 right-6 z-[1000] w-[360px] max-w-[calc(100vw-32px)] rounded-2xl bg-[#151b2a] border border-[rgba(60,74,70,0.5)] p-5 text-[#dce2f6] flex flex-col gap-3.5 outline-none font-sans shadow-2xl",
  header: "flex items-start justify-between gap-3",
  titleBox: "flex flex-col gap-1 min-w-0",
  title: "text-lg font-bold text-[#dce2f6] truncate tracking-tight font-sans",
  subtitle: "text-xs font-sans text-[#bacac5] flex items-center gap-1.5",
  closeBtn:
    "w-7 h-7 rounded-lg flex items-center justify-center text-[#bacac5] hover:text-[#dce2f6] hover:bg-[#232a39] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#57f1db] shrink-0",
  badgeRow: "flex flex-wrap items-center gap-2",
  badgeEventType:
    "px-2.5 py-0.5 rounded-full text-[11px] font-sans font-semibold uppercase tracking-wider bg-[rgba(87,241,219,0.15)] text-[#57f1db] border border-[rgba(87,241,219,0.3)]",
  badgeSensor:
    "px-2.5 py-0.5 rounded-full text-[11px] font-sans text-[#bacac5] bg-[#232a39] border border-[rgba(60,74,70,0.4)]",
  gridDetails:
    "grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#0c1321] border border-[rgba(60,74,70,0.3)] text-xs font-sans",
  gridItemLabel: "text-[10px] text-[#bacac5] uppercase tracking-wider block font-sans",
  gridItemValue: "text-xs text-[#dce2f6] font-semibold mt-0.5 truncate font-sans",
  description:
    "text-xs leading-relaxed text-[#bacac5] max-h-24 overflow-y-auto pr-1 font-sans",
  btnPrimary:
    "w-full py-2.5 px-4 rounded-xl bg-[#57f1db] text-[#003731] font-bold text-xs tracking-wide text-center flex items-center justify-center gap-2 hover:bg-[#78f5e3] active:scale-[0.99] transition-all font-sans cursor-pointer shadow-[0_4px_16px_rgba(87,241,219,0.25)]",
  btnSecondary:
    "w-full py-2 px-4 rounded-xl bg-[#232a39] text-[#57f1db] border border-[rgba(87,241,219,0.3)] font-semibold text-xs text-center flex items-center justify-center gap-2 hover:bg-[#2c3547] transition-all font-sans cursor-pointer",
  noticeBox:
    "p-3.5 rounded-xl bg-[#19202e] border border-[rgba(87,241,219,0.25)] text-xs text-[#dce2f6] flex flex-col gap-2.5 font-sans",
  noticeTitle: "font-semibold flex items-center gap-1.5 text-[#57f1db] font-sans text-xs",
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

function findClosestPass(availableDates, targetDate, minDate) {
  if (!availableDates || availableDates.length === 0) return targetDate;
  const filtered = minDate ? availableDates.filter((d) => d >= minDate) : availableDates;
  if (filtered.length === 0) return targetDate;
  if (filtered.includes(targetDate)) return targetDate;
  const targetTime = new Date(targetDate).getTime();
  let closest = filtered[0];
  let minDiff = Math.abs(new Date(closest).getTime() - targetTime);
  for (const d of filtered) {
    const diff = Math.abs(new Date(d).getTime() - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = d;
    }
  }
  return closest;
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
  const [startDate, setStartDate] = useState("2026-10-01");
  const [endDate, setEndDate] = useState("2026-11-13");
  const [availablePasses, setAvailablePasses] = useState([]);
  const [loadingPasses, setLoadingPasses] = useState(false);

  const nearest = clickInfo?.nearest?.zone;
  const lat = clickInfo?.lat;
  const lng = clickInfo?.lng;
  const countryName = clickInfo?.countryName;

  // Dynamically fetch actual NASA Sentinel-1 / NISAR pass dates for this clicked location
  useEffect(() => {
    if (lat != null && lng != null) {
      setLoadingPasses(true);
      fetch(`http://localhost:8000/api/satellite_passes?lat=${lat}&lng=${lng}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.dates?.length) {
            setAvailablePasses(data.dates);
            if (data.dates.length >= 2) {
              setStartDate(data.dates[data.dates.length - 2]);
              setEndDate(data.dates[data.dates.length - 1]);
            } else if (data.dates.length === 1) {
              setStartDate(data.dates[0]);
              setEndDate(data.dates[0]);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingPasses(false));
    }
  }, [lat, lng]);

  const displayTitle = countryName
    ? `${countryName}`
    : `Zone (${lat != null ? lat.toFixed(2) : 0}°, ${lng != null ? lng.toFixed(2) : 0}°)`;

  const handleLaunchAnalysis = () => {
    if (onOpenCustomZone) {
      onOpenCustomZone({
        lat,
        lng,
        countryName,
        start: startDate,
        end: endDate,
        maxPasses: 4,
        view: "period",
      });
    } else {
      onOpenZone("souss");
    }
  };

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
          <span>Target Dates</span>
        </div>

        {/* Date range inputs with integrated Satellite Calendar Pickers */}
        <div className="flex items-center gap-2 mt-1">
          <SatelliteCalendarPicker
            label="START"
            value={startDate}
            align="left"
            availableDates={availablePasses}
            maxDate={new Date().toISOString().split("T")[0]}
            onChange={(newStart) => {
              setStartDate(newStart);
              const autoMinEnd = new Date(new Date(newStart).getTime() + 12 * 86400000).toISOString().split("T")[0];
              if (new Date(endDate) < new Date(autoMinEnd)) {
                setEndDate(autoMinEnd);
              }
            }}
          />
          <SatelliteCalendarPicker
            label="END (MIN +12D)"
            value={endDate}
            align="right"
            availableDates={availablePasses}
            minDate={startDate ? new Date(new Date(startDate).getTime() + 12 * 86400000).toISOString().split("T")[0] : undefined}
            maxDate={new Date().toISOString().split("T")[0]}
            onChange={(newEnd) => setEndDate(newEnd)}
          />
        </div>

        {loadingPasses && (
          <div className="text-[10px] font-sans text-[#57f1db] animate-pulse">
            📡 Synchronizing NASA orbital passes…
          </div>
        )}
      </div>

      {/* Primary Action Button */}
      <button
        type="button"
        onClick={handleLaunchAnalysis}
        className={CSS.btnPrimary}
      >
        <span>Launch NISAR Satellite Analysis</span>
        <span className="material-symbols-outlined text-[18px]">travel_explore</span>
      </button>
    </div>
  );
}
