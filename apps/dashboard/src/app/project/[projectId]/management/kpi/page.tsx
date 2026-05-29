'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { PageRestricted } from '../../../../../components/PageRestricted';
import {
  BarChart3,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react';

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
  minHeight: '100vh',
  background: 'var(--bg-page)',
  color: 'var(--text-primary)'
};

const cardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible'
};

export default function KpiAnalyticsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();

  const [loading, setLoading] = useState(true);
  const [kpiSummary, setKpiSummary] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<{ available: any[]; unavailable: any[] }>({ available: [], unavailable: [] });
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((v: any) => String(v)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('management/kpi')) return;

      const [summaryRes, catalogRes] = await Promise.all([
        apiFetch(`/api/v1/tenants/current/projects/${projectId}/kpi/summary`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/tenants/current/projects/${projectId}/kpi/catalog`)
      ]);

      setKpiSummary(summaryRes?.data?.kpis || []);
      setCatalog(catalogRes?.data || { available: [], unavailable: [] });
    } catch (err) {
      console.error('Failed to load KPI data', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (allowedPageKeys !== null && !allowedPageKeys.includes('management/kpi')) {
    return <PageRestricted pageKey="management/kpi" />;
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'BUSINESS':
        return '#22c55e';
      case 'OPERATIONAL':
        return '#60a5fa';
      case 'EXPERIENCE':
        return '#a78bfa';
      case 'TECHNICAL':
        return '#fbbf24';
      default:
        return 'var(--text-muted)';
    }
  };

  const getFreshnessIcon = (status: string) => {
    switch (status) {
      case 'live':
        return <Wifi style={{ width: '16px', height: '16px', color: '#22c55e' }} />;
      case 'stale':
        return <WifiOff style={{ width: '16px', height: '16px', color: '#f87171' }} />;
      default:
        return <Clock style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />;
    }
  };

  const getCategoryPill = (category: string) => {
    const map: Record<string, { color: string; border: string; bg: string }> = {
      BUSINESS: { color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', bg: 'rgba(34,197,94,0.08)' },
      OPERATIONAL: { color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', bg: 'rgba(96,165,250,0.08)' },
      EXPERIENCE: { color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)', bg: 'rgba(167,139,250,0.08)' },
      TECHNICAL: { color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', bg: 'rgba(251,191,36,0.08)' }
    };
    const style = map[category] || { color: 'var(--text-secondary)', border: '1px solid var(--border-input)', bg: 'var(--bg-input)' };
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: '999px',
          fontSize: '10px',
          color: style.color,
          border: style.border,
          background: style.bg,
          whiteSpace: 'nowrap'
        }}
      >
        {category}
      </span>
    );
  };

  return (
    <>
      <div style={pageStyle}>
        <div style={{ marginBottom: '8px', overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <BarChart3 style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)' }}>
              KPI Governance
            </span>
          </div>

          <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
            KPI Analytics Engine
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#22c55e',
                display: 'inline-block',
                marginLeft: '10px',
                verticalAlign: 'middle'
              }}
            />
          </div>

          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '760px' }}>
            Canonical data-derived business, operational, and experience intelligence.
          </div>
        </div>

        <div>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Live KPI Summary
          </div>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', overflow: 'visible' }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: '12px',
                    border: '1px solid var(--border-card)',
                    background: 'var(--bg-card)',
                    padding: '24px',
                    minHeight: '120px',
                    opacity: 0.7
                  }}
                />
              ))}
            </div>
          ) : kpiSummary.length === 0 ? (
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', textAlign: 'center' }}>
              <Activity style={{ width: '16px', height: '16px', color: 'var(--text-label)' }} />
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                No KPI data yet. Ingest some order events via webhooks to start computing metrics.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', overflow: 'visible' }}>
              {kpiSummary.map((kpi) => (
                <div key={kpi.key} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <TrendingUp style={{ width: '16px', height: '16px', color: getCategoryColor(kpi.category), flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          color: 'var(--text-label)',
                          fontWeight: 500
                        }}
                      >
                        {kpi.name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {getFreshnessIcon(kpi.freshnessStatus)}
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{kpi.freshnessStatus}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>
                    {typeof kpi.value === 'number' ? kpi.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : kpi.value}
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Last updated: {kpi.lastUpdated ? new Date(kpi.lastUpdated).toLocaleString() : 'Never'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: '20px', overflow: 'visible' }}>
          <div style={{ overflow: 'visible' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
                KPI Catalog
              </div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '10px',
                  border: '1px solid var(--border-input)',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap'
                }}
              >
                {catalog.available.length} KPIs available
              </span>
            </div>

            <div
              style={{
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                padding: '0',
                overflow: 'visible'
              }}
            >
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-card)' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', color: 'var(--text-label)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <span style={{ width: '130px' }}>Category</span>
                  <span style={{ flex: 1 }}>KPI</span>
                  <span style={{ width: '180px' }}>Granularity</span>
                  <span style={{ width: '80px', textAlign: 'right' }}>SLA</span>
                </div>
              </div>

              {catalog.available.map((item, idx) => (
                <div
                  key={item.key || idx}
                  style={{
                    padding: '14px 20px',
                    borderBottom: idx === catalog.available.length - 1 ? 'none' : '1px solid var(--border-card)',
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ width: '130px' }}>{getCategoryPill(item.category)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '2px' }}>{item.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-label)', fontFamily: 'monospace' }}>{item.key}</div>
                  </div>
                  <div style={{ width: '180px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {item.granularities?.map((g: string) => (
                      <span
                        key={g}
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '999px',
                          fontSize: '10px',
                          background: 'var(--bg-input)',
                          color: 'var(--text-muted)',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                  <div style={{ width: '80px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {item.freshnessSlaMinutes}m
                  </div>
                </div>
              ))}

              {!loading && catalog.available.length === 0 && (
                <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No KPI catalog entries available for this project.
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <AlertCircle style={{ width: '16px', height: '16px', color: '#fbbf24' }} />
                <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
                  Unavailable KPIs
                </div>
              </div>

              {catalog.unavailable.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                  <span style={{ fontSize: '13px', color: '#22c55e' }}>All KPIs have coverage.</span>
                </div>
              ) : (
                <div>
                  {catalog.unavailable.map((u: any, idx) => (
                    <div
                      key={u.key}
                      style={{
                        padding: '14px 0',
                        borderBottom: idx === catalog.unavailable.length - 1 ? 'none' : '1px solid var(--border-card)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'monospace' }}>{u.key}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '24px',
          zIndex: 50,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-input)',
          borderRadius: '999px',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        Live feed · System nominal
      </div>
    </>
  );
}
