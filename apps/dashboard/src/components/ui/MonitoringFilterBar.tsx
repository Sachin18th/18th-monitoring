'use client';
import React, { useState } from 'react';
import { Card } from '@kpi-platform/ui';
import { RefreshCw, ChevronDown } from 'lucide-react';

interface MonitoringFilterBarProps {
  onTimeframeChange?: (v: string) => void;
  onRegionChange?: (v: string) => void;
  onSystemChange?: (v: string) => void;
  showProjectFilter?: boolean;
  onProjectChange?: (v: string) => void;
  projects?: { id: string; name: string }[];
  lastRefreshed?: Date;
}

export const MonitoringFilterBar: React.FC<MonitoringFilterBarProps> = ({
  onTimeframeChange,
  onRegionChange,
  onSystemChange,
  showProjectFilter = false,
  onProjectChange,
  projects = [],
  lastRefreshed,
}) => {
  const [timeframe, setTimeframe] = useState('24h');
  const [region, setRegion] = useState('global');
  const [system, setSystem] = useState('all');

  const handleTimeframe = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTimeframe(e.target.value);
    onTimeframeChange?.(e.target.value);
  };

  const handleRegion = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRegion(e.target.value);
    onRegionChange?.(e.target.value);
  };

  const handleSystem = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSystem(e.target.value);
    onSystemChange?.(e.target.value);
  };

  return (
    <div style={containerStyle}>
      <div style={leftGroupStyle}>
        {/* Timeframe */}
        <div style={filterNodeStyle}>
          <span style={filterLabelStyle}>TIMEFRAME</span>
          <SelectPill value={timeframe} onChange={handleTimeframe}>
            <option value="1h">Last 1 Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </SelectPill>
        </div>

        <div style={dividerStyle} />

        {/* Region */}
        <div style={filterNodeStyle}>
          <span style={filterLabelStyle}>REGION</span>
          <SelectPill value={region} onChange={handleRegion}>
            <option value="global">Global Edge</option>
            <option value="us-east">US-East-1</option>
            <option value="eu">EU-Central</option>
            <option value="ap">AP-South-1</option>
          </SelectPill>
        </div>

        <div style={dividerStyle} />

        {/* System */}
        <div style={filterNodeStyle}>
          <span style={filterLabelStyle}>SYSTEM</span>
          <SelectPill value={system} onChange={handleSystem}>
            <option value="all">All Topologies</option>
            <option value="frontend">Frontend Core</option>
            <option value="payment">Payment Gateway</option>
            <option value="auth">Authentication</option>
            <option value="oms">OMS / Integrations</option>
          </SelectPill>
        </div>

        {showProjectFilter && projects.length > 0 && (
          <>
            <div style={dividerStyle} />
            <div style={filterNodeStyle}>
              <span style={filterLabelStyle}>PROJECT</span>
              <SelectPill value="" onChange={e => onProjectChange?.(e.target.value)}>
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </SelectPill>
            </div>
          </>
        )}
      </div>

      {/* Right: live refresh indicator */}
      <div style={rightGroupStyle}>
        <div style={refreshIndicatorStyle}>
          <span style={pulseDotStyle} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>
            Auto-refreshing
          </span>
        </div>
        <LastRefreshedLabel date={lastRefreshed} />
      </div>
    </div>
  );
};

const LastRefreshedLabel: React.FC<{ date?: Date }> = ({ date }) => {
  const [mounted, setMounted] = useState(false);
  
  useState(() => {
    // Only works in browser
    if (typeof window !== 'undefined') setMounted(true);
  });

  // Use useEffect for cleaner hydration in Next.js
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!date || !mounted) return null;

  return (
    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
      Updated {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
};

const SelectPill: React.FC<{
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}> = ({ value, onChange, children }) => (
  <select value={value} onChange={onChange} style={selectStyle}>
    {children}
  </select>
);

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 20px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-xl)',
  marginBottom: '24px',
  flexWrap: 'wrap',
  gap: '12px',
};

const leftGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
};

const rightGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexShrink: 0,
};

const filterNodeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const filterLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 800,
  color: 'var(--text-muted)',
  letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
};

const dividerStyle: React.CSSProperties = {
  width: '1px',
  height: '20px',
  background: 'var(--border-subtle)',
  flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
  appearance: 'none',
  background: 'var(--bg-muted)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '20px',
  padding: '5px 28px 5px 12px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  outline: 'none',
  backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%2394a3b8' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
  transition: 'border-color 0.15s',
};

const refreshIndicatorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const pulseDotStyle: React.CSSProperties = {
  width: '7px',
  height: '7px',
  borderRadius: '50%',
  background: '#10b981',
  boxShadow: '0 0 6px #10b981',
  animation: 'pulse 2s infinite',
  display: 'inline-block',
};
