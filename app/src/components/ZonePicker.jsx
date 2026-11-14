import { useState, useRef, useEffect, useMemo } from "react";

// ─── Styling definitions ──────────────────────────────────────────────────
const STYLES = {
  container: "relative w-full max-w-sm",
  inputWrapper:
    "flex items-center gap-2 rounded-2xl bg-surface-container-low/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl border border-outline-variant/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/40 transition-all",
  searchIcon: "material-symbols-outlined text-outline text-[20px] shrink-0",
  input:
    "w-full bg-transparent text-sm text-on-surface placeholder:text-outline focus:outline-none font-sans",
  clearBtn:
    "flex h-6 w-6 items-center justify-center rounded-md text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  listbox:
    "absolute left-0 right-0 top-full mt-2 z-50 max-h-64 overflow-y-auto rounded-2xl bg-surface-container-low/95 p-1.5 shadow-2xl backdrop-blur-xl border border-outline-variant/50 flex flex-col gap-1 focus:outline-none",
  option:
    "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs cursor-pointer transition-colors focus:outline-none",
  optionActive: "bg-surface-container-high text-primary",
  optionNormal: "text-on-surface hover:bg-surface-container/70",
  optionTitle: "font-semibold text-on-surface font-sans",
  optionSubtitle: "text-[11px] text-on-surface-variant font-mono",
  optionBadge:
    "inline-flex items-center gap-1 rounded-md bg-surface-container px-2 py-0.5 text-[10px] font-mono text-primary border border-outline-variant/30 shrink-0",
  emptyText:
    "px-4 py-3 text-center text-xs text-on-surface-variant font-mono",
};

export default function ZonePicker({ zones = [], selectedZoneId, onSelectZone }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listboxRef = useRef(null);

  // Filter zones by query (matches name or country)
  const filteredZones = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => {
      const matchName = z.name?.toLowerCase().includes(q);
      const matchCountry = z.country?.toLowerCase().includes(q);
      return matchName || matchCountry;
    });
  }, [zones, query]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(filteredZones.length > 0 ? 0 : -1);
  }, [filteredZones]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(zone) {
    onSelectZone?.(zone);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredZones.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredZones.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredZones.length) {
        handleSelect(filteredZones[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={STYLES.container}>
      <div className={STYLES.inputWrapper}>
        <span className={STYLES.searchIcon} aria-hidden>
          search
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="zone-picker-listbox"
          aria-activedescendant={
            isOpen && highlightedIndex >= 0
              ? `zone-opt-${highlightedIndex}`
              : undefined
          }
          placeholder="Search zones by name or country…"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={STYLES.input}
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear zone search"
            className={STYLES.clearBtn}
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {isOpen && (
        <ul
          id="zone-picker-listbox"
          ref={listboxRef}
          role="listbox"
          aria-label="Supported SAR zones"
          className={STYLES.listbox}
        >
          {filteredZones.length === 0 ? (
            <li className={STYLES.emptyText}>No matching zones found</li>
          ) : (
            filteredZones.map((zone, idx) => {
              const isSelected = zone.id === selectedZoneId;
              const isHighlighted = idx === highlightedIndex;

              return (
                <li
                  id={`zone-opt-${idx}`}
                  key={zone.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(zone)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`${STYLES.option} ${
                    isHighlighted ? STYLES.optionActive : STYLES.optionNormal
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={STYLES.optionTitle}>{zone.name}</span>
                    <span className={STYLES.optionSubtitle}>
                      {zone.country || "Zone"}
                    </span>
                  </div>

                  {zone.event_type && (
                    <span className={STYLES.optionBadge}>
                      {zone.event_type}
                    </span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
