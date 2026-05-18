'use client';
import React, { memo } from 'react';
import { AlertTriangle, Activity, CheckCircle2, Gauge, LucideIcon, TriangleAlert } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  state: 'healthy' | 'warning' | 'critical';
  unit?: string;
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
