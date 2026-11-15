/**
 * SwipeDivider.jsx
 * Presentation + drag/keyboard logic for the before/after swipe handle.
 * Butter-smooth dragging with pointer capture and full-height interactive hitbox.
 */
import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";

const STYLES = {
  container:
    "absolute inset-y-0 z-[1000] flex flex-col items-center select-none cursor-ew-resize",
  line: "flex-1 w-0.5 pointer-events-none transition-colors",
  lineStyle: {
    background: "rgba(87,241,219,0.85)",
    boxShadow: "0 0 8px rgba(87,241,219,0.6)",
  },
  handle:
    "w-10 h-10 rounded-full flex items-center justify-center cursor-ew-resize pointer-events-auto focus:outline-none shrink-0 transition-transform hover:scale-110 active:scale-95",
  handleStyle: {
    background: "#0c1321",
    boxShadow: "0 2px 16px rgba(0,0,0,0.7), 0 0 12px rgba(87,241,219,0.5)",
    border: "2px solid #57f1db",
  },
  handleFocusRing: "focus:ring-2 focus:ring-[#57f1db] focus:ring-offset-2",
  labelsRow:
    "absolute top-3 left-4 right-4 flex justify-between items-start pointer-events-none z-[1001]",
  labelLeft:
    "px-3 py-1.5 rounded-lg text-xs font-mono font-semibold pointer-events-none shadow-lg flex items-center gap-1.5",
  labelStyle: {
    background: "rgba(15,23,42,0.92)",
    color: "#dce2f6",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(87,241,219,0.35)",
  },
  labelRight:
    "px-3 py-1.5 rounded-lg text-xs font-mono font-semibold pointer-events-none shadow-lg flex items-center gap-1.5",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const months = ["Janv","Févr","Mars","Avr","Mai","Juin","Juil","Août","Sept","Oct","Nov","Déc"];
  return `${d} ${months[m - 1]} ${y}`;
}

export default function SwipeDivider({
  split,
  onSplitChange,
  onDragDirect,
  mapContainerRef,
  startDate,
  endDate,
}) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const rafId = useRef(null);

  // Disable Leaflet map dragging when interacting with swipe column
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch (_) {}

    const updateFromClientX = (clientX) => {
      const mapEl = mapContainerRef.current;
      if (!mapEl) return;
      const rect = mapEl.getBoundingClientRect();
      const raw = Math.min(0.98, Math.max(0.02, (clientX - rect.left) / rect.width));
      onSplitChange(raw);
      onDragDirect?.(raw);
    };

    updateFromClientX(e.clientX);

    const onPointerMove = (ev) => {
      if (!isDragging.current) return;
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        updateFromClientX(ev.clientX);
      });
    };

    const onPointerUp = (ev) => {
      isDragging.current = false;
      if (rafId.current) cancelAnimationFrame(rafId.current);
      try {
        ev.currentTarget?.releasePointerCapture?.(ev.pointerId);
      } catch (_) {}
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }, [mapContainerRef, onSplitChange, onDragDirect]);

  // Keyboard navigation: arrow keys
  const onKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSplitChange(Math.max(0.02, split - 0.02));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSplitChange(Math.min(0.98, split + 0.02));
    }
  }, [split, onSplitChange]);

  const leftPct = `${split * 100}%`;
  const ariaVal = Math.round(split * 100);

  return (
    <>
      {/* Floating comparison labels at the top */}
      <div className={STYLES.labelsRow}>
        <div className={STYLES.labelLeft} style={STYLES.labelStyle}>
          <span style={{ color: "#57f1db", fontSize: 13 }}>◀</span>
          <span>AVANT :</span>
          <span style={{ color: "#57f1db", fontWeight: 700 }}>{formatDate(startDate)}</span>
          <span style={{ color: "#859490", fontSize: 10 }}>({startDate === endDate ? "Radar brut" : "Passage radar initial"})</span>
        </div>
        <div className={STYLES.labelRight} style={STYLES.labelStyle}>
          <span style={{ color: "#859490", fontSize: 10 }}>({startDate === endDate ? "+ Détection IA" : "Passage récent + IA"})</span>
          <span>APRÈS :</span>
          <span style={{ color: "#57f1db", fontWeight: 700 }}>{formatDate(endDate)}</span>
          <span style={{ color: "#57f1db", fontSize: 13 }}>▶</span>
        </div>
      </div>

      {/* Full-height draggable column: generous 32px hitbox centered on divider */}
      <div
        ref={containerRef}
        role="slider"
        aria-label="Séparateur de comparaison avant / après"
        aria-valuenow={ariaVal}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className={STYLES.container}
        style={{
          left: leftPct,
          transform: "translateX(-50%)",
          width: 36,
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        {/* Top line */}
        <div className={STYLES.line} style={STYLES.lineStyle} />

        {/* Central drag handle */}
        <div
          className={`${STYLES.handle} ${STYLES.handleFocusRing}`}
          style={STYLES.handleStyle}
        >
          {/* Double horizontal arrow icon */}
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M5 8H2m0 0l2-2M2 8l2 2"
              stroke="#57f1db"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M11 8h3m0 0l-2-2m2 2l-2 2"
              stroke="#57f1db"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Bottom line */}
        <div className={STYLES.line} style={STYLES.lineStyle} />
      </div>
    </>
  );
}
