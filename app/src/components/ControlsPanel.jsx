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
  const baseEvents = zone?.events || manifest?.events || [];
  // Include "Water change" combined option
  const events = [
    ...baseEvents,
    {
      id: "water_change",
      label: "Water change",
      color: "#38BDF8",
      subtitle: "Gain & loss",
    },
  ];
  const classes = zone?.classes || manifest?.classes || [];

  function toggleClass(id) {
    setActiveClasses((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
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
              NISAR L-Band SAR
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
            L-BAND
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
              Event (Type of Change)
            </span>
            <span
              className="flex items-center gap-1"
              style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#ffb95f" }}
            >
              <span className="material-symbols-outlined text-[13px]">bolt</span>
              Active
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
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
                  {ev.subtitle && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "#859490",
                      }}
                    >
                      {ev.subtitle}
                    </span>
                  )}
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
              Land Classification
            </span>
            <span
              style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: "#859490",
              }}
            >
              {activeClasses.length} Active
            </span>
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
                    {cls.hint && (
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "#859490",
                        }}
                      >
                        {cls.hint}
                      </span>
                    )}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={activeClasses.includes(cls.id)}
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
            Inspection Mode
          </span>
          <div
            className="grid grid-cols-2 p-1 rounded-xl gap-1"
            style={{ background: "#19202e" }}
          >
            {[
              { key: "period", label: "Period View" },
              { key: "swipe", label: "Swipe Split" },
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
              Basemap
            </span>
            <div
              className="flex rounded-lg p-0.5"
              style={{ background: "#19202e" }}
            >
              {[
                { key: "sat", label: "Sat Photo" },
                { key: "street", label: "Street" },
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
                SAR Overlay Opacity
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
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
