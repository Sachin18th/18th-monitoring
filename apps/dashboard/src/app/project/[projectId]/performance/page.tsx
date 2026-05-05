'use client';
<<<<<<< HEAD
import React, { useEffect, useState, useCallback } from 'react';

import { useAuth } from '../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { 
  PageLayout, 
  Typography, 
  Badge, 
  Button,
  OperationalTable, 
    DiagnosticDrawer
} from '@kpi-platform/ui';
import { 
  Activity, 
  AlertTriangle, 
  ShieldCheck,
  Search,
  ExternalLink,
  History,
  Clock,
    Zap,
    RefreshCw
} from 'lucide-react';

// Intelligence Components
import { AnomalyExplorer, type PerformanceAnomaly } from '../../../../components/performance/AnomalyExplorer';
import { PerformanceTrendExplorer } from '../../../../components/performance/PerformanceTrendExplorer';
import { SegmentationPivot } from '../../../../components/performance/SegmentationPivot';

const pageStyle: React.CSSProperties = {
    padding: '24px 28px',
    maxWidth: '1280px',
    margin: '0 auto',
    display: 'block',
    overflow: 'visible',
};

const sectionSpacingStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    overflow: 'visible',
};

const metricGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '24px',
    marginBottom: '24px',
    overflow: 'visible',
};

const metricCardStyle: React.CSSProperties = {
    borderRadius: '12px',
    border: '1px solid var(--border-card)',
    background: 'var(--bg-card)',
    padding: '24px',
    paddingTop: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '140px',
    overflow: 'visible',
};

const metricTopRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
};

const metricLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--text-muted)',
    fontWeight: 500,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const metricValueStyle: React.CSSProperties = {
    fontSize: '38px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    lineHeight: 1,
    padding: '8px 0',
    overflow: 'visible',
};

const metricBottomRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '12px',
};

const panelGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: '24px',
    overflow: 'visible',
    alignItems: 'start',
};

const leftColumnStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    overflow: 'visible',
};

const sectionLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--text-label)',
    fontWeight: 500,
};

const sectionTitleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '12px',
};

const contentCardStyle: React.CSSProperties = {
    borderRadius: '12px',
    border: '1px solid var(--border-card)',
    background: 'var(--bg-card)',
    padding: '24px',
    overflow: 'visible',
};

const sidebarStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
};

const sidebarCardStyle: React.CSSProperties = {
    borderRadius: '12px',
    border: '1px solid var(--border-card)',
    background: 'var(--bg-card)',
    padding: '24px',
    marginBottom: '16px',
};

const sidebarLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--text-label)',
    fontWeight: 500,
    display: 'block',
    marginBottom: '16px',
};

const bottleneckRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid var(--border-card)',
};

const normalizeSeverity = (severity: unknown): PerformanceAnomaly['severity'] => {
    return severity === 'critical' || severity === 'warning' || severity === 'info'
        ? severity
        : 'warning';
};

const normalizeAnomalies = (rows: any[]): PerformanceAnomaly[] => {
    return rows.map((row, index) => {
        const source = row?.source || row?.platform || row?.impact || 'Performance';

        return {
            id: String(row?.id || `anomaly-${index}`),
            metric: String(row?.metric || row?.title || row?.type || source),
            severity: normalizeSeverity(row?.severity),
            impact: String(row?.impact || `Source: ${source}`),
            scope: String(row?.scope || row?.title || row?.service || 'Monitored surface'),
            window: String(row?.window || row?.timestamp || 'Recent'),
            deviation: String(row?.deviation || row?.value || 'Detected'),
        };
    });
};
=======
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
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

