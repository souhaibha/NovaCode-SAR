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
 * Timeline — P2 radar frames timeline and date picker.
 *
 * Requirements:
 *  - Slider over frames (0 .. frames.length - 1)
 *  - <input type="date"> with min = first date, max = last date, synced both ways with slider
 *  - Snapped notice: "Showing radar of <date>" and "nearest to <picked> (±n days)" when snapped
 *  - Play/pause (1s per frame, stops at end, respects prefers-reduced-motion, no looping animation)
 *  - Hides completely when site has fewer than 2 frames
 *  - No backdrop-blur, no glows
 */
export default function Timeline({
  dates = [],
  selectedIndex = 0,
  onSelectIndex,
  pickedDate,
  onPickedDateChange,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef(null);

  // Requirement 6: Hide timeline controls when site has fewer than 2 frames
  if (!dates || dates.length < 2) {
    return null;
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const currentDate = dates[selectedIndex] || firstDate;

  // Snapping logic
  const isSnapped = Boolean(pickedDate && pickedDate !== currentDate);
  const dayDiff = isSnapped ? getDayDiff(currentDate, pickedDate) : 0;

  // Play / Pause timer
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    playTimerRef.current = setInterval(() => {
      onSelectIndex((prev) => {
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
  }, [isPlaying, dates, onSelectIndex, onPickedDateChange]);

  // Stop play if zone changes or selectedIndex hits end
  useEffect(() => {
    if (selectedIndex >= dates.length - 1 && isPlaying) {
      setIsPlaying(false);
    }
  }, [selectedIndex, dates.length, isPlaying]);

  function handlePlayToggle() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (selectedIndex >= dates.length - 1) {
        onSelectIndex(0);
        onPickedDateChange?.(dates[0]);
      }
      setIsPlaying(true);
    }
  }

  function handleSliderChange(e) {
    const idx = parseInt(e.target.value, 10);
    onSelectIndex(idx);
    onPickedDateChange?.(dates[idx]);
  }

  function handleDatePickerChange(e) {
    const val = e.target.value;
    if (!val) return;
    onPickedDateChange?.(val);
    const nearestIdx = findNearestIndex(val, dates);
    onSelectIndex(nearestIdx);
  }

  function handleStep(delta) {
    const next = Math.max(0, Math.min(dates.length - 1, selectedIndex + delta));
    onSelectIndex(next);
    onPickedDateChange?.(dates[next]);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 16px",
        borderRadius: 14,
        background: "rgba(21,27,42,0.96)",
        border: "1px solid rgba(60,74,70,0.5)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        userSelect: "none",
      }}
    >
      {/* Top row: controls, slider, date picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
            transition: "background 0.15s",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {isPlaying ? "pause" : "play_arrow"}
          </span>
        </button>

        {/* Previous step */}
        <button
          type="button"
          onClick={() => handleStep(-1)}
          disabled={selectedIndex === 0}
          title="Previous frame"
          aria-label="Previous frame"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid rgba(60,74,70,0.4)",
            background: selectedIndex === 0 ? "transparent" : "#19202e",
            color: selectedIndex === 0 ? "#3d4a5e" : "#dce2f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: selectedIndex === 0 ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            chevron_left
          </span>
        </button>

        {/* Slider over frames */}
        <div style={{ flex: 1, minWidth: 140, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range"
            min={0}
            max={dates.length - 1}
            step={1}
            value={selectedIndex}
            onChange={handleSliderChange}
            aria-label="Frame index slider"
            style={{
              width: "100%",
              accentColor: "#57f1db",
              cursor: "pointer",
            }}
          />
        </div>

        {/* Next step */}
        <button
          type="button"
          onClick={() => handleStep(1)}
          disabled={selectedIndex === dates.length - 1}
          title="Next frame"
          aria-label="Next frame"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid rgba(60,74,70,0.4)",
            background: selectedIndex === dates.length - 1 ? "transparent" : "#19202e",
            color: selectedIndex === dates.length - 1 ? "#3d4a5e" : "#dce2f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: selectedIndex === dates.length - 1 ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            chevron_right
          </span>
        </button>

        {/* Frame index badge */}
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

        {/* Date picker: synced both ways */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#859490", fontFamily: "'JetBrains Mono',monospace" }}>
            Date:
          </span>
          <input
            type="date"
            min={firstDate}
            max={lastDate}
            value={pickedDate || currentDate}
            onChange={handleDatePickerChange}
            aria-label="Select radar date"
            style={{
              background: "#070e1c",
              color: "#57f1db",
              border: "1px solid rgba(60,74,70,0.5)",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "'JetBrains Mono',monospace",
              colorScheme: "dark",
              cursor: "pointer",
            }}
          />
        </div>
      </div>

      {/* Bottom row: Snapping information */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace",
          borderTop: "1px solid rgba(60,74,70,0.2)",
          paddingTop: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#dce2f6" }}>
          <span style={{ color: "#859490" }}>Showing radar of</span>
          <strong style={{ color: "#57f1db", fontWeight: 700 }}>{formatDate(currentDate)}</strong>
        </div>

        {isSnapped && (
          <div style={{ color: "#ffb95f", fontSize: 11 }}>
            nearest to {formatDate(pickedDate)} (±{dayDiff} {dayDiff === 1 ? "day" : "days"})
          </div>
        )}
      </div>
    </div>
  );
}
