// EvaluationPanel.jsx
// Displays evaluation scores from summary.json — no invented values

const LABEL_STYLE = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#bacac5',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

function MetricBar({ value }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          background: '#070e1c',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: '#57f1db',
            borderRadius: 2,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          color: '#57f1db',
          fontWeight: 700,
          minWidth: 32,
          textAlign: 'right',
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

export default function EvaluationPanel({ evaluation }) {
  if (!evaluation || Object.keys(evaluation).length === 0) {
    return (
      <div style={{ color: '#859490', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: '12px 0' }}>
        Score data not yet available for this zone.
      </div>
    );
  }

  const { tested_on, ...classes } = evaluation;

  // Check if any class has numeric scores
  const hasNumericScores = Object.values(classes).some(
    (v) => v && typeof v === 'object' && 'precision' in v
  );

  // If no numeric scores (e.g. earthquake note), display the note
  if (!hasNumericScores) {
    // Find any string note in evaluation
    const notes = Object.entries(evaluation)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => ({ k, v }));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={LABEL_STYLE}>Evaluation notes</span>
        <div
          style={{
            background: '#19202e',
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {notes.length > 0 ? (
            notes.map(({ k, v }) => (
              <div key={k}>
                <span style={{ fontSize: 11, color: '#859490', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' }}>
                  {k}
                </span>
                <p style={{ fontSize: 12, color: '#bacac5', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.5, margin: '4px 0 0' }}>
                  {v}
                </p>
              </div>
            ))
          ) : (
            <span style={{ fontSize: 12, color: '#859490', fontFamily: "'JetBrains Mono', monospace" }}>
              Score data not yet available for this zone.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={LABEL_STYLE}>Class Scores</span>

      {Object.entries(classes).map(([className, scores]) => {
        if (!scores || typeof scores !== 'object' || !('precision' in scores)) return null;
        const { precision, recall, f1 } = scores;
        return (
          <div
            key={className}
            style={{
              background: '#19202e',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700,
                color: '#dce2f6',
                textTransform: 'capitalize',
              }}
            >
              {className}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { label: 'Precision', value: precision },
                { label: 'Recall',    value: recall },
                { label: 'F1 Score',  value: f1 },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: '#859490', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' }}>
                      {label}
                    </span>
                  </div>
                  <MetricBar value={value} />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {tested_on && (
        <div
          style={{
            background: '#19202e',
            borderRadius: 10,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 10, color: '#859490', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: 1 }}>
            Tested on
          </span>
          <span style={{ fontSize: 11, color: '#bacac5', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.4 }}>
            {tested_on}
          </span>
        </div>
      )}
    </div>
  );
}
