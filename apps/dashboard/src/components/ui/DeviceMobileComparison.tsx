'use client';
import React from 'react';

interface ComparisonMetric {
    label: string;
    desktop: number;
    mobile: number;
    unit: string;
    lowerIsBetter?: boolean;
}

const METRICS: ComparisonMetric[] = [
    { label: 'LCP', desktop: 1180, mobile: 2340, unit: 'ms', lowerIsBetter: true },
    { label: 'TTFB', desktop: 145, mobile: 390, unit: 'ms', lowerIsBetter: true },
    { label: 'FCP', desktop: 680, mobile: 1420, unit: 'ms', lowerIsBetter: true },
    { label: 'CLS', desktop: 0.04, mobile: 0.09, unit: '', lowerIsBetter: true },
    { label: 'Success Rate', desktop: 99.4, mobile: 98.1, unit: '%', lowerIsBetter: false },
];

export const DeviceMobileComparison = ({ title = 'Desktop vs Mobile Comparison' }: { title?: string }) => {
    const maxVal = (m: ComparisonMetric) => Math.max(m.desktop, m.mobile) * 1.1 || 1;

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: 'var(--shadow-sm)',
        }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '20px' }}>
                {title}
            </h3>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#3b82f6' }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>🖥 Desktop</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#8b5cf6' }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>📱 Mobile</span>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {METRICS.map((m) => {
                    const max = maxVal(m);
                    const desktopPct = (m.desktop / max) * 100;
                    const mobilePct = (m.mobile / max) * 100;

                    const desktopColor = m.lowerIsBetter
                        ? (m.desktop < m.mobile ? '#10b981' : '#3b82f6')
                        : (m.desktop >= m.mobile ? '#10b981' : '#ef4444');

                    return (
                        <div key={m.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>{m.label}</span>
                                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: '700' }}>
                                    <span style={{ color: '#3b82f6' }}>{m.desktop}{m.unit}</span>
                                    <span style={{ color: '#8b5cf6' }}>{m.mobile}{m.unit}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ height: '6px', borderRadius: '4px', background: 'var(--border-light)', overflow: 'hidden' }}>
                                    <div style={{ width: `${desktopPct}%`, height: '100%', background: '#3b82f6', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                                </div>
                                <div style={{ height: '6px', borderRadius: '4px', background: 'var(--border-light)', overflow: 'hidden' }}>
                                    <div style={{ width: `${mobilePct}%`, height: '100%', background: '#8b5cf6', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
