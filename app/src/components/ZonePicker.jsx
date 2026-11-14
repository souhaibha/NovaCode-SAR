import { useState, useRef, useEffect, useMemo } from "react";

// Single styling block for ZonePicker
const CSS = {
  container: "relative w-full max-w-md",
  inputWrapper:
    "flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#151b2a]/90 backdrop-blur-md border border-[rgba(60,74,70,0.5)] shadow-lg focus-within:border-[#57f1db] focus-within:ring-2 focus-within:ring-[rgba(87,241,219,0.2)] transition-all",
  searchIcon: "material-symbols-outlined text-[18px] text-[#bacac5] shrink-0",
  input:
    "w-full bg-transparent text-sm text-[#dce2f6] placeholder-[#bacac5]/60 outline-none font-sans",
  clearBtn:
    "text-[#bacac5] hover:text-[#dce2f6] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#57f1db] rounded p-0.5 shrink-0",
  dropdown:
    "absolute top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto rounded-xl bg-[#151b2a]/95 backdrop-blur-lg border border-[rgba(60,74,70,0.5)] shadow-2xl z-50 p-1 flex flex-col gap-0.5 outline-none",
  option:
    "px-3 py-2 rounded-lg text-sm flex items-center justify-between cursor-pointer transition-colors outline-none",
  optionActive: "bg-[#232a39] text-[#57f1db]",
  optionInactive: "text-[#dce2f6] hover:bg-[#232a39]/60",
  optionCountry: "text-xs font-mono text-[#bacac5]",
  emptyMsg: "px-3 py-4 text-xs font-mono text-[#bacac5] text-center",
};

export default function ZonePicker({ zones = [], selectedId, onSelect }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listboxRef = useRef(null);

  // Filter zones by name or country
  const filteredZones = useMemo(() => {
    if (!query.trim()) return zones;
    const q = query.toLowerCase();
    return zones.filter(
      (z) =>
        z.name?.toLowerCase().includes(q) ||
        z.country?.toLowerCase().includes(q)
    );
  }, [zones, query]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (zone) => {
    onSelect(zone);
    setQuery("");
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < filteredZones.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : filteredZones.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredZones.length) {
        handleSelect(filteredZones[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const activeOptionId =
    isOpen && activeIndex >= 0 && filteredZones[activeIndex]
      ? `zone-opt-${filteredZones[activeIndex].id}`
      : undefined;

  return (
    <div ref={containerRef} className={CSS.container}>
      <div className={CSS.inputWrapper}>
        <span className={CSS.searchIcon}>search</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="zone-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label="Search radar monitoring zones"
          value={query}
          placeholder="Search monitoring zone (e.g., Gharb, Morocco)..."
          className={CSS.input}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear query"
            className={CSS.clearBtn}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {isOpen && (
        <ul
          id="zone-listbox"
          ref={listboxRef}
          role="listbox"
          aria-label="Supported zones"
          tabIndex={-1}
          className={CSS.dropdown}
        >
          {filteredZones.length === 0 ? (
            <li className={CSS.emptyMsg}>No matching zones found</li>
          ) : (
            filteredZones.map((zone, idx) => {
              const isSelected = zone.id === selectedId;
              const isActive = idx === activeIndex;
              return (
                <li
                  key={zone.id}
                  id={`zone-opt-${zone.id}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(zone)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`${CSS.option} ${
                    isActive ? CSS.optionActive : CSS.optionInactive
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="material-symbols-outlined text-[16px]"
                      style={{ color: isSelected ? "#57f1db" : "#bacac5" }}
                    >
                      radar
                    </span>
                    <span className="font-medium">{zone.name}</span>
                  </div>
                  {zone.country && (
                    <span className={CSS.optionCountry}>{zone.country}</span>
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
