import { Popup } from "react-leaflet";

/**
 * Styling contract for ClickTooltip.
 * All classNames are centralized here for easy UI redesigns without touching component logic.
 */
const STYLES = {
  container: "bg-[#151b2a] text-[#dce2f6] border border-[#3c4a46]/70 rounded-xl p-3 shadow-2xl min-w-[220px] font-sans text-xs select-none",
  header: "flex items-center justify-between gap-2 pb-1.5 border-b border-[#3c4a46]/40",
  coords: "font-mono text-[10px] text-[#bacac5]",
  closeBtn: "w-5 h-5 flex items-center justify-center rounded text-[#bacac5] hover:text-[#dce2f6] hover:bg-[#232a39] focus:outline-none focus:ring-1 focus:ring-[#57f1db] cursor-pointer transition-colors",
  classRow: "flex items-center gap-2 pt-2 pb-1",
  classDot: "w-3 h-3 rounded-full shrink-0 shadow-sm",
  classLabel: "font-semibold text-xs text-[#dce2f6]",
  confidence: "font-mono text-[11px] text-[#57f1db] ml-auto font-medium",
  eventSection: "mt-2 pt-2 border-t border-[#3c4a46]/40 flex flex-col gap-1 text-[11px]",
  eventRow: "flex items-center justify-between",
  eventLabel: "text-[#dce2f6] font-medium truncate max-w-[140px]",
  eventYes: "font-mono font-bold text-[#38bdf8] uppercase text-[10px] px-1 rounded bg-[#38bdf8]/10",
  eventNo: "font-mono text-[#859490] uppercase text-[10px]",
  transitionRow: "text-[10px] font-mono text-[#bacac5] flex items-center gap-1 mt-0.5",
};

/**
 * Presentation component for map click tooltip (A6).
 *
 * @param {{
 *   point: {
 *     latlng: { lat: number, lng: number },
 *     endClass: { id: string, label: string, color: string } | null,
 *     startClass: { id: string, label: string, color: string } | null,
 *     inEvent: boolean,
 *     confidence: number | null,
 *     eventLabel: string | null
 *   } | null,
 *   onClose: () => void
 * }} props
 */
export default function ClickTooltip({ point, onClose }) {
  if (!point || !point.latlng) return null;

  const { latlng, endClass, startClass, inEvent, confidence, eventLabel, date, radarReflection } = point;
  const latStr = `${latlng.lat.toFixed(3)}°N`;
  const lngStr = `${Math.abs(latlng.lng).toFixed(3)}°W`;

  return (
    <Popup
      position={[latlng.lat, latlng.lng]}
      onClose={onClose}
      closeButton={false}
      autoPan={false}
    >
      <div className={STYLES.container}>
        {/* Header row with coordinates and accessible close button */}
        <div className={STYLES.header}>
          <span className={STYLES.coords}>
            {latStr}, {lngStr} {date ? `• ${date}` : ""}
          </span>
          <button
            type="button"
            className={STYLES.closeBtn}
            onClick={onClose}
            aria-label="Close tooltip"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>

        {/* Classification */}
        {endClass ? (
          <div className={STYLES.classRow}>
            <span
              className={STYLES.classDot}
              style={{ backgroundColor: endClass.color }}
            />
            <span className={STYLES.classLabel}>{endClass.label}</span>
            {endClass.hectares ? (
              <span className="font-mono text-[10px] text-[#bacac5] ml-auto">
                {endClass.hectares} ha
              </span>
            ) : typeof confidence === "number" ? (
              <span className={STYLES.confidence}>
                {Math.round(confidence * 100)}% conf.
              </span>
            ) : null}
          </div>
        ) : (
          <div className="pt-2 text-[11px] text-[#bacac5] italic">
            Unknown class
          </div>
        )}

        {/* Radar reflection analysis */}
        {radarReflection && (
          <div className="mt-2 pt-2 border-t border-[#3c4a46]/40 flex flex-col gap-1 text-[10px] font-mono">
            <div className="flex justify-between text-[#859490]">
              <span>Rétrodiffusion radar:</span>
              <span className="text-[#57f1db]">HV: {radarReflection.hv} / 255</span>
            </div>
            <div className="text-[10px] text-[#bacac5] leading-tight font-sans italic">
              {radarReflection.desc}
            </div>
          </div>
        )}

        {/* Event transition status (shown only when an event is active) */}
        {eventLabel && !radarReflection && (
          <div className={STYLES.eventSection}>
            <div className={STYLES.eventRow}>
              <span className={STYLES.eventLabel}>{eventLabel}:</span>
              <span className={inEvent ? STYLES.eventYes : STYLES.eventNo}>
                {inEvent ? "yes" : "no"}
              </span>
            </div>
            {startClass && endClass && (
              <div className={STYLES.transitionRow}>
                <span>{startClass.label}</span>
                <span>→</span>
                <span>{endClass.label}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Popup>
  );
}
