'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { StatusBadge } from '../../../../components/ui/StatusBadge';


export default function AlertsPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const { token, apiFetch } = useAuth();
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token || !projectId) return;
        setLoading(true);
        apiFetch(`/api/v1/dashboard/alerts?siteId=${projectId}`)
            .then(data => {
                setAlerts(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(e => {
                console.error(e);
                setLoading(false);
            });
    }, [projectId, token, apiFetch]);

    if (loading) return <div style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading alerts queue...</div>;

    const activeAlerts = alerts.filter(a => a.status === 'active');

    return (
        <div className="animate-fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>Active Alerts</h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Real-time incident queue for {projectId}</p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeAlerts.length === 0 ? (
                    <div style={{ padding: '40px', background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.1)', borderRadius: '16px', textAlign: 'center' }}>
                         <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                         <h4 style={{ fontWeight: '800', color: '#22c55e' }}>No critical issues detected</h4>
                         <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>All monitoring thresholds are within normal ranges.</p>
                    </div>
                ) : (
                    activeAlerts.map(alert => (
                        <div key={alert.alertId} style={{
                            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div style={{ 
                                    width: '40px', height: '40px', borderRadius: '10px', 
                                    background: alert.severity === 'critical' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'
                                }}>🚨</div>
                                <div>
                                    <h4 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>{alert.message}</h4>
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>KPI: {alert.kpiName} · ID: {alert.alertId}</p>
                                </div>
                            </div>
                            <StatusBadge status={alert.severity} />
                        </div>
                    ))
                )}
            </div>

            <div style={{ marginTop: '40px', borderTop: '1px solid var(--border)', paddingTop: '32px' }}>
                 <h4 style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '16px' }}>Alert History Placeholder</h4>
                 <div style={{ height: '200px', background: 'var(--border-light)', borderRadius: '16px', border: '1px dotted var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      Time-series of historical incidents will be displayed here.
                 </div>
            </div>
        </div>
    );
}
