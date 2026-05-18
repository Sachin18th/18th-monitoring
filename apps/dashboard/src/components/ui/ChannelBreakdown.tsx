'use client';
import React from 'react';

interface Channel {
    name: string;
    value: number;
}

interface ChannelBreakdownProps {
    data: Channel[];
}

export const ChannelBreakdown = ({ data }: ChannelBreakdownProps) => {
    const total = data.reduce((acc, curr) => acc + curr.value, 0);

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
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Channel Breakdown
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {data.map((channel, i) => (
                    <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{channel.name}</span>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--accent-blue)' }}>{channel.value.toLocaleString()}</span>
                        </div>
                        <div style={{ height: '8px', background: 'var(--bg-app)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ 
                                height: '100%', 
                                width: total > 0 ? `${(channel.value / total) * 100}%` : '0%', 
                                background: 'var(--accent-blue)',
                                opacity: 0.8 - (i * 0.15)
                            }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
