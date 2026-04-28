'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Activity,
  History,
  Settings,
  ExternalLink,
  AlertCircle,
  Play,
  Monitor,
  CheckCircle2,
  XCircle,
  Camera,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  ZapOff,
  MousePointerClick,
  Clock
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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

export default function SyntheticMonitoringPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [runHistory, setRunHistory] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [dash, hist, fails] = await Promise.all([
        apiFetch(`/api/v1/dashboard/synthetic/dashboard?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/synthetic/history?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/synthetic/failures?siteId=${projectId}`)
      ]);
      setSummary(Array.isArray(dash) ? dash : []);
      setRunHistory(Array.isArray(hist) ? hist : []);
      setFailures(Array.isArray(fails) ? fails : []);
    } catch (err: any) {
      console.error('[Synthetic] Load failed', err);
      setError('Failed to synchronize synthetic telemetry.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const passedRuns = runHistory.filter((r: any) => r.success_status === true || r.success_status === undefined).length;
  const totalRuns = runHistory.length || 1;
  const uptimePct = Math.round((passedRuns / totalRuns) * 1000) / 10;
  const lastRunPass = runHistory[0]?.success_status !== false;
  const lastRunTime = runHistory[0]?.timestamp
    ? new Date(runHistory[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'N/A';
  const firstStep = summary[0]?.totalRuns || runHistory.length || 1;
  const degraded = summary.filter((j: any) => Number(j.successRate || 0) < 95).length;

  const metricCards = useMemo(
    () => [
      {
        label: 'Completion Rate',
        value: `${uptimePct}%`,
        badge: 'Latest rolling uptime',
        icon: ShoppingBag
      },
      {
        label: 'Total Visitors',
        value: firstStep.toLocaleString(),
        badge: 'Synthetic traversals',
        icon: TrendingUp
      },
      {
        label: 'Failure Events',
        value: failures.length.toLocaleString(),
        badge: 'Recent failed checks',
        icon: ZapOff
      },
      {
        label: 'Degraded Flows',
        value: `${degraded}`,
        badge: 'Journeys below 95%',
        icon: MousePointerClick
      }
    ],
    [degraded, failures.length, firstStep, uptimePct]
  );

  if (loading && runHistory.length === 0) {
    return (
      <div style={{ ...pageStyle, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '999px',
              border: '4px solid #1f2937',
              borderTopColor: '#22c55e',
              marginBottom: '16px',
              animation: 'spin 1s linear infinite'
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--text-muted)'
            }}
          >
            Orchestrating proactive checks...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...pageStyle, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ maxWidth: '36rem', width: '100%' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px'
            }}
          >
            <AlertCircle style={{ width: '32px', height: '32px', color: '#f43f5e' }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Sync Failed</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '28rem', margin: '0 auto 32px' }}>{error}</p>
          <button
            onClick={loadData}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '999px',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid var(--border-card)'
            }}
          >
            <RefreshCw style={{ width: '16px', height: '16px' }} />
            Retry
          </button>
        </div>
      </div>
    );
  }

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
              <Activity style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <span
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-label)'
              }}
            >
              Synthetic Observability
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, maxWidth: '760px' }}>
              <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Synthetic Monitoring
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
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Proactive availability and flow validation for {projectId as string}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={loadData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0, animation: loading ? 'spin 1s linear infinite' : undefined }} />
                Refresh
              </button>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <Play style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Run Now
              </button>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '10px',
                  border: '1px solid rgba(96,165,250,0.2)',
                  background: '#60a5fa',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                <Settings style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Config
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                style={{
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '140px',
                  overflow: 'visible'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-label)',
                      fontWeight: 500
                    }}
                  >
                    {card.label}
                  </span>
                  <Icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                </div>

                <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>{card.value}</div>

                <div style={{ marginTop: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#22c55e' }}>{card.badge}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.75fr) minmax(320px, 1fr)',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'visible' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    System Availability
                  </div>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      border: '1px solid var(--border-input)',
                      color: 'var(--text-muted)',
                      display: 'inline-block',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Synthetic Uptime
                  </span>
                </div>

                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    border: '1px solid var(--border-input)',
                    color: lastRunPass ? '#22c55e' : '#f87171',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {lastRunPass ? 'All journeys passing' : 'Critical failure detected'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginBottom: '20px' }}>
                <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1 }}>{uptimePct}%</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingBottom: '4px' }}>Uptime (last 24h)</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(48, minmax(0, 1fr))', gap: '4px', marginBottom: '20px' }}>
                {Array.from({ length: 48 }).map((_, i) => {
                  const historyIdx = runHistory.length - 1 - (47 - i);
                  const run = runHistory[historyIdx];
                  const isFailing = run ? run.success_status === false : false;
                  const hasData = !!run;

                  return (
                    <div
                      key={i}
                      title={hasData ? `Run ${new Date(run.timestamp).toLocaleString()}: ${isFailing ? 'Failed' : 'Passed'}` : 'No data'}
                      style={{
                        height: '12px',
                        borderRadius: '999px',
                        background: !hasData ? 'var(--bg-badge-active)' : isFailing ? '#f87171' : '#22c55e',
                        opacity: hasData ? 1 : 0.5
                      }}
                    />
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <Clock style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                  Last checked: {lastRunTime}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Check interval: 10m</div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '20px' }}>
                Monitored Journeys
              </div>
              {summary.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  No journey data yet. Ingest a synthetic run to populate.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px', overflow: 'visible' }}>
                  {summary.map((journey: any) => (
                    <div
                      key={journey.journey}
                      style={{
                        borderRadius: '12px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--bg-card)',
                        padding: '24px',
                        overflow: 'visible'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            color: 'var(--text-label)',
                            fontWeight: 500
                          }}
                        >
                          Journey Status
                        </span>
                        <Monitor style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                      </div>

                      <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: '12px' }}>{journey.journey}</div>

                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontSize: '10px',
                            border: '1px solid var(--border-input)',
                            color: Number(journey.successRate || 0) >= 95 ? '#22c55e' : '#f87171',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {Number(journey.successRate || 0) >= 95 ? 'Passing' : 'Degraded'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', marginBottom: '4px' }}>
                            Success Rate
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{journey.successRate}%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', marginBottom: '4px' }}>
                            Avg Duration
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{journey.avgTime ? `${(journey.avgTime / 1000).toFixed(1)}s` : 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'visible' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '20px' }}>
                Recent Failure Events
              </div>
              {failures.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', textAlign: 'center' }}>
                  <CheckCircle2 style={{ width: '16px', height: '16px', color: '#22c55e', marginBottom: '12px' }} />
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>No failures detected in recent runs.</p>
                </div>
              ) : (
                <div>
                  {failures.slice(0, 4).map((fail: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '14px 0',
                        borderBottom: i === Math.min(failures.length, 4) - 1 ? 'none' : '1px solid var(--border-card)',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'flex-start'
                      }}
                    >
                      <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '2px', color: '#f87171' }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 5px' }}>{fail.journey_name}</p>
                        <p
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            lineHeight: 1.6,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            margin: '0 0 8px'
                          }}
                        >
                          {fail.error_logs?.split(' ')[0] || 'Failure'} · Failed at step {fail.step_name || 'Unknown Step'}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>
                            {fail.timestamp ? new Date(fail.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {fail.screenshot_url && (
                              <button
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '11px',
                                  color: '#60a5fa',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: 0
                                }}
                              >
                                <Camera style={{ width: '16px', height: '16px' }} />
                                Screenshot
                              </button>
                            )}
                            <button
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                color: '#60a5fa',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0
                              }}
                            >
                              <ExternalLink style={{ width: '16px', height: '16px' }} />
                              Trace
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ overflow: 'visible' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div
              style={{
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-muted)'
              }}
            >
              Comprehensive Execution History
            </div>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '999px',
                fontSize: '10px',
                border: '1px solid var(--border-input)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap'
              }}
            >
              {runHistory.length} runs
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
                <span style={{ width: '140px' }}>Status</span>
                <span style={{ flex: 1 }}>Journey</span>
                <span style={{ width: '160px' }}>Run ID</span>
                <span style={{ width: '100px', textAlign: 'right' }}>Duration</span>
                <span style={{ width: '110px', textAlign: 'right' }}>Completed</span>
              </div>
            </div>

            {runHistory.slice(0, 20).map((run: any, i: number) => (
              <div
                key={run.runId || i}
                style={{
                  padding: '14px 20px',
                  borderBottom: i === Math.min(runHistory.length, 20) - 1 ? 'none' : '1px solid var(--border-card)',
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center'
                }}
              >
                <div style={{ width: '140px' }}>
                  {run.success_status !== false ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontSize: '12px', fontWeight: 500 }}>
                      <CheckCircle2 style={{ width: '16px', height: '16px' }} />
                      Success
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontSize: '12px', fontWeight: 500 }}>
                      <XCircle style={{ width: '16px', height: '16px' }} />
                      Failed
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', minWidth: 0 }}>{run.journey_name || run.journey || '-'}</div>
                <div style={{ width: '160px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{run.runId || `run_${i}`}</div>
                <div style={{ width: '100px', textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {run.execution_time ? `${(run.execution_time / 1000).toFixed(1)}s` : '-'}
                </div>
                <div style={{ width: '110px', textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {run.timestamp ? new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                </div>
              </div>
            ))}

            {runHistory.length === 0 && (
              <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No run history yet. Trigger a synthetic run to begin recording.
              </div>
            )}
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
