'use client';
import React, { useState } from 'react';

interface FailureRecord {
    runId: string;
    timestamp: string;
    journey_name: string;
    step_name?: string;
    device_type: string;
    browser: string;
    error_logs?: string;
    screenshot_url?: string;
    execution_time?: number;
}

interface SyntheticFailureLogProps {
    data: FailureRecord[];
    title?: string;
}

export const SyntheticFailureLog = ({ data, title = 'Failure Log' }: SyntheticFailureLogProps) => {
    const [expanded, setExpanded] = useState<string | null>(null);

    if (!data || data.length === 0) return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            padding: '28px',
            textAlign: 'center',
        }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
            <h3 style={{ color: '#10b981', fontWeight: '800', marginBottom: '4px' }}>No Failures Detected</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>All synthetic journeys are passing successfully.</p>
        </div>
    );

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: 'var(--shadow-sm)',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                    {title}
                </h3>
                <span style={{
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                    borderRadius: '8px', padding: '4px 12px',
                    fontSize: '12px', fontWeight: '800', border: '1px solid rgba(239,68,68,0.2)',
                }}>
                    {data.length} Failure{data.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {data.map((item) => {
                    const isExp = expanded === item.runId;
                    return (
                        <div
                            key={item.runId}
                            style={{
                                background: isExp ? 'rgba(239,68,68,0.05)' : 'var(--bg-elevated)',
                                border: `1px solid ${isExp ? 'rgba(239,68,68,0.2)' : 'var(--border-light)'}`,
                                borderRadius: '12px',
                                overflow: 'hidden',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <div
                                onClick={() => setExpanded(isExp ? null : item.runId)}
                                style={{
                                    padding: '14px 16px', cursor: 'pointer',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                                            {item.journey_name} {item.step_name ? `— ${item.step_name}` : ''}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {new Date(item.timestamp).toLocaleString()} · {item.device_type} · {item.browser}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {item.execution_time && (
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {(item.execution_time / 1000).toFixed(1)}s
                                        </span>
                                    )}
                                    <span style={{ fontSize: '16px', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isExp ? 'rotate(180deg)' : 'none' }}>▾</span>
                                </div>
                            </div>

                            {isExp && (
                                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-light)' }}>
                                    {item.error_logs && (
                                        <div style={{ marginTop: '12px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Error Log</div>
                                            <pre style={{
                                                fontFamily: 'monospace', fontSize: '12px', color: '#ef4444',
                                                background: 'rgba(239,68,68,0.05)', borderRadius: '8px', padding: '10px',
                                                margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                                border: '1px solid rgba(239,68,68,0.1)',
                                            }}>
                                                {item.error_logs}
                                            </pre>
                                        </div>
                                    )}
                                    {item.screenshot_url && (
                                        <div style={{ marginTop: '12px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Screenshot</div>
                                            <a href={item.screenshot_url} target="_blank" rel="noopener noreferrer"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    fontSize: '12px', color: '#3b82f6', fontWeight: '600',
                                                    background: 'rgba(59,130,246,0.08)', borderRadius: '8px', padding: '6px 14px',
                                                    border: '1px solid rgba(59,130,246,0.2)', textDecoration: 'none',
                                                }}>
                                                📸 View Failure Screenshot
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
