import { useState, useEffect, useRef } from "react";

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

/**
 * Given a bbox [west, south, east, north] in degrees, return { wKm, hKm }.
 */
function bboxToKm(bbox) {
  if (!bbox) return null;
  let west, south, east, north;
  if (Array.isArray(bbox) && Array.isArray(bbox[0]) && bbox.length >= 2) {
    south = bbox[0][0];
    west = bbox[0][1];
    north = bbox[1][0];
    east = bbox[1][1];
  } else if (Array.isArray(bbox) && bbox.length >= 4) {
    [west, south, east, north] = bbox;
  } else {
    return null;
  }
  const R = 6371;
  const latMid = ((south + north) / 2) * (Math.PI / 180);
  const dLat = Math.abs(north - south) * (Math.PI / 180);
  const dLon = Math.abs(east - west) * (Math.PI / 180);
  const hKm = R * dLat;
  const wKm = R * dLon * Math.cos(latMid);
  return { wKm: Math.round(wKm * 10) / 10, hKm: Math.round(hKm * 10) / 10 };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function autoName() {
  const now = new Date();
  return `Analysis ${now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  })} ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: T.mono,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.1em",
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
        width: 14,
        height: 14,
        border: `2px solid ${T.border}`,
        borderTopColor: T.accent,
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function ProgressBar({ pct, indeterminate }) {
  return (
    <div
      style={{
        height: 4,
        background: T.card,
        borderRadius: 999,
        overflow: "hidden",
        marginTop: 6,
      }}
    >
      {indeterminate ? (
        <div
          style={{
            height: "100%",
            width: "40%",
            background: T.accent,
            borderRadius: 999,
            animation: "slide 1.2s ease-in-out infinite",
          }}
        />
      ) : (
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: T.accent,
            borderRadius: 999,
            transition: "width 0.3s ease",
          }}
        />
      )}
    </div>
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

export default function AnalyzePanel({ bbox = null, onJobResult }) {
  const today = todayISO();

  // ── State ──
  const [startDate, setStartDate] = useState("2026-06-15");
  const [endDate, setEndDate] = useState(today);

  const [coverageStatus, setCoverageStatus] = useState(null); // null | 'loading' | { ok, passes, message }
  const [jobStatus, setJobStatus] = useState(null); // null | 'running' | 'done' | 'failed'
  const [jobStep, setJobStep] = useState(null); // { text, pct, indeterminate }
  const [recentAnalyses, setRecentAnalyses] = useState([]);
  const [analysisName, setAnalysisName] = useState("");

  const timeoutsRef = useRef([]);

  // ── Derived ──
  const dims = bboxToKm(bbox);
  const zoneTooLarge = dims && (dims.wKm > 50 || dims.hKm > 50);
  const coverageOk = coverageStatus?.ok === true;
  const canAnalyze = coverageOk && !zoneTooLarge && jobStatus !== "running";

  // ── Cleanup timeouts on unmount ──
  useEffect(() => {
    return () => timeoutsRef.current.forEach(clearTimeout);
  }, []);

  // ── Coverage check ──
  async function handleCheckCoverage() {
    setCoverageStatus("loading");
    try {
      const res = await fetch(import.meta.env.BASE_URL + "data/mock/coverage_ok.json");
      const data = await res.json();
      const passes = data.tracks?.[0]?.dates?.length ?? 0;
      setCoverageStatus({ ok: data.ok, passes, message: data.message });
    } catch {
      setCoverageStatus({ ok: false, passes: 0, message: "Network error — could not check coverage." });
    }
  }

  // ── Analyze zone ──
  async function handleAnalyze() {
    if (!canAnalyze) return;
    setJobStatus("running");
    setJobStep(null);
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    try {
      await fetch(import.meta.env.BASE_URL + "data/mock/job_created.json");
    } catch {
      /* ignore */
    }

    // t=0 — downloading
    const dl = async () => {
      try {
        const data = await (
          await fetch(import.meta.env.BASE_URL + "data/mock/job_downloading.json")
        ).json();
        const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
        setJobStep({
          text: `${data.step} ${data.done} of ${data.total}`,
          pct,
          indeterminate: false,
        });
      } catch {
        setJobStep({ text: "Reading radar pass 4 of 7", pct: 57, indeterminate: false });
      }
    };
    dl();

    // t=3s — processing
    const t1 = setTimeout(async () => {
      try {
        const data = await (
          await fetch(import.meta.env.BASE_URL + "data/mock/job_processing.json")
        ).json();
        setJobStep({ text: data.step + "...", pct: 0, indeterminate: true });
      } catch {
        setJobStep({ text: "Running model...", pct: 0, indeterminate: true });
      }
    }, 3000);
    timeoutsRef.current.push(t1);

    // t=6s — done
    const t2 = setTimeout(async () => {
      try {
        const data = await (
          await fetch(import.meta.env.BASE_URL + "data/mock/job_done.json")
        ).json();

        if (data.state === "failed") {
          setJobStatus("failed");
          setJobStep({ text: data.message, pct: 0, indeterminate: false });
          return;
        }

        setJobStatus("done");
        setJobStep({ text: "✓ Analysis ready", pct: 100, indeterminate: false });

        const name = analysisName.trim() || autoName();
        const result = data.result ?? "/data/sites/souss/";

        setRecentAnalyses((prev) => {
          const entry = { name, time: new Date(), result };
          return [entry, ...prev].slice(0, 5);
        });

        if (onJobResult) onJobResult(result);
      } catch {
        setJobStatus("failed");
        setJobStep({ text: "Analysis failed — check logs.", pct: 0, indeterminate: false });
      }
    }, 6000);
    timeoutsRef.current.push(t2);
  }

  // ── Render ──
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "10px 12px 16px",
        fontFamily: T.sans,
        color: T.text,
        fontSize: 13,
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* Global keyframe injection */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slide {
          0%   { transform: translateX(-150%); }
          50%  { transform: translateX(0%); }
          100% { transform: translateX(350%); }
        }
      `}</style>

      {/* ── 1. Zone size ── */}
      <PanelCard>
        <SectionLabel>Analysis zone</SectionLabel>
        {!dims ? (
          <span style={{ color: T.muted, fontSize: 12 }}>
            Draw a rectangle on the map to select a zone
          </span>
        ) : zoneTooLarge ? (
          <span style={{ color: T.error, fontSize: 12, fontFamily: T.mono }}>
            Zone too large (max 50 × 50 km)
          </span>
        ) : (
          <span style={{ color: T.accent, fontFamily: T.mono, fontSize: 12 }}>
            {dims.wKm} km × {dims.hKm} km
          </span>
        )}
      </PanelCard>

      {/* ── 2. Date pickers ── */}
      <PanelCard>
        <SectionLabel>Date range</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { label: "Start date", value: startDate, setter: setStartDate },
            { label: "End date", value: endDate, setter: setEndDate },
          ].map(({ label, value, setter }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <label
                style={{ fontSize: 11, color: T.muted, fontFamily: T.mono, letterSpacing: "0.04em" }}
              >
                {label}
              </label>
              <input
                type="date"
                value={value}
                min="2026-06-15"
                max={today}
                onChange={(e) => setter(e.target.value)}
                style={{
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  color: T.text,
                  fontFamily: T.mono,
                  fontSize: 12,
                  padding: "5px 8px",
                  outline: "none",
                  colorScheme: "dark",
                  width: "100%",
                }}
              />
            </div>
          ))}
        </div>
      </PanelCard>

      {/* ── 3. Coverage check ── */}
      <PanelCard>
        <SectionLabel>Coverage</SectionLabel>
        <button
          onClick={handleCheckCoverage}
          disabled={coverageStatus === "loading"}
          style={{
            background: coverageStatus === "loading" ? T.border : "rgba(87,241,219,0.12)",
            border: `1px solid ${T.accent}`,
            borderRadius: 6,
            color: T.accent,
            fontFamily: T.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "6px 12px",
            cursor: coverageStatus === "loading" ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "background 0.2s",
          }}
        >
          {coverageStatus === "loading" && <Spinner />}
          Check coverage
        </button>

        {coverageStatus && coverageStatus !== "loading" && (
          <div
            style={{
              fontSize: 12,
              fontFamily: T.mono,
              marginTop: 2,
              color: coverageStatus.ok ? T.accent : T.error,
            }}
          >
            {coverageStatus.ok
              ? `✓ NISAR covers this zone (${coverageStatus.passes} passes)`
              : coverageStatus.message || "Coverage not available for this zone."}
          </div>
        )}
      </PanelCard>

      {/* ── 4. Analyze zone + progress ── */}
      <PanelCard>
        <SectionLabel>Analysis</SectionLabel>

        <input
          type="text"
          placeholder="Analysis name (optional)"
          value={analysisName}
          onChange={(e) => setAnalysisName(e.target.value)}
          style={{
            background: T.deep,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            color: T.text,
            fontFamily: T.sans,
            fontSize: 12,
            padding: "5px 8px",
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
        />

        <button
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          style={{
            background: canAnalyze
              ? "rgba(87,241,219,0.15)"
              : "rgba(87,241,219,0.04)",
            border: `1px solid ${canAnalyze ? T.accent : T.border}`,
            borderRadius: 6,
            color: canAnalyze ? T.accent : T.dim,
            fontFamily: T.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            padding: "7px 14px",
            cursor: canAnalyze ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {jobStatus === "running" && <Spinner />}
          Analyze zone
        </button>

        {/* Progress / status */}
        {jobStep && (
          <div style={{ marginTop: 2 }}>
            <div
              style={{
                fontSize: 12,
                fontFamily: T.mono,
                color:
                  jobStatus === "failed"
                    ? T.error
                    : jobStatus === "done"
                    ? T.accent
                    : T.muted,
              }}
            >
              {jobStep.text}
            </div>
            {jobStatus === "running" && (
              <ProgressBar
                pct={jobStep.pct}
                indeterminate={jobStep.indeterminate}
              />
            )}
            {jobStatus === "done" && (
              <ProgressBar pct={100} indeterminate={false} />
            )}
          </div>
        )}
      </PanelCard>

      {/* ── 5. Recent analyses ── */}
      {recentAnalyses.length > 0 && (
        <PanelCard>
          <SectionLabel>Recent analyses</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentAnalyses.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: T.bg,
                  borderRadius: 7,
                  padding: "7px 10px",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: T.text,
                      fontFamily: T.sans,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: T.dim,
                      fontFamily: T.mono,
                    }}
                  >
                    {item.time.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}{" "}
                    {item.time.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <button
                  onClick={() => onJobResult && onJobResult(item.result)}
                  style={{
                    background: "rgba(87,241,219,0.1)",
                    border: `1px solid ${T.accent}`,
                    borderRadius: 5,
                    color: T.accent,
                    fontFamily: T.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    padding: "3px 10px",
                    cursor: "pointer",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </PanelCard>
      )}
    </div>
  );
}
