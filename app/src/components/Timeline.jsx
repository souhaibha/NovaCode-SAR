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
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
  }

  return (
    <div
      className="flex flex-col gap-2.5 p-4 rounded-2xl"
      style={{
        background: "rgba(21,27,42,0.97)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(60,74,70,0.4)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex items-center gap-4">
        {/* Play button */}
        <button
          onClick={togglePlay}
          className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all hover:scale-105"
          style={{
            background: "#57f1db",
            color: "#003731",
            boxShadow: "0 4px 16px rgba(87,241,219,0.25)",
          }}
        >
          <span className="material-symbols-outlined text-[24px]">
            {playing ? "pause" : "play_arrow"}
          </span>
        </button>

        {/* Track */}
        <div
          className="flex-1 relative flex flex-col justify-center select-none"
          style={{ paddingTop: 20, paddingBottom: 4 }}
        >
          {/* End bubble */}
          <div
            className="absolute flex items-center gap-1 px-2.5 py-0.5 rounded-md"
            style={{
              top: -6,
              left: `${endPct}%`,
              transform: "translateX(-50%)",
              background: "#070e1c",
              border: "1px solid #57f1db",
              color: "#57f1db",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
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
            style={{ height: 8, background: "#19202e" }}
          >
            {/* Active fill */}
            <div
              className="absolute top-0 bottom-0 rounded-full"
              style={{
                left: `${startPct}%`,
                width: `${endPct - startPct}%`,
                background: "#57f1db",
                boxShadow: "0 0 12px rgba(87,241,219,0.5)",
                pointerEvents: "none",
              }}
            />

            {/* Start handle */}
            <div
              onMouseDown={makeDragHandler("start")}
              onTouchStart={makeDragHandler("start")}
              className="absolute rounded-full cursor-pointer hover:scale-110 transition-transform"
              style={{
                width: 16,
                height: 16,
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
                width: 20,
                height: 20,
                top: "50%",
                left: `${endPct}%`,
                transform: "translate(-50%, -50%)",
                background: "#57f1db",
                border: "2px solid #070e1c",
                boxShadow: "0 2px 8px rgba(87,241,219,0.4)",
                zIndex: 6,
              }}
            >
              <span
                className="rounded-full"
                style={{ width: 6, height: 6, background: "#070e1c" }}
              />
            </div>
          </div>

          {/* Date ticks */}
          <div className="relative w-full flex justify-between mt-2">
            {dates.map((date, i) => {
              const pct = idxToPercent(i);
              const isStart = date === period.start;
              const isEnd = date === period.end;
              const isActive = isStart || isEnd;
              return (
                <div
                  key={date}
                  onClick={() => setPeriod((p) => ({ ...p, end: date }))}
                  className="flex flex-col items-center cursor-pointer"
                  style={{
                    position: "absolute",
                    left: `${pct}%`,
                    transform: "translateX(-50%)",
                    opacity: isActive ? 1 : 0.6,
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = isActive ? "1" : "0.6")}
                >
                  <span
                    className="rounded-full mb-1"
                    style={{
                      width: isEnd ? 8 : 6,
                      height: isEnd ? 8 : 6,
                      background: isEnd ? "#FF5A5F" : isStart ? "#57f1db" : "#57f1db",
                      border: isEnd ? "2px solid #57f1db" : "none",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: isActive ? 700 : 400,
                      color: isActive ? "#57f1db" : "#bacac5",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDate(date).split(" ").slice(0, 2).join(" ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div
        className="flex items-center justify-between"
        style={{ fontSize: 11, color: "#bacac5", paddingTop: 4 }}
      >
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[15px]" style={{ color: "#859490" }}>
            info
          </span>
          <span style={{ fontStyle: "italic" }}>
            Ticks indicate actual NISAR acquisition dates. Animation between dates is visual only.
          </span>
        </div>
      </div>
    </div>
  );
}
