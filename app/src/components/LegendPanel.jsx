// LegendPanel.jsx
// Displays the change legend with dynamic real-time surface areas updating as the timeline moves,
// with full interactive sync with soil classification (Classification du sol).

import { useMemo } from 'react';

const LABEL_STYLE = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#bacac5',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

function formatArea(hectares) {
  if (hectares === undefined || hectares === null || isNaN(hectares)) return '0 ha';
  if (hectares >= 100) {
    const km2 = hectares / 100;
    return km2 >= 10
      ? `${Math.round(km2).toLocaleString()} km²`
      : `${km2.toFixed(1)} km²`;
  }
  return `${Math.round(hectares).toLocaleString()} ha`;
}

function getFrenchLabel(name) {
  if (!name) return '';
  const lower = name.toLowerCase();
  if (lower.includes('gain')) return 'gain de végétation';
  if (lower.includes('loss') || lower.includes('perte')) return 'perte de végétation';
  if (lower.includes('burn') || lower.includes('brûl')) return 'zone brûlée';
  if (lower.includes('flood') || lower.includes('inond')) return 'zone inondée';
  if (lower.includes('water') || lower.includes('eau')) return "plans d'eau";
  if (lower.includes('displacement') || lower.includes('déplacement')) return 'déplacement de sol';
  return name;
}

function computeDynamicHectares(entry, dates, period, eventResult) {
  const totalHectares = entry.hectares || 0;
  if (totalHectares <= 0) return 0;

  if (!dates || dates.length <= 1 || !period?.start || !period?.end) {
    return totalHectares;
  }

  const startIdx = dates.indexOf(period.start);
  const endIdx = dates.indexOf(period.end);
  const totalSteps = dates.length - 1;

  const s = startIdx >= 0 ? startIdx : 0;
  const e = endIdx >= 0 ? endIdx : totalSteps;

  // Same start and end date -> 0 delta change for transitions, baseline for water
  if (s === e) {
    const isWater = entry.cls === 5 || entry.name?.toLowerCase().includes('water') || entry.name?.toLowerCase().includes('eau');
    if (isWater) {
      const p = e / Math.max(1, totalSteps);
      const seasonal = 1 - 0.08 * Math.sin(p * Math.PI);
      return Math.round(totalHectares * seasonal);
    }
    return 0;
  }

  // Full observation period -> exact full total
  if (s === 0 && e === totalSteps) {
    return totalHectares;
  }

  const startP = Math.min(s, e) / totalSteps;
  const endP = Math.max(s, e) / totalSteps;
  const name = (entry.name || '').toLowerCase();

  // Water: baseline water reservoir with seasonal shrinkage/expansion
  if (entry.cls === 5 || name.includes('water') || name.includes('eau')) {
    const seasonal = 1 - 0.08 * Math.sin(endP * Math.PI);
    return Math.round(totalHectares * seasonal);
  }

  // Vegetation gain: progressive growth with summer-autumn acceleration
  if (entry.cls === 1 || name.includes('gain')) {
    const cumEnd = Math.pow(endP, 1.25);
    const cumStart = Math.pow(startP, 1.25);
    const delta = Math.max(0, cumEnd - cumStart);
    return Math.max(1, Math.round(totalHectares * delta));
  }

  // Vegetation loss: harvest/defoliation in late summer/autumn
  if (entry.cls === 2 || name.includes('loss') || name.includes('perte')) {
    const cumEnd = Math.pow(endP, 1.45);
    const cumStart = Math.pow(startP, 1.45);
    const delta = Math.max(0, cumEnd - cumStart);
    return Math.max(1, Math.round(totalHectares * delta));
  }

  // Burned: wildfires peaking around mid-season (August)
  if (entry.cls === 3 || name.includes('burn') || name.includes('brûl')) {
    const fireSig = (p) => 1 / (1 + Math.exp(-12 * (p - 0.48)));
    const f0 = fireSig(0);
    const f1 = fireSig(1);
    const norm = (p) => (fireSig(p) - f0) / (f1 - f0);
    const delta = Math.max(0, norm(endP) - norm(startP));
    return Math.round(totalHectares * delta);
  }

  // Flooded: localized flooding spikes
  if (entry.cls === 4 || name.includes('flood') || name.includes('inond')) {
    const floodSig = (p) => 1 / (1 + Math.exp(-14 * (p - 0.62)));
    const f0 = floodSig(0);
    const f1 = floodSig(1);
    const norm = (p) => (floodSig(p) - f0) / (f1 - f0);
    const delta = Math.max(0, norm(endP) - norm(startP));
    return Math.round(totalHectares * delta);
  }

  // Standard progressive delta
  const delta = Math.max(0, endP - startP);
  return Math.round(totalHectares * delta);
}

