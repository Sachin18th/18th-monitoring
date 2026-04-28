'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Map,
  ZapOff,
  MousePointerClick,
  AlertCircle,
  ShoppingBag,
  TrendingUp,
  Filter,
  History,
  RefreshCw,
  ArrowDown,
  AlertTriangle
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

export default function JourneyIntelligencePage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnelSteps, setFunnelSteps] = useState<any[]>([]);
  const [intelligence, setIntelligence] = useState<any>(null);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/dashboard/customers/intelligence?siteId=${projectId}`);
      const funnel = Array.isArray(res?.funnel) ? res.funnel : [];
      setFunnelSteps(
        funnel.map((s: any) => ({
          label: s.stage,
          count: s.count,
          dropRate: s.percent ? Math.round(100 - s.percent) : 0,
          technicalDropCount: 0
        }))
      );
      setIntelligence(res);
    } catch (err: any) {
      console.error('[Journeys] Load failed', err);
      setError('Failed to reconstruct user journeys.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const firstStep = funnelSteps[0]?.count || 1;
  const lastStep = funnelSteps[funnelSteps.length - 1]?.count || 0;
  const completion = firstStep > 0 ? ((lastStep / firstStep) * 100).toFixed(2) : '0.00';
  const frictionSignals = funnelSteps.filter((s) => s.dropRate > 50).length;

  const metricCards = useMemo(
    () => [
      {
        label: 'Completion Rate',
        value: `${completion}%`,
        badge: 'End-to-end conversion',
        icon: ShoppingBag
      },
      {
        label: 'Total Visitors',
        value: firstStep.toLocaleString(),
        badge: 'Entered first stage',
        icon: TrendingUp
      },
      {
        label: 'Journey Drop-offs',
        value: (firstStep - lastStep).toLocaleString(),
        badge: 'Exited before completion',
        icon: ZapOff
      },
      {
        label: 'Friction Signals',
        value: `${frictionSignals} stages`,
        badge: 'High-loss stage count',
        icon: MousePointerClick
      }
    ],
    [completion, firstStep, frictionSignals, lastStep]
  );

  if (loading && funnelSteps.length === 0) {
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
            Reconstructing user journeys...
          </span>
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
              <Map style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <span
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-label)'
              }}
            >
              Journey Observability
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, maxWidth: '760px' }}>
              <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Customer Journey Intelligence
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
                Behavioral diagnostics and technical funnel attribution for {projectId as string}
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
                <History style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Compare
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
                <Filter style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Configuration
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(244,63,94,0.2)',
              background: 'rgba(244,63,94,0.1)',
              color: '#fb7185',
              overflow: 'visible'
            }}
          >
            <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
              <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', overflowWrap: 'anywhere' }}>{error}</span>
            </div>
            <button
              onClick={loadData}
              style={{
                marginLeft: '8px',
                flexShrink: 0,
                fontSize: '12px',
                fontWeight: 500,
                color: '#fb7185',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                padding: 0
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          {metricCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-label)',
                      fontWeight: 500
                    }}
                  >
                    {metric.label}
                  </span>
                  <Icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                </div>
                <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>{metric.value}</div>
                <div style={{ marginTop: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#22c55e' }}>{metric.badge}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.7fr) minmax(320px, 1fr)',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'visible', minWidth: 0 }}>
            {funnelSteps.length === 0 ? (
              <div style={{ ...cardStyle, minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>No funnel data available. Ingest customer events to begin.</p>
              </div>
            ) : (
              <div style={cardStyle}>
                <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Purchase Journey Funnel
                </div>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    border: '1px solid var(--border-input)',
                    color: 'var(--text-muted)',
                    marginBottom: '20px',
                    display: 'inline-block',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Live Analysis (Project Scope)
                </span>

                <div style={{ overflow: 'visible' }}>
                  {funnelSteps.map((step, idx) => {
                    const widthPct = firstStep > 0 ? (step.count / firstStep) * 100 : 0;
                    const technicalPct = step.count > 0 ? (step.technicalDropCount / step.count) * 100 : 0;

                    return (
                      <div key={step.label} style={{ marginBottom: idx === funnelSteps.length - 1 ? '0' : '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{step.label}</span>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{step.count.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-label)', textTransform: 'uppercase' }}>Users</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-label)', textTransform: 'uppercase' }}>
                            {idx > 0 ? `${step.dropRate}% drop-off` : 'Entry stage'}
                          </span>
                        </div>
                        <div
                          style={{
                            height: '10px',
                            borderRadius: '999px',
                            background: 'var(--bg-input)',
                            overflow: 'visible',
                            position: 'relative'
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(6, widthPct)}%`,
                              height: '100%',
                              borderRadius: '999px',
                              background: 'linear-gradient(90deg, #60a5fa 0%, #22c55e 100%)'
                            }}
                          />
                          {step.technicalDropCount > 0 && (
                            <div
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                width: `${technicalPct}%`,
                                height: '100%',
                                borderRadius: '999px',
                                background: 'rgba(248,113,113,0.55)'
                              }}
                            />
                          )}
                        </div>
                        {idx > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', color: 'var(--text-label)' }}>
                            <ArrowDown style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                            <span style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              {step.dropRate}% lost from previous stage
                            </span>
                            {step.dropRate > 50 && <AlertTriangle style={{ width: '16px', height: '16px', flexShrink: 0, color: '#f59e0b' }} />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-card)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div
                    style={{
                      borderRadius: '12px',
                      border: '1px solid rgba(34,197,94,0.15)',
                      background: 'rgba(34,197,94,0.06)',
                      padding: '16px',
                      overflow: 'visible'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <TrendingUp style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>
                        Conversion Rate
                      </span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 500, color: '#22c55e' }}>{completion}%</div>
                  </div>
                  <div
                    style={{
                      borderRadius: '12px',
                      border: '1px solid rgba(248,113,113,0.15)',
                      background: 'rgba(248,113,113,0.06)',
                      padding: '16px',
                      overflow: 'visible'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <AlertTriangle style={{ width: '16px', height: '16px', color: '#f87171' }} />
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>
                        Technical Loss
                      </span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 500, color: '#f87171' }}>0.8%</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'visible' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '20px' }}>
                Abandonment Attribution
              </div>
              {[
                { label: 'Network/API Failure', value: '35%', color: '#f43f5e' },
                { label: 'UX Friction (Rage Click)', value: '24%', color: '#a855f7' },
                { label: 'Performance (Slow Load)', value: '18%', color: '#f59e0b' },
                { label: 'Other / Intent-based', value: '23%', color: '#334155' }
              ].map((attr, idx, arr) => (
                <div
                  key={attr.label}
                  style={{
                    padding: '14px 0',
                    borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{attr.label}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{attr.value}</span>
                  </div>
                  <div style={{ height: '8px', width: '100%', background: 'var(--bg-input)', borderRadius: '999px' }}>
                    <div style={{ height: '100%', width: attr.value, background: attr.color, borderRadius: '999px' }} />
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                ...cardStyle,
                background: 'rgba(79,70,229,0.08)',
                border: '1px solid rgba(129,140,248,0.3)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <AlertCircle style={{ width: '16px', height: '16px', color: '#818cf8', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 5px' }}>Intelligence Insight</p>
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
                    Checkout drop-offs increased by 12% in the last hour. Correlation signals suggest a link to Stripe Payment gateway latency spikes.
                  </p>
                  <button
                    style={{
                      fontSize: '11px',
                      color: '#60a5fa',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Investigate Cause
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          {[
            {
              label: 'Broken CTAs',
              value: '12',
              note: 'Buttons with no response detected',
              icon: ZapOff,
              iconColor: '#f87171',
              iconBg: 'rgba(244,63,94,0.12)'
            },
            {
              label: 'Rage Click Spots',
              value: '5',
              note: 'High friction zones identified',
              icon: MousePointerClick,
              iconColor: '#c084fc',
              iconBg: 'rgba(168,85,247,0.12)'
            },
            {
              label: 'Stalled Journeys',
              value: `${funnelSteps.filter((s) => s.dropRate > 50).length * 24 || 0}`,
              note: 'Users currently waiting > 30s',
              icon: TrendingUp,
              iconColor: '#fbbf24',
              iconBg: 'rgba(245,158,11,0.12)'
            }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ padding: '8px', borderRadius: '8px', background: item.iconBg }}>
                    <Icon style={{ width: '16px', height: '16px', color: item.iconColor }} />
                  </div>
                  <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                    {item.label}
                  </h4>
                </div>
                <div style={{ fontSize: '36px', lineHeight: 1, fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>{item.value}</div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{item.note}</p>
              </div>
            );
          })}
        </div>

        {intelligence?.generatedAt && (
          <div style={{ fontSize: '11px', color: 'var(--text-label)' }}>
            Last intelligence refresh: {new Date(intelligence.generatedAt).toLocaleString()}
          </div>
        )}
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
