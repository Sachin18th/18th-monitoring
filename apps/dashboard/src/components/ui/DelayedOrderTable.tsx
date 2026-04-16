'use client';
import React from 'react';
import { StatusBadge } from './StatusBadge';

interface DelayedOrder {
    orderId: string;
    placedAt: string;
    channel: string;
    minutesDelayed: number;
}

interface DelayedOrderTableProps {
    data: DelayedOrder[];
}

export const DelayedOrderTable = ({ data }: DelayedOrderTableProps) => {
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
                Delayed Orders (&gt;5s for demo)
            </h3>
            <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Order ID</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Channel</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Placed At</th>
                            <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Delay</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((order, i) => (
                            <tr key={order.orderId} style={{ borderBottom: i === data.length - 1 ? 'none' : '1px solid var(--border-light)' }}>
                                <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                    {order.orderId}
                                </td>
                                <td style={{ padding: '16px', fontSize: '14px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                                    {order.channel}
                                </td>
                                <td style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    {new Date(order.placedAt).toLocaleTimeString()}
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className="status-dot" style={{ background: 'var(--accent-red)', width: '8px', height: '8px' }} />
                                        <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-red)' }}>{order.minutesDelayed}m delay</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                                    All orders are processing within SLA.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