export default function PerformancePage() {
    const params = useParams();
    const projectId = params.projectId as string;
<<<<<<< HEAD
    const { token, apiFetch, outageStatus } = useAuth();

    // Data State
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<any>({
        p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, errorRate: 0, affectedServices: 0, uptime: 0
    });
    const [trends, setTrends] = useState<any[]>([]);
    const [anomalies, setAnomalies] = useState<PerformanceAnomaly[]>([]);
    const [regional, setRegional] = useState<any[]>([]);
    const [apis, setApis] = useState<any[]>([]);
    const [integrations, setIntegrations] = useState<any[]>([]);

    // UI State
    const [selectedAnomaly, setSelectedAnomaly] = useState<PerformanceAnomaly | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [activeMetric, setActiveMetric] = useState('latency');

    const loadData = useCallback(async () => {
        if (!token || !projectId) return;
        setLoading(true);
        try {
            const [summ, trnd, anom, reg, pages, intg] = await Promise.all([
                apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/performance/trends?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/performance/anomalies?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/performance/regional?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/performance/slowest-pages?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/integrations/summary?siteId=${projectId}`)
            ]);

            setSummary(summ || summary);
            setTrends(Array.isArray(trnd) ? trnd : []);
            setAnomalies(Array.isArray(anom) ? normalizeAnomalies(anom) : []);
            setIntegrations(Array.isArray(intg) ? intg : []);
            
            // Defensive mapping for regional data
            if (Array.isArray(reg)) {
                setRegional(reg.map((r: any) => ({
                    dimension: r.name || 'Unknown',
                    count: (r.share || 0) * 1000,
                    p50: r.lcp || 0,
                    p95: (r.lcp || 0) * 1.8,
                    errors: r.errorRate || 0,
                    health: (r.lcp || 0) > 2000 ? 'critical' : (r.lcp || 0) > 1500 ? 'warning' : 'healthy'
                })));
            } else {
                setRegional([]);
            }
            
            // Defensive mapping for apis/pages data
            if (Array.isArray(pages)) {
                setApis(pages.map((p: any) => ({
                    dimension: p.page || 'Unknown',
                    count: p.hits || 5000,
                    p50: p.loadTime || 0,
                    p95: (p.loadTime || 0) * 2.1,
                    errors: p.errorRate || 0,
                    health: (p.loadTime || 0) > 3000 ? 'critical' : 'healthy'
                })));
            } else {
                setApis([]);
            }
        } catch (err) {
            console.error('Performance lab failure:', err);
        } finally {
            setLoading(false);
        }
    }, [projectId, token, apiFetch]);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [loadData]);

    const handleAnomalyInspect = (anomaly: PerformanceAnomaly) => {
        setSelectedAnomaly(anomaly);
        setIsDrawerOpen(true);
    };

    return (
        <PageLayout
            title="Performance Lab"
            subtitle="Deep intelligence on site reliability, latency distributions, and anomaly attribution."
            icon={<Activity size={24} />}
        >
            <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ maxWidth: '42rem', minWidth: 0 }}>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', fontSize: '20px', lineHeight: 1.25, fontWeight: 500, color: 'var(--text-primary)' }}>
                            <Activity style={{ width: '20px', height: '20px', color: '#818cf8', flexShrink: 0 }} />
                            <span>Performance Lab</span>
                        </h1>
                        <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>Deep intelligence on site reliability, latency distributions, and anomaly attribution.</p>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                        <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', flexShrink: 0, cursor: 'pointer' }}>
                            <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0, transform: loading ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms linear' }} /> Refresh
                        </button>
                        <button style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', flexShrink: 0, cursor: 'pointer' }}>
                            <History style={{ width: '16px', height: '16px', flexShrink: 0 }} /> Activity
                        </button>
                        <button style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid rgba(96,165,250,0.2)', background: '#2563EB', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: '#fff', flexShrink: 0, cursor: 'pointer' }}>
                            <ShieldCheck style={{ width: '16px', height: '16px', flexShrink: 0 }} /> Health Overview
                        </button>
                    </div>
                </div>

                <div style={metricGridStyle}>
                    <div style={metricCardStyle}>
                        <div style={metricTopRowStyle}>
                            <span style={metricLabelStyle}>P50 Latency</span>
                            <Clock style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                        </div>
                        <div style={metricValueStyle}>{summary.p50} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>ms</span></div>
                        <div style={metricBottomRowStyle}>
                            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: 'var(--success-bg)', color: 'var(--success-text)' }}>BASELINE</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>Latency</span>
                        </div>
                    </div>
                    <div style={metricCardStyle}>
                        <div style={metricTopRowStyle}>
                            <span style={metricLabelStyle}>P95 Latency</span>
                            <Zap style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                        </div>
                        <div style={metricValueStyle}>{summary.p95} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>ms</span></div>
                        <div style={metricBottomRowStyle}>
                            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>WARNING</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>Latency</span>
                        </div>
                    </div>
                    <div style={metricCardStyle}>
                        <div style={metricTopRowStyle}>
                            <span style={metricLabelStyle}>Error Rate</span>
                            <AlertTriangle style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                        </div>
                        <div style={metricValueStyle}>{summary.errorRate}%</div>
                        <div style={metricBottomRowStyle}>
                            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: 'var(--success-bg)', color: 'var(--success-text)' }}>HEALTHY</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>Errors</span>
                        </div>
                    </div>
                    <div style={metricCardStyle}>
                        <div style={metricTopRowStyle}>
                            <span style={metricLabelStyle}>SLA Uptime</span>
                            <ShieldCheck style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                        </div>
                        <div style={metricValueStyle}>{summary.uptime}%</div>
                        <div style={metricBottomRowStyle}>
                            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: 'var(--success-bg)', color: 'var(--success-text)' }}>STABLE</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>Availability</span>
                        </div>
                    </div>
                </div>

                <div style={panelGridStyle}>
                    <div style={leftColumnStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={sectionLabelStyle}>PERFORMANCE TRENDS</span>
                            <p style={sectionTitleStyle}>Latency Distribution</p>
                            <div style={contentCardStyle}>
                                <PerformanceTrendExplorer 
                                    trends={trends} 
                                    loading={loading}
                                    activeMetric={activeMetric}
                                    onMetricChange={setActiveMetric}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={sectionLabelStyle}>ANOMALY DETECTION</span>
                            <p style={sectionTitleStyle}>Performance Regressions</p>
                            <div style={contentCardStyle}>
                                <AnomalyExplorer 
                                    anomalies={anomalies} 
                                    loading={loading}
                                    onInspect={handleAnomalyInspect}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={sectionLabelStyle}>REGIONAL ANALYSIS</span>
                            <p style={sectionTitleStyle}>Geographic Distribution</p>
                            <div style={contentCardStyle}>
                                <SegmentationPivot 
                                    data={regional}
                                    loading={loading}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={sidebarStyle}>
                        <div style={sidebarCardStyle}>
                           <span style={sidebarLabelStyle}>TOP BOTTLENECKS</span>
                           <div style={{ display: 'flex', flexDirection: 'column' }}>
                              {apis.length > 0 ? apis.slice(0, 5).map((api, idx) => (
                                 <div key={idx} style={bottleneckRowStyle}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                       {api.dimension}
                                    </span>
                                    <Badge variant={api.health as any} size="sm">{Math.round(api.p95)}ms</Badge>
                                 </div>
                              )) : (
                                <Typography variant="caption" style={{ display: 'block', textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>No slowest pages detected.</Typography>
                              )}
                           </div>
                        </div>

                        <div style={sidebarCardStyle}>
                            <span style={sidebarLabelStyle}>ENDPOINT INTELLIGENCE</span>
                            <OperationalTable 
                                columns={[
                                    { key: 'dimension', header: 'Resource', render: (v) => <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{v}</span> },
                                    { key: 'p95', header: 'p95', width: '80px', align: 'right', render: (v) => <span style={{ fontWeight: 700 }}>{Math.round(v)}ms</span> }
                                ]}
                                data={apis.slice(5, 12)}
                                isLoading={loading}
                                isDense
                            />
                        </div>

                                <div style={{ borderRadius: '12px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
                           <span style={sidebarLabelStyle}>DEEP TRACE</span>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8', border: '1px solid var(--border-input)' }}>
                              <Search size={24} />
                           </div>
                           <div>
                              <Typography variant="h3" noMargin>Trace Explorer</Typography>
                              <Typography variant="caption" style={{ marginTop: '4px', display: 'block' }}>Analyze granular p99 request traces.</Typography>
                           </div>
                           <Button variant="primary" size="sm" style={{ width: '100%', borderRadius: '999px' }}>
                               Start Deep Trace <ExternalLink size={14} style={{ marginLeft: '8px' }} />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <DiagnosticDrawer 
                isOpen={isDrawerOpen} 
                onClose={() => setIsDrawerOpen(false)}
                title="Anomaly Diagnostic"
                subtitle={`Fingerprint: ${selectedAnomaly?.id || 'Unknown'}`}
            >
                {selectedAnomaly && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <div style={{ padding: '24px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '16px', display: 'flex', gap: '16px' }}>
                            <div style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '12px', color: '#f87171', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <Typography variant="h3" style={{ color: '#f87171' }}>Performance Regression</Typography>
                                <Typography variant="body" style={{ marginTop: '4px', display: 'block' }}>
                                    A <span style={{ fontWeight: 700, color: '#f87171' }}>{selectedAnomaly.deviation}</span> deviation in <span style={{ fontWeight: 700 }}>{selectedAnomaly.metric}</span> was detected across <span style={{ fontWeight: 700 }}>{selectedAnomaly.scope}</span>.
                                </Typography>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <Typography variant="h3">Root Cause Attribution</Typography>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
                                <div style={{ padding: '16px', background: 'var(--bg-input)', border: '1px solid var(--border-card)', borderRadius: '12px' }}>
                                    <Typography variant="micro" weight="bold" style={{ opacity: 0.6, marginBottom: '4px', display: 'block' }}>Metric</Typography>
                                    <Typography variant="body" weight="bold">{selectedAnomaly.metric}</Typography>
                                </div>
                                <div style={{ padding: '16px', background: 'var(--bg-input)', border: '1px solid var(--border-card)', borderRadius: '12px' }}>
                                    <Typography variant="micro" weight="bold" style={{ opacity: 0.6, marginBottom: '4px', display: 'block' }}>Scope</Typography>
                                    <Typography variant="body" weight="bold">{selectedAnomaly.scope}</Typography>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Typography variant="h3">Historical Samples</Typography>
                                <Badge variant="info">3 SAMPLES</Badge>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {[1, 2, 3].map(i => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border-card)', borderRadius: '12px', background: 'var(--bg-card)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <History size={16} style={{ color: 'var(--text-muted)' }} />
                                            <Typography variant="caption">T - {i*10}m occurrence</Typography>
                                        </div>
                                        <Typography variant="body" weight="bold" style={{ color: '#f87171' }}>{selectedAnomaly.deviation}</Typography>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ paddingTop: '32px', display: 'flex', gap: '16px' }}>
                            <Button variant="primary" style={{ flex: 1, borderRadius: '999px' }}>Acknowledge</Button>
                            <Button variant="outline" style={{ flex: 1, borderRadius: '999px' }}>Open Trace</Button>
                        </div>
                    </div>
                )}
            </DiagnosticDrawer>
        </PageLayout>
    );
}
=======
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
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
