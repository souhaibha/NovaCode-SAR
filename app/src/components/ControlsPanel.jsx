/**
 * ControlsPanel — P1 dashboard left panel.
 *
 * Shows:
 *  - Sensor badge
 *  - Metadata card (name, event, event_date, period, frames count,
 *    model_version, track/frame, event_share_of_land_percent — only present fields)
 *  - Class filter checkboxes from visibleLegend() with colour swatch + area in ha
 *  - Changemap opacity slider
 *
 * No Events section, no Mode section, no Basemap toggle (all removed per P1 spec).
 * Props kept backward-compatible: unused ones are silently ignored.
 */
import { visibleLegend } from "../lib/siteAdapter";

function formatDate(str) {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length !== 3) return str;
  const [y, m, d] = parts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[parseInt(m, 10) - 1] || m} ${y}`;
}

function toRgbString(color) {
  if (!color) return "transparent";
  if (Array.isArray(color)) return `rgb(${color[0]},${color[1]},${color[2]})`;
  return color;
}

function MetaRow({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
      <span style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"#859490", textTransform:"uppercase", letterSpacing:"0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize:12, color:"#dce2f6", lineHeight:1.4 }}>{value}</span>
    </div>
  );
}

export default function ControlsPanel({
  zone,
  activeClasses,
  setActiveClasses,
  opacity,
  setOpacity,
  siteBase,
  // Legacy props silently ignored:
  manifest, eventId, setEventId, mode, setMode, basemap, setBasemap,
}) {
  if (!zone) return null;

  const legendItems = visibleLegend(zone.legend || []);

  function toggleClass(cls) {
    setActiveClasses((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  }

  // Metadata derivations
  const period =
    zone.dates?.length >= 2
      ? `${formatDate(zone.dates[0])} → ${formatDate(zone.dates[zone.dates.length - 1])}`
      : zone.dates?.length === 1 ? formatDate(zone.dates[0]) : null;

  const frameCount = zone.frames?.length ?? zone.dates?.length ?? null;

  // Parse "track NNN frame NNN" from source string
  let track = null, frame = null;
  if (zone.source) {
    const tm = zone.source.match(/track\s+(\d+)/i);
    const fm = zone.source.match(/frame\s+(\d+)/i);
    if (tm) track = tm[1];
    if (fm) frame = fm[1];
  }

  // event_share_of_land_percent — may be object or null
  const eventShare = zone.eventShare ?? zone.event_share_of_land_percent ?? null;
  let eventShareText = null;
  if (eventShare && typeof eventShare === "object") {
    const entries = Object.entries(eventShare)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .map(([k, v]) => `${k}: ${v.toFixed(2)}%`);
    if (entries.length) eventShareText = entries.join(" · ");
  }

  const panelStyle = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
  };
  const sectionStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: "14px 14px 0",
  };
  const labelStyle = {
    fontSize: 10,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#bacac5",
    fontWeight: 600,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
  };
  const boxStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "10px 10px",
    borderRadius: 10,
    background: "#0c1321",
    border: "1px solid rgba(60,74,70,0.3)",
  };

  return (
    <div style={panelStyle}>
      <div style={sectionStyle}>

        {/* Sensor badge */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 10px", borderRadius:10, background:"rgba(35,42,57,0.8)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ position:"relative", display:"flex", width:10, height:10 }}>
              <span className="animate-ping" style={{ position:"absolute", display:"inline-flex", width:"100%", height:"100%", borderRadius:"50%", background:"#57f1db", opacity:0.75 }} />
              <span style={{ position:"relative", display:"inline-flex", width:10, height:10, borderRadius:"50%", background:"#57f1db" }} />
            </span>
            <span style={{ color:"#57f1db", fontSize:10, fontFamily:"'JetBrains Mono',monospace", fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>
              NISAR L-band
            </span>
          </div>
          <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bacac5", background:"#070e1c", padding:"2px 6px", borderRadius:4 }}>
            HH/HV
          </span>
        </div>

        {/* Metadata card */}
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <span style={labelStyle}>Site Info</span>
          <div style={boxStyle}>
            <MetaRow label="Site" value={zone.name} />
            {zone.event && (
              <MetaRow label="Event type" value={zone.event} />
            )}
            {zone.eventDate && (
              <MetaRow label="Event date" value={formatDate(zone.eventDate)} />
            )}
            {period && <MetaRow label="Period" value={period} />}
            {frameCount !== null && (
              <MetaRow label="Frames" value={`${frameCount} passes`} />
            )}
            {zone.model_version && (
              <MetaRow label="Model" value={zone.model_version} />
            )}
            {(track || frame) && (
              <MetaRow
                label="Track / Frame"
                value={[track && `T${track}`, frame && `F${frame}`].filter(Boolean).join(" / ")}
              />
            )}
            {eventShareText && (
              <MetaRow label="Event share" value={eventShareText} />
            )}
          </div>
        </div>

        {/* Class filters */}
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={labelStyle}>Detected classes</span>
            <span style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"#859490" }}>
              {activeClasses.length} / {legendItems.length} active
            </span>
          </div>
          <div style={boxStyle}>
            {legendItems.length === 0 ? (
              <span style={{ fontSize:11, color:"#859490" }}>No classes in legend.</span>
            ) : (
              legendItems.map((item) => {
                const isOn = activeClasses.includes(item.cls);
                return (
                  <label
                    key={item.cls}
                    style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 4px", borderRadius:7, cursor:"pointer", transition:"background 0.1s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#19202e")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span
                        style={{ width:14, height:14, borderRadius:4, flexShrink:0, background: toRgbString(item.color), opacity: isOn ? 1 : 0.4 }}
                      />
                      <div style={{ display:"flex", flexDirection:"column" }}>
                        <span style={{ fontSize:12, color: isOn ? "#dce2f6" : "#859490" }}>{item.name}</span>
                        {item.hectares > 0 && (
                          <span style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"#859490" }}>
                            {item.hectares.toLocaleString()} ha
                          </span>
                        )}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggleClass(item.cls)}
                      style={{ accentColor:"#57f1db", width:15, height:15, cursor:"pointer" }}
                    />
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Opacity slider */}
        <div style={{ display:"flex", flexDirection:"column", gap:4, paddingBottom:14 }}>
          <span style={labelStyle}>Changemap opacity</span>
          <div style={{ ...boxStyle, gap:4 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:12, color:"#dce2f6" }}>Overlay</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:"#57f1db" }}>
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0" max="1" step="0.01"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              style={{ width:"100%", accentColor:"#57f1db" }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
