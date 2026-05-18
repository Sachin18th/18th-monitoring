'use client';
import React from 'react';

interface System {
    id: string;
    name: string;
    status: 'Active' | 'Degraded' | 'Offline';
    latency: string;
    health: number;
    lastSync: string;
}

interface SystemStatusListProps {
    data: System[];
    onResync: (id: string) => void;
}

export const SystemStatusList = ({ data, onResync }: SystemStatusListProps) => {
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
                System Dependency Health
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {data.map((system, i) => (
                    <div key={i} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '16px',
                        background: 'var(--bg-app)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-light)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ 
                                width: '10px', 
                                height: '10px', 
                                borderRadius: '50%', 
                                background: system.status === 'Active' ? 'var(--accent-green)' : system.status === 'Degraded' ? 'var(--accent-orange)' : 'var(--accent-red)',
                                boxShadow: system.status === 'Active' ? '0 0 8px var(--accent-green)' : 'none'
                             }} />
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>{system.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Latency: {system.latency}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '14px', fontWeight: '900', color: system.health > 90 ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                                    {system.health}%
                                </div>
                                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                    Avail.
                                </div>
                            </div>
                            <button 
                                onClick={() => onResync(system.id)}
                                style={{
                                    padding: '8px 12px', background: 'white', border: '1px solid var(--border)', 
                                    borderRadius: '8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer',
                                    transition: 'all 0.2s', whiteSpace: 'nowrap'
                                }}>
                                Force Resync
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <div style={{ marginTop: '24px', padding: '12px', background: 'rgba(255, 165, 0, 0.05)', borderRadius: '8px', border: '1px solid rgba(255, 165, 0, 0.2)' }}>
                <p style={{ fontSize: '11px', color: 'var(--accent-orange)', textAlign: 'center', fontWeight: '700' }}>
                    📢 CRM Connector is currently experiencing high latency. Investigation in progress.
                </p>
            </div>
        </div>
    );
};
