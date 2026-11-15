import { useState, useEffect, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Rectangle, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { coverage, startJob, IS_MOCK } from "../lib/api";
import { boundsToBbox } from "../lib/siteAdapter";
import { useSites } from "../hooks/useSites";
import {
  getRecentAnalyses,
  saveRecentAnalysis,
  clearRecentAnalyses,
  getActiveJobId,
  setActiveJobId,
} from "../lib/recentAnalyses";

const BASEMAP_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const MIN_DATE = "2026-06-15";
const TODAY = new Date().toISOString().split("T")[0];

function computeZoneDimensions(bounds) {
  if (!bounds || bounds.length !== 2) return null;
  const [[south, west], [north, east]] = bounds;
  const midLat = (north + south) / 2;
  const midLatRad = (midLat * Math.PI) / 180;
  const w = Math.abs(east - west) * 111.32 * Math.cos(midLatRad);
  const h = Math.abs(north - south) * 110.57;
  return {
    w,
    h,
    label: `${Math.round(w)} x ${Math.round(h)} km`,
    isTooLarge: w > 50 || h > 50,
  };
}

// ── Two corner click rectangle drawer (no new dependency) ───────────────────
function RectangleDrawer({ bounds, onBoundsChange, isTooLarge }) {
  const map = useMap();
  useEffect(() => {
    window.__leafletMap = map;
  }, [map]);
  const [firstCorner, setFirstCorner] = useState(null);
  const [hoverCorner, setHoverCorner] = useState(null);

  useMapEvents({
    click(e) {
      const latLng = [e.latlng.lat, e.latlng.lng];
      if (!firstCorner) {
        setFirstCorner(latLng);
        setHoverCorner(latLng);
      } else {
        const c1 = firstCorner;
        const c2 = latLng;
        const south = Math.min(c1[0], c2[0]);
        const north = Math.max(c1[0], c2[0]);
        const west = Math.min(c1[1], c2[1]);
        const east = Math.max(c1[1], c2[1]);
        onBoundsChange([[south, west], [north, east]]);
        setFirstCorner(null);
        setHoverCorner(null);
      }
    },
    mousemove(e) {
      if (firstCorner) {
        setHoverCorner([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  const previewBounds = useMemo(() => {
    if (!firstCorner || !hoverCorner) return null;
    const south = Math.min(firstCorner[0], hoverCorner[0]);
    const north = Math.max(firstCorner[0], hoverCorner[0]);
    const west = Math.min(firstCorner[1], hoverCorner[1]);
    const east = Math.max(firstCorner[1], hoverCorner[1]);
    return [[south, west], [north, east]];
  }, [firstCorner, hoverCorner]);

  const activeBounds = previewBounds || bounds;

  if (!activeBounds) return null;

  return (
    <Rectangle
      bounds={activeBounds}
      pathOptions={{
        color: isTooLarge ? "#ffb4ab" : "#57f1db",
        weight: 2,
        dashArray: previewBounds ? "4, 4" : undefined,
        fillColor: isTooLarge ? "#ffb4ab" : "#57f1db",
        fillOpacity: 0.18,
      }}
    />
  );
}

export default function Analyze({ onNavigate }) {
  const { sites } = useSites();

  const [activeTab, setActiveTab] = useState("analyze"); // "analyze" | "demo"

  // Drawing state
  const [bounds, setBounds] = useState(null);

  // Dates state
  const [startDate, setStartDate] = useState("2026-06-15");
  const [endDate, setEndDate] = useState("2026-08-31");

  // Advanced settings state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [earthquakeDate, setEarthquakeDate] = useState("");
  const [selectedTrackFrame, setSelectedTrackFrame] = useState("");

  // Coverage state
  const [isCheckingCoverage, setIsCheckingCoverage] = useState(false);
  const [coverageResult, setCoverageResult] = useState(null);
  const [coverageError, setCoverageError] = useState(null);

  // Job launch state
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [jobError, setJobError] = useState(null);

  // Recent analyses and active job (Requirements 5 & 7)
  const [recentAnalyses, setRecentAnalyses] = useState(() => getRecentAnalyses());
  const [activeJobId, setActiveJobIdState] = useState(() => getActiveJobId());

  // Dimensions
  const dims = useMemo(() => computeZoneDimensions(bounds), [bounds]);
  const isTooLarge = dims?.isTooLarge ?? false;

  // ── Date validations (Requirement 4) ───────────────────────────────────────
  const dateValidation = useMemo(() => {
    if (!startDate || !endDate) {
      return { valid: false, message: "Please select start and end dates." };
    }
    if (startDate < MIN_DATE) {
      return { valid: false, message: `Start date must be ${MIN_DATE} or later.` };
    }
    if (endDate > TODAY) {
      return { valid: false, message: "End date cannot be in the future." };
    }
    if (startDate >= endDate) {
      return { valid: false, message: "Start date must be before end date." };
    }
    return { valid: true, message: null };
  }, [startDate, endDate]);

  // Check coverage action
  const handleCheckCoverage = useCallback(async () => {
    if (!bounds || isTooLarge || !dateValidation.valid) return;

    setIsCheckingCoverage(true);
    setCoverageError(null);
    setCoverageResult(null);
    setSelectedTrackFrame("");

    try {
      const bbox = boundsToBbox(bounds);
      const res = await coverage(bbox, startDate, endDate);
      if (res && res.ok) {
        setCoverageResult(res);
      } else {
        setCoverageError(
          (res?.message || "No satellite passes found for this region.") +
          " Try a longer period or a different area."
        );
      }
    } catch (err) {
      setCoverageError(
        (err.message || String(err)) + " Try a longer period or a different area."
      );
    } finally {
      setIsCheckingCoverage(false);
    }
  }, [bounds, isTooLarge, dateValidation, startDate, endDate]);

  // Start job action
  const handleStartJob = useCallback(async () => {
    if (!bounds || isTooLarge || !dateValidation.valid || !coverageResult?.ok) return;

    setIsStartingJob(true);
    setJobError(null);

    try {
      const payload = {
        bbox: boundsToBbox(bounds),
        start: startDate,
        end: endDate,
      };

      if (selectedTrackFrame) {
        const [t, f] = selectedTrackFrame.split(",").map(Number);
        if (!isNaN(t) && !isNaN(f)) {
          payload.track = t;
          payload.frame = f;
        }
      }

      if (earthquakeDate) {
        payload.earthquake_date = earthquakeDate;
      }

      const res = await startJob(payload);
      if (res && res.id) {
        // Requirement 5 & 7: Keep job id in localStorage and recent analyses
        setActiveJobId(res.id);
        const name = `Zone ${startDate} to ${endDate}`;
        saveRecentAnalysis({
          id: res.id,
          name,
          bbox: payload.bbox,
          start: startDate,
          end: endDate,
          folder: res.folder || (IS_MOCK ? "kampong_cham/" : null),
        });
        setRecentAnalyses(getRecentAnalyses());
        onNavigate(`/job/${res.id}`);
      } else {
        throw new Error(res?.message || "Failed to start analysis job");
      }
    } catch (err) {
      setJobError(err.message || String(err));
      setIsStartingJob(false);
    }
  }, [bounds, isTooLarge, dateValidation, coverageResult, startDate, endDate, selectedTrackFrame, earthquakeDate, onNavigate]);

  const canCheckCoverage = Boolean(bounds && !isTooLarge && dateValidation.valid);
  const canStartJob = Boolean(canCheckCoverage && coverageResult?.ok && !isStartingJob);

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", background: "#0c1321", color: "#dce2f6", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* ── Left Sidebar (Tabs: Analyze a zone / Demo zones) ── */}
      <aside
        style={{
          width: 360,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: "#151b2a",
          borderRight: "1px solid rgba(60,74,70,0.35)",
          zIndex: 20,
          overflowY: "auto",
        }}
      >
        {/* Header / Brand */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(60,74,70,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => onNavigate("/")}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid rgba(60,74,70,0.4)",
                background: "#19202e",
                color: "#dce2f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              title="Back to globe"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
            </button>
            <h1 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#dce2f6" }}>
              SARdance Analyze
            </h1>
          </div>

          {/* Simulated mock badge (Requirement 1) */}
          {IS_MOCK && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono',monospace",
                fontWeight: 700,
                color: "#ffb95f",
                background: "rgba(255,185,95,0.15)",
                border: "1px solid rgba(255,185,95,0.4)",
                padding: "2px 8px",
                borderRadius: 12,
                textTransform: "uppercase",
              }}
            >
              Simulated
            </span>
          )}
        </div>

        {/* Navigation Tabs (Requirement 2 & 7) */}
        <div style={{ display: "flex", padding: "8px 12px", gap: 6, borderBottom: "1px solid rgba(60,74,70,0.2)" }}>
          <button
            type="button"
            onClick={() => setActiveTab("analyze")}
            style={{
              flex: 1,
              padding: "7px 6px",
              borderRadius: 8,
              border: activeTab === "analyze" ? "1px solid #57f1db" : "1px solid rgba(60,74,70,0.3)",
              background: activeTab === "analyze" ? "rgba(87,241,219,0.12)" : "#0c1321",
              color: activeTab === "analyze" ? "#57f1db" : "#bacac5",
              fontWeight: activeTab === "analyze" ? 700 : 500,
              fontSize: 11.5,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Analyze zone
          </button>
          <button
            type="button"
            onClick={() => {
              setRecentAnalyses(getRecentAnalyses());
              setActiveTab("recent");
            }}
            style={{
              flex: 1,
              padding: "7px 6px",
              borderRadius: 8,
              border: activeTab === "recent" ? "1px solid #57f1db" : "1px solid rgba(60,74,70,0.3)",
              background: activeTab === "recent" ? "rgba(87,241,219,0.12)" : "#0c1321",
              color: activeTab === "recent" ? "#57f1db" : "#bacac5",
              fontWeight: activeTab === "recent" ? 700 : 500,
              fontSize: 11.5,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <span>Recent</span>
            {recentAnalyses.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono',monospace",
                  background: activeTab === "recent" ? "#57f1db" : "#19202e",
                  color: activeTab === "recent" ? "#003731" : "#bacac5",
                  padding: "1px 5px",
                  borderRadius: 8,
                  fontWeight: 700,
                }}
              >
                {recentAnalyses.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("demo")}
            style={{
              flex: 1,
              padding: "7px 6px",
              borderRadius: 8,
              border: activeTab === "demo" ? "1px solid #57f1db" : "1px solid rgba(60,74,70,0.3)",
              background: activeTab === "demo" ? "rgba(87,241,219,0.12)" : "#0c1321",
              color: activeTab === "demo" ? "#57f1db" : "#bacac5",
              fontWeight: activeTab === "demo" ? 700 : 500,
              fontSize: 11.5,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Demo zones
          </button>
        </div>

        {/* Active Job Alert banner */}
        {activeJobId && (
          <div
            style={{
              margin: "10px 16px 0",
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(87,241,219,0.1)",
              border: "1px solid rgba(87,241,219,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#57f1db", animation: "spin 3s linear infinite" }}>
                progress_activity
              </span>
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#57f1db" }}>Job in progress</span>
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "#bacac5", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                  {activeJobId}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(`/job/${activeJobId}`)}
              style={{
                background: "#57f1db",
                color: "#003731",
                border: "none",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Resume
            </button>
          </div>
        )}

        {/* ── TAB 1: ANALYZE A ZONE ── */}
        {activeTab === "analyze" && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Zone selection card */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 10, background: "#0c1321", border: "1px solid rgba(60,74,70,0.3)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#859490", textTransform: "uppercase" }}>
                  1. Area of Interest
                </span>
                {bounds && (
                  <button
                    type="button"
                    onClick={() => { setBounds(null); setCoverageResult(null); }}
                    style={{ background: "transparent", border: "none", color: "#ffb4ab", fontSize: 11, cursor: "pointer", padding: 0 }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {!bounds ? (
                <div style={{ fontSize: 12, color: "#bacac5", lineHeight: 1.5 }}>
                  Click two opposite corners on the map to define a rectangle.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#dce2f6" }}>Zone size</span>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 12,
                        fontWeight: 700,
                        color: isTooLarge ? "#ffb4ab" : "#57f1db",
                      }}
                    >
                      {dims.label}
                    </span>
                  </div>

                  {isTooLarge ? (
                    <span style={{ fontSize: 11, color: "#ffb4ab", fontWeight: 600 }}>
                      Zone too large; the limit is 50 x 50 km
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: "#57f1db" }}>
                      ✓ Within NISAR processing limits
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Dates card (Requirement 4) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 10, background: "#0c1321", border: "1px solid rgba(60,74,70,0.3)" }}>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#859490", textTransform: "uppercase" }}>
                2. Target Period
              </span>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#dce2f6" }}>
                  <span>Start date (from 15 Jun 2026)</span>
                  <input
                    type="date"
                    min={MIN_DATE}
                    max={TODAY}
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setCoverageResult(null); }}
                    style={{
                      background: "#151b2a",
                      color: "#57f1db",
                      border: "1px solid rgba(60,74,70,0.4)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono',monospace",
                      colorScheme: "dark",
                    }}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#dce2f6" }}>
                  <span>End date (up to today)</span>
                  <input
                    type="date"
                    min={MIN_DATE}
                    max={TODAY}
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setCoverageResult(null); }}
                    style={{
                      background: "#151b2a",
                      color: "#57f1db",
                      border: "1px solid rgba(60,74,70,0.4)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono',monospace",
                      colorScheme: "dark",
                    }}
                  />
                </label>

                {!dateValidation.valid && (
                  <span style={{ fontSize: 11, color: "#ffb4ab", lineHeight: 1.3 }}>
                    {dateValidation.message}
                  </span>
                )}
              </div>
            </div>

            {/* Advanced settings (Requirement 5: collapsed by default) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 10, background: "#0c1321", border: "1px solid rgba(60,74,70,0.3)" }}>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "transparent",
                  border: "none",
                  color: "#dce2f6",
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono',monospace",
                  cursor: "pointer",
                  padding: 0,
                  textTransform: "uppercase",
                }}
              >
                <span>3. Advanced Settings</span>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {showAdvanced ? "expand_less" : "expand_more"}
                </span>
              </button>

              {showAdvanced && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6, borderTop: "1px solid rgba(60,74,70,0.2)" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#dce2f6" }}>
                    <span>Optional earthquake date</span>
                    <input
                      type="date"
                      value={earthquakeDate}
                      onChange={(e) => setEarthquakeDate(e.target.value)}
                      style={{
                        background: "#151b2a",
                        color: "#57f1db",
                        border: "1px solid rgba(60,74,70,0.4)",
                        borderRadius: 6,
                        padding: "5px 8px",
                        fontSize: 11,
                        fontFamily: "'JetBrains Mono',monospace",
                        colorScheme: "dark",
                      }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#dce2f6" }}>
                    <span>Track / Frame selection</span>
                    <select
                      value={selectedTrackFrame}
                      onChange={(e) => setSelectedTrackFrame(e.target.value)}
                      disabled={!coverageResult?.tracks?.length}
                      style={{
                        background: "#151b2a",
                        color: "#dce2f6",
                        border: "1px solid rgba(60,74,70,0.4)",
                        borderRadius: 6,
                        padding: "5px 8px",
                        fontSize: 11,
                        fontFamily: "'JetBrains Mono',monospace",
                        cursor: coverageResult?.tracks?.length ? "pointer" : "not-allowed",
                      }}
                    >
                      <option value="">Automatic (recommended)</option>
                      {coverageResult?.tracks?.map((t) => (
                        <option key={`${t.track},${t.frame}`} value={`${t.track},${t.frame}`}>
                          Track {t.track} / Frame {t.frame} ({t.direction}, {t.dates?.length || t.count} dates)
                        </option>
                      ))}
                    </select>
                    {!coverageResult && (
                      <span style={{ fontSize: 10, color: "#859490" }}>
                        Check coverage to see available track/frame options.
                      </span>
                    )}
                  </label>
                </div>
              )}
            </div>

            {/* Check coverage button (Requirement 6) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={handleCheckCoverage}
                disabled={!canCheckCoverage || isCheckingCoverage}
                style={{
                  padding: "9px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(60,74,70,0.5)",
                  background: canCheckCoverage ? "#19202e" : "#0c1321",
                  color: canCheckCoverage ? "#57f1db" : "#859490",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: canCheckCoverage && !isCheckingCoverage ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {isCheckingCoverage ? "progress_activity" : "radar"}
                </span>
                <span>{isCheckingCoverage ? "Checking coverage…" : "Check coverage"}</span>
              </button>

              {/* Coverage error message */}
              {coverageError && (
                <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,180,171,0.1)", border: "1px solid rgba(255,180,171,0.3)", color: "#ffb4ab", fontSize: 11, lineHeight: 1.4 }}>
                  {coverageError}
                </div>
              )}

              {/* Coverage tracks list */}
              {coverageResult?.ok && coverageResult.tracks && (
                <div style={{ padding: 10, borderRadius: 8, background: "#0c1321", border: "1px solid rgba(87,241,219,0.3)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#57f1db", fontSize: 11, fontWeight: 700 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                    <span>NISAR passes found ({coverageResult.tracks.length} tracks):</span>
                  </div>
                  {coverageResult.tracks.map((t) => (
                    <div key={`${t.track}-${t.frame}`} style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#dce2f6", display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(60,74,70,0.15)" }}>
                      <span>Track {t.track} / F{t.frame} ({t.direction})</span>
                      <strong style={{ color: "#57f1db" }}>{t.dates?.length || t.count} dates</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Launch analyze job button (Requirement 7) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto", paddingTop: 10 }}>
              <button
                type="button"
                onClick={handleStartJob}
                disabled={!canStartJob}
                style={{
                  padding: "11px 16px",
                  borderRadius: 12,
                  border: "none",
                  background: canStartJob ? "#57f1db" : "#19202e",
                  color: canStartJob ? "#003731" : "#859490",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: canStartJob ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: canStartJob ? "0 2px 10px rgba(87,241,219,0.2)" : "none",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {isStartingJob ? "progress_activity" : "play_arrow"}
                </span>
                <span>{isStartingJob ? "Launching analysis…" : "Analyze zone"}</span>
              </button>

              {jobError && (
                <div style={{ color: "#ffb4ab", fontSize: 11, textAlign: "center" }}>
                  {jobError}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── TAB: RECENT ANALYSES (Requirement 7) ── */}
        {activeTab === "recent" && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#859490", textTransform: "uppercase" }}>
                Saved analyses ({recentAnalyses.length})
              </span>
              {recentAnalyses.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearRecentAnalyses();
                    setRecentAnalyses([]);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#ffb4ab",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono',monospace",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Clear all
                </button>
              )}
            </div>

            {recentAnalyses.length === 0 ? (
              <div
                style={{
                  padding: "24px 16px",
                  borderRadius: 10,
                  background: "#0c1321",
                  border: "1px solid rgba(60,74,70,0.3)",
                  textAlign: "center",
                  color: "#859490",
                  fontSize: 12,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#4a5568" }}>
                  history
                </span>
                <span>No recent analyses saved yet. Launch an analysis from "Analyze zone" to review it here.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentAnalyses.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onNavigate(`/map/${item.id}`)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#0c1321",
                      border: "1px solid rgba(60,74,70,0.3)",
                      cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#57f1db";
                      e.currentTarget.style.background = "#19202e";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(60,74,70,0.3)";
                      e.currentTarget.style.background = "#0c1321";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#dce2f6" }}>
                        {item.name}
                      </span>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#57f1db" }}>
                        arrow_forward
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, fontFamily: "'JetBrains Mono',monospace", color: "#859490" }}>
                      <span>ID: {item.id}</span>
                    </div>

                    {item.start && item.end && (
                      <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#bacac5" }}>
                        {item.start} → {item.end}
                      </div>
                    )}

                    {Array.isArray(item.bbox) && (
                      <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "#4a5568" }}>
                        Bbox: [{item.bbox.map((v) => Number(v).toFixed(2)).join(", ")}]
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: DEMO ZONES (Requirement 8) ── */}
        {activeTab === "demo" && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#859490", textTransform: "uppercase" }}>
              Pre-processed Demo Sites
            </span>
            <p style={{ fontSize: 12, color: "#bacac5", margin: "0 0 6px", lineHeight: 1.4 }}>
              Click any verified site to explore ready-to-view NISAR change maps. Works offline without a backend.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sites.map((s) => (
                <div
                  key={s.site}
                  onClick={() => onNavigate(`/map/${s.site}`)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "#0c1321",
                    border: "1px solid rgba(60,74,70,0.3)",
                    cursor: "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#57f1db";
                    e.currentTarget.style.background = "#19202e";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(60,74,70,0.3)";
                    e.currentTarget.style.background = "#0c1321";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#dce2f6" }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "#57f1db", background: "rgba(87,241,219,0.1)", padding: "1px 6px", borderRadius: 4 }}>
                      {s.event}
                    </span>
                  </div>
                  {s.event_date && (
                    <span style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono',monospace", color: "#859490" }}>
                      Event: {s.event_date}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </aside>

      {/* ── Main Map Canvas with Rectangle Drawer ── */}
      <main style={{ flex: 1, position: "relative", height: "100%", minWidth: 0, background: "#070e1c" }}>
        <MapContainer
          center={[25, 0]}
          zoom={3}
          style={{ width: "100%", height: "100%", background: "#070e1c" }}
        >
          <TileLayer url={BASEMAP_URL} maxZoom={18} />
          <RectangleDrawer
            bounds={bounds}
            onBoundsChange={(b) => {
              setBounds(b);
              setCoverageResult(null);
            }}
            isTooLarge={isTooLarge}
          />
        </MapContainer>

        {/* Interactive drawing guide overlay */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(21,27,42,0.92)",
            border: "1px solid rgba(60,74,70,0.5)",
            borderRadius: 12,
            padding: "8px 16px",
            fontSize: 12,
            fontFamily: "'JetBrains Mono',monospace",
            color: "#dce2f6",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#57f1db" }}>
            draw
          </span>
          <span>
            {!bounds
              ? "Click two opposite corners on the map to define a zone"
              : `Selected area: ${dims?.label || ""} — click again to redraw`}
          </span>
        </div>
      </main>

    </div>
  );
}
