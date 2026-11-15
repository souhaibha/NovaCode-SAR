import { useState, useRef, useEffect } from "react";

/**
 * SatelliteCalendarPicker — High-precision Space / Telemetry Calendar Picker
 * Custom-engineered for NASA SARdance.
 * Accurately highlights genuine NASA Sentinel-1 / NISAR radar acquisition dates.
 */
export default function SatelliteCalendarPicker({
  label,
  value,
  onChange,
  availableDates = [],
  minDate,
  maxDate,
  align = "left", // "left" | "right"
  position = "top", // "top" | "bottom"
  placeholder = "Select",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Parse initial view year/month from current value or fallback
  const initialDate = value ? new Date(value) : new Date();
  const [viewYear, setViewYear] = useState(
    isNaN(initialDate.getFullYear()) ? 2026 : initialDate.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(
    isNaN(initialDate.getMonth()) ? 9 : initialDate.getMonth()
  );

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Sync view when value changes
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const prevMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Build days grid for viewYear, viewMonth (Monday = 0)
  const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const daysGrid = [];
  for (let i = 0; i < firstDayIndex; i++) {
    daysGrid.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysGrid.push(d);
  }

  // Count available satellite passes in this viewed month
  const monthPassesCount = availableDates.filter((ds) => {
    const parts = ds.split("-");
    return (
      parseInt(parts[0], 10) === viewYear &&
      parseInt(parts[1], 10) === viewMonth + 1
    );
  }).length;

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <label className="text-[10px] uppercase font-sans tracking-wider text-[#9bb0a9] block mb-1 font-semibold">
        {label}
      </label>

      {/* Styled Interactive Button Input */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-[#0c1321] hover:bg-[#111a2d] border border-[rgba(87,241,219,0.35)] hover:border-[#57f1db] rounded-xl px-3 py-2 text-xs font-sans font-medium transition-all text-left cursor-pointer group"
        style={{
          boxShadow: isOpen
            ? "0 0 0 2px rgba(87,241,219,0.4), 0 4px 12px rgba(0,0,0,0.5)"
            : "0 2px 6px rgba(0,0,0,0.3)",
          borderColor: isOpen ? "#57f1db" : undefined,
        }}
      >
        <span className={value ? "text-[#57f1db] font-bold tracking-wide font-sans" : "text-[#859490] font-sans"}>
          {value ? value.split("-").reverse().join("/") : placeholder}
        </span>
        <span
          className={`material-symbols-outlined text-[17px] transition-transform duration-200 ${
            isOpen ? "text-[#57f1db] scale-110" : "text-[#859490] group-hover:text-[#57f1db]"
          }`}
        >
          calendar_month
        </span>
      </button>

      {/* High-End Precision Satellite Calendar Popover */}
      {isOpen && (
        <div
          className={`absolute z-[3000] w-[292px] bg-[#121927] border border-[rgba(87,241,219,0.45)] rounded-2xl p-3 shadow-2xl text-[#dce2f6] flex flex-col gap-2 backdrop-blur-xl ${
            position === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          } ${align === "right" ? "right-0" : "left-0"}`}
          style={{
            boxShadow:
              "0 20px 45px -10px rgba(0, 0, 0, 0.9), 0 0 25px rgba(87, 241, 219, 0.15)",
            boxSizing: "border-box",
          }}
        >
          {/* Header with Month Navigation and Satellite Count Pill */}
          <div className="flex items-center justify-between pb-1.5 border-b border-[rgba(255,255,255,0.06)] px-0.5">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center bg-[#192233] hover:bg-[#25324c] text-[#bacac5] hover:text-[#57f1db] transition-all cursor-pointer border border-[rgba(255,255,255,0.05)] active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>

            <div className="flex flex-col items-center">
              <span className="text-[13px] font-bold tracking-tight text-white font-sans">
                {monthNames[viewMonth]} {viewYear}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#57f1db] animate-pulse" />
                <span className="text-[9.5px] font-sans text-[#57f1db] font-semibold tracking-wide">
                  {monthPassesCount} NASA pass{monthPassesCount > 1 ? "es" : ""}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center bg-[#192233] hover:bg-[#25324c] text-[#bacac5] hover:text-[#57f1db] transition-all cursor-pointer border border-[rgba(255,255,255,0.05)] active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center font-sans text-[9px] font-bold text-[#859490] tracking-wider py-0.5">
            <span>MON</span>
            <span>TUE</span>
            <span>WED</span>
            <span>THU</span>
            <span>FRI</span>
            <span>SAT</span>
            <span>SUN</span>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center font-sans">
            {daysGrid.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="w-8 h-8" />;
              }
              const monthStr = String(viewMonth + 1).padStart(2, "0");
              const dayStr = String(day).padStart(2, "0");
              const dateStr = `${viewYear}-${monthStr}-${dayStr}`;

              const hasPhoto = availableDates.includes(dateStr);
              const isSelected = value === dateStr;
              const isTooEarly = minDate && dateStr < minDate;
              const isTooLate = maxDate && dateStr > maxDate;
              const isDisabled = !hasPhoto || isTooEarly || isTooLate;

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    onChange(dateStr);
                    setIsOpen(false);
                  }}
                  className={`relative w-8 h-8 rounded-lg text-[11px] font-sans flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? "bg-[#57f1db] text-[#003731] font-bold shadow-[0_0_12px_#57f1db] scale-105 z-10"
                      : hasPhoto && !isDisabled
                      ? "bg-[rgba(87,241,219,0.12)] text-[#57f1db] border border-[rgba(87,241,219,0.45)] hover:bg-[#57f1db] hover:text-[#003731] hover:scale-105 font-bold cursor-pointer shadow-[0_2px_8px_rgba(87,241,219,0.1)]"
                      : isTooEarly || isTooLate
                      ? "text-[#333d4e] cursor-not-allowed opacity-30 line-through"
                      : "text-[#556377] cursor-not-allowed hover:bg-transparent"
                  }`}
                  title={
                    hasPhoto && !isDisabled
                      ? `NASA SAR radar scene available: ${dateStr}`
                      : isTooEarly
                      ? `Too early for comparison (min +12 days after start): ${dateStr}`
                      : hasPhoto && isTooLate
                      ? `Future date: ${dateStr}`
                      : `No satellite overpass on ${dateStr}`
                  }
                >
                  <span className="leading-none">{day}</span>
                  {hasPhoto && !isSelected && (
                    <span className="w-1 h-1 rounded-full bg-[#57f1db] mt-0.5 shadow-[0_0_4px_#57f1db]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Guide */}
          <div className="pt-1.5 border-t border-[rgba(255,255,255,0.06)] flex items-center justify-between text-[9px] font-mono px-0.5">
            <div className="flex items-center gap-1.5 text-[#57f1db]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#57f1db] shadow-[0_0_5px_#57f1db] shrink-0" />
              <span className="font-semibold whitespace-nowrap">NASA SAR available</span>
            </div>
            <span className="text-[#859490] whitespace-nowrap text-[8.5px]">Dimmed = no overpass</span>
          </div>
        </div>
      )}
    </div>
  );
}
