import React from 'react';

export default function SwipeSlider({ sliderPos, setSliderPos, startDate, endDate }) {
  return (
    <div className="absolute inset-0 z-[600] pointer-events-none flex items-center justify-center">
      {/* Ligne verticale de séparation */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-sky-400 shadow-[0_0_10px_#38BDF8]"
        style={{ left: `${sliderPos}%` }}
      >
        {/* Poignée centrale */}
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-slate-900 border-2 border-sky-400 text-sky-400 flex items-center justify-center text-xs shadow-xl pointer-events-auto cursor-ew-resize select-none">
          ↔
        </div>
      </div>

      {/* Input Range invisible sur toute la carte pour capter le drag */}
      <input
        type="range"
        min="0"
        max="100"
        value={sliderPos}
        onChange={(e) => setSliderPos(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize pointer-events-auto"
      />

      {/* Etiquettes d'information Avant / Après */}
      {startDate && (
        <div className="absolute top-16 left-6 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded border border-slate-700 text-[11px] font-mono text-sky-400 shadow-lg select-none">
          BEFORE: {startDate}
        </div>
      )}
      {endDate && (
        <div className="absolute top-16 right-16 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded border border-slate-700 text-[11px] font-mono text-emerald-400 shadow-lg select-none">
          AFTER: {endDate}
        </div>
      )}
    </div>
  );
}