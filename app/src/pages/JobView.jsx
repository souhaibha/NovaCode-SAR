import { useState, useEffect } from "react";
import { getJob, IS_MOCK } from "../lib/api";

const STEPS = ["queued", "searching", "downloading", "processing", "predicting", "done"];

export default function JobView({ jobId, onNavigate }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    let active = true;

    async function poll() {
      try {
        const res = await getJob(jobId);
        if (active) {
          setJob(res);
          if (res.status !== "done" && res.status !== "failed") {
            setTimeout(poll, 1500);
          }
        }
      } catch (err) {
        if (active) {
          setError(err.message || String(err));
        }
      }
    }

    poll();

    return () => {
      active = false;
    };
  }, [jobId]);

  const currentStep = job?.status || "queued";
  const stepIdx = STEPS.indexOf(currentStep);

  const resultFolder = job?.folder || job?.result?.folder || null;
  const targetSiteId = resultFolder ? resultFolder.replace(/\/$/, "") : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        background: "#070e1c",
        color: "#dce2f6",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#151b2a",
          borderRadius: 20,
          border: "1px solid rgba(60,74,70,0.5)",
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="material-symbols-outlined" style={{ color: "#57f1db", fontSize: 28 }}>
              radar
            </span>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Processing Job</h2>
          </div>
          {IS_MOCK && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono',monospace",
                color: "#ffb95f",
                background: "rgba(255,185,95,0.15)",
                border: "1px solid rgba(255,185,95,0.4)",
                padding: "2px 8px",
                borderRadius: 12,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Simulated
            </span>
          )}
        </div>

        {/* Job ID info */}
        <div style={{ background: "#0c1321", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(60,74,70,0.3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#859490" }}>Job ID:</span>
          <code style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: "#57f1db" }}>{jobId}</code>
        </div>

        {/* Status progress tracker */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#859490", textTransform: "uppercase" }}>
            Pipeline Status
          </span>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {STEPS.map((s, idx) => {
              const isPast = stepIdx > idx;
              const isCurrent = stepIdx === idx;
              return (
                <div
                  key={s}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: isCurrent ? "rgba(87,241,219,0.15)" : isPast ? "#0c1321" : "#19202e",
                    border: isCurrent ? "1px solid #57f1db" : isPast ? "1px solid rgba(87,241,219,0.3)" : "1px solid rgba(60,74,70,0.2)",
                    color: isCurrent ? "#57f1db" : isPast ? "#bacac5" : "#4a5568",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono',monospace",
                    textTransform: "capitalize",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {isPast ? "check_circle" : isCurrent ? "progress_activity" : "radio_button_unchecked"}
                  </span>
                  <span>{s}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div style={{ color: "#ffb4ab", background: "rgba(255,180,171,0.1)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,180,171,0.3)", fontSize: 12 }}>
            {error}
          </div>
        )}

        {/* Completion action */}
        {currentStep === "done" && targetSiteId && (
          <button
            type="button"
            onClick={() => onNavigate(`/map/${targetSiteId}`)}
            style={{
              padding: "12px 20px",
              borderRadius: 12,
              background: "#57f1db",
              color: "#003731",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 4px 16px rgba(87,241,219,0.25)",
            }}
          >
            <span>Open Analysis Results</span>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
          </button>
        )}

        {/* Back navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid rgba(60,74,70,0.2)" }}>
          <button
            type="button"
            onClick={() => onNavigate("/analyze")}
            style={{
              background: "transparent",
              border: "none",
              color: "#bacac5",
              fontSize: 12,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ← Back to analyze
          </button>
          <button
            type="button"
            onClick={() => onNavigate("/")}
            style={{
              background: "transparent",
              border: "none",
              color: "#859490",
              fontSize: 12,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Return to globe
          </button>
        </div>

      </div>
    </div>
  );
}
