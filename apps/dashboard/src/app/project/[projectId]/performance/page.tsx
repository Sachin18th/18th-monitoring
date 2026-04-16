'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { MetricCard } from '../../../../components/ui/MetricCard';
import { PerformanceChart } from '../../../../components/ui/PerformanceChart';
import { RegionalBreakdown } from '../../../../components/ui/RegionalBreakdown';
import { DeviceSegmentation } from '../../../../components/ui/DeviceSegmentation';
import { ResourceBreakdown } from '../../../../components/ui/ResourceBreakdown';
import { SlowPageTable } from '../../../../components/ui/SlowPageTable';
import { SyntheticJourneyWidget } from '../../../../components/ui/SyntheticJourneyWidget';
import { SyntheticFailureLog } from '../../../../components/ui/SyntheticFailureLog';
import { SyntheticHistoryChart } from '../../../../components/ui/SyntheticHistoryChart';
import { BrowserMatrix } from '../../../../components/ui/BrowserMatrix';
import { DeviceMobileComparison } from '../../../../components/ui/DeviceMobileComparison';

export default function PerformancePage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const { token, apiFetch, outageStatus, lastUpdated } = useAuth();

    const [summary, setSummary] = useState<any>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [regional, setRegional] = useState<any[]>([]);
    const [devices, setDevices] = useState<any[]>([]);
    const [resources, setResources] = useState<any[]>([]);
    const [slowPages, setSlowPages] = useState<any[]>([]);
    const [syntheticSummary, setSyntheticSummary] = useState<any[]>([]);
    const [syntheticFailures, setSyntheticFailures] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const isExpired = outageStatus === 'expired';

    useEffect(() => {
        if (!token || !projectId) {
            setLoading(false);
            return;
        }
        let isMounted = true;
        setLoading(true);

        Promise.allSettled([
            apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
            apiFetch(`/api/v1/dashboard/performance/trends?siteId=${projectId}`),
            apiFetch(`/api/v1/dashboard/performance/regional?siteId=${projectId}`),
            apiFetch(`/api/v1/dashboard/performance/device?siteId=${projectId}`),
            apiFetch(`/api/v1/dashboard/performance/resources?siteId=${projectId}`),
            apiFetch(`/api/v1/dashboard/performance/slowest-pages?siteId=${projectId}`),
            apiFetch(`/api/v1/dashboard/synthetic/dashboard?siteId=${projectId}`),
            apiFetch(`/api/v1/dashboard/synthetic/failures?siteId=${projectId}`),
        ]).then((results) => {
            if (!isMounted) return;
            const [summ, trend, reg, dev, res, slow, synth, failures] = results.map(r =>
                r.status === 'fulfilled' ? r.value : null
            );

            setSummary(summ);
            setTrends(Array.isArray(trend) ? trend : []);
            setRegional(Array.isArray(reg) ? reg : []);
            setDevices(Array.isArray(dev) ? dev : []);
            setResources(Array.isArray(res) ? res : []);
            setSlowPages(Array.isArray(slow) ? slow : []);
            setSyntheticSummary(Array.isArray(synth) ? synth : []);
            setSyntheticFailures(Array.isArray(failures) ? failures : []);
            setLoading(false);
        }).catch(err => {
            if (!isMounted) return;
            console.error('Failed to load performance metrics', err);
            setLoading(false);
        });

        return () => { isMounted = false; };
    }, [projectId, token, apiFetch]);

    if (loading) return (
        <div style={{ padding: '40px', color: 'var(--text-secondary)' }}>
            Gathering performance intelligence...
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '80px', position: 'relative' }}>
            {isExpired && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.4)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 50,
                    borderRadius: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px',
                    textAlign: 'center',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '30px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: '24px',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        fontSize: '36px',
                    }}>⚠️</div>
                    <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#fff', marginBottom: '16px' }}>Performance Vitals Expired</h2>
                    <p style={{ maxWidth: '400px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.6', marginBottom: '32px' }}>
                        Latency and Core Web Vital tracing has been disconnected for over 24 hours.
                        Last valid telemetry: <strong style={{ color: '#fff' }}>{lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Unknown'}</strong>.
                    </p>
                    <button
                        id="btn-reconnect-telemetry"
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '12px 32px',
                            background: 'var(--accent-red)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                        }}
                    >
                        Attempt Telemetry Reconnect
                    </button>
                </div>
            )}

            <div style={{ opacity: isExpired ? 0.3 : 1 }}>
                <header style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
                        Performance Analytics
                    </h2>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Real-time Core Web Vitals, synthetic journey validation, and multi-device observability for {projectId}
                    </p>
                </header>

                {/* ── SECTION 1: Synthetic Journey Health ─────────────────── */}
                <section style={{ marginBottom: '32px' }}>
                    <SyntheticJourneyWidget data={syntheticSummary} />
                </section>

                {/* ── SECTION 2: RUM Top-Level KPIs ───────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                    <MetricCard title="Avg Load Time" value={summary?.avgLoadTime ?? 0} unit="ms" state={summary?.avgLoadTime > 3000 ? 'critical' : 'healthy'} icon="⚡" />
                    <MetricCard title="LCP" value={summary?.lcp ?? 0} unit="ms" state={summary?.lcp > 2500 ? 'critical' : summary?.lcp > 1800 ? 'warning' : 'healthy'} icon="🖼️" />
                    <MetricCard title="TTFB" value={summary?.ttfb ?? 0} unit="ms" state={summary?.ttfb > 600 ? 'critical' : summary?.ttfb > 400 ? 'warning' : 'healthy'} icon="🌐" />
                    <MetricCard title="CLS" value={summary?.cls ?? 0} state={summary?.cls > 0.25 ? 'critical' : summary?.cls > 0.1 ? 'warning' : 'healthy'} icon="🔳" />
                    <MetricCard title="FID / INP" value={summary?.fid ?? 0} unit="ms" state={summary?.fid > 300 ? 'critical' : summary?.fid > 100 ? 'warning' : 'healthy'} icon="🖱️" />
                    <MetricCard title="Uptime (24h)" value={summary?.uptime ?? '—'} unit="%" state="healthy" icon="🛡️" />
                </div>

                {/* ── SECTION 3: Trend Chart + Device Segmentation ────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '32px' }}>
                    <PerformanceChart data={trends || []} title="Web Vitals Trend" />
                    <DeviceSegmentation data={devices || []} title="Device Distribution" />
                </div>

                {/* ── SECTION 4: Desktop vs Mobile + Browser Matrix ───────── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '32px' }}>
                    <DeviceMobileComparison />
                    <BrowserMatrix />
                </div>

                {/* ── SECTION 5: Regional + Resource ──────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                    <RegionalBreakdown data={regional || []} title="Regional Latency Comparison" />
                    <ResourceBreakdown data={resources || []} title="Frontend Resource Weight" />
                </div>

                {/* ── SECTION 6: Slowest Pages ─────────────────────────────── */}
                <div style={{ marginBottom: '32px' }}>
                    <SlowPageTable data={slowPages || []} title="Critical Path: Slowest User Pages" />
                </div>

                {/* ── SECTION 7: Historical Trend (7 days) ─────────────────── */}
                <div style={{ marginBottom: '32px' }}>
                    <SyntheticHistoryChart />
                </div>

                {/* ── SECTION 8: Failure Log ────────────────────────────────── */}
                <div style={{ marginBottom: '32px' }}>
                    <SyntheticFailureLog data={syntheticFailures || []} title="Synthetic Failure Log" />
                </div>
            </div>
        </div>
    );
}
