// HelpPanel.jsx
// Static "How to read radar colours" guide for NISAR L-band HH/HV

const LABEL_STYLE = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#bacac5',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const CARD_STYLE = {
  background: '#19202e',
  borderRadius: 12,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

function ColorRow({ dot, label, desc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: dot,
          flexShrink: 0,
          marginTop: 2,
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span
          style={{
            fontSize: 12,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700,
            color: '#dce2f6',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            color: '#859490',
            lineHeight: 1.5,
          }}
        >
          {desc}
        </span>
      </div>
    </div>
  );
}

export default function HelpPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Title badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 10,
          background: 'rgba(87,241,219,0.07)',
          border: '1px solid rgba(87,241,219,0.18)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            color: '#57f1db',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
          }}
        >
          NISAR L-band HH/HV Polarimetry
        </span>
      </div>

      {/* RGB colour key */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={LABEL_STYLE}>False-colour composite</span>
        <div style={CARD_STYLE}>
          <ColorRow
            dot="rgb(220,60,60)"
            label="Red — HH"
            desc="Rough or bright surfaces: buildings, rocks, tall crops. Strong direct backscatter."
          />
          <ColorRow
            dot="rgb(60,180,60)"
            label="Green — HV"
            desc="Volume scattering from vegetation canopy: forests, crops, shrubs."
          />
          <ColorRow
            dot="rgb(60,100,220)"
            label="Blue — HH − HV (dB)"
            desc="Contrast between direct and volume scattering. Highlights open water and bare soil."
          />
        </div>
      </div>

      {/* Why radar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={LABEL_STYLE}>Why radar?</span>
        <div style={CARD_STYLE}>
          <p
            style={{
              fontSize: 12,
              color: '#bacac5',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Synthetic Aperture Radar (SAR) transmits its own microwave pulses.
            Unlike optical cameras, SAR operates day and night and penetrates
            cloud cover, smoke, and haze — which makes it uniquely valuable for
            monitoring floods, deforestation, and agricultural cycles in regions
            that are frequently overcast.
          </p>
        </div>
      </div>

      {/* Reading tips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={LABEL_STYLE}>Reading tips</span>
        <div style={CARD_STYLE}>
          {[
            { tip: 'Bright cyan/white', meaning: 'Very high backscatter — corner reflectors, metallic structures.' },
            { tip: 'Dark (near-black)', meaning: 'Calm open water or very smooth surface — specular reflection away from sensor.' },
            { tip: 'Dark green', meaning: 'Flooded vegetation — double-bounce under canopy.' },
          ].map(({ tip, meaning }) => (
            <div key={tip} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#57f1db', fontWeight: 700 }}>
                {tip}
              </span>
              <span style={{ fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#859490', lineHeight: 1.4 }}>
                {meaning}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
