'use client';
<<<<<<< HEAD
import React, { memo } from 'react';
import { AlertTriangle, Activity, CheckCircle2, Gauge, LucideIcon, TriangleAlert } from 'lucide-react';
=======
import React, { useState } from 'react';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

interface MetricCardProps {
  title: string;
  value: string | number;
  state: 'healthy' | 'warning' | 'critical';
  unit?: string;
<<<<<<< HEAD
  icon?: React.ReactNode;
  trendPct?: number;
  loading?: boolean;
}

const FALLBACK_ICONS: Record<MetricCardProps['state'], LucideIcon> = {
  healthy: CheckCircle2,
  warning: TriangleAlert,
  critical: AlertTriangle,
};

export const MetricCard = memo(function MetricCard({
  title,
  value,
  state,
  unit = '',
  icon,
  trendPct,
  loading = false,
}: MetricCardProps) {
  const Icon = FALLBACK_ICONS[state] ?? Gauge;
  const normalizedValue = value === null || value === undefined || value === 'N/A' ? '--' : value;
  const trendTone = trendPct === undefined || trendPct === 0 ? 'neutral' : trendPct > 0 ? 'up' : 'down';

  return (
    <article className={`metric-card metric-card--${state}`}>
      <div className="metric-card__top">
        <div className="metric-card__eyebrow">{title}</div>
        <div className="metric-card__icon" aria-hidden="true">
          {React.isValidElement(icon) ? icon : icon ? <span>{icon}</span> : <Icon size={18} />}
        </div>
      </div>

      {loading ? (
        <div className="metric-card__loading">
          <div className="skeleton metric-card__skeleton metric-card__skeleton--value" />
          <div className="skeleton metric-card__skeleton metric-card__skeleton--meta" />
        </div>
      ) : (
        <>
          <div className="metric-card__value-row">
            <strong className="metric-card__value">{normalizedValue}</strong>
            {unit ? <span className="metric-card__unit">{unit}</span> : null}
          </div>

          <div className="metric-card__footer">
            <span className="metric-card__status">
              <span className="metric-card__status-dot" />
              {state}
            </span>
            {trendPct !== undefined && trendPct !== 0 ? (
              <span className={`metric-card__trend metric-card__trend--${trendTone}`}>
                {trendPct > 0 ? 'Up' : 'Down'} {Math.abs(trendPct).toFixed(1)}%
              </span>
            ) : (
              <span className="metric-card__trend metric-card__trend--neutral">Stable</span>
            )}
          </div>
        </>
      )}

      <style jsx>{`
        .metric-card {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-height: 190px;
          padding: 1.35rem;
          border-radius: 22px;
          border: 1px solid var(--border-subtle);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 88%, white), var(--bg-surface));
          box-shadow: var(--shadow-sm);
          transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
        }

        .metric-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .metric-card--healthy {
          border-color: color-mix(in srgb, var(--success) 18%, var(--border-subtle));
        }

        .metric-card--warning {
          border-color: color-mix(in srgb, var(--warning) 22%, var(--border-subtle));
        }

        .metric-card--critical {
          border-color: color-mix(in srgb, var(--error) 22%, var(--border-subtle));
        }

        .metric-card__top,
        .metric-card__footer,
        .metric-card__value-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .metric-card__top {
          align-items: flex-start;
        }

        .metric-card__eyebrow {
          font-size: 0.73rem;
          line-height: 1.4;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-secondary);
        }

        .metric-card__icon {
          width: 2.75rem;
          height: 2.75rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          background: color-mix(in srgb, currentColor 10%, transparent);
        }

        .metric-card--healthy .metric-card__icon {
          color: var(--success);
          background: color-mix(in srgb, var(--success) 12%, var(--bg-surface));
        }

        .metric-card--warning .metric-card__icon {
          color: var(--warning);
          background: color-mix(in srgb, var(--warning) 12%, var(--bg-surface));
        }

        .metric-card--critical .metric-card__icon {
          color: var(--error);
          background: color-mix(in srgb, var(--error) 12%, var(--bg-surface));
        }

        .metric-card__value-row {
          justify-content: flex-start;
          align-items: baseline;
          margin-top: auto;
        }

        .metric-card__value {
          font-size: clamp(2rem, 3vw, 2.5rem);
          line-height: 1;
          letter-spacing: -0.06em;
          font-weight: 800;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .metric-card__unit {
          color: var(--text-secondary);
          font-size: 0.95rem;
          font-weight: 700;
        }

        .metric-card__status,
        .metric-card__trend {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          min-height: 30px;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .metric-card__status {
          background: color-mix(in srgb, var(--bg-muted) 80%, var(--bg-surface));
          color: var(--text-secondary);
        }

        .metric-card__status-dot {
          width: 0.45rem;
          height: 0.45rem;
          border-radius: 999px;
          background: currentColor;
        }

        .metric-card--healthy .metric-card__status {
          color: var(--success-text);
          background: var(--success-bg);
        }

        .metric-card--warning .metric-card__status {
          color: var(--warning-text);
          background: var(--warning-bg);
        }

        .metric-card--critical .metric-card__status {
          color: var(--error-text);
          background: var(--error-bg);
        }

        .metric-card__trend--up {
          color: var(--error-text);
          background: var(--error-bg);
        }

        .metric-card__trend--down {
          color: var(--success-text);
          background: var(--success-bg);
        }

        .metric-card__trend--neutral {
          color: var(--text-muted);
          background: color-mix(in srgb, var(--bg-muted) 85%, var(--bg-surface));
        }

        .metric-card__loading {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          margin-top: auto;
        }

        .metric-card__skeleton {
          border-radius: 10px;
        }

        .metric-card__skeleton--value {
          height: 2.35rem;
          width: 68%;
        }

        .metric-card__skeleton--meta {
          height: 0.95rem;
          width: 42%;
        }
      `}</style>
    </article>
  );
});
=======
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
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
