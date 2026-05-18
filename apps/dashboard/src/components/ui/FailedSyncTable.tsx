'use client';
import React from 'react';

interface FailedSync {
    id: string;
    system: string;
    error: string;
    timestamp: string;
}

interface FailedSyncTableProps {
    data: FailedSync[];
}

export const FailedSyncTable = ({ data }: FailedSyncTableProps) => {
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
                Recent Integration Failures
            </h3>
            <div style={{ width: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>System</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Error Detail</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', textAlign: 'right' }}>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((sync, i) => (
                            <tr key={sync.id} style={{ borderBottom: i === data.length - 1 ? 'none' : '1px solid var(--border-light)' }}>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    {sync.system}
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: 'var(--accent-red)', fontWeight: '600' }}>
                                    {sync.error}
                                </td>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', textAlign: 'right' }}>
                                    {new Date(sync.timestamp).toLocaleTimeString()}
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                                    No integration failures detected in selected range.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
