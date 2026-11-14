import { useEffect, useRef } from "react";
import { bboxAreaKm2, formatCoords } from "../lib/geo";

// ─── Single styling object for presentation redesign ──────────────────────
const STYLES = {
  dialog:
    "relative z-50 w-full max-w-sm rounded-2xl bg-surface-container-low/95 p-5 text-on-surface shadow-2xl backdrop-blur-xl border border-outline-variant/50 flex flex-col gap-3.5 focus:outline-none focus:ring-2 focus:ring-primary",
  header: "flex items-start justify-between gap-3",
  titleWrap: "flex flex-col gap-0.5",
  title: "text-lg font-bold tracking-tight text-on-surface font-sans",
  subtitle: "text-xs font-medium text-on-surface-variant flex items-center gap-1.5",
  closeBtn:
    "flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors",
  badgeWrap: "flex flex-wrap items-center gap-2",
  badgeFlood:
    "inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-400 border border-sky-500/30",
  badgeQuake:
    "inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400 border border-amber-500/30",
  badgeDefault:
    "inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary border border-primary/30",
  badgeSensor:
    "inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-0.5 text-[10px] font-mono text-primary border border-outline-variant/30",
  alertBox:
    "rounded-xl bg-surface-container/80 p-3 text-xs border border-outline-variant/40 flex flex-col gap-1",
  alertTitle: "font-semibold text-primary flex items-center gap-1.5",
  alertDesc: "text-on-surface-variant leading-relaxed",
  grid: "grid grid-cols-2 gap-2 text-xs",
  statItem:
    "flex flex-col gap-0.5 rounded-lg bg-surface-container/60 p-2 border border-outline-variant/20",
  statLabel: "text-[10px] uppercase font-mono tracking-wider text-outline",
  statValue: "font-semibold text-on-surface font-mono",
  description: "text-xs text-on-surface-variant leading-relaxed line-clamp-3",
  footer: "pt-1 flex items-center justify-end gap-2",
  primaryBtn:
    "w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-fixed transition-colors shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface no-underline",
  secondaryBtn:
    "inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

export default function ZoneInfoCard({ cardData, onClose, manifestSensor }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Keyboard accessibility: Esc to close
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        onCloseRef.current?.();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  if (!cardData) return null;

  const { type, zone, distanceKm, clickedCoords, countryName } = cardData;
  const isDirect = type === "zone";
  const isNear = type === "near";
  const isFar = type === "far";

  const dates = zone?.dates || [];
  const hasDates = dates.length > 0;
  const dateRange = hasDates
    ? dates.length > 1
      ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`
      : formatDate(dates[0])
    : null;

  const area = zone?.bbox ? bboxAreaKm2(zone.bbox) : null;
  const sensorText = zone?.sensor || manifestSensor;
  const hasNisar = typeof sensorText === "string" && sensorText.includes("NISAR L-band");

  const dialogTitle = isDirect
    ? zone.name
    : isNear
    ? `Near ${zone?.name || "Zone"}`
    : "No Data Available";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label={dialogTitle}
      tabIndex={-1}
      className={STYLES.dialog}
    >
      {/* Header */}
      <div className={STYLES.header}>
        <div className={STYLES.titleWrap}>
          <h2 className={STYLES.title}>
            {isDirect ? zone.name : isNear ? `Proximity: ${zone?.name}` : "Unmonitored Area"}
          </h2>
          <div className={STYLES.subtitle}>
            {isDirect && zone.country && <span>{zone.country}</span>}
            {!isDirect && clickedCoords && (
              <span>
                {formatCoords(clickedCoords.lat, clickedCoords.lng)}
                {countryName ? ` • ${countryName}` : ""}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close info card"
          className={STYLES.closeBtn}
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Proximity / Status Notices */}
      {isNear && zone && (
        <div className={STYLES.alertBox}>
          <div className={STYLES.alertTitle}>
            <span className="material-symbols-outlined text-[16px]">near_me</span>
            <span>Nearest supported zone</span>
          </div>
          <p className={STYLES.alertDesc}>
            {zone.name}, about <strong className="text-on-surface font-semibold">{Math.round(distanceKm)} km</strong> away.
          </p>
        </div>
      )}

      {isFar && (
        <div className={STYLES.alertBox}>
          <div className={STYLES.alertTitle}>
            <span className="material-symbols-outlined text-[16px]">info</span>
            <span>No processed data here yet</span>
          </div>
          {zone && typeof distanceKm === "number" && (
            <p className={STYLES.alertDesc}>
              Nearest supported zone: <strong className="text-on-surface font-semibold">{zone.name}</strong> ({Math.round(distanceKm)} km away).
            </p>
          )}
        </div>
      )}

      {/* Zone Details (Direct or Nearest Zone in Proximity) */}
      {zone && (
        <>
          {/* Badges row: event type, sensor */}
          <div className={STYLES.badgeWrap}>
            {zone.event_type && (
              <span
                className={
                  zone.event_type.toLowerCase() === "flood"
                    ? STYLES.badgeFlood
                    : zone.event_type.toLowerCase() === "earthquake"
                    ? STYLES.badgeQuake
                    : STYLES.badgeDefault
                }
              >
                <span className="material-symbols-outlined text-[13px]">
                  {zone.event_type.toLowerCase() === "flood"
                    ? "flood"
                    : zone.event_type.toLowerCase() === "earthquake"
                    ? "landslide"
                    : "emergency"}
                </span>
                {zone.event_type.charAt(0).toUpperCase() + zone.event_type.slice(1)}
              </span>
            )}

            {hasNisar && (
              <span className={STYLES.badgeSensor}>
                <span className="material-symbols-outlined text-[12px]">sensors</span>
                NISAR L-band
              </span>
            )}
          </div>

          {/* Data Grid: Dates, Acquisitions, Area */}
          <div className={STYLES.grid}>
            {dateRange && (
              <div className={STYLES.statItem}>
                <span className={STYLES.statLabel}>Period</span>
                <span className={STYLES.statValue} title={dateRange}>
                  {dateRange}
                </span>
              </div>
            )}

            {dates.length > 0 && (
              <div className={STYLES.statItem}>
                <span className={STYLES.statLabel}>Acquisitions</span>
                <span className={STYLES.statValue}>
                  {dates.length} pass{dates.length > 1 ? "es" : ""}
                </span>
              </div>
            )}

            {area !== null && area > 0 && (
              <div className={STYLES.statItem}>
                <span className={STYLES.statLabel}>Coverage Area</span>
                <span className={STYLES.statValue}>~{area.toLocaleString()} km²</span>
              </div>
            )}

            {zone.country && !isDirect && (
              <div className={STYLES.statItem}>
                <span className={STYLES.statLabel}>Country</span>
                <span className={STYLES.statValue}>{zone.country}</span>
              </div>
            )}
          </div>

          {/* Description text */}
          {zone.description && (
            <p className={STYLES.description}>{zone.description}</p>
          )}

          {/* Action button */}
          <div className={STYLES.footer}>
            <a href={`#/map/${zone.id}`} className={STYLES.primaryBtn}>
              <span>{isDirect ? "Open dashboard" : `Open ${zone.name}`}</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
