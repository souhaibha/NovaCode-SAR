/**
 * TopBar — P1 version.
 *
 * Center: clickable zone name that opens a dropdown listing useSites() entries.
 *   Each entry shows name + event as a small label.
 *   Selecting navigates to #/map/<site> and closes the dropdown.
 *
 * Props:
 *  zone         — current normalized summary (has .name, .event, etc.)
 *  showBack     — boolean, show back-to-globe link
 *  sites        — array from useSites() (passed down from App to avoid a second fetch)
 *  onNavigate   — (siteId: string) => void, called when user picks a zone
 */
import { useState, useRef, useEffect } from "react";

export default function TopBar({ zone, showBack = false, sites = [], onNavigate }) {
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropOpen]);

  const handlePick = (siteId) => {
    setDropOpen(false);
    onNavigate?.(siteId);
  };

  return (
    <header
      className="shrink-0 h-14 flex items-center justify-between px-4 z-50"
      style={{ background:"rgba(7,14,28,0.95)", borderBottom:"1px solid rgba(60,74,70,0.4)" }}
    >
      {/* Left: back link + logo */}
      <div className="flex items-center gap-3">
        {showBack && (
          <a
            href="#/"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors"
            style={{ background:"#151b2a", color:"#57f1db", border:"1px solid rgba(87,241,219,0.3)", textDecoration:"none" }}
            title="Back to globe"
            aria-label="Back to globe"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Globe</span>
          </a>
        )}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:"#232a39" }}>
          <span className="material-symbols-outlined text-[20px]" style={{ color:"#57f1db" }}>radar</span>
        </div>
        <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:700, fontSize:18, color:"#dce2f6", letterSpacing:"-0.5px" }}>
          SARdance
        </span>
        <span
          className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full"
          style={{ background:"#232a39", color:"#57f1db", fontSize:10, fontFamily:"'JetBrains Mono',monospace", fontWeight:500, letterSpacing:"0.06em", textTransform:"uppercase", border:"1px solid rgba(60,74,70,0.5)" }}
        >
          Radar Change Map
        </span>
      </div>

      {/* Center: zone selector dropdown */}
      <div ref={dropRef} style={{ position:"relative" }}>
        <button
          type="button"
          onClick={() => setDropOpen((v) => !v)}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 14px", borderRadius:12, background:"#151b2a", border:"1px solid rgba(60,74,70,0.5)", cursor:"pointer", outline:"none" }}
          aria-haspopup="listbox"
          aria-expanded={dropOpen}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color:"#57f1db" }}>location_on</span>
          <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:600, fontSize:13, color:"#dce2f6" }}>
            {zone?.name || "— Select zone —"}
          </span>
          <span className="material-symbols-outlined text-[16px]" style={{ color:"#bacac5", transform: dropOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }}>expand_more</span>
        </button>

        {dropOpen && (
          <ul
            role="listbox"
            aria-label="Monitoring zones"
            style={{
              position:"absolute", top:"calc(100% + 6px)", left:"50%", transform:"translateX(-50%)",
              minWidth:260, maxHeight:280, overflowY:"auto", zIndex:9999,
              background:"#151b2a", border:"1px solid rgba(60,74,70,0.5)", borderRadius:12,
              padding:4, margin:0, listStyle:"none",
              display:"flex", flexDirection:"column", gap:2,
            }}
          >
            {sites.length === 0 ? (
              <li style={{ padding:"10px 12px", fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#859490" }}>
                No sites loaded
              </li>
            ) : (
              sites.map((s) => {
                const isActive = zone && (zone.id === s.site || zone.site === s.site);
                return (
                  <li
                    key={s.site}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handlePick(s.site)}
                    style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"8px 12px", borderRadius:8, cursor:"pointer",
                      background: isActive ? "rgba(87,241,219,0.08)" : "transparent",
                      border: isActive ? "1px solid rgba(87,241,219,0.25)" : "1px solid transparent",
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(35,42,57,0.8)"; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span className="material-symbols-outlined text-[15px]" style={{ color: isActive ? "#57f1db" : "#bacac5" }}>radar</span>
                      <span style={{ fontSize:13, fontWeight: isActive ? 600 : 400, color: isActive ? "#57f1db" : "#dce2f6" }}>
                        {s.name}
                      </span>
                    </div>
                    {s.event && (
                      <span style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"#859490", background:"#0c1321", padding:"2px 6px", borderRadius:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                        {s.event}
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {/* Right: live badge */}
      <div className="flex items-center gap-4">
        <div
          className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full"
          style={{ background:"#151b2a", border:"1px solid rgba(60,74,70,0.3)", fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bacac5", letterSpacing:"0.06em" }}
        >
          <span className="relative flex h-2 w-2 mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full" style={{ background:"#57f1db", opacity:0.75 }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background:"#57f1db" }} />
          </span>
          NISAR L-BAND PASS
        </div>
      </div>
    </header>
  );
}
