// InfoPanel.jsx
// Displays source, date range, and excluded dates from summary.json
// Never shows invented data

const LABEL_STYLE = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#bacac5',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const VALUE_STYLE = {
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#dce2f6',
};

const CARD_STYLE = {
  background: '#19202e',
  borderRadius: 12,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

export default function InfoPanel({ source, dates, excluded_dates }) {
  const dateFirst = dates && dates.length > 0 ? dates[0] : null;
  const dateLast = dates && dates.length > 0 ? dates[dates.length - 1] : null;
  const count = dates ? dates.length : 0;

  const excluded = excluded_dates && excluded_dates.length > 0 ? excluded_dates : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Source */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={LABEL_STYLE}>Data Source</span>
        <div style={CARD_STYLE}>
          <span style={{ ...VALUE_STYLE, lineHeight: 1.5 }}>{source || '—'}</span>
        </div>
      </div>

      {/* Date range */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={LABEL_STYLE}>Date Range</span>
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#859490', fontFamily: "'JetBrains Mono', monospace" }}>
              First
            </span>
            <span style={{ ...VALUE_STYLE, fontWeight: 700, color: '#57f1db' }}>
              {dateFirst || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#859490', fontFamily: "'JetBrains Mono', monospace" }}>
              Last
            </span>
            <span style={{ ...VALUE_STYLE, fontWeight: 700, color: '#57f1db' }}>
              {dateLast || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid rgba(220,226,246,0.07)' }}>
            <span style={{ fontSize: 11, color: '#859490', fontFamily: "'JetBrains Mono', monospace" }}>
              Passes
            </span>
            <span style={{ ...VALUE_STYLE, fontWeight: 700 }}>
              {count}
            </span>
          </div>
        </div>
      </div>

      {/* Excluded dates */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={LABEL_STYLE}>Excluded Dates</span>
        <div style={CARD_STYLE}>
          {excluded ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {excluded.map((d) => (
                <span key={d} style={{ ...VALUE_STYLE, color: '#ffb4ab' }}>
                  {d}
                </span>
              ))}
            </div>
          ) : (
            <span style={{ ...VALUE_STYLE, color: '#859490' }}>None</span>
          )}
        </div>
      </div>
    </div>
  );
}
