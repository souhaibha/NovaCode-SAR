/**
 * SwipeDivider.jsx
 * Presentation + drag/keyboard logic for the before/after swipe handle.
 *
 * Rules:
 *  - No backdrop-blur, no glows
 *  - Drag handle and keyboard arrow (Left/Right) navigation
 *  - Clear readable Before / After date labels
 */
import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";

const STYLES = {
  container:
    "absolute inset-y-0 z-[1000] flex flex-col items-center pointer-events-none select-none",
  line: "flex-1 w-0.5 pointer-events-none",
  lineStyle: { background: "rgba(255,255,255,0.8)", boxShadow: "0 0 4px rgba(0,0,0,0.5)" },
  handle:
    "w-9 h-9 rounded-full flex items-center justify-center cursor-ew-resize pointer-events-auto focus:outline-none shrink-0",
  handleStyle: {
    background: "#dce2f6",
    boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
    border: "2px solid #57f1db",
  },
  labelsRow:
    "absolute top-3 left-4 right-4 flex justify-between items-start pointer-events-none z-[1001]",
  labelLeft:
    "px-3 py-1.5 rounded-lg text-[11px] font-mono font-semibold pointer-events-none",
  labelRight:
    "px-3 py-1.5 rounded-lg text-[11px] font-mono font-semibold pointer-events-none",
  labelStyle: {
    background: "rgba(21,27,42,0.95)",
    color: "#dce2f6",
    border: "1px solid rgba(87,241,219,0.35)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[m - 1] || m} ${y}`;
}

/**
 * SwipeDivider
 * Props:
 *   split            {number}   0..1 position of the divider
 *   onSplitChange    {fn}       called with new 0..1 value while dragging
 *   mapContainerRef  {ref}      ref to the outer map wrapper div
 *   beforeDate       {string}   e.g. "2026-05-17"
 *   afterDate        {string}   e.g. "2026-06-10"
 */
export default function SwipeDivider({
  split = 0.5,
  onSplitChange,
  mapContainerRef,
  beforeDate,
  afterDate,
}) {
  const handleRef = useRef(null);
  const isDragging = useRef(false);

  // Disable Leaflet propagation on handle
  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

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
    onSplitChange?.(Math.min(1, Math.max(0, raw)));
  }, [mapContainerRef, onSplitChange]);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Keyboard navigation: Left/Right arrow ±2%
  const onKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSplitChange?.(Math.max(0, split - 0.02));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSplitChange?.(Math.min(1, split + 0.02));
    }
  }, [split, onSplitChange]);

  const leftPct = `${split * 100}%`;
  const ariaVal = Math.round(split * 100);

  return (
    <>
      {/* Top labels */}
      <div className={STYLES.labelsRow}>
        <span className={STYLES.labelLeft} style={STYLES.labelStyle}>
          ◀ Before: {formatDate(beforeDate)}
        </span>
        <span className={STYLES.labelRight} style={STYLES.labelStyle}>
          After: {formatDate(afterDate)} ▶
        </span>
      </div>

      {/* Divider column */}
      <div
        className={STYLES.container}
        style={{ left: leftPct, transform: "translateX(-50%)" }}
      >
        <div className={STYLES.line} style={STYLES.lineStyle} />

        <div
          ref={handleRef}
          role="slider"
          aria-label="Swipe divider"
          aria-valuenow={ariaVal}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          className={STYLES.handle}
          style={STYLES.handleStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M5 8H2m0 0l2-2M2 8l2 2" stroke="#0c1321" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M11 8h3m0 0l-2-2m2 2l-2 2" stroke="#0c1321" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div className={STYLES.line} style={STYLES.lineStyle} />
      </div>
    </>
  );
}
