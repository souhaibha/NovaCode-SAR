import { useState, useRef, useEffect, useMemo } from "react";

// Modern stylish CSS definitions block for ZonePicker
const CSS = {
  container: "relative w-full max-w-md",
  inputWrapper:
    "flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[#151b2a] border border-[rgba(87,241,219,0.35)] focus-within:border-[#57f1db] focus-within:shadow-[0_0_20px_rgba(87,241,219,0.2)] transition-all",
  searchIcon: "material-symbols-outlined text-[19px] text-[#57f1db] shrink-0",
  input:
    "w-full bg-transparent text-sm text-[#dce2f6] placeholder-[#bacac5]/60 outline-none font-sans font-medium",
  clearBtn:
    "text-[#bacac5] hover:text-[#dce2f6] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#57f1db] rounded p-0.5 shrink-0 transition-colors cursor-pointer",
  dropdown:
    "absolute top-full left-0 right-0 mt-2 max-h-72 overflow-y-auto rounded-2xl bg-[#121927] border border-[rgba(87,241,219,0.35)] shadow-2xl z-50 p-1.5 flex flex-col gap-1 outline-none backdrop-blur-xl",
  option:
    "px-3.5 py-2.5 rounded-xl text-sm flex items-center justify-between cursor-pointer transition-all outline-none",
  optionActive: "bg-[#1f283d] text-[#57f1db]",
  optionInactive: "text-[#dce2f6] hover:bg-[#1a2334]",
  optionSubtitle: "text-xs font-sans text-[#bacac5]",
  emptyMsg: "px-4 py-6 text-xs font-sans text-[#bacac5] text-center flex flex-col items-center gap-1.5",
};

export default function ZonePicker({ zones = [], selectedId, onSelect }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [remoteResults, setRemoteResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listboxRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Debounced live geocoding for cities, regions & countries worldwide
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemoteResults([]);
      setIsSearching(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(() => {
      setIsSearching(true);
      fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=7`,
        { signal: controller.signal }
      )
        .then((res) => {
          if (!res.ok) throw new Error("Search failed");
          return res.json();
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          const features = data?.features || [];
          const items = features.map((f, i) => {
            const p = f.properties || {};
            const coords = f.geometry?.coordinates || [0, 0];
            const type = p.type || p.osm_value || "lieu";
            const contextParts = [p.city, p.state, p.country].filter(
              (x) => x && x !== p.name
            );

            let typeLabel = "Place";
            let typeColor = "text-[#bacac5] bg-[#232a39]";
            if (["city", "town", "village", "municipality"].includes(type)) {
              typeLabel = "City";
              typeColor = "text-[#57f1db] bg-[rgba(87,241,219,0.15)] border-[rgba(87,241,219,0.3)]";
            } else if (["state", "region", "province", "county", "district"].includes(type)) {
              typeLabel = "Region";
              typeColor = "text-[#ffb95f] bg-[rgba(255,185,95,0.15)] border-[rgba(255,185,95,0.3)]";
            } else if (["country"].includes(type)) {
              typeLabel = "Country";
              typeColor = "text-[#38bdf8] bg-[rgba(56,189,248,0.15)] border-[rgba(56,189,248,0.3)]";
            }

            return {
              id: `geo-${p.osm_id || i}-${p.name}`,
              name: p.name || trimmed,
              subtitle: contextParts.join(", ") || p.country || "",
              typeLabel,
              typeColor,
              lat: Number(coords[1].toFixed(4)),
              lng: Number(coords[0].toFixed(4)),
              icon: typeLabel === "City" ? "location_city" : typeLabel === "Region" ? "map" : "public",
            };
          });
          setRemoteResults(items);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            setRemoteResults([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Combine matching local countries and remote geocoded places
  const combinedResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return zones.slice(0, 10).map((z) => ({
        ...z,
        subtitle: z.country || "Country",
        typeLabel: "Country",
        typeColor: "text-[#38bdf8] bg-[rgba(56,189,248,0.15)] border-[rgba(56,189,248,0.3)]",
        icon: "public",
      }));
    }

    // Match in local list
    const localMatches = zones
      .filter((z) => z.name?.toLowerCase().includes(q))
      .slice(0, 4)
      .map((z) => ({
        ...z,
        subtitle: z.country || "Country",
        typeLabel: "Country",
        typeColor: "text-[#38bdf8] bg-[rgba(56,189,248,0.15)] border-[rgba(56,189,248,0.3)]",
        icon: "public",
      }));

    // Merge without exact name duplicates
    const names = new Set(localMatches.map((x) => x.name.toLowerCase()));
    const additionalRemote = remoteResults.filter(
      (r) => !names.has(r.name.toLowerCase())
    );

    return [...localMatches, ...additionalRemote];
  }, [zones, query, remoteResults]);

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

  const handleSelect = (item) => {
    onSelect(item);
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
        prev < combinedResults.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : combinedResults.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < combinedResults.length) {
        handleSelect(combinedResults[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const activeOptionId =
    isOpen && activeIndex >= 0 && combinedResults[activeIndex]
      ? `zone-opt-${combinedResults[activeIndex].id}`
      : undefined;

  return (
    <div ref={containerRef} className={CSS.container}>
      <div className={CSS.inputWrapper}>
        <span className={CSS.searchIcon}>travel_explore</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="zone-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label="Search city, region, or country"
          value={query}
          placeholder="Search city, region, or country (e.g. Algiers, Paris, Tokyo...)"
          className={CSS.input}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        />
        {isSearching && (
          <span className="material-symbols-outlined text-[17px] text-[#57f1db] animate-spin shrink-0">
            progress_activity
          </span>
        )}
        {query && !isSearching && (
          <button
            type="button"
            aria-label="Clear search"
            className={CSS.clearBtn}
            onClick={() => {
              setQuery("");
              setRemoteResults([]);
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
          aria-label="Geographic search results"
          tabIndex={-1}
          className={CSS.dropdown}
        >
          {combinedResults.length === 0 ? (
            <li className={CSS.emptyMsg}>
              <span className="material-symbols-outlined text-[24px] text-[#57f1db]">location_off</span>
              <span>No location found for "{query}"</span>
            </li>
          ) : (
            combinedResults.map((item, idx) => {
              const isSelected = item.id === selectedId;
              const isActive = idx === activeIndex;
              return (
                <li
                  key={item.id}
                  id={`zone-opt-${item.id}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`${CSS.option} ${
                    isActive ? CSS.optionActive : CSS.optionInactive
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="material-symbols-outlined text-[18px] shrink-0"
                      style={{ color: isSelected ? "#57f1db" : "#859490" }}
                    >
                      {item.icon || "location_on"}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold font-sans text-sm text-[#ffffff] truncate">
                          {item.name}
                        </span>
                        {item.typeLabel && (
                          <span
                            className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-sans font-bold uppercase tracking-wider border ${item.typeColor}`}
                          >
                            {item.typeLabel}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <span className="text-xs font-sans text-[#9bb0a9] truncate">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {item.lat != null && item.lng != null && (
                    <span className="text-[11px] font-sans font-medium text-[#57f1db] shrink-0 ml-2">
                      {Math.abs(item.lat).toFixed(1)}°{item.lat >= 0 ? "N" : "S"},{" "}
                      {Math.abs(item.lng).toFixed(1)}°{item.lng >= 0 ? "E" : "W"}
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
