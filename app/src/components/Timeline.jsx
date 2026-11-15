import { useState, useEffect, useRef } from "react";

function formatDate(str) {
  if (!str) return "";
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  const [y, m, d] = parts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1] || m} ${y}`;
}

function findNearestIndex(targetDateStr, dates) {
  if (!targetDateStr || !dates?.length) return 0;
  const targetTime = new Date(targetDateStr + "T00:00:00Z").getTime();
  let bestIdx = 0;
  let minDiff = Infinity;
  dates.forEach((d, idx) => {
    const time = new Date(d + "T00:00:00Z").getTime();
    const diff = Math.abs(time - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

function getDayDiff(d1, d2) {
  if (!d1 || !d2) return 0;
  const t1 = new Date(d1 + "T00:00:00Z").getTime();
  const t2 = new Date(d2 + "T00:00:00Z").getTime();
  return Math.round(Math.abs(t1 - t2) / (1000 * 60 * 60 * 24));
}

/**
 * Timeline — P3 radar frames timeline, date pickers, and Compare Dates mode.
 *
 * Requirements:
 *  - Single view:
 *    - Slider over frames, synced both ways with <input type="date">
 *    - Snapped notice: "Showing radar of <date>" and "nearest to <picked> (±n days)"
 *    - Play/pause (1s per frame, no loop)
 *  - Compare dates mode:
 *    - Toggle "Compare dates"
 *    - Two date pickers: "Before" and "After", each snapping to nearest frame
 *    - Before must be earlier than after, with a readable message
 *  - Hides completely when site has fewer than 2 frames
 *  - No backdrop-blur, no glows
 */
export default function Timeline({
  dates = [],
  isCompare = false,
  onToggleCompare,
  // Single view props
  selectedIndex = 0,
  onSelectIndex,
  pickedDate,
  onPickedDateChange,
  // Compare view props
  beforeIndex = 0,
  onSelectBeforeIndex,
  pickedBeforeDate,
  onPickedBeforeDateChange,
  afterIndex = 1,
  onSelectAfterIndex,
  pickedAfterDate,
  onPickedAfterDateChange,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef(null);

  // Requirement 6: Hide timeline controls when site has fewer than 2 frames
  if (!dates || dates.length < 2) {
    return null;
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  // ── Single view state derivations ──────────────────────────────────────────
  const currentSingleDate = dates[selectedIndex] || firstDate;
  const isSingleSnapped = Boolean(pickedDate && pickedDate !== currentSingleDate);
  const singleDayDiff = isSingleSnapped ? getDayDiff(currentSingleDate, pickedDate) : 0;

  // ── Compare view state derivations ────────────────────────────────────────
  const currentBeforeDate = dates[beforeIndex] || firstDate;
  const currentAfterDate = dates[afterIndex] || lastDate;
  const isBeforeSnapped = Boolean(pickedBeforeDate && pickedBeforeDate !== currentBeforeDate);
  const beforeDayDiff = isBeforeSnapped ? getDayDiff(currentBeforeDate, pickedBeforeDate) : 0;
  const isAfterSnapped = Boolean(pickedAfterDate && pickedAfterDate !== currentAfterDate);
  const afterDayDiff = isAfterSnapped ? getDayDiff(currentAfterDate, pickedAfterDate) : 0;

  // Validation: Before must be earlier than after
  const isInvalidOrder = beforeIndex >= afterIndex;

  // ── Play / Pause timer for single view ─────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || isCompare) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    playTimerRef.current = setInterval(() => {
      onSelectIndex?.((prev) => {
        if (prev >= dates.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        const next = prev + 1;
        onPickedDateChange?.(dates[next]);
        return next;
      });
    }, 1000);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, isCompare, dates, onSelectIndex, onPickedDateChange]);

  useEffect(() => {
    if (selectedIndex >= dates.length - 1 && isPlaying) {
      setIsPlaying(false);
    }
  }, [selectedIndex, dates.length, isPlaying]);

  function handlePlayToggle() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (selectedIndex >= dates.length - 1) {
        onSelectIndex?.(0);
        onPickedDateChange?.(dates[0]);
      }
      setIsPlaying(true);
    }
  }

  function handleSingleSlider(e) {
    const idx = parseInt(e.target.value, 10);
    onSelectIndex?.(idx);
    onPickedDateChange?.(dates[idx]);
  }

  function handleSingleDatePicker(e) {
    const val = e.target.value;
    if (!val) return;
    onPickedDateChange?.(val);
    const nearestIdx = findNearestIndex(val, dates);
    onSelectIndex?.(nearestIdx);
  }

  function handleSingleStep(delta) {
    const next = Math.max(0, Math.min(dates.length - 1, selectedIndex + delta));
    onSelectIndex?.(next);
    onPickedDateChange?.(dates[next]);
  }

  // ── Compare view handlers ─────────────────────────────────────────────────
  function handleBeforeDatePicker(e) {
    const val = e.target.value;
    if (!val) return;
    onPickedBeforeDateChange?.(val);
    const nearestIdx = findNearestIndex(val, dates);
    onSelectBeforeIndex?.(nearestIdx);
  }

  function handleAfterDatePicker(e) {
    const val = e.target.value;
    if (!val) return;
    onPickedAfterDateChange?.(val);
    const nearestIdx = findNearestIndex(val, dates);
    onSelectAfterIndex?.(nearestIdx);
  }

  function handleBeforeStep(delta) {
    const next = Math.max(0, Math.min(dates.length - 1, beforeIndex + delta));
    onSelectBeforeIndex?.(next);
    onPickedBeforeDateChange?.(dates[next]);
  }

  function handleAfterStep(delta) {
    const next = Math.max(0, Math.min(dates.length - 1, afterIndex + delta));
    onSelectAfterIndex?.(next);
    onPickedAfterDateChange?.(dates[next]);
  }

  const containerStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 16px",
    borderRadius: 14,
    background: "rgba(21,27,42,0.96)",
    border: "1px solid rgba(60,74,70,0.5)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    userSelect: "none",
  };

  const btnStyle = (active = false) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 8,
    border: active ? "1px solid #57f1db" : "1px solid rgba(60,74,70,0.5)",
    background: active ? "#57f1db" : "#19202e",
    color: active ? "#003731" : "#dce2f6",
    fontWeight: active ? 700 : 500,
    fontSize: 11,
    fontFamily: "'JetBrains Mono',monospace",
    cursor: "pointer",
    transition: "all 0.15s",
    flexShrink: 0,
  });

  const stepBtnStyle = (disabled) => ({
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "1px solid rgba(60,74,70,0.4)",
    background: disabled ? "transparent" : "#19202e",
    color: disabled ? "#3d4a5e" : "#dce2f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "not-allowed" : "pointer",
    flexShrink: 0,
  });

  const dateInputStyle = {
    background: "#070e1c",
    color: "#57f1db",
    border: "1px solid rgba(60,74,70,0.5)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 11,
    fontFamily: "'JetBrains Mono',monospace",
    colorScheme: "dark",
    cursor: "pointer",
  };

  return (
    <div style={containerStyle}>

      {/* Top row: Mode toggle + Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>

        {/* Toggle Compare dates button */}
        <button
          type="button"
          onClick={onToggleCompare}
          style={btnStyle(isCompare)}
          title={isCompare ? "Exit compare mode" : "Compare two dates with split divider"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {isCompare ? "close" : "compare"}
          </span>
          <span>{isCompare ? "Exit compare" : "Compare dates"}</span>
        </button>

        {/* ── MODE A: SINGLE VIEW ── */}
        {!isCompare && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 260 }}>
            {/* Play/pause button */}
            <button
              type="button"
              onClick={handlePlayToggle}
              title={isPlaying ? "Pause timeline" : "Play timeline"}
              aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "none",
                background: "#57f1db",
                color: "#003731",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>

            {/* Stepper buttons */}
            <button
              type="button"
              onClick={() => handleSingleStep(-1)}
              disabled={selectedIndex === 0}
              title="Previous frame"
              style={stepBtnStyle(selectedIndex === 0)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
            </button>

            {/* Frame Slider */}
            <div style={{ flex: 1, minWidth: 100, display: "flex", alignItems: "center" }}>
              <input
                type="range"
                min={0}
                max={dates.length - 1}
                step={1}
                value={selectedIndex}
                onChange={handleSingleSlider}
                aria-label="Frame index slider"
                style={{ width: "100%", accentColor: "#57f1db", cursor: "pointer" }}
              />
            </div>

            <button
              type="button"
              onClick={() => handleSingleStep(1)}
              disabled={selectedIndex === dates.length - 1}
              title="Next frame"
              style={stepBtnStyle(selectedIndex === dates.length - 1)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
            </button>

            {/* Pass badge */}
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11,
                color: "#bacac5",
                background: "#0c1321",
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid rgba(60,74,70,0.3)",
                whiteSpace: "nowrap",
              }}
            >
              Pass {selectedIndex + 1}/{dates.length}
            </span>

            {/* Single Date Picker */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#859490", fontFamily: "'JetBrains Mono',monospace" }}>
                Date:
              </span>
              <input
                type="date"
                min={firstDate}
                max={lastDate}
                value={pickedDate || currentSingleDate}
                onChange={handleSingleDatePicker}
                aria-label="Select radar date"
                style={dateInputStyle}
              />
            </div>
          </div>
        )}

        {/* ── MODE B: COMPARE VIEW (TWO DATE PICKERS: BEFORE & AFTER) ── */}
        {isCompare && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>

            {/* Before frame controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(12,19,33,0.8)", padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(60,74,70,0.3)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#57f1db", fontFamily: "'JetBrains Mono',monospace" }}>
                Before:
              </span>
              <button
                type="button"
                onClick={() => handleBeforeStep(-1)}
                disabled={beforeIndex === 0}
                style={stepBtnStyle(beforeIndex === 0)}
                title="Previous before frame"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
              </button>
              <input
                type="date"
                min={firstDate}
                max={lastDate}
                value={pickedBeforeDate || currentBeforeDate}
                onChange={handleBeforeDatePicker}
                aria-label="Before radar date"
                style={dateInputStyle}
              />
              <button
                type="button"
                onClick={() => handleBeforeStep(1)}
                disabled={beforeIndex === dates.length - 1}
                style={stepBtnStyle(beforeIndex === dates.length - 1)}
                title="Next before frame"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
              </button>
              <span style={{ fontSize: 10, color: "#859490", fontFamily: "'JetBrains Mono',monospace" }}>
                P{beforeIndex + 1}
              </span>
            </div>

            {/* After frame controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(12,19,33,0.8)", padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(60,74,70,0.3)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#57f1db", fontFamily: "'JetBrains Mono',monospace" }}>
                After:
              </span>
              <button
                type="button"
                onClick={() => handleAfterStep(-1)}
                disabled={afterIndex === 0}
                style={stepBtnStyle(afterIndex === 0)}
                title="Previous after frame"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
              </button>
              <input
                type="date"
                min={firstDate}
                max={lastDate}
                value={pickedAfterDate || currentAfterDate}
                onChange={handleAfterDatePicker}
                aria-label="After radar date"
                style={dateInputStyle}
              />
              <button
                type="button"
                onClick={() => handleAfterStep(1)}
                disabled={afterIndex === dates.length - 1}
                style={stepBtnStyle(afterIndex === dates.length - 1)}
                title="Next after frame"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
              </button>
              <span style={{ fontSize: 10, color: "#859490", fontFamily: "'JetBrains Mono',monospace" }}>
                P{afterIndex + 1}
              </span>
            </div>

          </div>
        )}

      </div>

      {/* Bottom row: Information / Snapping / Validation messages */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace",
          borderTop: "1px solid rgba(60,74,70,0.2)",
          paddingTop: 6,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {/* Single view status */}
        {!isCompare && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#dce2f6" }}>
              <span style={{ color: "#859490" }}>Showing radar of</span>
              <strong style={{ color: "#57f1db", fontWeight: 700 }}>{formatDate(currentSingleDate)}</strong>
            </div>

            {isSingleSnapped && (
              <div style={{ color: "#ffb95f", fontSize: 11 }}>
                nearest to {formatDate(pickedDate)} (±{singleDayDiff} {singleDayDiff === 1 ? "day" : "days"})
              </div>
            )}
          </>
        )}

        {/* Compare view status & Validation message */}
        {isCompare && (
          <>
            {isInvalidOrder ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#ffb4ab",
                  background: "rgba(255,180,171,0.1)",
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,180,171,0.3)",
                  width: "100%",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                <span style={{ fontWeight: 600 }}>
                  Before date must be earlier than after date.
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#859490" }}>Before:</span>
                  <strong style={{ color: "#57f1db" }}>{formatDate(currentBeforeDate)}</strong>
                  {isBeforeSnapped && (
                    <span style={{ color: "#ffb95f", fontSize: 10 }}>
                      (nearest ±{beforeDayDiff}d)
                    </span>
                  )}
                </div>

                <span style={{ color: "#859490" }}>◀ Drag divider to compare ▶</span>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#859490" }}>After:</span>
                  <strong style={{ color: "#57f1db" }}>{formatDate(currentAfterDate)}</strong>
                  {isAfterSnapped && (
                    <span style={{ color: "#ffb95f", fontSize: 10 }}>
                      (nearest ±{afterDayDiff}d)
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}

      </div>

    </div>
  );
}
