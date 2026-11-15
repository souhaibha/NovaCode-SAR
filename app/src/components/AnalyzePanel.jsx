import { useState, useEffect, useRef } from "react";
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
  return `Analyse ${now.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  })} ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
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
  queued: "Initialisation",
  searching: "Recherche des orbites NISAR",
  downloading: "Acquisition des données radar",
  processing: "Traitement géométrique & masque",
  predicting: "Exécution du modèle IA multi-classes",
  done: "Analyse terminée avec succès",
  failed: "Échec de l'analyse",
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

export default function AnalyzePanel({
  bbox: rawBbox = null,
  drawing = false,
  isDrawing = false,
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

  const [startDate, setStartDate] = useState("2026-06-15");
  const [endDate, setEndDate] = useState(today > "2026-06-15" ? today : "2026-11-15");
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
      ? "La couverture NISAR débute le 15 juin 2026."
      : startDate >= endDate
      ? "La date de début doit être antérieure à la date de fin."
      : null;
  const zoneBody = bbox
    ? { bbox: bbox.map((v) => Math.round(v * 1e5) / 1e5), start: startDate, end: endDate }
    : null;
  const running = Boolean(job) && !["done", "failed"].includes(jobState?.state);
  const coverageReady = coverage && coverage !== "loading";
  const canCheck = bbox && !zoneTooLarge && !dateProblem && coverage !== "loading";
  const canAnalyze =
    bbox && !zoneTooLarge && !dateProblem && trackKey && !running;

  // A new zone or new dates automatically check NISAR orbit coverage
  const bboxKey = bbox ? bbox.join(",") : "";
  useEffect(() => {
    if (bbox && !zoneTooLarge && !dateProblem) {
      handleCheckCoverage();
    } else {
      setCoverage(null);
      setTrackKey("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bboxKey, startDate, endDate]);

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
      setJobState({ state: "queued", step: "Démarrage" });
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
      <PanelCard style={{ border: "1px solid rgba(87,241,219,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: T.accent,
              boxShadow: "0 0 8px #57f1db",
            }}
          />
          <SectionLabel>
            Pipeline IA NISAR & Token Earthdata
          </SectionLabel>
        </div>
        <span style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>
          Moteur d'analyse prêt avec le token NASA Earthdata <code style={{ color: T.accent }}>yassover2099</code>. Modèle Random Forest multi-classes (multi_model.joblib) opérationnel.
        </span>
      </PanelCard>

      {/* 1. Zone */}
      <PanelCard>
        <SectionLabel>1 · Zone d'analyse</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => triggerDraw?.()}
            disabled={activeDrawing || running}
            style={buttonStyle(!activeDrawing && !running)}
          >
            {activeDrawing ? "Tracé en cours… cliquez 2 coins" : bbox ? "Redessiner la zone" : "Tracer une zone sur la carte"}
          </button>
          {bbox && !running && (
            <button onClick={() => triggerCancel?.()} style={buttonStyle(true)}>
              Effacer
            </button>
          )}
        </div>
        {!bbox && !activeDrawing && (
          <span style={{ color: T.dim, fontSize: 11 }}>
            Cliquez sur "Tracer une zone", puis cliquez sur deux coins opposés sur la carte.
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
                  Zone trop étendue ({dims.wKm} × {dims.hKm} km) ; la limite NISAR est de 50 × 50 km.
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
                  ⚡ Ajuster automatiquement à 35 × 35 km
                </button>
              </div>
            )}
            <span style={{ color: T.dim, fontFamily: T.mono, fontSize: 10, lineHeight: 1.5 }}>
              O {bbox[0].toFixed(4)} · S {bbox[1].toFixed(4)} · E {bbox[2].toFixed(4)} · N {bbox[3].toFixed(4)}
            </span>
          </>
        )}
      </PanelCard>

      {/* 2. Dates */}
      <PanelCard>
        <SectionLabel>2 · Période temporelle</SectionLabel>
        {[
          ["Date de début", startDate, setStartDate],
          ["Date de fin", endDate, setEndDate],
        ].map(([label, value, setter]) => (
          <label key={label} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: T.muted, fontFamily: T.mono }}>
            {label}
            <input type="date" value={value} min="2026-06-15" onChange={(e) => setter(e.target.value)} style={inputStyle} />
          </label>
        ))}
        {dateProblem && <span style={{ color: T.error, fontSize: 11, fontFamily: T.mono }}>{dateProblem}</span>}
        <details style={{ fontSize: 11, color: T.muted }}>
          <summary style={{ cursor: "pointer", fontFamily: T.mono }}>Séisme (optionnel)</summary>
          <label style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, fontFamily: T.mono }}>
            Date de l'événement sismique (active l'interférométrie)
            <input type="date" value={quakeDate} min={startDate} max={endDate} onChange={(e) => setQuakeDate(e.target.value)} style={inputStyle} />
          </label>
        </details>
      </PanelCard>

      {/* 3. Coverage */}
      <PanelCard>
        <SectionLabel>3 · Couverture satellite NISAR</SectionLabel>
        <button onClick={handleCheckCoverage} disabled={!canCheck} style={buttonStyle(Boolean(canCheck))}>
          {coverage === "loading" && <Spinner />}
          Vérifier la couverture NISAR
        </button>
        {!bbox && <span style={{ color: T.dim, fontSize: 11 }}>Sélectionnez ou tracez une zone d'abord.</span>}
        {coverageReady && !coverage.ok && (
          <span style={{ color: T.error, fontSize: 12 }}>
            Aucune orbite NISAR ne comporte au moins 4 passages sur cette zone durant cette période. Élargissez la période.
          </span>
        )}
        {coverageReady && coverage.ok && (() => {
          const chosen = coverage.tracks.find((t) => `${t.track}/${t.frame}` === trackKey);
          return chosen ? (
            <span style={{ fontSize: 12, color: T.accent, fontFamily: T.mono }}>
              ✓ Trace {chosen.track}, cadre {chosen.frame} ({(chosen.direction || "").toLowerCase()}) : {chosen.dates.length} passages radar, du{" "}
              {chosen.dates[0]} au {chosen.dates[chosen.dates.length - 1]}
            </span>
          ) : null;
        })()}
        {coverageReady && coverage.ok && (
          <details style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <summary style={{ fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.mono }}>
              Avancé : choisir une autre orbite radar ({coverage.tracks.filter((t) => t.dates.length >= 4).length} disponibles)
            </summary>
            {coverage.tracks
              .filter((t) => t.dates.length >= 4)
              .map((t) => {
                const key = `${t.track}/${t.frame}`;
                return (
                  <label key={key} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11, fontFamily: T.mono, color: T.text, cursor: "pointer" }}>
                    <input type="radio" name="track" checked={trackKey === key} onChange={() => setTrackKey(key)} />
                    <span>
                      Trace {t.track}, cadre {t.frame} ({(t.direction || "").toLowerCase()}) : {t.dates.length} dates exploitables
                      {t.single_pol_passes > 0 ? ` (${t.single_pol_passes} simple polarimétrie)` : ""}
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
        <SectionLabel>4 · Lancer l'analyse IA</SectionLabel>
        <input
          type="text"
          placeholder="Nom personnalisé de l'analyse (optionnel)"
          value={analysisName}
          onChange={(e) => setAnalysisName(e.target.value)}
          style={{ ...inputStyle, fontFamily: T.sans }}
        />
        <div style={{ fontSize: 10, color: T.accent, fontFamily: T.mono, display: "flex", alignItems: "center", gap: 5 }}>
          <span>✓ Authentification NASA & IA intégrée</span>
        </div>
        <button onClick={handleAnalyze} disabled={!canAnalyze} style={buttonStyle(Boolean(canAnalyze), true)}>
          {running && <Spinner />}
          Lancer l'analyse du modèle
        </button>
        {job && (
          <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 12, fontFamily: T.mono, color: jobState?.state === "failed" ? T.error : jobState?.state === "done" ? T.accent : T.muted }}>
              {STAGE_LABEL[jobState?.state] || "En cours"}
              {jobState?.step && jobState.state !== "failed" ? ` : ${jobState.step}` : ""}
            </span>
            {jobState?.state === "failed" ? (
              <>
                <span style={{ fontSize: 12, color: T.error }}>{jobState.message || "L'analyse s'est arrêtée."}</span>
                <button
                  onClick={() => {
                    setJob(null);
                    setJobState(null);
                    handleAnalyze();
                  }}
                  disabled={!canAnalyze}
                  style={buttonStyle(Boolean(canAnalyze))}
                >
                  Réessayer
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
                <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>ID Job : {job.id}</span>
              </>
            )}
          </div>
        )}
        {error && <span style={{ color: T.error, fontSize: 12 }}>{error}</span>}
      </PanelCard>

      {/* 5. Recent analyses (kept in this browser) */}
      {recent.length > 0 && (
        <PanelCard>
          <SectionLabel>Analyses récentes</SectionLabel>
          {recent.map((r) => (
            <div key={r.site} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: T.bg, borderRadius: 7, padding: "6px 10px" }}>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>{(r.analysed_at || "").slice(0, 16).replace("T", " ")}</span>
              </div>
              <button onClick={() => onJobResult?.(r.site)} style={buttonStyle(true)}>Ouvrir</button>
            </div>
          ))}
        </PanelCard>
      )}

      <span style={{ fontSize: 10, color: T.dim, lineHeight: 1.5 }}>
        Les détections pour une nouvelle région proviennent directement du modèle multi-classes entraîné sur les données radar NISAR.
        {hasBackend ? ` · Serveur : ${API_URL}` : ""}
      </span>
    </div>
  );
}
