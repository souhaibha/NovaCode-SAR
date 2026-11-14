export default function MapControls({
  zone,
  eventId,
  setEventId,
  period,
  setPeriod,
  activeClasses,
  setActiveClasses,
  opacity,
  setOpacity,
}) {
  const baseEvents = zone?.events || [];
  const events = [
    ...baseEvents,
    { id: "water_change", label: "Water change (Combined)" },
  ];
  const classes = zone?.classes || [];
  const dates = zone?.dates || [];

  function toggleClass(id) {
    setActiveClasses((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  return (
    <div
      className="absolute top-4 left-4 z-[1000] flex flex-col gap-2.5 p-3 rounded-xl max-w-[280px]"
      style={{
        background: "rgba(21, 27, 42, 0.95)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(60, 74, 70, 0.5)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
        color: "#dce2f6",
        fontSize: 12,
      }}
    >
      <div className="flex items-center justify-between pb-1 border-b border-surface-container-high/40">
        <span className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-1">
          <span className="material-symbols-outlined text-[16px]">tune</span>
          Map Controls
        </span>
        <span className="text-[10px] text-outline font-mono">Dev A</span>
      </div>

      {/* Event dropdown */}
      {events.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase text-on-surface-variant font-semibold">
            Event (A5)
          </span>
          <select
            value={eventId || ""}
            onChange={(e) => setEventId?.(e.target.value || null)}
            className="w-full px-2 py-1 rounded-lg bg-[#070e1c] border border-outline-variant/40 text-on-surface text-xs focus:outline-none focus:border-primary"
          >
            <option value="">(None)</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Start and end dates dropdowns */}
      {dates.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase text-on-surface-variant font-semibold">
              Start Date
            </span>
            <select
              value={period?.start || dates[0]}
              onChange={(e) =>
                setPeriod?.((p) => ({ ...p, start: e.target.value }))
              }
              className="w-full px-1.5 py-1 rounded bg-[#070e1c] border border-outline-variant/40 text-on-surface text-xs focus:outline-none focus:border-primary"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase text-on-surface-variant font-semibold">
              End Date
            </span>
            <select
              value={period?.end || dates[dates.length - 1]}
              onChange={(e) =>
                setPeriod?.((p) => ({ ...p, end: e.target.value }))
              }
              className="w-full px-1.5 py-1 rounded bg-[#070e1c] border border-outline-variant/40 text-on-surface text-xs focus:outline-none focus:border-primary"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Class checkboxes (A4) */}
      {classes.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase text-on-surface-variant font-semibold">
            Class Masks (A4)
          </span>
          <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded bg-[#070e1c] border border-outline-variant/30">
            {classes.map((cls) => (
              <label
                key={cls.id}
                className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={activeClasses?.includes(cls.id) ?? true}
                  onChange={() => toggleClass(cls.id)}
                  style={{ accentColor: cls.color }}
                  className="rounded"
                />
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: cls.color }}
                />
                <span className="truncate">{cls.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Opacity slider */}
      <label className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-[10px] font-mono uppercase text-on-surface-variant">
          <span>Opacity</span>
          <span className="text-primary font-bold">
            {Math.round((opacity ?? 0.85) * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity ?? 0.85}
          onChange={(e) => setOpacity?.(Number(e.target.value))}
          className="w-full"
        />
      </label>
    </div>
  );
}
