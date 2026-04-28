'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Users,
  Activity,
  Layers,
  Filter,
  Search,
  ChevronRight,
  Mail,
  Calendar,
  Shield,
  MapPin,
  Smartphone,
  Globe,
  Clock,
  History,
  Fingerprint,
  UserCheck,
  UserPlus,
  AlertCircle,
  ArrowDown
} from 'lucide-react';
import { DiagnosticDrawer } from '@kpi-platform/ui';
import { useAuth } from '../../../../context/AuthContext';

type IdentityRow = {
  id: string;
  name: string;
  email: string;
  state: string;
  sessions: number;
  lastActive: string;
};

type FunnelStage = {
  stage: string;
  count: number;
  percent: number;
};

type Segment = {
  name: string;
  size: number;
  active: number;
  conversion: number;
  growth: number;
};

type Attribution = {
  source: string;
  conversion: number;
  sessions: number;
};

export default function CustomersPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>({
    totalUsers: 0,
    activeUsers: 0,
    identifiedRatio: 0,
    newVsReturning: 0,
    sessions: 0
  });
  const [intelligence, setIntelligence] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;

    setLoading(true);
    try {
      const [summ, intel] = await Promise.all([
        apiFetch(`/api/v1/dashboard/customers/summary?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/customers/intelligence?siteId=${projectId}`)
      ]);
      setSummary(summ);
      setIntelligence(intel);
    } catch (err) {
      console.error('Customer intelligence failure:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const metricCards = useMemo(
    () => [
      {
        label: 'Audience Reach',
        value: loading ? '...' : Number(summary.totalUsers || 0).toLocaleString(),
        badge: '12.4% vs last 30d',
        icon: Users
      },
      {
        label: 'Identity Maturity',
        value: loading ? '...' : `${summary.identifiedRatio || 0}%`,
        badge: (summary.identifiedRatio || 0) > 50 ? 'Identity graph healthy' : 'Opportunity to enrich',
        icon: Fingerprint
      },
      {
        label: 'Live Engagement',
        value: loading ? '...' : Number(summary.activeUsers || 0).toLocaleString(),
        badge: 'Realtime active profile count',
        icon: UserCheck
      },
      {
        label: 'Acquisition Mix',
        value: loading ? '...' : `${summary.newVsReturning || 0}%`,
        badge: 'New visitor share',
        icon: UserPlus
      }
    ],
    [loading, summary]
  );

  const funnelStages: FunnelStage[] = intelligence?.funnel || [];
  const segments: Segment[] = intelligence?.segments || [];
  const identities: IdentityRow[] = intelligence?.recentIdentities || [];
  const topAttribution: Attribution[] = intelligence?.topAttribution || [];

  const insights = [
    {
      title: 'Funnel leakage detected',
      description: '14% drop in cart-to-checkout in mobile Safari users.',
      icon: Activity,
      color: '#f59e0b'
    },
    {
      title: 'Segment growth spike',
      description: 'High-value VIP segment grew by 24% following v3.0 release.',
      icon: Layers,
      color: '#22c55e'
    },
    {
      title: 'Anomalous guest pattern',
      description: 'Increased bot-like traffic detected from the DE region.',
      icon: MapPin,
      color: '#60a5fa'
    }
  ];

  const panelStyle: React.CSSProperties = {
    borderRadius: '12px',
    border: '1px solid var(--border-card)',
    background: 'var(--bg-card)',
    padding: '24px',
    overflow: 'visible'
  };

  return (
    <>
      <div
        style={{
          padding: '24px 28px',
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          overflow: 'visible'
        }}
      >
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
              <Users style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <span
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-label)',
                marginBottom: '0'
              }}
            >
              Identity Analytics
            </span>
          </div>

          <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Customer Intelligence Lab
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

          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              maxWidth: '760px'
            }}
          >
            Strategic behavioral analysis, funnel exploration, and identity-aware journey tracking.
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                  }}
                >
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

                <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>
                  {card.value}
                </div>

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
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          <div style={panelStyle}>
            <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Conversion Journey Intelligence
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
              Site-Wide Funnel
            </span>

            <div style={{ overflow: 'visible' }}>
              {(loading ? [] : funnelStages).map((stage, idx) => {
                const previousPercent = idx > 0 ? funnelStages[idx - 1].percent : stage.percent;
                const dropoff = Math.max(previousPercent - stage.percent, 0);

                return (
                  <div key={`${stage.stage}-${idx}`} style={{ marginBottom: idx === funnelStages.length - 1 ? '0' : '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{stage.stage}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{stage.percent}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-label)', textTransform: 'uppercase' }}>
                        {stage.count.toLocaleString()} Users
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-label)', textTransform: 'uppercase' }}>Conversion</span>
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
                          width: `${Math.max(6, stage.percent)}%`,
                          height: '100%',
                          borderRadius: '999px',
                          background: 'linear-gradient(90deg, #60a5fa 0%, #22c55e 100%)'
                        }}
                      />
                    </div>
                    {idx > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', color: 'var(--text-label)' }}>
                        <ArrowDown style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                        <span style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          {dropoff}% leakage from previous stage
                        </span>
                        {dropoff > 10 && <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, color: '#f59e0b' }} />}
                      </div>
                    )}
                  </div>
                );
              })}
              {loading && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>Loading funnel intelligence...</div>
              )}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '20px' }}>
              Behavioral Segmentation
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 60px 70px',
                gap: '8px',
                padding: '0 0 10px',
                borderBottom: '1px solid var(--border-card)',
                marginBottom: '12px'
              }}
            >
              {['Segment', 'Users', 'CR', 'Growth'].map((label) => (
                <span
                  key={label}
                  style={{
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-label)'
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {(loading ? [] : segments).map((segment, idx) => (
              <div
                key={`${segment.name}-${idx}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 60px 70px',
                  gap: '8px',
                  padding: '12px 0',
                  borderBottom: idx === segments.length - 1 ? 'none' : '1px solid var(--border-card)',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{segment.name}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{segment.size.toLocaleString()}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{segment.conversion}%</span>
                <span style={{ fontSize: '13px', color: segment.growth >= 0 ? '#22c55e' : '#f87171' }}>
                  {segment.growth >= 0 ? '+' : '-'}
                  {Math.abs(segment.growth)}%
                </span>
              </div>
            ))}
            {loading && (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>Loading segment intelligence...</div>
            )}
          </div>

          <div style={panelStyle}>
            <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '6px' }}>
              Behavioral Insights
            </div>

            {insights.map((insight, idx) => {
              const Icon = insight.icon;

              return (
                <div
                  key={insight.title}
                  style={{
                    padding: '14px 0',
                    borderBottom: idx === insights.length - 1 ? 'none' : '1px solid var(--border-card)',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start'
                  }}
                >
                  <Icon style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '2px', color: insight.color }} />
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 5px' }}>{insight.title}</p>
                    <p
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        lineHeight: 1.6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        margin: 0
                      }}
                    >
                      {insight.description}
                    </p>
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: '20px' }}>
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-label)'
                }}
              >
                Top Traffic Attribution
              </div>

              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(loading ? [] : topAttribution).map((attr) => (
                  <div key={attr.source} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      {attr.source}
                      <span style={{ color: 'var(--text-muted)' }}> · {attr.sessions.toLocaleString()} sessions</span>
                    </span>
                    <span style={{ fontSize: '12px', color: '#60a5fa', whiteSpace: 'nowrap' }}>{attr.conversion}% CR</span>
                  </div>
                ))}
                {loading && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading attribution data...</span>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ overflow: 'visible' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}
          >
            <div
              style={{
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-muted)'
              }}
            >
              Recent Identity Log
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  minWidth: '240px'
                }}
              >
                <Search style={{ width: '16px', height: '16px', color: 'var(--text-label)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search identities..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                />
              </div>
              <button
                type="button"
                aria-label="Filter identities"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  cursor: 'pointer'
                }}
              >
                <Filter style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />
              </button>
            </div>
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
                <span style={{ flex: 2 }}>Customer Identity</span>
                <span style={{ flex: 1 }}>Lifecycle State</span>
                <span style={{ width: '80px', textAlign: 'right' }}>Sessions</span>
                <span style={{ width: '120px', textAlign: 'right' }}>Last Active</span>
                <span style={{ width: '24px' }} />
              </div>
            </div>

            {(loading ? [] : identities).map((customer, idx) => (
              <button
                key={customer.id || `${customer.email}-${idx}`}
                type="button"
                onClick={() => {
                  setSelectedCustomer(customer);
                  setIsDrawerOpen(true);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '14px 20px',
                  borderBottom: idx === identities.length - 1 ? 'none' : '1px solid var(--border-card)',
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'var(--text-primary)'
                }}
              >
                <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'rgba(96,165,250,0.12)',
                      border: '1px solid rgba(96,165,250,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#60a5fa',
                      fontSize: '12px',
                      fontWeight: 600,
                      flexShrink: 0
                    }}
                  >
                    {customer.name?.charAt(0) || '?'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '2px' }}>{customer.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {customer.email}
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      border: '1px solid var(--border-input)',
                      color: customer.state === 'VIP' ? '#22c55e' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {customer.state}
                  </span>
                </div>

                <div style={{ width: '80px', textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>{customer.sessions}</div>
                <div style={{ width: '120px', textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>{customer.lastActive}</div>
                <ChevronRight style={{ width: '16px', height: '16px', color: 'var(--text-label)', flexShrink: 0 }} />
              </button>
            ))}
            {loading && <div style={{ padding: '18px 20px', fontSize: '13px', color: 'var(--text-muted)' }}>Loading identity log...</div>}
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

      <DiagnosticDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Customer Identity Profile"
        subtitle={`Identity ID: ${selectedCustomer?.id} • Lifecycle: ${selectedCustomer?.state}`}
        width="700px"
      >
        {selectedCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <section
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                padding: '24px',
                background: 'var(--bg-input)',
                borderRadius: '24px',
                border: '1px solid var(--border-card)'
              }}
            >
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: '#60a5fa',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  fontWeight: 700,
                  border: '4px solid var(--border-card)',
                  flexShrink: 0
                }}
              >
                {selectedCustomer.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>{selectedCustomer.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>
                  <Mail style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                  {selectedCustomer.email}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  {[selectedCustomer.state, 'ID Verified', '2FA Active'].map((label, idx) => (
                    <span
                      key={`${label}-${idx}`}
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        border: '1px solid var(--border-input)',
                        color: idx === 0 ? '#22c55e' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {[
                { icon: Calendar, label: 'Customer Since', value: 'October 24, 2025' },
                { icon: Globe, label: 'Origin Tracking', value: 'London, GB • Virgin Media' }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    style={{
                      padding: '16px',
                      borderRadius: '18px',
                      border: '1px solid var(--border-card)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                      <Icon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</span>
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>{item.value}</div>
                  </div>
                );
              })}
            </div>

            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>Behavioral Journey</div>
                </div>
                <button
                  type="button"
                  style={{
                    border: '1px solid var(--border-card)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  View full session log
                </button>
              </div>

              <div style={{ borderLeft: '1px solid var(--border-card)', marginLeft: '10px', paddingLeft: '24px' }}>
                {[
                  { time: '2m ago', event: 'Purchased Order #4421', desc: 'Basket Value: $244.10', icon: Shield, color: '#22c55e' },
                  { time: '12m ago', event: 'Completed Checkout Stage 3', desc: 'Payment Method: Visa • 4421', icon: Clock, color: 'var(--text-secondary)' },
                  { time: '4h ago', event: 'Session Started (Direct)', desc: 'Device: Apple iPhone 15 Pro • iOS 17.4', icon: Smartphone, color: 'var(--text-secondary)' },
                  { time: '2d ago', event: 'Engaged with Loyalty Reward', desc: 'Claimed: 15% Welcome Discount', icon: Activity, color: '#60a5fa' }
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div key={`${item.event}-${idx}`} style={{ position: 'relative', paddingBottom: idx === 3 ? '0' : '24px' }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: '-29px',
                          top: '4px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: 'var(--bg-card)',
                          border: '2px solid #60a5fa'
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <Icon style={{ width: '16px', height: '16px', color: item.color, flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{item.event}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.desc}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                          {item.time}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section style={{ paddingTop: '16px', borderTop: '1px solid var(--border-card)', display: 'flex', gap: '16px' }}>
              <button
                type="button"
                style={{
                  flex: 1,
                  borderRadius: '12px',
                  border: '1px solid rgba(96,165,250,0.2)',
                  background: '#60a5fa',
                  color: 'var(--text-primary)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <Search style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Analyze Path
              </button>
              <button
                type="button"
                style={{
                  flex: 1,
                  borderRadius: '12px',
                  border: '1px solid var(--border-input)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Re-Link Identity
              </button>
            </section>
          </div>
        )}
      </DiagnosticDrawer>
    </>
  );
}
