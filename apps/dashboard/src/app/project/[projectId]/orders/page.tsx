'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { 
    OrderStatsGrid, 
    IntelligentRcaPanel, 
    IngestionControlPanel 
} from '../../../../components/ui/OrderAnalyticsWidgets';

export default function OrdersPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const { token, apiFetch } = useAuth();
    
    const [stats, setStats] = useState<any>(null);
    const [rca, setRca] = useState<any>(null);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (!token || !projectId) return;
        try {
            const [s, r, rec, l] = await Promise.all([
                apiFetch(`/api/v1/dashboard/orders/summary?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/orders/rca?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/orders/recommendations?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/orders/integrations/status?siteId=${projectId}`)
            ]);
            setStats(s);
            setRca(r);
            setRecommendations(rec);
            setLogs(l);
        } catch (e) {
            console.error('Failed to sync order intelligence:', e);
        } finally {
            setLoading(false);
        }
    }, [projectId, token, apiFetch]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleUpload = async (csv: string) => {
        try {
            await apiFetch(`/api/v1/dashboard/orders/offline/upload?siteId=${projectId}`, {
                method: 'POST',
                body: JSON.stringify({ csv })
            });
            fetchData();
        } catch (e) {
            alert('Upload failed. Check format.');
        }
    };

    const handleSync = async (system: string) => {
        try {
            await apiFetch(`/api/v1/dashboard/orders/integrations/sync?siteId=${projectId}`, {
                method: 'POST',
                body: JSON.stringify({ system })
            });
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    if (loading && !stats) return <div style={{ padding: '40px' }}>Loading Command Center...</div>;

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '100px' }}>
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '28px', fontWeight: '900', color: 'var(--text-primary)', marginBottom: '8px' }}>Orders Monitoring & Intelligence</h2>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Centralized oversight of online, offline, and integrated system flow</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '12px', height: '12px', background: rca?.status === 'alert' ? 'var(--accent-red)' : '#10b981', borderRadius: '50%', boxShadow: `0 0 10px ${rca?.status === 'alert' ? 'var(--accent-red)' : '#10b981'}` }} />
                    <span style={{ fontWeight: '700', fontSize: '14px' }}>System Status: {rca?.status === 'alert' ? 'CRITICAL' : 'HEALHTY'}</span>
                </div>
            </header>

            <IntelligentRcaPanel rca={rca} recommendations={recommendations} />

            <OrderStatsGrid stats={stats} />

            <div style={{ marginBottom: '40px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '20px' }}>Ingestion & Integration Management</h3>
                <IngestionControlPanel onUpload={handleUpload} onSync={handleSync} />
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '24px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px' }}>Recent Sync History</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {logs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>No integration logs found for this period.</div>
                    ) : (
                        logs.slice(0, 5).map((log, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <span style={{ fontWeight: '700' }}>{log.system}</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <span style={{ 
                                    color: log.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    fontSize: '11px'
                                }}>{log.status}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
