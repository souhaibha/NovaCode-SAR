export default function TopBar({ zone, showBack = false }) {
  return (
    <header
      className="shrink-0 h-14 flex items-center justify-between px-4 z-50"
      style={{
        background: "rgba(7,14,28,0.92)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(60,74,70,0.4)",
      }}
    >
      {/* Left: back link + logo */}
      <div className="flex items-center gap-3">
        {showBack && (
          <a
            href="#/"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{
              background: "#151b2a",
              color: "#57f1db",
              border: "1px solid rgba(87,241,219,0.3)",
              textDecoration: "none",
            }}
            title="Back to globe"
            aria-label="Back to globe"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Globe</span>
          </a>
        )}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: "#232a39",
            boxShadow: "0 0 12px rgba(87,241,219,0.2)",
          }}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ color: "#57f1db" }}>
            radar
          </span>
        </div>
        <span
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700,
            fontSize: 18,
            color: "#dce2f6",
            letterSpacing: "-0.5px",
          }}
        >
          SARdance
        </span>
        <span
          className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full"
          style={{
            background: "#232a39",
            color: "#57f1db",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            border: "1px solid rgba(60,74,70,0.5)",
          }}
        >
          Radar Change Map
        </span>
      </div>

      {/* Center: zone name */}
      <div
        className="flex items-center gap-2 px-4 py-1.5 rounded-xl cursor-pointer transition-colors"
        style={{
          background: "#151b2a",
          border: "1px solid rgba(60,74,70,0.5)",
        }}
      >
        <span className="material-symbols-outlined text-[18px]" style={{ color: "#57f1db" }}>
          location_on
        </span>
        <span
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 600,
            fontSize: 13,
            color: "#dce2f6",
          }}
        >
          {zone?.name || "—"}
        </span>
        <span className="material-symbols-outlined text-[16px]" style={{ color: "#bacac5" }}>
          expand_more
        </span>
      </div>

      {/* Right: live badge + nav + lang */}
      <div className="flex items-center gap-4">
        <div
          className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full"
          style={{
            background: "#151b2a",
            border: "1px solid rgba(60,74,70,0.3)",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            color: "#bacac5",
            letterSpacing: "0.06em",
          }}
        >
          <span className="relative flex h-2 w-2 mr-1">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full"
              style={{ background: "#57f1db", opacity: 0.75 }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: "#57f1db" }}
            />
          </span>
          NISAR L-BAND PASS
        </div>

        <nav className="hidden lg:flex items-center gap-4">
          <a
            href="#"
            style={{
              color: "#57f1db",
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Map View
          </a>
          <a
            href="#"
            style={{
              color: "#bacac5",
              fontWeight: 400,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            About the data
          </a>
        </nav>

        <div
          className="flex items-center rounded-full px-2.5 py-0.5"
          style={{
            background: "#151b2a",
            border: "1px solid rgba(87,241,219,0.3)",
          }}
        >
          <span
            className="text-[11px] font-bold"
            style={{
              color: "#57f1db",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            FR
          </span>
        </div>
      </div>
    </header>
  );
}
