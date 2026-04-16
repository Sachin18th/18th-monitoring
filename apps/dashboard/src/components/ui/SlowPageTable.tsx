'use client';
import React from 'react';
import { StatusBadge } from './StatusBadge';

interface SlowPage {
    url: string;
    avgLoadTime: number;
    status: 'healthy' | 'warning' | 'critical';
}

interface SlowPageTableProps {
    data: SlowPage[];
    title?: string;
}

export const SlowPageTable = ({ data, title = 'Slowest Pages' }: SlowPageTableProps) => {
    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            width: '100%'
        }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {title}
            </h3>
            <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>URL Path</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Avg Load Time</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((page, i) => (
                            <tr key={i} style={{ borderBottom: i === data.length - 1 ? 'none' : '1px solid var(--border-light)', transition: 'background 0.2s ease' }}>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                    {page.url}
                                </td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                    {page.avgLoadTime} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>ms</span>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <StatusBadge status={page.status === 'healthy' ? 'resolved' : page.status} />
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>
                                    No slow pages detected in this time range.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
