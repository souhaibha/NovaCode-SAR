import { useState, useEffect, useRef } from "react";
import { getJob, IS_MOCK } from "../lib/api";
import { setActiveJobId, saveRecentAnalysis, getRecentAnalyses } from "../lib/recentAnalyses";

const STAGES = [
  { key: "queued", label: "Queued", desc: "Waiting in processing queue…" },
  { key: "searching", label: "Searching", desc: "Querying NISAR catalog for radar acquisitions…" },
  { key: "downloading", label: "Downloading", desc: "Fetching radar granules from archive…" },
  { key: "processing", label: "Processing", desc: "Calibrating and co-registering radar scenes…" },
  { key: "predicting", label: "Predicting", desc: "Detecting surface changes and computing deformation…" },
  { key: "done", label: "Done", desc: "Analysis complete." },
];

export default function JobView({ jobId, onNavigate }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [isFailed, setIsFailed] = useState(false);
  const hasNavigatedRef = useRef(false);

  // Keep job id in localStorage (Requirement 5)
  useEffect(() => {
    if (jobId) {
      setActiveJobId(jobId);
    }
  }, [jobId]);

  // Polling loop: every 5 to 10s, stops on done or failed (Requirement 1 & 2)
  useEffect(() => {
    if (!jobId) return;

    let active = true;
    let timerId = null;

    async function poll() {
      try {
        const res = await getJob(jobId);
        if (!active) return;

        setJob(res);

        const status = (res?.status || "").toLowerCase();

        // Treat status "failed" AND "error" as failure (Requirement 2)
        if (status === "failed" || status === "error") {
          setIsFailed(true);
          setError(res.message || res.error || "Analysis failed");
          setActiveJobId(null);
          return; // stop polling
        }

        if (status === "done") {
          setActiveJobId(null);
          // Save finished job folder to recent analyses
          const recents = getRecentAnalyses();
          const existing = recents.find((r) => r.id === jobId);
          saveRecentAnalysis({
            id: jobId,
            name: existing?.name || `Zone ${jobId.slice(-6)}`,
            bbox: existing?.bbox || null,
            start: existing?.start || null,
            end: existing?.end || null,
            folder: res.folder || res.result?.folder || "kampong_cham/",
          });

          // Requirement 6: On done, navigate to #/map/<id> (the viewer from P1-P3)
          if (!hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            setTimeout(() => {
              if (active) {
                onNavigate(`/map/${jobId}`);
              }
            }, 600);
          }
          return; // stop polling
        }

        // Poll every 5 to 10s (using 5000ms)
        timerId = setTimeout(poll, 5000);
      } catch (err) {
        if (!active) return;
        const msg = err.message || String(err);
        setError(msg);
        setIsFailed(true);
        setActiveJobId(null);
      }
    }

    poll();

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [jobId, onNavigate]);

  const currentStatus = (job?.status || "queued").toLowerCase();
  const currentStageIndex = STAGES.findIndex((s) => s.key === currentStatus);
  const activeStage = STAGES[Math.max(0, currentStageIndex)] || STAGES[0];

  // Failure message inspection (Requirement 2 & 4)
  const failureMessage = error || job?.message || job?.error || "An unexpected error occurred.";
  const isPassesError = /usable passes/i.test(failureMessage);
  const isLostJob = /lost|unknown job/i.test(failureMessage);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100vw",
        background: "#070e1c",
        color: "#dce2f6",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          background: "#151b2a",
          borderRadius: 20,
          border: "1px solid rgba(60,74,70,0.5)",
          padding: 36,
          display: "flex",
          flexDirection: "column",
          gap: 28,
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Card Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              className="material-symbols-outlined"
              style={{
                color: isFailed ? "#ffb4ab" : currentStatus === "done" ? "#57f1db" : "#57f1db",
                fontSize: 32,
              }}
            >
              {isFailed ? "error" : "radar"}
            </span>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#dce2f6" }}>
                {isFailed ? "Analysis Failed" : currentStatus === "done" ? "Analysis Ready" : "Processing SAR Analysis"}
              </h2>
              <span style={{ fontSize: 11, color: "#859490", fontFamily: "'JetBrains Mono',monospace" }}>
                Job ID: {jobId}
              </span>
            </div>
          </div>

          {IS_MOCK && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono',monospace",
                color: "#ffb95f",
                background: "rgba(255,185,95,0.15)",
                border: "1px solid rgba(255,185,95,0.4)",
                padding: "3px 10px",
                borderRadius: 12,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Simulated
            </span>
          )}
        </div>

        {/* ── Active Pipeline Stage Bar (Requirement 1) ── */}
        {!isFailed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Stage Bar */}
            <div style={{ position: "relative", padding: "10px 4px 4px" }}>
              {/* Connecting background track */}
              <div
                style={{
                  position: "absolute",
                  top: 24,
                  left: 24,
                  right: 24,
                  height: 3,
                  background: "#19202e",
                  zIndex: 1,
                }}
              />
              {/* Active filled track */}
              <div
                style={{
                  position: "absolute",
                  top: 24,
                  left: 24,
                  width: `${Math.max(0, Math.min(100, (currentStageIndex / (STAGES.length - 1)) * 100))}%`,
                  height: 3,
                  background: "#57f1db",
                  transition: "width 0.4s ease",
                  zIndex: 2,
                }}
              />

              {/* Stage nodes */}
              <div style={{ display: "flex", justifyContent: "space-between", position: "relative", zIndex: 3 }}>
                {STAGES.map((s, idx) => {
                  const isPast = currentStageIndex > idx;
                  const isCurrent = currentStageIndex === idx;

                  let nodeBg = "#151b2a";
                  let nodeBorder = "rgba(60,74,70,0.5)";
                  let nodeColor = "#4a5568";

                  if (isPast) {
                    nodeBg = "#57f1db";
                    nodeBorder = "#57f1db";
                    nodeColor = "#003731";
                  } else if (isCurrent) {
                    nodeBg = "#151b2a";
                    nodeBorder = "#57f1db";
                    nodeColor = "#57f1db";
                  }

                  return (
                    <div
                      key={s.key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 48,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: nodeBg,
                          border: `2px solid ${nodeBorder}`,
                          color: nodeColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.3s ease",
                        }}
                      >
                        {isPast ? (
                          <span className="material-symbols-outlined" style={{ fontSize: 16, fontWeight: 700 }}>
                            check
                          </span>
                        ) : isCurrent ? (
                          <span
                            className="material-symbols-outlined"
                            style={{
                              fontSize: 14,
                              animation: "spin 2s linear infinite",
                            }}
                          >
                            progress_activity
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>{idx + 1}</span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "'JetBrains Mono',monospace",
                          fontWeight: isCurrent ? 700 : 500,
                          color: isCurrent ? "#57f1db" : isPast ? "#bacac5" : "#4a5568",
                          textTransform: "capitalize",
                          textAlign: "center",
                        }}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Current step text and duration banner (Requirement 1: show step text and "usually about 15 minutes", NO percentage) */}
            <div
              style={{
                background: "#0c1321",
                padding: "16px 20px",
                borderRadius: 12,
                border: "1px solid rgba(60,74,70,0.35)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono',monospace",
                    color: "#859490",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Current stage
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono',monospace",
                    color: "#ffb95f",
                    fontWeight: 600,
                  }}
                >
                  usually about 15 minutes
                </span>
              </div>
              <div style={{ fontSize: 14, color: "#dce2f6", fontWeight: 600, lineHeight: 1.5 }}>
                {activeStage.desc}
              </div>
            </div>

            {/* Action when done (auto-navigating, but clickable if not redirected) */}
            {currentStatus === "done" && (
              <button
                type="button"
                onClick={() => onNavigate(`/map/${jobId}`)}
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
                  boxShadow: "0 4px 16px rgba(87,241,219,0.3)",
                }}
              >
                <span>Open Analysis Results</span>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  arrow_forward
                </span>
              </button>
            )}
          </div>
        ) : (
          /* ── Failure View (Requirement 2 & 4: NO link to a map, Try again button, passes hint) ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "rgba(255,180,171,0.08)",
                border: "1px solid rgba(255,180,171,0.35)",
                borderRadius: 12,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: "#ffb4ab", fontSize: 22, marginTop: 1 }}>
                  error_outline
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#ffb4ab" }}>
                    Analysis could not be completed
                  </span>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#dce2f6",
                      lineHeight: 1.5,
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {failureMessage}
                  </p>
                </div>
              </div>

              {/* Requirement 2: For "Only N usable passes" suggest choosing another track/frame */}
              {isPassesError && (
                <div
                  style={{
                    marginTop: 4,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(255,185,95,0.12)",
                    border: "1px solid rgba(255,185,95,0.35)",
                    fontSize: 12,
                    color: "#ffb95f",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    lightbulb
                  </span>
                  <span>Try choosing another track/frame from the coverage list.</span>
                </div>
              )}

              {/* Requirement 4: 404 lost job hint */}
              {isLostJob && (
                <div
                  style={{
                    marginTop: 4,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(87,241,219,0.08)",
                    border: "1px solid rgba(87,241,219,0.25)",
                    fontSize: 12,
                    color: "#57f1db",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    history
                  </span>
                  <span>Check Recent analyses on the Analyze screen to reopen previous results.</span>
                </div>
              )}
            </div>

            {/* Try again button (Requirement 2: Try again button and NO link to a map) */}
            <button
              type="button"
              onClick={() => onNavigate("/analyze")}
              style={{
                padding: "12px 20px",
                borderRadius: 12,
                background: "#19202e",
                color: "#dce2f6",
                fontWeight: 700,
                fontSize: 13,
                border: "1px solid rgba(60,74,70,0.5)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "background 0.2s ease",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                refresh
              </span>
              <span>Try again</span>
            </button>
          </div>
        )}

        {/* Footer Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 12,
            borderTop: "1px solid rgba(60,74,70,0.25)",
          }}
        >
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
