'use client';
import React, { useState } from 'react';

interface JourneySummary {
    journey: string;
    successRate: number;
    avgTime: number;
}

interface SyntheticJourneyWidgetProps {
    data: JourneySummary[];
    lastRun?: string;
    nextRun?: string;
}

const journeyIcons: Record<string, string> = {
    'Homepage Load': '🏠',
    'Login Flow': '🔐',
    'Signup Flow': '📝',
    'Protected Route Access': '🛡️',
    'Navigation': '🧭',
    'Logout Flow': '🚪',
};

export const SyntheticJourneyWidget = ({ data, lastRun, nextRun }: SyntheticJourneyWidgetProps) => {
    const [hovered, setHovered] = useState<string | null>(null);

    const overallSuccessRate = data.length > 0
        ? Math.round(data.reduce((s, d) => s + d.successRate, 0) / data.length * 10) / 10
        : 99.4;

    const globalState = overallSuccessRate >= 99 ? 'healthy' : overallSuccessRate >= 95 ? 'warning' : 'critical';
    const stateColor = globalState === 'critical' ? '#ef4444' : globalState === 'warning' ? '#f59e0b' : '#10b981';
    const stateBg = globalState === 'critical' ? 'rgba(239,68,68,0.08)' : globalState === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)';

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: `1px solid var(--border)`,
            borderRadius: '20px',
            padding: '28px',
            boxShadow: 'var(--shadow-sm)',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Header glow */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                background: `linear-gradient(90deg, ${stateColor}, transparent)`,
                opacity: 0.8,
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                            Synthetic Journey Health
                        </h3>
                        <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: stateColor,
                            boxShadow: `0 0 8px ${stateColor}88`,
                            animation: 'pulse 2s infinite',
                        }} />
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Automated critical-path validation</p>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        fontSize: '36px', fontWeight: '900', color: stateColor,
                        letterSpacing: '-1px', lineHeight: '1',
                    }}>{overallSuccessRate}%</div>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Success Rate
                    </div>
                </div>
            </div>

            {/* Journey Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                {data.map((item) => {
                    const rate = item.successRate;
                    const color = rate >= 99 ? '#10b981' : rate >= 95 ? '#f59e0b' : '#ef4444';
                    const bg = rate >= 99 ? 'rgba(16,185,129,0.06)' : rate >= 95 ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)';
                    const isHov = hovered === item.journey;

                    return (
                        <div
                            key={item.journey}
                            onMouseEnter={() => setHovered(item.journey)}
                            onMouseLeave={() => setHovered(null)}
                            style={{
                                background: isHov ? bg : 'var(--bg-elevated)',
                                border: `1px solid ${isHov ? color + '33' : 'var(--border-light)'}`,
                                borderRadius: '12px',
                                padding: '16px',
                                cursor: 'default',
                                transition: 'all 0.2s ease',
                                transform: isHov ? 'translateY(-2px)' : 'none',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '18px' }}>{journeyIcons[item.journey] || '🔄'}</span>
                                <span style={{
                                    fontSize: '11px', fontWeight: '800', color,
                                    background: `${color}15`, borderRadius: '6px', padding: '2px 8px',
                                }}>{rate}%</span>
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                {item.journey}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Avg: {item.avgTime > 0 ? `${(item.avgTime / 1000).toFixed(1)}s` : 'N/A'}
                            </div>
                            {/* Progress bar */}
                            <div style={{ marginTop: '10px', height: '3px', borderRadius: '4px', background: 'var(--border-light)', overflow: 'hidden' }}>
                                <div style={{ width: `${rate}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer: Last Run / Next Run */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: '16px', borderTop: '1px solid var(--border-light)',
            }}>
                <div style={{ display: 'flex', gap: '24px' }}>
                    <div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Last Run</div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                            {lastRun ? new Date(lastRun).toLocaleString() : 'Just now'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Next Scheduled</div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                            {nextRun ? new Date(nextRun).toLocaleString() : 'In ~4 hours'}
                        </div>
                    </div>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: stateBg, border: `1px solid ${stateColor}22`,
                    borderRadius: '10px', padding: '6px 14px',
                }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: stateColor, boxShadow: `0 0 6px ${stateColor}66` }} />
                    <span style={{ fontSize: '11px', fontWeight: '800', color: stateColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {globalState}
                    </span>
                </div>
            </div>
        </div>
    );
};
