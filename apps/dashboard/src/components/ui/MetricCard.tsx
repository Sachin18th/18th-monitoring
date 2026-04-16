'use client';
import React, { useState } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  state: 'healthy' | 'warning' | 'critical';
  unit?: string;
  icon: string;
  trendPct?: number;
  gradient?: string;
}

export const MetricCard = ({ title, value, state, unit = '', icon, trendPct, gradient }: MetricCardProps) => {
  const [hovered, setHovered] = useState(false);

  const stateColor =
    state === 'critical' ? 'var(--accent-red)' :
    state === 'warning'  ? 'var(--accent-orange)' : 'var(--accent-green)';

  const stateBg =
    state === 'critical' ? 'rgba(220, 38, 38, 0.04)' :
    state === 'warning'  ? 'rgba(217, 119, 6, 0.04)' : 'rgba(16, 185, 129, 0.04)';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: `var(--bg-surface)`,
        border: `1px solid ${state !== 'healthy' ? stateColor + '33' : 'var(--border)'}`,
        borderRadius: '16px',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Dynamic Background Gradient */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: hovered ? stateBg : 'transparent',
        transition: 'background 0.3s ease',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <span style={{
            fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '1px',
          }}>{title}</span>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: `${stateColor}12`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px',
            border: `1px solid ${stateColor}15`
          }}>{icon}</div>
        </div>

        {/* Value Area */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
          <span style={{
            fontSize: '36px', fontWeight: '800', color: 'var(--text-primary)',
            letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', lineHeight: '1',
          }}>
            {value === null || value === undefined || value === 'N/A' ? '—' : value}
          </span>
          {unit && <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '600' }}>{unit}</span>}
        </div>

        {/* Status Indicator Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '4px 8px', borderRadius: '20px',
            background: `${stateColor}08`
          }}>
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: stateColor,
              boxShadow: `0 0 6px ${stateColor}66`,
            }} />
            <span style={{
              fontSize: '10px', fontWeight: '800', color: stateColor,
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>{state}</span>
          </div>
          
          {trendPct !== undefined && trendPct !== 0 && (
            <div style={{
              fontSize: '13px', fontWeight: '700',
              color: trendPct > 0 ? 'var(--accent-red)' : 'var(--accent-green)',
              display: 'flex', alignItems: 'center', gap: '2px'
            }}>
              {trendPct > 0 ? '↑' : '↓'} {Math.abs(trendPct)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
