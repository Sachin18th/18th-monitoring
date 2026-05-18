'use client';
import React from 'react';

interface TopPage {
    url: string;
    count: number;
}

interface TopPagesTableProps {
    data: TopPage[];
}

export const TopPagesTable = ({ data }: TopPagesTableProps) => {
    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            width: '100%',
            height: '100%'
        }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Top Visited Pages
            </h3>
            <div style={{ width: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>URL Path</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', textAlign: 'right' }}>Page Views</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((page, i) => (
                            <tr key={i} style={{ borderBottom: i === data.length - 1 ? 'none' : '1px solid var(--border-light)' }}>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                    {page.url}
                                </td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)', textAlign: 'right' }}>
                                    {page.count.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={2} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                                    No page view data available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
