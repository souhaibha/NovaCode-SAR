/**
 * SwipeDivider.jsx
 * Presentation + drag/keyboard logic for the before/after swipe handle.
 * All styling is in STYLES — no scattered inline colors (a redesign only edits here).
 */
import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";

// ─── Single styling constant ───────────────────────────────────────────────
const STYLES = {
  // The full-height column that holds the line + handle, centered on the split
  container:
    "absolute inset-y-0 z-[1000] flex flex-col items-center pointer-events-none select-none",
  // Thin vertical white line
  line: "flex-1 w-0.5 pointer-events-none",
  lineStyle: { background: "rgba(255,255,255,0.75)", boxShadow: "0 0 6px rgba(0,0,0,0.5)" },
  // Circular drag handle
  handle:
    "w-9 h-9 rounded-full flex items-center justify-center cursor-ew-resize pointer-events-auto focus:outline-none shrink-0",
  handleStyle: {
    background: "rgba(255,255,255,0.95)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
    border: "2px solid rgba(87,241,219,0.7)",
  },
  handleFocusRing: "focus:ring-2 focus:ring-[#57f1db] focus:ring-offset-1",
  // Date labels pinned to the top of the map
  labelsRow:
    "absolute top-0 left-0 right-0 flex justify-between items-start pointer-events-none z-[1001]",
  labelLeft:
    "px-2 py-1 rounded-br-lg text-[11px] font-mono font-semibold pointer-events-none",
  labelStyle: {
    background: "rgba(21,27,42,0.88)",
    color: "#dce2f6",
    backdropFilter: "blur(6px)",
    border: "1px solid rgba(87,241,219,0.25)",
  },
  labelRight:
    "px-2 py-1 rounded-bl-lg text-[11px] font-mono font-semibold pointer-events-none",
};

/** Format a date string "2026-08-19" → "19 Aug 2026" */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

/**
 * SwipeDivider
 * Props:
 *   split            {number}   0..1 position of the divider
 *   onSplitChange    {fn}       called with new 0..1 value while dragging
 *   mapContainerRef  {ref}      ref to the outer map wrapper div
 *   startDate        {string}   e.g. "2026-08-19"
 *   endDate          {string}
 */
export default function SwipeDivider({ split, onSplitChange, mapContainerRef, startDate, endDate }) {
  const handleRef = useRef(null);
  const isDragging = useRef(false);

  // ── Disable Leaflet event propagation so dragging doesn't pan the map ──
  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  // ── Pointer drag ───────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    handleRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return;
    const mapEl = mapContainerRef.current;
    if (!mapEl) return;
    const rect = mapEl.getBoundingClientRect();
    const raw = (e.clientX - rect.left) / rect.width;
    onSplitChange(Math.min(1, Math.max(0, raw)));
  }, [mapContainerRef, onSplitChange]);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // ── Keyboard: left/right arrow ±2% ────────────────────────────────────
  const onKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSplitChange(Math.max(0, split - 0.02));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSplitChange(Math.min(1, split + 0.02));
    }
  }, [split, onSplitChange]);

  const leftPct = `${split * 100}%`;
  const ariaVal = Math.round(split * 100);

  return (
    <>
      {/* Date labels row: start on left, end on right, always visible */}
      <div className={STYLES.labelsRow}>
        <span className={STYLES.labelLeft} style={STYLES.labelStyle}>
          {formatDate(startDate)}
        </span>
        <span className={STYLES.labelRight} style={STYLES.labelStyle}>
          {formatDate(endDate)}
        </span>
      </div>

      {/* Divider column: positioned at split% from left */}
      <div
        className={STYLES.container}
        style={{ left: leftPct, transform: "translateX(-50%)" }}
      >
        {/* Top half-line */}
        <div className={STYLES.line} style={STYLES.lineStyle} />

        {/* Drag handle */}
        <div
          ref={handleRef}
          role="slider"
          aria-label="Swipe divider"
          aria-valuenow={ariaVal}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          className={`${STYLES.handle} ${STYLES.handleFocusRing}`}
          style={STYLES.handleStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {/* Double-arrow icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M5 8H2m0 0l2-2M2 8l2 2" stroke="#0c1321" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M11 8h3m0 0l-2-2m2 2l-2 2" stroke="#0c1321" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Bottom half-line */}
        <div className={STYLES.line} style={STYLES.lineStyle} />
      </div>
    </>
  );
}
