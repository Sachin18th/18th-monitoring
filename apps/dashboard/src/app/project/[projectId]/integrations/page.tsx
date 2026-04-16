'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { MetricCard } from '../../../../components/ui/MetricCard';
import { SyncTrendChart } from '../../../../components/ui/SyncTrendChart';
import { SystemStatusList } from '../../../../components/ui/SystemStatusList';
import { FailedSyncTable } from '../../../../components/ui/FailedSyncTable';
import { SystemConnectivityMap } from '../../../../components/ui/SystemConnectivityMap';
import { AlertCircle } from 'lucide-react';

export default function IntegrationsPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const { token, apiFetch, outageStatus, lastUpdated } = useAuth();
    
    const [summary, setSummary] = useState<any>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [systems, setSystems] = useState<any[]>([]);
    const [failedSyncs, setFailedSyncs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const isExpired = outageStatus === 'expired';

    const loadData = useCallback(async () => {
        if (!token || !projectId) return;
        try {
            const [summ, trend, sys, failed] = await Promise.all([
                apiFetch(`/api/v1/dashboard/integrations/summary?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/integrations/trends?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/integrations/systems?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/integrations/failed?siteId=${projectId}`)
            ]);
            
            setSummary(summ);
            setTrends(Array.isArray(trend) ? trend : []);
            setSystems(Array.isArray(sys) ? sys : []);
            setFailedSyncs(Array.isArray(failed) ? failed : []);
        } catch (err) {
            console.error('Failed to load integration metrics', err);
        } finally {
            setLoading(false);
        }
    }, [projectId, token, apiFetch]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleResync = async (connectorId: string) => {
        try {
            await apiFetch(`/api/v1/config/${projectId}/integrations/sync/force`, {
                method: 'POST',
                body: JSON.stringify({ connectorId })
            });
            loadData(); // Refresh health after sync
        } catch (e) {
            console.error('Failed to trigger manual resync', e);
        }
    };

    if (loading) return <div style={{ padding: '40px', color: 'var(--text-secondary)' }}>Probing integration health...</div>;

    const mapSystems = systems.map(s => ({
        name: s.name,
        status: s.status === 'Active' ? 'Active' as const : 'Degraded' as const,
        latency: s.latency || '0ms',
        type: 'source' as const
    }));

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '80px', position: 'relative' }}>
            {isExpired && (
                <div style={outageOverlayStyle}>
                    <div style={outageContentStyle}>
                        <div style={outageIconStyle}><AlertCircle size={40} color="var(--accent-red)" /></div>
                        <h2 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '16px' }}>Integration State Expired</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: '1.6' }}>
                            Connectivity to back-office services has been lost for over 24 hours. 
                            Last heartbeat: <strong>{lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Unknown'}</strong>.
                        </p>
                        <button onClick={() => window.location.reload()} style={primaryBtnStyle}>Force System Probing</button>
                    </div>
                </div>
            )}

            <div style={{ opacity: isExpired ? 0.3 : 1 }}>
                <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--text-primary)', marginBottom: '8px' }}>Integrations Monitoring</h2>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Real-time health of ERP, OMS, and 3rd party API dependencies for {projectId}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px' }}>
                        <div style={{ width: '8px', height: '8px', background: 'var(--accent-green)', borderRadius: '50%', boxShadow: '0 0 8px var(--accent-green)' }} />
                        <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ingestion Active</span>
                    </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                    <MetricCard title="Sync Success Rate" value={summary?.successRate} unit="%" state={summary?.successRate < 95 ? 'warning' : 'healthy'} icon="🔗" />
                    <MetricCard title="Failures (24h)" value={summary?.failureCount24h} state={summary?.failureCount24h > 10 ? 'critical' : 'healthy'} icon="⚠️" />
                    <MetricCard title="Avg Latency" value={summary?.avgOmsLatency} unit="ms" state="healthy" icon="⏱️" />
                    <MetricCard title="Health Score" value={summary?.healthScore} unit="%" state="healthy" icon="💖" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <SystemConnectivityMap systems={mapSystems} />
                        <SyncTrendChart data={trends || []} title="Sync Success Trend (24h)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <SystemStatusList 
                            data={systems.map(s => ({ 
                                ...s, 
                                id: s.connectorId || s.name.toLowerCase().replace(' ', '_'),
                                status: s.status as any,
                                latency: s.latency || 'N/A',
                                health: s.health || 100,
                                lastSync: s.lastSyncAt || 'Never'
                            }))} 
                            onResync={handleResync} 
                        />
                        
                        <div style={logCardStyle}>
                            <h4 style={logTitleStyle}>Configuration Governance</h4>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                                To update authentication credentials (API Keys, OAuth2) or toggle environment modes (Staging/Prod), please visit the <strong>Project Settings</strong> section.
                            </p>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                    <FailedSyncTable data={failedSyncs || []} title="Critical Errors: Integration Sync Failures" />
                </div>
            </div>
        </div>
    );
}

const outageOverlayStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)',
    zIndex: 50, borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center'
};

const outageContentStyle: React.CSSProperties = {
    background: 'white', padding: '40px', borderRadius: '32px', textAlign: 'center', maxWidth: '480px',
    boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border)'
};

const outageIconStyle: React.CSSProperties = {
    width: '80px', height: '80px', borderRadius: '30px', background: 'rgba(239, 68, 68, 0.05)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
    border: '1px solid rgba(239, 68, 68, 0.1)'
};

const primaryBtnStyle: React.CSSProperties = {
    padding: '12px 32px', background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
};

const logCardStyle: React.CSSProperties = {
    background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '24px', borderRadius: '20px'
};

const logTitleStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: '800', color: 'var(--accent-blue)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px'
};
