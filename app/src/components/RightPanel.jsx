// RightPanel.jsx
// Replaces SidebarRight.jsx — tabs: Legend | Info | Help | Story | Scores | Analyze
// Props: { zone, onJobResult } — the full summary.json of the active site

import { useState } from 'react';
import LegendPanel from './LegendPanel';
import InfoPanel from './InfoPanel';
import HelpPanel from './HelpPanel';
import StoryCard from './StoryCard';
import EvaluationPanel from './EvaluationPanel';
import AnalyzePanel from './AnalyzePanel';

const TABS = [
  { key: 'legend',  label: 'Legend' },
  { key: 'info',    label: 'Info' },
  { key: 'help',    label: 'Help' },
  { key: 'story',   label: 'Story' },
  { key: 'scores',  label: 'Scores' },
  { key: 'analyze', label: 'Analyze' },
];

export default function RightPanel({ zone, onJobResult }) {
  const [activeTab, setActiveTab] = useState('legend');

  const hasEvaluation =
    zone?.evaluation &&
    Object.keys(zone.evaluation).length > 0;

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        background: '#151b2a',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderLeft: '1px solid rgba(220,226,246,0.07)',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(220,226,246,0.07)',
          padding: '0 4px',
          gap: 1,
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: '10px 1px 9px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid #57f1db'
                  : '2px solid transparent',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#57f1db' : '#859490',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 14px 20px',
        }}
      >
        {activeTab === 'legend' && (
          <LegendPanel legend={zone?.legend} />
        )}

        {activeTab === 'info' && (
          <InfoPanel
            source={zone?.source}
            dates={zone?.dates}
            excluded_dates={zone?.excluded_dates}
          />
        )}

        {activeTab === 'help' && (
          <HelpPanel />
        )}

        {activeTab === 'story' && (
          <StoryCard zone={zone} />
        )}

        {activeTab === 'scores' && (
          hasEvaluation ? (
            <EvaluationPanel evaluation={zone.evaluation} />
          ) : (
            <div
              style={{
                padding: '20px 0',
                color: '#859490',
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.6,
              }}
            >
              Score data not yet available for this zone.
            </div>
          )
        )}

        {activeTab === 'analyze' && (
          <AnalyzePanel bbox={zone?.bbox || zone?.bounds} onJobResult={onJobResult} />
        )}
      </div>
    </div>
  );
}
