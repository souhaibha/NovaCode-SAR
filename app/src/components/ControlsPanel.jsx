export default function ControlsPanel({
  manifest,
  zone,
  eventId,
  setEventId,
  activeClasses,
  setActiveClasses,
  mode,
  setMode,
  basemap,
  setBasemap,
  opacity,
  setOpacity,
}) {
  // Real summary.json uses zone.event (string), not zone.events (array).
  // Build a synthetic single-event list from zone.event when available.
  const eventLabel = zone?.event
    ? (zone.event === "farming" ? "Agriculture & Végétation" : zone.event.charAt(0).toUpperCase() + zone.event.slice(1))
    : null;
  const baseEvents = eventLabel
    ? [{ id: zone.event, label: eventLabel, color: "#57f1db" }]
    : (manifest?.events || []);
  const events = baseEvents;

  // Real summary.json uses legend[] with { cls, name, color: [R,G,B]|null, hectares }
  const DEFAULT_LEGEND = [
    { cls: 1, name: "gain de végétation", color: [40, 200, 60], hectares: 6312 },
    { cls: 2, name: "perte de végétation", color: [230, 50, 50], hectares: 5396 },
    { cls: 3, name: "zone brûlée", color: [110, 30, 10], hectares: 1092 },
    { cls: 4, name: "zone inondée", color: [0, 150, 255], hectares: 28 },
    { cls: 5, name: "plans d'eau", color: [40, 70, 160], hectares: 24591 },
  ];

  const sourceLegend = (zone?.legend && zone.legend.length > 0) ? zone.legend : DEFAULT_LEGEND;
  const classes = sourceLegend
    .filter((e) => e.color !== null && e.color !== undefined)
    .map((e) => ({
      id: e.cls,
      label: e.name === "vegetation gain" ? "gain de végétation"
        : e.name === "vegetation loss" ? "perte de végétation"
        : e.name === "burned" ? "zone brûlée"
        : e.name === "flooded" ? "zone inondée"
        : e.name === "water" ? "plans d'eau"
        : e.name === "earthquake ground displacement" ? "déplacement de sol"
        : e.name,
      color: Array.isArray(e.color)
        ? `rgb(${e.color[0]},${e.color[1]},${e.color[2]})`
        : e.color,
      hectares: e.hectares,
    }));

  function isClassChecked(id) {
    return activeClasses.some((c) => c == id || String(c) === String(id));
  }

  function toggleClass(id) {
    setActiveClasses((prev) => {
      const active = prev.some((c) => c == id || String(c) === String(id));
      if (active) {
        return prev.filter((c) => c != id && String(c) !== String(id));
      } else {
        return [...prev, id];
      }
    });
  }

  return (
    <div className="flex flex-col h-full justify-between">
      <div className="p-4 flex flex-col gap-4">
        {/* Sensor badge */}
        <div
          className="flex items-center justify-between p-2 rounded-xl"
          style={{ background: "rgba(35,42,57,0.8)" }}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full"
                style={{ background: "#57f1db", opacity: 0.75 }}
              />
              <span
                className="relative inline-flex rounded-full h-2.5 w-2.5"
                style={{ background: "#57f1db" }}
              />
            </span>
            <span
              style={{
                color: "#57f1db",
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              NISAR Bande L HH/HV
            </span>
          </div>
          <span
            style={{
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              color: "#bacac5",
              background: "#070e1c",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            HH/HV
          </span>
        </div>

        {/* Section 1: Events */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: "#bacac5",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Événement (Thème)
            </span>
            <span
              className="flex items-center gap-1"
              style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#ffb95f" }}
            >
              <span className="material-symbols-outlined text-[13px]">bolt</span>
              Actif
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {events.map((ev) => {
              const isSelected = eventId === ev.id;
              const evColor = ev.color || "#FF5A5F";
              return (
                <button
                  key={ev.id}
                  onClick={() => setEventId(isSelected ? null : ev.id)}
                  className="flex flex-col items-start p-2 rounded-xl text-left transition-all"
                  style={{
                    background: isSelected ? `${evColor}15` : "#19202e",
                    border: isSelected
                      ? `1px solid ${evColor}`
                      : "1px solid transparent",
                    boxShadow: isSelected ? `0 0 15px ${evColor}25` : "none",
                    cursor: "pointer",
                  }}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span
                      style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: 13,
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? evColor : "#dce2f6",
                      }}
                    >
                      {ev.label}
                    </span>
                    {isSelected ? (
                      <span className="relative flex h-2 w-2">
                        <span
                          className="animate-ping absolute inline-flex h-full w-full rounded-full"
                          style={{ background: evColor, opacity: 0.75 }}
                        />
                        <span
                          className="relative inline-flex rounded-full h-2 w-2"
                          style={{ background: evColor }}
                        />
                      </span>
                    ) : (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: `${evColor}60` }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Land Classification */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: "#bacac5",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Classification du sol
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveClasses(classes.map((c) => c.id))}
                className="text-[10px] font-mono text-[#57f1db] hover:underline cursor-pointer"
              >
                Tout
              </button>
              <span style={{ color: "#859490", fontSize: 10 }}>|</span>
              <button
                type="button"
                onClick={() => setActiveClasses([])}
                className="text-[10px] font-mono text-[#859490] hover:text-[#dce2f6] cursor-pointer"
              >
                Aucun
              </button>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "#859490",
                  marginLeft: 4,
                }}
              >
                ({classes.filter((c) => isClassChecked(c.id)).length}/{classes.length})
              </span>
            </div>
          </div>

          <div
            className="flex flex-col gap-1.5 p-2.5 rounded-xl"
            style={{ background: "#19202e" }}
          >
            {classes.map((cls) => (
              <label
                key={cls.id}
                className="flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#232a39")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded"
                    style={{ background: cls.color, flexShrink: 0 }}
                  />
                  <div className="flex flex-col">
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#dce2f6" }}>
                      {cls.label}
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isClassChecked(cls.id)}
                  onChange={() => toggleClass(cls.id)}
                  style={{ accentColor: "#57f1db", width: 16, height: 16, cursor: "pointer" }}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Section 3: Mode */}
        <div className="flex flex-col gap-1.5">
          <span
            style={{
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              color: "#bacac5",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Mode d'inspection
          </span>
          <div
            className="grid grid-cols-2 p-1 rounded-xl gap-1"
            style={{ background: "#19202e" }}
          >
            {[
              { key: "period", label: "Vue Temporelle" },
              { key: "swipe", label: "Comparaison Swipe" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className="py-1.5 px-2 rounded-lg text-sm font-semibold transition-all"
                style={
                  mode === key
                    ? { background: "#57f1db", color: "#003731" }
                    : { color: "#bacac5", background: "transparent" }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Section 4: Basemap + Opacity */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: "#bacac5",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Fond de carte
            </span>
            <div
              className="flex rounded-lg p-0.5"
              style={{ background: "#19202e" }}
            >
              {[
                { key: "sat", label: "Satellite" },
                { key: "street", label: "Rues" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setBasemap(key)}
                  className="px-2 py-0.5 rounded text-[11px] transition-all"
                  style={
                    basemap === key
                      ? {
                          background: "#323949",
                          color: "#dce2f6",
                          fontWeight: 600,
                          fontFamily: "'JetBrains Mono', monospace",
                        }
                      : {
                          color: "#859490",
                          fontFamily: "'JetBrains Mono', monospace",
                        }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="flex flex-col gap-1 p-2.5 rounded-xl"
            style={{ background: "#19202e" }}
          >
            <div className="flex justify-between items-center">
              <span style={{ fontSize: 13, fontWeight: 500, color: "#dce2f6" }}>
                Opacité radar SAR
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#57f1db",
                }}
              >
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-full mt-1 accent-[#57f1db] cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