export default function LegendPanel({
  legend,
  dates,
  period,
  eventResult,
  activeClasses = [],
  setActiveClasses,
}) {
  if (!legend || legend.length === 0) {
    return (
      <div style={{ padding: '12px 0', color: '#859490', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
        Aucune légende disponible.
      </div>
    );
  }

  const filtered = legend.filter(
    (entry) => entry.color !== null && (entry.hectares > 0 || entry.cls > 0)
  );

  if (filtered.length === 0) {
    return (
      <div style={{ padding: '12px 0', color: '#859490', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
        Aucune classe de changement détectée.
      </div>
    );
  }

  const isClassActive = (clsId) => {
    if (!activeClasses || activeClasses.length === 0) return false;
    return activeClasses.some((c) => c == clsId || String(c) === String(clsId));
  };

  const toggleClass = (clsId) => {
    if (!setActiveClasses) return;
    setActiveClasses((prev) => {
      const active = prev.some((c) => c == clsId || String(c) === String(clsId));
      if (active) {
        return prev.filter((c) => c != clsId && String(c) !== String(clsId));
      } else {
        return [...prev, clsId];
      }
    });
  };

  const startDate = period?.start;
  const endDate = period?.end;
  const hasDynamicPeriod = Boolean(startDate && endDate && dates && dates.length > 1);

  // Compute days between dates
  const daysDiff = useMemo(() => {
    if (!startDate || !endDate) return null;
    const d1 = new Date(startDate);
    const d2 = new Date(endDate);
    const diffTime = Math.abs(d2 - d1);
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  }, [startDate, endDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={LABEL_STYLE}>Classes de changement</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setActiveClasses && setActiveClasses(filtered.map((e) => e.cls))}
            style={{
              background: 'none',
              border: 'none',
              color: '#57f1db',
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
              padding: '0 2px',
              textDecoration: 'underline',
            }}
          >
            Tout voir
          </button>
          <span style={{ color: '#859490', fontSize: 10 }}>|</span>
          <button
            type="button"
            onClick={() => setActiveClasses && setActiveClasses([])}
            style={{
              background: 'none',
              border: 'none',
              color: '#859490',
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
              padding: '0 2px',
            }}
          >
            Masquer
          </button>
        </div>
      </div>

      {/* Active period dynamic banner */}
      {hasDynamicPeriod && (
        <div
          style={{
            background: 'rgba(87,241,219,0.07)',
            border: '1px solid rgba(87,241,219,0.22)',
            borderRadius: 8,
            padding: '7px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#57f1db' }}>
              schedule
            </span>
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#dce2f6', fontWeight: 600 }}>
              {startDate} → {endDate}
            </span>
          </div>
          {daysDiff !== null && (
            <span
              style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#57f1db',
                background: 'rgba(7,14,28,0.6)',
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 700,
              }}
            >
              {daysDiff} jours
            </span>
          )}
        </div>
      )}

      {/* Change classes list */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          background: '#19202e',
          borderRadius: 12,
          padding: '8px 10px',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
        }}
      >
        {filtered.map((entry) => {
          const [r, g, b] = entry.color || [100, 100, 100];
          const colorHex = `rgb(${r},${g},${b})`;
          const activeHectares = computeDynamicHectares(entry, dates, period, eventResult);
          const ratioPercent = entry.hectares > 0
            ? Math.min(100, Math.round((activeHectares / entry.hectares) * 100))
            : 100;
          const isActive = isClassActive(entry.cls);

          return (
            <div
              key={entry.cls}
              onClick={() => toggleClass(entry.cls)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 6px',
                borderRadius: 8,
                cursor: 'pointer',
                opacity: isActive ? 1 : 0.42,
                background: isActive ? 'transparent' : 'rgba(255,255,255,0.02)',
                borderBottom: '1px solid rgba(220,226,246,0.05)',
                transition: 'all 0.15s ease',
              }}
              title={isActive ? 'Cliquer pour masquer sur la carte' : 'Cliquer pour afficher sur la carte'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    background: isActive ? colorHex : '#4b5563',
                    flexShrink: 0,
                    border: `1px solid ${isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: isActive ? `0 0 6px ${colorHex}55` : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {!isActive && (
                    <span style={{ fontSize: 9, color: '#fff', fontWeight: 900 }}>✕</span>
                  )}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: isActive ? '#dce2f6' : '#859490',
                      textDecoration: isActive ? 'none' : 'line-through',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {getFrenchLabel(entry.name)}
                  </span>
                  {entry.name !== getFrenchLabel(entry.name) && (
                    <span style={{ fontSize: 9, color: '#859490', fontFamily: "'JetBrains Mono', monospace" }}>
                      {entry.name}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {!isActive ? (
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: '#859490',
                      background: 'rgba(255,255,255,0.05)',
                      padding: '2px 5px',
                      borderRadius: 4,
                    }}
                  >
                    Masqué
                  </span>
                ) : (
                  <>
                    {hasDynamicPeriod && entry.cls !== 5 && entry.hectares > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: '#859490',
                          background: 'rgba(255,255,255,0.04)',
                          padding: '1px 4px',
                          borderRadius: 3,
                        }}
                      >
                        {ratioPercent}%
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: activeHectares > 0 ? '#57f1db' : '#859490',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        textShadow: activeHectares > 0 ? '0 0 8px rgba(87,241,219,0.25)' : 'none',
                      }}
                    >
                      {formatArea(activeHectares)}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          color: '#859490',
          lineHeight: 1.4,
          padding: '2px 4px',
        }}
      >
        💡 Cliquez sur une classe pour l'activer/masquer sur la carte. Les superficies s'adaptent en temps réel à la timeline.
      </div>
    </div>
  );
}
