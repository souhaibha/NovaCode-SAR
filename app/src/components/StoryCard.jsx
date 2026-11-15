// StoryCard.jsx
// Displays site narrative from summary.json — no invented values

const EVENT_COLORS = {
  farming:    { bg: 'rgba(40,200,80,0.12)',  border: 'rgba(40,200,80,0.35)',  text: '#57f1a0' },
  flood:      { bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.35)', text: '#38bdf8' },
  fire:       { bg: 'rgba(255,185,95,0.12)', border: 'rgba(255,185,95,0.35)', text: '#ffb95f' },
  earthquake: { bg: 'rgba(192,132,252,0.12)',border: 'rgba(192,132,252,0.35)',text: '#c084fc' },
  unknown:    { bg: 'rgba(133,148,144,0.12)',border: 'rgba(133,148,144,0.35)',text: '#859490' },
};

function getEventStyle(event) {
  return EVENT_COLORS[event] || EVENT_COLORS.unknown;
}

export default function StoryCard({ zone }) {
  if (!zone) {
    return (
      <div style={{ color: '#859490', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: '12px 0' }}>
        No site selected.
      </div>
    );
  }

  const eventStyle = getEventStyle(zone.event);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Site name + event badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 14,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700,
            color: '#dce2f6',
            lineHeight: 1.3,
          }}
        >
          {zone.name}
        </span>
        {zone.event && (
          <span
            style={{
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: eventStyle.text,
              background: eventStyle.bg,
              border: `1px solid ${eventStyle.border}`,
              padding: '2px 8px',
              borderRadius: 20,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {zone.event}
          </span>
        )}
      </div>

      {/* Event date, if present */}
      {zone.event_date && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#859490',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>event</span>
          Event detected: {zone.event_date}
        </div>
      )}

      {/* Story text */}
      {zone.story ? (
        <div
          style={{
            background: '#19202e',
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: '#bacac5',
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {zone.story}
          </p>
        </div>
      ) : (
        <div
          style={{
            background: '#19202e',
            borderRadius: 12,
            padding: '12px 14px',
            color: '#859490',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          No story available for this site.
        </div>
      )}

      {/* Sensor note — always NISAR L-band HH/HV */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 8,
          background: 'rgba(87,241,219,0.06)',
          border: '1px solid rgba(87,241,219,0.14)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#57f1db',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          NISAR L-band HH/HV
        </span>
      </div>
    </div>
  );
}
