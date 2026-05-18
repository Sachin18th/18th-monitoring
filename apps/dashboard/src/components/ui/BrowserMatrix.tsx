'use client';
import React from 'react';

interface BrowserRow {
    browser: string;
    desktop_lcp: number;
    mobile_lcp: number;
    desktop_success: number;
    mobile_success: number;
}

interface BrowserMatrixProps {
    title?: string;
}

const MOCK_DATA: BrowserRow[] = [
    { browser: 'Chrome', desktop_lcp: 1180, mobile_lcp: 2340, desktop_success: 99.8, mobile_success: 98.9 },
    { browser: 'Safari', desktop_lcp: 1320, mobile_lcp: 2100, desktop_success: 99.2, mobile_success: 99.4 },
    { browser: 'Firefox', desktop_lcp: 1450, mobile_lcp: 2580, desktop_success: 98.8, mobile_success: 97.6 },
    { browser: 'Edge', desktop_lcp: 1210, mobile_lcp: 2290, desktop_success: 99.5, mobile_success: 98.7 },
];

const browserIcons: Record<string, string> = {
    Chrome: '🌐', Safari: '🧭', Firefox: '🦊', Edge: '🔵',
};

const getColor = (val: number, type: 'lcp' | 'rate') => {
    if (type === 'lcp') return val > 3000 ? '#ef4444' : val > 2000 ? '#f59e0b' : '#10b981';
    return val >= 99 ? '#10b981' : val >= 95 ? '#f59e0b' : '#ef4444';
};

export const BrowserMatrix = ({ title = 'Browser Performance Matrix' }: BrowserMatrixProps) => {
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

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Browser</th>
                            <th style={{ textAlign: 'center', padding: '10px 12px', color: '#3b82f6', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🖥 Desktop LCP</th>
                            <th style={{ textAlign: 'center', padding: '10px 12px', color: '#8b5cf6', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📱 Mobile LCP</th>
                            <th style={{ textAlign: 'center', padding: '10px 12px', color: '#3b82f6', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🖥 Desktop Rate</th>
                            <th style={{ textAlign: 'center', padding: '10px 12px', color: '#8b5cf6', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📱 Mobile Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {MOCK_DATA.map((row, i) => (
                            <tr key={i} style={{
                                borderBottom: '1px solid var(--border-light)',
                                transition: 'background 0.15s',
                            }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                <td style={{ padding: '14px 12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '18px' }}>{browserIcons[row.browser]}</span>
                                        <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{row.browser}</span>
                                    </div>
                                </td>

                                {[
                                    { val: row.desktop_lcp, type: 'lcp', suffix: 'ms' },
                                    { val: row.mobile_lcp, type: 'lcp', suffix: 'ms' },
                                    { val: row.desktop_success, type: 'rate', suffix: '%' },
                                    { val: row.mobile_success, type: 'rate', suffix: '%' },
                                ].map((cell, ci) => {
                                    const color = getColor(cell.val, cell.type as 'lcp' | 'rate');
                                    return (
                                        <td key={ci} style={{ textAlign: 'center', padding: '14px 12px' }}>
                                            <span style={{
                                                fontWeight: '800', fontSize: '14px', color,
                                                background: `${color}12`, borderRadius: '8px', padding: '4px 10px',
                                            }}>
                                                {cell.val}{cell.suffix}
                                            </span>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
