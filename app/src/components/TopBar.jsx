export default function TopBar({ zone, manifest }) {
  return (
    <header
      className="shrink-0 h-14 flex items-center justify-between px-4 z-50"
      style={{
        background: "rgba(7,14,28,0.92)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(60,74,70,0.4)",
      }}
    >
      {/* Left: logo + back to globe */}
      <div className="flex items-center gap-3">
        <a
          href="#/"
          title="Back to 3D Globe"
          className="flex items-center gap-2.5 text-inherit no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform hover:scale-105"
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
        </a>

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

        {manifest?.fake && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-amber-400 bg-amber-500/15 border border-amber-500/30"
            title="Demonstration dataset"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Demo data
          </span>
        )}
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

      {/* Right: back to globe link + live badge + lang */}
      <div className="flex items-center gap-4">
        {/* Back to globe navigation link */}
        <a
          href="#/"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style={{
            background: "#151b2a",
            color: "#57f1db",
            border: "1px solid rgba(87,241,219,0.3)",
            textDecoration: "none",
          }}
          aria-label="Back to 3D Globe landing page"
        >
          <span className="material-symbols-outlined text-[16px]">public</span>
          <span>Back to globe</span>
        </a>

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

        <div
          className="flex items-center rounded-full p-0.5"
          style={{
            background: "#151b2a",
            border: "1px solid rgba(60,74,70,0.3)",
          }}
        >
          <button
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{
              background: "#57f1db",
              color: "#003731",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            FR
          </button>
          <button
            className="px-2 py-0.5 rounded-full text-[11px]"
            style={{ color: "#bacac5", fontFamily: "'JetBrains Mono', monospace" }}
          >
            EN
          </button>
        </div>
      </div>
    </header>
  );
}
