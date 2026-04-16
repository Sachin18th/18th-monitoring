'use client';
import React from 'react';
import { 
  Cloud, 
  Database, 
  Globe, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Activity 
} from 'lucide-react';

interface SystemNode {
    name: string;
    status: 'Active' | 'Degraded' | 'Offline';
    latency: string;
    type: 'source' | 'core' | 'destination';
}

interface SystemConnectivityMapProps {
    systems: SystemNode[];
}

export const SystemConnectivityMap = ({ systems }: SystemConnectivityMapProps) => {
    const getStatusColor = (status: string) => {
        if (status === 'Active') return 'var(--accent-green)';
        if (status === 'Degraded') return 'var(--accent-orange)';
        return 'var(--accent-red)';
    };

    const getStatusIcon = (status: string) => {
        if (status === 'Active') return <CheckCircle2 size={16} color="var(--accent-green)" />;
        if (status === 'Degraded') return <AlertCircle size={16} color="var(--accent-orange)" />;
        return <Activity size={16} color="var(--accent-red)" />;
    };

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '24px',
            padding: '40px',
            boxShadow: 'var(--shadow-md)',
            marginBottom: '40px',
            overflowX: 'auto'
        }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Globe size={20} color="var(--accent-blue)" />
                System Connectivity Map
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '800px', gap: '20px' }}>
                
                {/* Source Tier */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>Ingest Channels</div>
                    {systems.filter(s => s.type === 'source').map(s => (
                        <div key={s.name} style={{
                            padding: '16px',
                            background: 'rgba(255,255,255,0.02)',
                            border: `1px solid ${getStatusColor(s.status)}33`,
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            position: 'relative'
                        }}>
                             <Cloud size={20} color="var(--text-secondary)" />
                             <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '13px', fontWeight: '700' }}>{s.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.latency} Latency</div>
                             </div>
                             {getStatusIcon(s.status)}
                        </div>
                    ))}
                </div>

                <ArrowRight size={24} color="var(--border)" />

                {/* Core Tier */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Compute Core</div>
                    <div style={{
                        padding: '32px',
                        background: 'linear-gradient(135deg, var(--accent-blue) 0%, #1e40af 100%)',
                        borderRadius: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        color: 'white',
                        boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.4)'
                    }}>
                        <Database size={40} />
                        <div style={{ marginTop: '12px', fontWeight: '900', fontSize: '14px' }}>KPI ENGINE</div>
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>99.9% Uptime</div>
                    </div>
                </div>

                <ArrowRight size={24} color="var(--border)" />

                {/* Destination Tier */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>Distribution</div>
                    <div style={{
                        padding: '16px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                         <Globe size={20} color="var(--text-secondary)" />
                         <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: '700' }}>Admin Dashboard</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Real-time Push</div>
                         </div>
                         <CheckCircle2 size={16} color="var(--accent-green)" />
                    </div>
                </div>

            </div>
        </div>
    );
};
