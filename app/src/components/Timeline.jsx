import { useState, useRef, useEffect, useCallback } from "react";

export default function Timeline({ zone, period, setPeriod }) {
  const dates = zone.dates || [];
  const trackRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(null);

  const startIdx = dates.indexOf(period.start);
  const endIdx = dates.indexOf(period.end);
  const safeStart = startIdx >= 0 ? startIdx : 0;
  const safeEnd = endIdx >= 0 ? endIdx : dates.length - 1;

  const totalDates = dates.length;

  function idxToPercent(idx) {
    if (totalDates <= 1) return 0;
    return (idx / (totalDates - 1)) * 100;
  }

  function percentToIdx(pct) {
    if (totalDates <= 1) return 0;
    return Math.round((pct / 100) * (totalDates - 1));
  }

  function getClickIdx(e) {
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    return percentToIdx(pct);
  }

  function handleTrackClick(e) {
    const idx = getClickIdx(e);
    // Move whichever handle is closer
    const dStart = Math.abs(idx - safeStart);
    const dEnd = Math.abs(idx - safeEnd);
    if (dStart <= dEnd) {
      setPeriod((p) => ({ ...p, start: dates[Math.min(idx, safeEnd)] }));
    } else {
      setPeriod((p) => ({ ...p, end: dates[Math.max(idx, safeStart)] }));
    }
  }

  function makeDragHandler(which) {
    return (e) => {
      e.preventDefault();
      const onMove = (ev) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return;
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const idx = percentToIdx(pct);
        if (which === "start") {
          setPeriod((p) => ({ ...p, start: dates[Math.min(idx, safeEnd)] }));
        } else {
          setPeriod((p) => ({ ...p, end: dates[Math.max(idx, safeStart)] }));
        }
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
    };
  }

  // Play animation
  function togglePlay() {
    if (playing) {
      clearInterval(playRef.current);
      setPlaying(false);
    } else {
      setPlaying(true);
      let idx = safeEnd;
      playRef.current = setInterval(() => {
        idx = idx >= totalDates - 1 ? 0 : idx + 1;
        setPeriod((p) => ({ ...p, end: dates[idx] }));
      }, 1000);
    }
  }

  useEffect(() => () => clearInterval(playRef.current), []);

  const startPct = idxToPercent(safeStart);
  const endPct = idxToPercent(safeEnd);

  function formatDate(d) {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    const months = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
    return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
  }

  return (
    <div
      className="flex flex-col gap-1 px-3.5 py-2 rounded-xl"
      style={{
        background: "rgba(15,23,42,0.92)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(60,74,70,0.35)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center gap-3">
        {/* Play button — sleek & compact */}
        <button
          onClick={togglePlay}
          className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-all hover:scale-105 cursor-pointer"
          style={{
            background: "#57f1db",
            color: "#003731",
            boxShadow: "0 2px 10px rgba(87,241,219,0.25)",
          }}
          title={playing ? "Pause animation" : "Play timeline"}
        >
          <span className="material-symbols-outlined text-[19px]">
            {playing ? "pause" : "play_arrow"}
          </span>
        </button>

        {/* Track */}
        <div
          className="flex-1 relative flex flex-col justify-center select-none"
          style={{ paddingTop: 14, paddingBottom: 2 }}
        >
          {/* End bubble */}
          <div
            className="absolute flex items-center gap-1 px-2 py-0.5 rounded"
            style={{
              top: -6,
              left: `${endPct}%`,
              transform: "translateX(-50%)",
              background: "#070e1c",
              border: "1px solid #57f1db",
              color: "#57f1db",
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
              zIndex: 10,
              whiteSpace: "nowrap",
            }}
          >
            <span>{formatDate(period.end)}</span>
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "#ffb95f" }}
            />
          </div>

          {/* Rail */}
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className="relative w-full rounded-full cursor-pointer"
            style={{ height: 5, background: "#19202e" }}
          >
            {/* Active fill */}
            <div
              className="absolute top-0 bottom-0 rounded-full"
              style={{
                left: `${startPct}%`,
                width: `${endPct - startPct}%`,
                background: "#57f1db",
                boxShadow: "0 0 10px rgba(87,241,219,0.5)",
                pointerEvents: "none",
              }}
            />

            {/* Start handle */}
            <div
              onMouseDown={makeDragHandler("start")}
              onTouchStart={makeDragHandler("start")}
              className="absolute rounded-full cursor-pointer hover:scale-110 transition-transform"
              style={{
                width: 13,
                height: 13,
                top: "50%",
                left: `${startPct}%`,
                transform: "translate(-50%, -50%)",
                background: "#070e1c",
                border: "2px solid #57f1db",
                zIndex: 5,
              }}
            />

            {/* End handle */}
            <div
              onMouseDown={makeDragHandler("end")}
              onTouchStart={makeDragHandler("end")}
              className="absolute rounded-full cursor-pointer hover:scale-110 transition-transform flex items-center justify-center"
              style={{
                width: 15,
                height: 15,
                top: "50%",
                left: `${endPct}%`,
                transform: "translate(-50%, -50%)",
                background: "#57f1db",
                border: "2px solid #070e1c",
                boxShadow: "0 2px 6px rgba(87,241,219,0.4)",
                zIndex: 6,
              }}
            >
              <span
                className="rounded-full"
                style={{ width: 5, height: 5, background: "#070e1c" }}
              />
            </div>
          </div>

          {/* Date ticks */}
          <div className="relative w-full flex justify-between mt-1 h-5">
            {dates.map((date, i) => {
              const pct = idxToPercent(i);
              const isStart = date === period.start;
              const isEnd = date === period.end;
              const isActive = isStart || isEnd;
              // Prevent label collision: show first, last, and nicely spaced intermediate dates
              const step = totalDates > 10 ? 3 : totalDates > 6 ? 2 : 1;
              const showText = i === 0 || i === totalDates - 1 || (i % step === 0);

              return (
                <div
                  key={date}
                  onClick={() => setPeriod((p) => ({ ...p, end: date }))}
                  title={`Passage NISAR : ${formatDate(date)}`}
                  className="flex flex-col items-center cursor-pointer group"
                  style={{
                    position: "absolute",
                    left: `${pct}%`,
                    transform: "translateX(-50%)",
                    opacity: isActive ? 1 : 0.65,
                    transition: "opacity 0.15s ease",
                    zIndex: isActive ? 8 : 2,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = isActive ? "1" : "0.65")}
                >
                  <span
                    className="rounded-full mb-1 transition-all group-hover:scale-125"
                    style={{
                      width: isEnd ? 7 : 5,
                      height: isEnd ? 7 : 5,
                      background: isEnd ? "#57f1db" : isStart ? "#38bdf8" : "rgba(87,241,219,0.7)",
                      border: isEnd ? "2px solid #070e1c" : "none",
                      boxShadow: isEnd ? "0 0 8px #57f1db" : "none",
                    }}
                  />
                  {showText && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? "#57f1db" : "#859490",
                        whiteSpace: "nowrap",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {formatDate(date).split(" ").slice(0, 2).join(" ")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Compact footer note */}
      <div
        className="flex items-center gap-1.5 text-[9.5px] text-[#859490] pt-0.5 px-0.5"
      >
        <span className="material-symbols-outlined text-[13px] text-[#859490] shrink-0">
          info
        </span>
        <span className="italic truncate">
          Passages orbitaux NISAR (cycle de 12 jours). Détection temporelle des variations de rétrodiffusion radar.
        </span>
      </div>
    </div>
  );
}
