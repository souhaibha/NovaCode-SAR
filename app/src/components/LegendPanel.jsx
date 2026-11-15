// LegendPanel.jsx
// Displays the change legend from summary.json
// Filters out entries with color===null (stable) and hectares===0

const LABEL_STYLE = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#bacac5',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

function formatArea(hectares) {
  if (hectares >= 100) {
    const km2 = hectares / 100;
    return km2 >= 10
      ? `${Math.round(km2).toLocaleString()} km²`
      : `${km2.toFixed(1)} km²`;
  }
  return `${hectares.toLocaleString()} ha`;
}

export default function LegendPanel({ legend }) {
  if (!legend || legend.length === 0) {
    return (
      <div style={{ padding: '12px 0', color: '#859490', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
        No legend available.
      </div>
    );
  }

  const filtered = legend.filter(
    (entry) => entry.color !== null && entry.hectares > 0
  );

  if (filtered.length === 0) {
    return (
      <div style={{ padding: '12px 0', color: '#859490', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
        No change classes detected.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={LABEL_STYLE}>Change Classes</span>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: '#19202e',
          borderRadius: 12,
          padding: '10px 12px',
        }}
      >
        {filtered.map((entry) => {
          const [r, g, b] = entry.color;
          const colorHex = `rgb(${r},${g},${b})`;
          return (
            <div
              key={entry.cls}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 2px',
                borderBottom: '1px solid rgba(220,226,246,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: colorHex,
                    flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: '#dce2f6',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  {entry.name}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#57f1db',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  marginLeft: 8,
                }}
              >
                {formatArea(entry.hectares)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
