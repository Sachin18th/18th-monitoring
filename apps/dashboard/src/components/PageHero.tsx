'use client';

import React from 'react';

// Shared gradient hero header — matches the Frontend RUM page. An accent-colored
// icon badge, eyebrow/title/subtitle stack, and an optional right slot for
// per-page controls plus an optional animated "Live" status pill.
export interface PageHeroProps {
  icon: React.ComponentType<any>;
  /** Accent color for the gradient wash + icon badge (hex, e.g. "#60a5fa"). */
  accent?: string;
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  /** Show the pulsing green "Live" pill on the right. */
  live?: boolean;
  /** Extra right-aligned controls (rendered before the Live pill). */
  right?: React.ReactNode;
}

function LivePill() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.1)', flexShrink: 0 }}>
      <span style={{ position: 'relative', display: 'inline-flex', width: '8px', height: '8px' }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '999px', background: '#4ade80', opacity: 0.5, animation: 'ping 1.6s cubic-bezier(0,0,0.2,1) infinite' }} />
        <span style={{ position: 'relative', width: '8px', height: '8px', borderRadius: '999px', background: '#4ade80' }} />
      </span>
      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4ade80' }}>Live</span>
    </div>
  );
}

export function PageHero({ icon: Icon, accent = '#818cf8', eyebrow, title, subtitle, live = false, right }: PageHeroProps) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '16px',
        border: '1px solid var(--border-card)',
        // 8-digit hex alpha: 1a ≈ 10%. Fades the accent into a subtle violet then transparent.
        background: `linear-gradient(135deg, ${accent}1a, rgba(168,85,247,0.06) 55%, transparent)`,
        padding: '24px 26px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '12px', background: `${accent}26`, border: `1px solid ${accent}4d`, flexShrink: 0 }}>
            <Icon style={{ width: '22px', height: '22px', color: accent }} />
          </div>
          <div style={{ minWidth: 0 }}>
            {eyebrow ? (
              <p style={{ margin: '0 0 4px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 600 }}>{eyebrow}</p>
            ) : null}
            <h1 style={{ margin: 0, fontSize: '20px', lineHeight: 1.25, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h1>
            {subtitle ? (
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{subtitle}</p>
            ) : null}
          </div>
        </div>

        {(right || live) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {right}
            {live ? <LivePill /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default PageHero;
