import { useState, useEffect, useRef } from "react";
import SatelliteCalendarPicker from "./SatelliteCalendarPicker";
import {
  hasBackend,
  API_URL,
  checkCoverage,
  startJob,
  getJob,
  registerFinishedJob,
  getRemoteSites,
  getActiveJob,
  setActiveJob,
  getToken,
  setToken,
  normalizeBbox,
} from "../lib/api";
import { bboxSizeKm, zoneTooLarge as isTooLarge } from "../lib/geo";

// ── Style tokens ────────────────────────────────────────────────────────────
const T = {
  bg: "#151b2a",
  card: "#19202e",
  deep: "#070e1c",
  border: "#3c4a46",
  text: "#dce2f6",
  muted: "#bacac5",
  dim: "#859490",
  accent: "#57f1db",
  error: "#ffb4ab",
  warn: "#ffb95f",
  mono: "'JetBrains Mono', monospace",
  sans: "'Plus Jakarta Sans', sans-serif",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function autoName() {
  const now = new Date();
  return `Analysis ${now.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
  })} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: T.mono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: T.dim,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        border: `2px solid ${T.accent}`,
        borderTopColor: "transparent",
        animation: "spin 0.8s linear infinite",
        verticalAlign: "middle",
      }}
    />
  );
}

function PanelCard({ children, style }) {
  return (
    <div
      style={{
        background: T.card,
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

const STAGES = ["queued", "searching", "downloading", "processing", "predicting", "done"];
const STAGE_LABEL = {
  queued: "Initialization",
  searching: "Querying Sentinel-1 / NISAR orbits",
  downloading: "Acquiring NASA radar scenes",
  processing: "Geometric calibration & radiometric filter",
  predicting: "Executing AI multi-class terrain model",
  done: "Analysis completed successfully",
  failed: "Analysis failed",
};

const inputStyle = {
  background: T.deep,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  color: T.text,
  fontFamily: T.mono,
  fontSize: 12,
  padding: "5px 8px",
  outline: "none",
  colorScheme: "dark",
  width: "100%",
  boxSizing: "border-box",
};

function buttonStyle(enabled, strong = false) {
  return {
    background: enabled ? (strong ? "rgba(87,241,219,0.18)" : "rgba(87,241,219,0.10)") : "rgba(87,241,219,0.03)",
    border: `1px solid ${enabled ? T.accent : T.border}`,
    borderRadius: 6,
    color: enabled ? T.accent : T.dim,
    fontFamily: T.mono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    padding: "6px 12px",
    cursor: enabled ? "pointer" : "not-allowed",
    display: "flex",
    alignItems: "center",
    gap: 6,
  };
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

export default function AnalyzePanel({
  bbox: rawBbox = null,
  drawing = false,
  isDrawing = false,
  initialStart = null,
  initialEnd = null,
  availableDates: propAvailableDates = [],
  onStartDraw,
  onStartDrawZone,
  onClearBbox,
  onCancelDrawZone,
  onJobResult,
}) {
  const activeDrawing = drawing || isDrawing;
  const triggerDraw = onStartDraw || onStartDrawZone;
  const triggerCancel = onClearBbox || onCancelDrawZone;
  const [adjustedBbox, setAdjustedBbox] = useState(null);
  const bbox = normalizeBbox(adjustedBbox || rawBbox);
  const today = todayISO();

  const [startDate, setStartDate] = useState(initialStart || "2026-06-15");
  const [endDate, setEndDate] = useState(initialEnd || (today > "2026-06-15" ? today : "2026-11-15"));
  const [availablePasses, setAvailablePasses] = useState(propAvailableDates);

  useEffect(() => {
    if (initialStart) setStartDate(initialStart);
    if (initialEnd) setEndDate(initialEnd);
  }, [initialStart, initialEnd]);

  const [quakeDate, setQuakeDate] = useState("");
  const [analysisName, setAnalysisName] = useState("");
  const [token, setTokenState] = useState(() => getToken() || "nasa2026");
  const [coverage, setCoverage] = useState(null); // null | "loading" | { ok, tracks, message }
  const [trackKey, setTrackKey] = useState(""); // "track/frame"
  const [job, setJob] = useState(() => getActiveJob()); // { id, name }
  const [jobState, setJobState] = useState(null); // status.json from the server
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState(() => getRemoteSites());
  const pollRef = useRef(null);

  const dims = bboxSizeKm(bbox);
  const zoneTooLarge = isTooLarge(dims);
  const dateProblem =
    startDate < "2026-06-15"
      ? "NISAR orbital coverage begins June 15, 2026."
      : startDate >= endDate
      ? "Start date must be earlier than end date."
      : null;
  const zoneBody = bbox
    ? { bbox: bbox.map((v) => Math.round(v * 1e5) / 1e5), start: startDate, end: endDate }
    : null;
  const running = Boolean(job) && !["done", "failed"].includes(jobState?.state);
  const coverageReady = coverage && coverage !== "loading";
  const canCheck = hasBackend && bbox && !zoneTooLarge && !dateProblem && coverage !== "loading";
  const canAnalyze =
    hasBackend && bbox && !zoneTooLarge && !dateProblem && coverageReady && coverage.ok && trackKey && !running;

  // A new zone or new dates invalidate the previous coverage answer
  const bboxKey = bbox ? bbox.join(",") : "";
  useEffect(() => {
    setCoverage(null);
    setTrackKey("");
  }, [bboxKey, startDate, endDate]);

  // Fetch real NASA satellite passes for this bbox
  useEffect(() => {
    if (propAvailableDates && propAvailableDates.length > 0) {
      setAvailablePasses(propAvailableDates);
      return;
    }
    if (bbox && bbox.length === 4) {
      const cLat = (bbox[1] + bbox[3]) / 2;
      const cLng = (bbox[0] + bbox[2]) / 2;
      fetch(`http://localhost:8000/api/satellite_passes?lat=${cLat.toFixed(3)}&lng=${cLng.toFixed(3)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.dates?.length) {
            setAvailablePasses(data.dates);
          }
        })
        .catch(() => {});
    }
  }, [bboxKey, propAvailableDates]);

  // Follow a running job (also resumes after a page refresh)
  useEffect(() => {
    if (!job || !hasBackend) return undefined;
    let stopped = false;
    async function tick() {
      try {
        const s = await getJob(job.id);
        if (stopped) return;
        setJobState(s);
        setError(null);
        if (s.state === "done") {
          const entry = await registerFinishedJob(job.id, job.name);
          setActiveJob(null);
          setRecent(getRemoteSites());
          onJobResult?.(entry.site);
          return;
        }
        if (s.state === "failed") {
          setActiveJob(null);
          return;
        }
      } catch (e) {
        if (!stopped) setError(e.message);
      }
      if (!stopped) pollRef.current = setTimeout(tick, 5000);
    }
    tick();
    return () => {
      stopped = true;
      clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  async function handleCheckCoverage() {
    if (!canCheck) return;
    setError(null);
    setCoverage("loading");
    try {
      const c = await checkCoverage(zoneBody);
      setCoverage(c);
      const usable = (c.tracks || []).filter((t) => t.dates.length >= 4);
      if (usable.length > 0) {
        setTrackKey(`${usable[0].track}/${usable[0].frame}`);
      }
    } catch (e) {
      setCoverage(null);
      setError(e.message);
    }
  }

  async function handleAnalyze() {
    if (!canAnalyze) return;
    setError(null);
    const [t, f] = trackKey.split("/").map(Number);
    const name = analysisName.trim() || autoName();
    const payload = {
      ...zoneBody,
      name,
      track: t,
      frame: f,
      earthquake_date: quakeDate || null,
    };
    try {
      setToken(token.trim());
      const res = await startJob(payload, token.trim());
      const newJob = { id: res.job_id, name };
      setJob(newJob);
      setActiveJob(newJob);
      setJobState({ state: "queued", step: "Starting" });
    } catch (e) {
      setError(e.message);
    }
  }

  const stageIdx = jobState ? STAGES.indexOf(jobState.state) : -1;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: T.sans,
        fontSize: 13,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slide {
          0%   { transform: translateX(-150%); }
          50%  { transform: translateX(0%); }
          100% { transform: translateX(350%); }
        }
      `}</style>

      {/* Backend connection status pill */}
      <PanelCard style={{ border: `1px solid ${hasBackend ? "rgba(87,241,219,0.3)" : T.warn}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: hasBackend ? T.accent : T.warn,
              boxShadow: hasBackend ? "0 0 8px #57f1db" : "none",
            }}
          />
          <SectionLabel>
            {hasBackend ? "NISAR AI Server Connected" : "No Analysis Server Connected"}
          </SectionLabel>
        </div>
        <span style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>
          {hasBackend ? (
            <>
              API active on <code style={{ color: T.accent }}>{API_URL}</code>. NASA ASF Datapool search & multi-class model ready.
            </>
          ) : (
            <>
              Demo sites run without a server. To analyze custom coordinates, run <code>backend.py</code> on port 8000.
            </>
          )}
        </span>
      </PanelCard>

      {/* 1. Zone */}
      <PanelCard>
        <SectionLabel>1 · Analysis Region</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => triggerDraw?.()}
            disabled={activeDrawing || running}
            style={buttonStyle(!activeDrawing && !running)}
          >
            {activeDrawing ? "Drawing in progress… click 2 corners" : bbox ? "Redraw region" : "Draw region on map"}
          </button>
          {bbox && !running && (
            <button onClick={() => triggerCancel?.()} style={buttonStyle(true)}>
              Clear
            </button>
          )}
        </div>
        {!bbox && !activeDrawing && (
          <span style={{ color: T.dim, fontSize: 11 }}>
            Click "Draw region on map", then click two opposite corners on the map.
          </span>
        )}
        {dims && (
          <>
            <span style={{ color: zoneTooLarge ? T.error : T.accent, fontFamily: T.mono, fontSize: 12 }}>
              {dims.wKm} km × {dims.hKm} km
            </span>
            {zoneTooLarge && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: T.error, fontSize: 11 }}>
                  Region too extensive ({dims.wKm} × {dims.hKm} km); NISAR max limit is 50 × 50 km.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const [w, s, e, n] = bbox;
                    const cLat = (s + n) / 2;
                    const cLng = (w + e) / 2;
                    const dLat = 17.5 / 110.57;
                    const dLon = 17.5 / (111.32 * Math.max(0.15, Math.cos((cLat * Math.PI) / 180)));
                    setAdjustedBbox([cLng - dLon, cLat - dLat, cLng + dLon, cLat + dLat]);
                  }}
                  style={{
                    background: "rgba(87,241,219,0.15)",
                    border: "1px solid #57f1db",
                    color: "#57f1db",
                    borderRadius: 6,
                    fontFamily: T.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "6px 10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    marginTop: 2,
                  }}
                >
                  ⚡ Auto-adjust to 35 × 35 km
                </button>
              </div>
            )}
            <span style={{ color: T.dim, fontFamily: T.mono, fontSize: 10, lineHeight: 1.5 }}>
              W {bbox[0].toFixed(4)} · S {bbox[1].toFixed(4)} · E {bbox[2].toFixed(4)} · N {bbox[3].toFixed(4)}
            </span>
          </>
        )}
      </PanelCard>

      {/* 2. Dates */}
      <PanelCard style={{ overflow: "visible" }}>
        <SectionLabel>2 · Temporal Period</SectionLabel>
        <div style={{ display: "flex", gap: 8, position: "relative" }}>
          <SatelliteCalendarPicker
            label="Start Date"
            value={startDate}
            align="left"
            position="bottom"
            availableDates={availablePasses}
            maxDate={today}
            onChange={(s) => {
              setStartDate(s);
              const minE = new Date(new Date(s).getTime() + 12 * 86400000).toISOString().split("T")[0];
              if (new Date(endDate) < new Date(minE)) setEndDate(minE);
            }}
          />
          <SatelliteCalendarPicker
            label="End Date (min +12d)"
            value={endDate}
            align="right"
            position="bottom"
            availableDates={availablePasses}
            minDate={startDate ? new Date(new Date(startDate).getTime() + 12 * 86400000).toISOString().split("T")[0] : undefined}
            maxDate={today}
            onChange={(e) => setEndDate(e)}
          />
        </div>

        {/* Quick orbital presets */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 10, fontFamily: T.mono, color: T.muted }}>NASA Pass:</span>
          {[
            { label: "+12d (2 dates)", days: 12 },
            { label: "+24d (3 dates)", days: 24 },
            { label: "+48d (5 dates)", days: 48 },
          ].map(({ label, days }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                const rawTarget = new Date(new Date(startDate).getTime() + days * 86400000).toISOString().split("T")[0];
                const clamped = rawTarget > today ? today : rawTarget;
                const minEnd = new Date(new Date(startDate).getTime() + 10 * 86400000).toISOString().split("T")[0];
                const snapped = findClosestPass(availablePasses, clamped, minEnd);
                setEndDate(snapped);
              }}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                fontFamily: T.mono,
                background: "#0c1321",
                color: "#bacac5",
                border: "1px solid rgba(60,74,70,0.5)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {dateProblem && <span style={{ color: T.error, fontSize: 11, fontFamily: T.mono }}>{dateProblem}</span>}
        <details style={{ fontSize: 11, color: T.muted }}>
          <summary style={{ cursor: "pointer", fontFamily: T.mono }}>Earthquake (optional)</summary>
          <label style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, fontFamily: T.mono }}>
            Seismic event date (activates interferometric analysis)
            <input type="date" value={quakeDate} min={startDate} max={endDate} onChange={(e) => setQuakeDate(e.target.value)} style={inputStyle} />
          </label>
        </details>
      </PanelCard>

      {/* 3. Coverage */}
      <PanelCard>
        <SectionLabel>3 · Satellite Radar Coverage</SectionLabel>
        <button onClick={handleCheckCoverage} disabled={!canCheck} style={buttonStyle(Boolean(canCheck))}>
          {coverage === "loading" && <Spinner />}
          Verify NISAR Coverage
        </button>
        {!bbox && <span style={{ color: T.dim, fontSize: 11 }}>Select or draw a region first.</span>}
        {coverageReady && !coverage.ok && (
          <span style={{ color: T.error, fontSize: 12 }}>
            No NISAR orbit has at least 4 passes over this region during this period. Expand the time window.
          </span>
        )}
        {coverageReady && coverage.ok && (() => {
          const chosen = coverage.tracks.find((t) => `${t.track}/${t.frame}` === trackKey);
          return chosen ? (
            <span style={{ fontSize: 12, color: T.accent, fontFamily: T.mono }}>
              ✓ Track {chosen.track}, Frame {chosen.frame} ({(chosen.direction || "").toLowerCase()}): {chosen.dates.length} radar passes, from{" "}
              {chosen.dates[0]} to {chosen.dates[chosen.dates.length - 1]}
            </span>
          ) : null;
        })()}
        {coverageReady && coverage.ok && (
          <details style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <summary style={{ fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.mono }}>
              Advanced: select an alternate radar orbit ({coverage.tracks.filter((t) => t.dates.length >= 4).length} available)
            </summary>
            {coverage.tracks
              .filter((t) => t.dates.length >= 4)
              .map((t) => {
                const key = `${t.track}/${t.frame}`;
                return (
                  <label key={key} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11, fontFamily: T.mono, color: T.text, cursor: "pointer" }}>
                    <input type="radio" name="track" checked={trackKey === key} onChange={() => setTrackKey(key)} />
                    <span>
                      Track {t.track}, Frame {t.frame} ({(t.direction || "").toLowerCase()}): {t.dates.length} exploitable passes
                      {t.single_pol_passes > 0 ? ` (${t.single_pol_passes} single pol)` : ""}
                      <br />
                      <span style={{ color: T.dim }}>{t.dates.join(", ")}</span>
                    </span>
                  </label>
                );
              })}
          </details>
        )}
      </PanelCard>

      {/* 4. Run */}
      <PanelCard>
        <SectionLabel>4 · Launch AI Analysis</SectionLabel>
        <input
          type="text"
          placeholder="Custom analysis label (optional)"
          value={analysisName}
          onChange={(e) => setAnalysisName(e.target.value)}
          style={{ ...inputStyle, fontFamily: T.sans }}
        />
        <div style={{ fontSize: 10, color: T.accent, fontFamily: T.mono, display: "flex", alignItems: "center", gap: 5 }}>
          <span>✓ Integrated NASA ASF authentication & AI</span>
        </div>
        <button onClick={handleAnalyze} disabled={!canAnalyze} style={buttonStyle(Boolean(canAnalyze), true)}>
          {running && <Spinner />}
          Run Model Analysis
        </button>
        {job && (
          <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 12, fontFamily: T.mono, color: jobState?.state === "failed" ? T.error : jobState?.state === "done" ? T.accent : T.muted }}>
              {STAGE_LABEL[jobState?.state] || "In progress"}
              {jobState?.step && jobState.state !== "failed" ? ` : ${jobState.step}` : ""}
            </span>
            {jobState?.state === "failed" ? (
              <>
                <span style={{ fontSize: 12, color: T.error }}>{jobState.message || "Analysis stopped."}</span>
                <button
                  onClick={() => {
                    setJob(null);
                    setJobState(null);
                    handleAnalyze();
                  }}
                  disabled={!canAnalyze}
                  style={buttonStyle(Boolean(canAnalyze))}
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                  {STAGES.slice(1).map((st, i) => {
                    const idx = i + 1;
                    const state = stageIdx > idx ? "done" : stageIdx === idx ? "current" : "todo";
                    return (
                      <span key={st} style={{ fontSize: 11, fontFamily: T.mono, color: state === "current" ? T.accent : state === "done" ? T.muted : T.dim }}>
                        {state === "done" ? "✓" : state === "current" ? "●" : "○"} {idx}. {STAGE_LABEL[st]}
                      </span>
                    );
                  })}
                </div>
                <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>Job ID : {job.id}</span>
              </>
            )}
          </div>
        )}
        {error && <span style={{ color: T.error, fontSize: 12 }}>{error}</span>}
      </PanelCard>

      {/* 5. Recent analyses (kept in this browser) */}
      {recent.length > 0 && (
        <PanelCard>
          <SectionLabel>Recent Analyses</SectionLabel>
          {recent.map((r) => (
            <div key={r.site} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: T.bg, borderRadius: 7, padding: "6px 10px" }}>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>{(r.analysed_at || "").slice(0, 16).replace("T", " ")}</span>
              </div>
              <button onClick={() => onJobResult?.(r.site)} style={buttonStyle(true)}>Open</button>
            </div>
          ))}
        </PanelCard>
      )}

      <span style={{ fontSize: 10, color: T.dim, lineHeight: 1.5 }}>
        Detections for custom regions are generated by the multi-class AI model calibrated on Sentinel-1 & NISAR radar data.
        {hasBackend ? ` · Server : ${API_URL}` : ""}
      </span>
    </div>
  );
}
