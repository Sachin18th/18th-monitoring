'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { UserStatsSummary, DeviceDistribution, BrowserDistribution } from '../../../../components/ui/UserAnalyticsWidgets';

export default function UsersPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const { token, apiFetch } = useAuth();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!token || !projectId) return;
        try {
            const result = await apiFetch(`/api/v1/dashboard/users/analytics?siteId=${projectId}`);
            setData(result);
            setError(null);
        } catch (e) {
            console.error('Failed to fetch user analytics:', e);
            setError('Real-time sync interrupted. Retrying...');
        } finally {
            setLoading(false);
        }
    }, [projectId, token, apiFetch]);

    useEffect(() => {
        fetchData();
        // Polling every 10 seconds for "real-time" feel
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading && !data) {
        return (
            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div className="spinner" style={{ border: '4px solid var(--border-light)', borderTop: '4px solid var(--accent-blue)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
                <p style={{ marginTop: '16px', color: 'var(--text-secondary)', fontWeight: '600' }}>Initializing User Analytics...</p>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '60px' }}>
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h2 style={{ fontSize: '28px', fontWeight: '900', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>User Analytics</h2>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 8px #10b981' }} />
                        Real-time visitor insights for {projectId}
                    </p>
                </div>
                {error && (
                    <div style={{ fontSize: '12px', color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        {error}
                    </div>
                )}
            </header>

            {data ? (
                <>
                    <UserStatsSummary data={data} />
                    
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                        <DeviceDistribution data={data.deviceBreakdown} />
                        <BrowserDistribution data={data.browserBreakdown} />
                    </div>

                    <div style={{ marginTop: '24px', padding: '32px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '24px', boxShadow: 'var(--shadow-sm)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)' }}>
                            Live Session Insights
                        </h3>
                        <div style={{ textAlign: 'center', padding: '40px', border: '2px dashed var(--border)', borderRadius: '16px' }}>
                            <div style={{ fontSize: '32px', marginBottom: '16px' }}>🧵</div>
                            <p style={{ color: 'var(--text-secondary)', maxWidth: '450px', margin: '0 auto', fontSize: '14px', lineHeight: '1.6' }}>
                                <strong>Session Replay Engine</strong> is processing {data.activeUsers} active streams. Individual session drill-down and behavioral heatmaps are being aggregated in the background.
                            </p>
                            <button style={{ marginTop: '24px', background: 'var(--accent-blue)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', transition: 'filter 0.2s' }} onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'} onMouseOut={e => e.currentTarget.style.filter = 'none'}>
                                View Active Stream Logs
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '24px', border: '1px solid var(--border)' }}>
                    No active sessions found for this project.
                </div>
            )}
        </div>
    );
}
