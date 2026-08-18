'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { UserSearch, Search, Fingerprint, Activity, ShoppingBag, Clock, RefreshCw, Sparkles, ChevronLeft, ChevronRight, ArrowLeft, Mail, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { PageHero } from '@/components/PageHero';
import { PageRestricted } from '@/components/PageRestricted';
import { useConfirm } from '@/components/ConfirmDialog';
import { CampaignEditor } from '@/components/CampaignEditor';
import CustomerInsights from '@/components/customers/CustomerInsights';

const PAGE_KEY = 'observability/customer-360';

// Funnel stage → color, shared with the live-journey rendering.
const STAGE_META: Record<string, { label: string; color: string }> = {
  visit: { label: 'Visit', color: '#64748b' },
  product_view: { label: 'Product view', color: '#0ea5e9' },
  add_to_cart: { label: 'Add to cart', color: '#f59e0b' },
  checkout: { label: 'Checkout', color: '#a855f7' },
  purchase: { label: 'Purchase', color: '#22c55e' },
};

const STAGE_RANK: Record<string, number> = { visit: 0, product_view: 1, add_to_cart: 2, checkout: 3, purchase: 4 };

const SEGMENT_COLOR: Record<string, string> = {
  VIP: '#a855f7',
  HIGH_VALUE: '#22c55e',
  AT_RISK: '#f59e0b',
  LOST: '#ef4444',
  REGULAR: '#64748b',
};
const CHURN_COLOR: Record<string, string> = { low: '#22c55e', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };

// Fused segments (live × historical) — Phase 3.
const FUSED_COLOR: Record<string, string> = {
  HIGH_VALUE_ABANDONER: '#ef4444',
  CART_ABANDONER: '#f97316',
  LAPSED_REACTIVATING: '#f59e0b',
  NEW_HIGH_INTENT: '#22d3ee',
  LOYAL_ACTIVE: '#22c55e',
};
const FUSED_LABEL: Record<string, string> = {
  HIGH_VALUE_ABANDONER: 'High-value abandoner',
  CART_ABANDONER: 'Cart abandoner',
  LAPSED_REACTIVATING: 'Lapsed reactivating',
  NEW_HIGH_INTENT: 'New high intent',
  LOYAL_ACTIVE: 'Loyal active',
};
const fusedLabel = (s: string) => FUSED_LABEL[s] || s;
const fusedColor = (s: string) => FUSED_COLOR[s] || '#a855f7';

const fmtDate = (v: any) => (v ? new Date(v).toLocaleString() : '—');
const fmtMoney = (v: any) => (v != null ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');

export default function Customer360Page() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();
  const { confirm, dialog } = useConfirm();

  const [allowed, setAllowed] = useState<string[] | null>(null);

  // Detail selection (null = paginated customer list view).
  const [detailKey, setDetailKey] = useState<{ by: 'email' | 'id'; value: string } | null>(null);
  // One search box: an exact email jumps straight to that customer, anything
  // else filters the list by name (server-side, debounced).
  const [searchInput, setSearchInput] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [recs, setRecs] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'orders' | 'journey' | 'recs' | 'identity' | 'campaigns'>('journey');
  const [listSubView, setListSubView] = useState<'table' | 'insights'>('table');
  const [campaigns, setCampaigns] = useState<any[] | null>(null);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaignRunResult, setCampaignRunResult] = useState<any>(null);
  const [campaignEditing, setCampaignEditing] = useState<any | null>(null);

  // Paginated customer list.
  const PAGE_SIZE = 30;
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [segmentFilter, setSegmentFilter] = useState('');
  const [segments, setSegments] = useState<{ fused: any[]; base: any[] } | null>(null);

  // Live "who's on the site now" (auto-polled).
  const [live, setLive] = useState<any[] | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [autoLive, setAutoLive] = useState(true);

  // Load the caller's allowed page keys once (drives the in-page guard).
  useEffect(() => {
    let active = true;
    (async () => {
      if (!token || !projectId) return;
      try {
        const perms = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
        const keys = Array.isArray(perms?.allowedPageKeys) ? perms.allowedPageKeys.map(String) : [];
        if (active) setAllowed(keys);
      } catch {
        if (active) setAllowed([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiFetch, projectId, token]);

  // ── Customer list (server-side paginated) ────────────────────────────────
  const loadList = useCallback(async () => {
    if (!token || !projectId || !connectorInstanceId) {
      setCustomers(null);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const qs = new URLSearchParams({
        projectId: String(projectId),
        connectorInstanceId: String(connectorInstanceId),
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (segmentFilter) qs.set('segment', segmentFilter);
      if (nameFilter) qs.set('name', nameFilter);
      const res = await apiFetch(`/api/storefront/customers?${qs.toString()}`, { suppressUnauthorizedRedirect: true });
      setCustomers(Array.isArray(res?.customers) ? res.customers : []);
      setTotal(Number(res?.total) || 0);
    } catch {
      setListError('Failed to load customers.');
      setCustomers([]);
    } finally {
      setListLoading(false);
    }
  }, [apiFetch, projectId, token, connectorInstanceId, page, segmentFilter, nameFilter]);

  useEffect(() => {
    if (!detailKey) loadList();
  }, [loadList, detailKey]);

  // Debounce the name search so typing doesn't fire a request per keystroke.
  // An email-shaped value is a jump target, not a name filter.
  useEffect(() => {
    const term = searchInput.trim();
    const next = term.includes('@') ? '' : term;
    if (next === nameFilter) return;
    const id = setTimeout(() => {
      setNameFilter(next);
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput, nameFilter]);

  // Segment counts for the filter chips (refreshed with the store).
  const loadSegments = useCallback(async () => {
    if (!token || !projectId || !connectorInstanceId) {
      setSegments(null);
      return;
    }
    try {
      const qs = new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId) });
      const res = await apiFetch(`/api/storefront/segments?${qs.toString()}`, { suppressUnauthorizedRedirect: true });
      setSegments({ fused: res?.fused ?? [], base: res?.base ?? [] });
    } catch {
      setSegments(null);
    }
  }, [apiFetch, projectId, token, connectorInstanceId]);

  useEffect(() => {
    if (!detailKey) loadSegments();
  }, [loadSegments, detailKey]);

  // Reset to the first page of the list when the active store changes.
  useEffect(() => {
    setDetailKey(null);
    setPage(1);
    setSearchInput('');
    setNameFilter('');
  }, [connectorSelectionTick]);

  // ── Customer detail (unified 360) ────────────────────────────────────────
  // `silent` (used by the auto-refresh poll) updates in place without the loading flicker.
  const loadDetail = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!detailKey || !projectId || !connectorInstanceId) return;
      const silent = opts?.silent;
      if (!silent) {
        setDetailLoading(true);
        setDetailError(null);
        setDetail(null);
        setTab('journey');
        // Clear the previous customer's run banner + drafts so they don't bleed
        // into the newly opened customer (e.g. a "cooldown" from riya showing
        // while you're looking at dhruv).
        setCampaignRunResult(null);
        setCampaigns(null);
      }
      try {
        const qs = new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId) });
        if (detailKey.by === 'email') qs.set('email', detailKey.value);
        else qs.set('customerProfileId', detailKey.value);
        const res = await apiFetch(`/api/storefront/unified-customer?${qs.toString()}`, { suppressUnauthorizedRedirect: true });
        setDetail(res);
      } catch (err: any) {
        if (!silent) {
          const status = err?.response?.status;
          setDetailError(status === 404 ? 'No customer found.' : 'Failed to load customer.');
        }
      } finally {
        if (!silent) setDetailLoading(false);
      }
    },
    [apiFetch, projectId, connectorInstanceId, detailKey],
  );

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // ── Live "who's on the site now" — polled every 5s while auto is on ───────
  const fetchLive = useCallback(async () => {
    if (!token || !projectId || !connectorInstanceId) {
      setLive(null);
      return;
    }
    try {
      const qs = new URLSearchParams({
        projectId: String(projectId),
        connectorInstanceId: String(connectorInstanceId),
        windowMinutes: '5',
      });
      const res = await apiFetch(`/api/storefront/customers/live?${qs.toString()}`, { suppressUnauthorizedRedirect: true });
      setLive(Array.isArray(res?.visitors) ? res.visitors : []);
      setLiveCount(Number(res?.liveVisitors) || 0);
    } catch {
      /* keep the last snapshot on a transient error */
    }
  }, [apiFetch, token, projectId, connectorInstanceId]);

  useEffect(() => {
    if (!connectorInstanceId) return;
    fetchLive(); // immediate
    if (!autoLive) return;
    const id = setInterval(() => {
      fetchLive();
      if (detailKey) loadDetail({ silent: true }); // keep the open customer's journey live
    }, 5000);
    return () => clearInterval(id);
  }, [connectorInstanceId, autoLive, detailKey, fetchLive, loadDetail]);

  // Recompute RFM/CLTV/churn/segment store-wide, then refresh the open view.
  const recompute = useCallback(async () => {
    if (!projectId || !connectorInstanceId) return;
    setRecomputing(true);
    try {
      await apiFetch(`/api/storefront/unified-customer/recompute`, {
        method: 'POST',
        body: { projectId: String(projectId), connectorInstanceId: String(connectorInstanceId) },
      });
      if (detailKey) await loadDetail();
      else await loadList();
    } catch {
      /* surfaced on the next fetch */
    } finally {
      setRecomputing(false);
    }
  }, [apiFetch, projectId, connectorInstanceId, detailKey, loadDetail, loadList]);

  // Load personalized recommendations once a customer detail is resolved.
  useEffect(() => {
    const pid = detail?.profile?.id;
    if (!pid || !projectId || !connectorInstanceId) {
      setRecs(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const qs = new URLSearchParams({
          projectId: String(projectId),
          connectorInstanceId: String(connectorInstanceId),
          customerProfileId: pid,
          limit: '6',
        });
        const res = await apiFetch(`/api/storefront/unified-customer/recommendations?${qs.toString()}`, {
          suppressUnauthorizedRedirect: true,
        });
        if (active) setRecs(Array.isArray(res?.items) ? res.items : []);
      } catch {
        if (active) setRecs([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiFetch, detail?.profile?.id, projectId, connectorInstanceId]);

  // Campaigns (triggered drafts) for the open customer.
  const loadCampaigns = useCallback(async () => {
    const pid = detail?.profile?.id;
    if (!pid || !projectId || !connectorInstanceId) {
      setCampaigns(null);
      return;
    }
    try {
      const qs = new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), customerProfileId: pid });
      const res = await apiFetch(`/api/storefront/campaigns?${qs.toString()}`, { suppressUnauthorizedRedirect: true });
      setCampaigns(Array.isArray(res?.messages) ? res.messages : []);
    } catch {
      setCampaigns([]);
    }
  }, [apiFetch, detail?.profile?.id, projectId, connectorInstanceId]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Evaluate fused-segment triggers store-wide and generate drafts, then refresh.
  const runCampaigns = useCallback(async () => {
    if (!projectId || !connectorInstanceId) return;
    const pid = detail?.profile?.id;
    setCampaignBusy(true);
    setCampaignRunResult(null);
    try {
      const res = await apiFetch(`/api/storefront/campaigns/run`, {
        method: 'POST',
        body: { projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), ...(pid ? { customerProfileId: pid } : {}) },
      });
      setCampaignRunResult(res || {});
      await loadCampaigns();
    } catch {
      // The request can time out client-side while the server finishes and
      // commits the draft. Refresh the list so a draft that landed shows up.
      setCampaignRunResult({ error: true });
      await loadCampaigns();
    } finally {
      setCampaignBusy(false);
    }
  }, [apiFetch, projectId, connectorInstanceId, detail?.profile?.id, loadCampaigns]);

  const sendCampaign = useCallback(
    async (id: string) => {
      if (!projectId || !connectorInstanceId) return;
      setCampaignBusy(true);
      try {
        await apiFetch(`/api/storefront/campaigns/${id}/send`, {
          method: 'POST',
          body: { projectId: String(projectId), connectorInstanceId: String(connectorInstanceId) },
          suppressUnauthorizedRedirect: true,
        });
        await loadCampaigns();
      } catch {
        /* surfaced via status on refresh */
      } finally {
        setCampaignBusy(false);
      }
    },
    [apiFetch, projectId, connectorInstanceId, loadCampaigns],
  );

  const deleteCampaign = useCallback(
    async (id: string) => {
      if (!projectId || !connectorInstanceId) return;
      if (!(await confirm({ title: 'Delete campaign', message: 'Delete this campaign message? This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
      setCampaignBusy(true);
      try {
        await apiFetch(`/api/storefront/campaigns/${id}?${new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId) }).toString()}`, {
          method: 'DELETE',
          suppressUnauthorizedRedirect: true,
        });
        await loadCampaigns();
      } catch {
        /* surfaced on refresh */
      } finally {
        setCampaignBusy(false);
      }
    },
    [apiFetch, projectId, connectorInstanceId, loadCampaigns, confirm],
  );

  const saveCampaignEdit = useCallback(
    async (id: string, patch: { subject: string; body: string }) => {
      if (!projectId || !connectorInstanceId) return;
      setCampaignBusy(true);
      try {
        await apiFetch(`/api/storefront/campaigns/${id}`, {
          method: 'PUT',
          body: { projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), ...patch },
          suppressUnauthorizedRedirect: true,
        });
        setCampaignEditing(null);
        await loadCampaigns();
      } catch {
        /* surfaced on refresh */
      } finally {
        setCampaignBusy(false);
      }
    },
    [apiFetch, projectId, connectorInstanceId, loadCampaigns],
  );

  if (allowed !== null && !allowed.includes(PAGE_KEY) && !allowed.includes('customers')) {
    return <PageRestricted pageKey={PAGE_KEY} />;
  }

  const profile = detail?.profile;
  const history = detail?.history;
  const fusion = detail?.fusion;
  const links = detail?.identity?.links ?? [];
  const journey = detail?.liveJourney;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
      <PageHero
        icon={UserSearch}
        accent="#22d3ee"
        eyebrow="CDP · Unified Customer"
        title="Customers"
        subtitle="One record per customer — history, live behavior, identity & campaigns, plus store-wide insights."
        right={
          connectorInstanceId ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setAutoLive((v) => !v)}
                title="Auto-refresh live data every 5 seconds"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8,
                  border: '1px solid var(--border-card)', background: 'var(--bg-card)',
                  color: autoLive ? '#22c55e' : 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontWeight: 600,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: autoLive ? '#22c55e' : 'var(--text-muted)', animation: autoLive ? 'pulse 1.5s ease-in-out infinite' : 'none' }} />
                {autoLive ? 'Live' : 'Paused'}
              </button>
              <button
                onClick={recompute}
                disabled={recomputing}
                title="Recompute RFM / CLTV / churn / segment from order history (also runs automatically after each sync)"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                  border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-primary)',
                  fontSize: 13, cursor: recomputing ? 'wait' : 'pointer',
                }}
              >
                <RefreshCw size={14} style={{ animation: recomputing ? 'spin 1s linear infinite' : 'none' }} />
                {recomputing ? 'Recomputing…' : 'Recompute metrics'}
              </button>
            </div>
          ) : null
        }
      />

      {!connectorInstanceId && <Empty text="Select a store to view customers." />}

      {/* ── LIST VIEW: paginated customers ── */}
      {connectorInstanceId && !detailKey && (
        <div style={{ marginTop: 20 }}>
          {/* who's on the site right now */}
          <LiveNow visitors={live} count={liveCount} onOpen={(pid: string) => setDetailKey({ by: 'id', value: pid })} />

          {/* Customers ↔ Insights sub-view */}
          <div style={{ display: 'inline-flex', gap: 4, background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 10, padding: 3, margin: '16px 0 8px' }}>
            {(['table', 'insights'] as const).map((v) => (
              <button key={v} onClick={() => setListSubView(v)}
                style={{ border: 0, background: listSubView === v ? '#22d3ee' : 'transparent', color: listSubView === v ? '#04252b' : 'var(--text-muted)', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}>
                {v === 'table' ? 'Customers' : 'Insights'}
              </button>
            ))}
          </div>

          {listSubView === 'insights' ? (
            <CustomerInsights projectId={String(projectId)} connectorInstanceId={connectorInstanceId} apiFetch={apiFetch} />
          ) : (
          <>
          {/* search by name (filters the list), or jump by exact email */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const term = searchInput.trim();
              if (!term) return;
              // Emails are stored encrypted, so they can only be matched exactly —
              // an email-shaped term resolves the customer directly. A name is a
              // partial match, so it filters the list instead.
              if (term.includes('@')) setDetailKey({ by: 'email', value: term });
              else {
                setNameFilter(term);
                setPage(1);
              }
            }}
            style={{ display: 'flex', gap: 10, marginBottom: 16, maxWidth: 460 }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by customer name, or exact email…"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8,
                  border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14,
                }}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setNameFilter(''); setPage(1); }}
                  title="Clear search"
                  style={{
                    position: 'absolute', right: 8, top: 7, border: 0, background: 'transparent',
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: '20px', padding: '4px 6px',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </form>

          {/* segment filter chips (fused first, then base) */}
          {segments && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <Chip active={!segmentFilter} onClick={() => { setSegmentFilter(''); setPage(1); }} label="All" />
              {segments.fused.filter((s: any) => s.count > 0).map((s: any) => (
                <Chip key={s.segment} active={segmentFilter === s.segment} color={fusedColor(s.segment)}
                  onClick={() => { setSegmentFilter(s.segment); setPage(1); }} label={`⚡ ${fusedLabel(s.segment)} (${s.count})`} />
              ))}
              {segments.base.map((s: any) => (
                <Chip key={s.segment} active={segmentFilter === s.segment} color={SEGMENT_COLOR[s.segment]}
                  onClick={() => { setSegmentFilter(s.segment); setPage(1); }} label={`${s.segment} (${s.count})`} />
              ))}
            </div>
          )}

          {listLoading && <Empty text="Loading customers…" />}
          {!listLoading && listError && <Empty text={listError} />}
          {!listLoading && !listError && customers && customers.length === 0 && (
            <Empty text={nameFilter ? `No customer matches “${nameFilter}”.` : 'No customers found for this store yet.'} />
          )}
          {!listLoading && !listError && customers && customers.length > 0 && (
            <div style={{ border: '1px solid var(--border-card)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                      <Th>Customer</Th>
                      <Th>Segment</Th>
                      <Th right>Lifetime value</Th>
                      <Th right>Orders</Th>
                      <Th>Churn</Th>
                      <Th right>Last seen</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c: any) => (
                      <tr
                        key={c.id}
                        onClick={() => setDetailKey({ by: 'id', value: c.id })}
                        style={{ cursor: 'pointer', borderTop: '1px solid var(--border-card)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-page)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Td>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {c.email
                              || c.name
                              || Object.entries(c.externalIds || {}).map(([k, v]) => `${k}:${v}`).join(', ')
                              || 'Guest'}
                          </span>
                        </Td>
                        <Td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {c.segment ? <Badge color={SEGMENT_COLOR[c.segment] || '#64748b'}>{c.segment}</Badge> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            {(c.fusedSegments || []).map((f: string) => (
                              <Badge key={f} color={fusedColor(f)}>⚡ {fusedLabel(f)}</Badge>
                            ))}
                          </div>
                        </Td>
                        <Td right>{fmtMoney(c.totalLtv)}</Td>
                        <Td right>{c.orderCount}</Td>
                        <Td>{c.churnLevel ? <span style={{ color: CHURN_COLOR[c.churnLevel] || 'var(--text-muted)' }}>{c.churnLevel}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</Td>
                        <Td right><span style={{ color: 'var(--text-muted)' }}>{fmtDate(c.lastSeenAt)}</span></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--border-card)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{total} customers · page {page} of {totalPages}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <PageBtn disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft size={15} /> Prev
                  </PageBtn>
                  <PageBtn disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next <ChevronRight size={15} />
                  </PageBtn>
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* ── DETAIL VIEW: one customer's unified 360 ── */}
      {connectorInstanceId && detailKey && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setDetailKey(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
              border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: 13, cursor: 'pointer', marginBottom: 16,
            }}
          >
            <ArrowLeft size={15} /> Back to customers
          </button>

          {detailLoading && <Empty text="Resolving customer…" />}
          {!detailLoading && detailError && <Empty text={detailError} />}

      {profile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Compact summary band: identity + intelligence KPIs in one card ── */}
          <div style={{ borderRadius: 12, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '16px 20px' }}>
            {/* identity row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingBottom: 14, borderBottom: '1px solid var(--border-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: 999, background: '#22d3ee22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <UserSearch size={20} style={{ color: '#22d3ee' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile.email || profile.name || 'Unknown customer'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {Object.entries(profile.externalIds || {}).map(([k, v]) => `${k}:${v}`).join(' · ') || 'no external id'} · hash {profile.emailHashPreview || '—'}
                  </div>
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge color={SEGMENT_COLOR[history?.segment] || '#0ea5e9'}>{history?.segment || profile.lifecycleState || 'UNKNOWN'}</Badge>
                <MiniField label="First seen" value={fmtDate(profile.firstSeenAt)} />
                <MiniField label="Last seen" value={fmtDate(profile.lastSeenAt)} />
              </div>
            </div>
            {/* Fused segments (live × historical) + live-signal summary — Phase 3 */}
            {fusion && (fusion.fusedSegments?.length > 0 || fusion.cartAbandonedAt || fusion.sessionsLast30d > 0) && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12 }}>
                {(fusion.fusedSegments || []).map((f: string) => (
                  <Badge key={f} color={fusedColor(f)}>⚡ {fusedLabel(f)}</Badge>
                ))}
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {fusion.cartAbandonedAt ? `cart abandoned ${fmtDate(fusion.cartAbandonedAt)} · ` : ''}
                  {fusion.sessionsLast30d ?? 0} sessions / 30d
                  {fusion.liveFurthestStage ? ` · live reached ${STAGE_META[fusion.liveFurthestStage]?.label || fusion.liveFurthestStage}` : ''}
                  {fusion.recentCategories?.length ? ` · browsing ${fusion.recentCategories.slice(0, 2).join(', ')}` : ''}
                </span>
              </div>
            )}
            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))', gap: 12, paddingTop: 14 }}>
              <Kpi label="Lifetime value" value={fmtMoney(profile.totalLtv)} />
              <Kpi label="Predicted CLTV" value={history?.cltv != null ? fmtMoney(history.cltv) : '—'} sub={history?.cltvTier} />
              <Kpi label="Churn risk" value={history?.churnLevel || '—'} color={CHURN_COLOR[history?.churnLevel]} sub={history?.churnRisk != null ? history.churnRisk.toFixed(2) : undefined} />
              <Kpi label="RFM" value={history?.rfm ? String(history.rfm.score) : '—'} sub={history?.rfm ? `${history.rfm.recency}/${history.rfm.frequency}/${history.rfm.monetary}` : undefined} />
              <Kpi label="Orders" value={String(history?.orderCount ?? 0)} />
              <Kpi label="Avg order" value={history?.avgOrderValue != null ? fmtMoney(history.avgOrderValue) : '—'} />
              <Kpi label="Orders / mo" value={history?.frequencyMonthly != null ? history.frequencyMonthly.toFixed(2) : '—'} />
              <Kpi label="Days since order" value={history?.recencyDays != null ? String(history.recencyDays) : '—'} />
            </div>
            {!history && (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>
                No computed metrics yet — click <strong>Recompute metrics</strong> to derive RFM / CLTV / churn / segment.
              </div>
            )}
          </div>

          {/* ── Tabbed detail: only one deep section visible at a time ── */}
          <div>
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-card)', marginBottom: 16 }}>
              <TabBtn active={tab === 'orders'} onClick={() => setTab('orders')} icon={ShoppingBag} label="Orders" count={detail?.orders?.length} />
              <TabBtn active={tab === 'journey'} onClick={() => setTab('journey')} icon={Activity} label="Live journey" count={journey?.sessionCount} />
              <TabBtn active={tab === 'recs'} onClick={() => setTab('recs')} icon={Sparkles} label="Recommended" count={recs?.length} />
              <TabBtn active={tab === 'identity'} onClick={() => setTab('identity')} icon={Fingerprint} label="Identity" count={detail?.identity?.linkCount ?? links.length} />
              <TabBtn active={tab === 'campaigns'} onClick={() => setTab('campaigns')} icon={Mail} label="Campaigns" count={campaigns?.length} />
            </div>

            {tab === 'orders' && <OrdersPanel orders={detail?.orders || []} />}
            {tab === 'journey' && <LiveJourneyPanel journey={journey} />}
            {tab === 'recs' && <RecsPanel recs={recs} />}
            {tab === 'identity' && <IdentityPanel links={links} />}
            {tab === 'campaigns' && <CampaignsPanel campaigns={campaigns} busy={campaignBusy} runResult={campaignRunResult} onRun={runCampaigns} onSend={sendCampaign} onDelete={deleteCampaign} onEdit={setCampaignEditing} />}
          </div>
        </div>
      )}
        </div>
      )}
      {campaignEditing && <CampaignEditor campaign={campaignEditing} busy={campaignBusy} onSave={saveCampaignEdit} onClose={() => setCampaignEditing(null)} />}
      {dialog}
    </div>
  );
}

// ── small presentational helpers (inline-styled, matching the journeys page) ──

/** Compact label/value used inline in the summary header. */
function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

/** A compact KPI tile for the summary strip. */
function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-page)', border: '1px solid var(--border-card)' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--text-primary)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

/** A tab button for the detail area. */
function TabBtn({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: any; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'none', cursor: 'pointer',
        border: 'none', borderBottom: `2px solid ${active ? '#22d3ee' : 'transparent'}`,
        color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13.5, fontWeight: active ? 600 : 500,
      }}
    >
      <Icon size={15} style={{ color: active ? '#22d3ee' : 'var(--text-muted)' }} />
      {label}
      {count != null && (
        <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'var(--border-card)', color: 'var(--text-muted)' }}>{count}</span>
      )}
    </button>
  );
}

/** Orders tab — the customer's order history (matched by email hash / external id). */
function OrdersPanel({ orders }: { orders: any[] }) {
  if (!orders || orders.length === 0) return <Empty text="No orders found for this customer." />;
  return (
    <div style={{ border: '1px solid var(--border-card)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
              <Th>Order</Th><Th>Placed</Th><Th right>Items</Th><Th right>Total</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o: any) => (
              <tr key={o.orderId} style={{ borderTop: '1px solid var(--border-card)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{o.orderId}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{fmtDate(o.placedAt)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{o.itemCount}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {fmtMoney(o.total)}{o.refunded > 0 ? <span style={{ color: '#ef4444', fontSize: 11 }}> · −{fmtMoney(o.refunded)}</span> : null}
                </td>
                <td style={{ padding: '10px 14px' }}><Badge color={o.status === 'PAID' ? '#22c55e' : o.status === 'REFUNDED' ? '#ef4444' : '#64748b'}>{o.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Live journey tab — stats + per-session funnel + event timeline. */
function LiveJourneyPanel({ journey }: { journey: any }) {
  if (!journey) return <Empty text="No live activity for this customer yet." />;
  const sessions = journey.recentSessions ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Stat icon={Activity} label="Sessions" value={String(journey.sessionCount ?? 0)} />
        <Stat icon={ShoppingBag} label="Furthest stage" value={STAGE_META[journey.furthestStage]?.label || journey.furthestStage || '—'} color={STAGE_META[journey.furthestStage]?.color} />
        <Stat icon={Clock} label="Last active" value={fmtDate(journey.lastActiveAt)} />
      </div>
      {sessions.map((s: any) => (
        <div key={s.sessionId} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-card)', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Badge color={STAGE_META[s.funnelStage]?.color || '#64748b'}>{STAGE_META[s.funnelStage]?.label || s.funnelStage}</Badge>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtDate(s.startedAt)}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.deviceType || '—'} · {s.channel || 'direct'}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.pageViewCount} pages</span>
            {s.purchaseCompleted && <span style={{ marginLeft: 'auto' }}><Flag color="#22c55e">purchased</Flag></span>}
          </div>
          <FunnelPath current={s.funnelStage} reached={s.funnelStagesReached || []} />
          {(s.events?.length ?? 0) > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Event timeline ({s.events.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {s.events.map((e: any, i: number) => (
                  <EventRow key={i} event={e} last={i === s.events.length - 1} />
                ))}
              </div>
            </div>
          ) : (s.pageUrlsVisited?.length ?? 0) > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Pages visited ({s.pageUrlsVisited.length})</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {s.pageUrlsVisited.map((u: string, i: number) => (
                  <li key={i} style={{ fontSize: 12.5, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    <span title={u}>{shortPath(u)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ))}
      {sessions.length === 0 && <Empty text="No live sessions bridged to this customer yet." />}
    </div>
  );
}

/** Recommendations tab — personalized product grid. */
function RecsPanel({ recs }: { recs: any[] | null }) {
  if (recs === null) return <Empty text="Loading recommendations…" />;
  if (recs.length === 0) return <Empty text="No recommendations available for this customer yet." />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
      {recs.map((r: any, i: number) => (
        <div key={i} style={{ border: '1px solid var(--border-card)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-card)' }}>
          {r.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.imageUrl} alt={r.name || ''} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ height: 130, background: 'var(--border-card)' }} />
          )}
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>
              {r.name || 'Product'}
            </div>
            {r.price != null && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{fmtMoney(r.price)}</div>}
            <div style={{ marginTop: 6 }}><Badge color="#22d3ee">{r.reason}</Badge></div>
          </div>
        </div>
      ))}
    </div>
  );
}

const CAMPAIGN_STATUS_COLOR: Record<string, string> = { GENERATED: '#f59e0b', SENT: '#22c55e', FAILED: '#ef4444', SKIPPED: '#64748b' };

/** Campaigns tab — triggered email drafts (Phase 4). */
function CampaignsPanel({ campaigns, busy, runResult, onRun, onSend, onDelete, onEdit }: { campaigns: any[] | null; busy: boolean; runResult: any; onRun: () => void; onSend: (id: string) => void; onDelete: (id: string) => void; onEdit: (c: any) => void }) {
  const runSummary = (() => {
    if (!runResult) return null;
    if (runResult.error) return 'Still generating — the email can take up to a minute. If a draft appears below it succeeded; otherwise try again.';
    const gen = runResult.generated ?? 0;
    const skip = runResult.skipped ?? 0;
    const reasons = runResult.reasons || {};
    if (gen > 0) return '✓ Generated a personalized campaign for this customer.';
    if (reasons.cooldown) return 'Already generated recently (cooldown) — the existing draft is shown below.';
    if (reasons.no_consent) return 'This customer has opted out of marketing.';
    if (reasons.error) return 'Generation failed for this customer — try again.';
    if (skip === 0) return "This customer doesn't currently match any trigger (cart abandon, lapsed, high-intent, VIP).";
    return `Skipped (${Object.keys(reasons).join(', ') || 'no match'}).`;
  })();
  const runBtn = (
    <button
      onClick={onRun}
      disabled={busy}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        border: '1px solid var(--border-card)', background: '#22d3ee', color: '#04252b', cursor: busy ? 'wait' : 'pointer',
      }}
    >
      <Sparkles size={14} /> {busy ? 'Generating…' : 'Generate for this customer'}
    </button>
  );

  if (campaigns === null) return <Empty text="Loading campaigns…" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Personalized emails triggered by fused segments (history × live behavior).
        </span>
        {runBtn}
      </div>

      {runSummary && (
        <div style={{ fontSize: 12.5, color: 'var(--text-primary)', background: 'var(--bg-page)', border: '1px solid var(--border-card)', borderRadius: 8, padding: '8px 12px' }}>
          {runSummary}
        </div>
      )}

      {campaigns.length === 0 && (
        <Empty text="No campaigns for this customer yet. Click 'Generate for this customer' — a draft is created if they match a trigger (cart abandoner, lapsed, high-intent, VIP)." />
      )}

      {campaigns.map((c: any) => (
        <div key={c.id} style={{ border: '1px solid var(--border-card)', borderRadius: 8, background: 'var(--bg-card)', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <Badge color={fusedColor(c.trigger)}>⚡ {fusedLabel(c.trigger)}</Badge>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{String(c.goal || '').replace(/_/g, ' ')}</span>
            <Badge color={CAMPAIGN_STATUS_COLOR[c.status] || '#64748b'}>{c.status}</Badge>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>via {c.generator}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {c.status !== 'SENT' && (
                <button
                  onClick={() => onEdit(c)}
                  disabled={busy}
                  title="Edit"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                    border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-primary)', cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
              {c.status === 'GENERATED' && (
                <button
                  onClick={() => onSend(c.id)}
                  disabled={busy}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                    border: 'none', background: '#22c55e', color: '#04250f', cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  <Mail size={13} /> Send
                </button>
              )}
              <button
                onClick={() => onDelete(c.id)}
                disabled={busy}
                title="Delete"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                  border: '1px solid var(--border-card)', background: 'transparent', color: '#ef4444', cursor: busy ? 'wait' : 'pointer',
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{c.subject}</div>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#22d3ee' }}>Preview email</summary>
            <div
              style={{ marginTop: 10, border: '1px solid var(--border-card)', borderRadius: 6, padding: 12, background: '#fff', maxHeight: 380, overflow: 'auto' }}
              // Body is generated by our PitchService/Claude (no scripts). Internal preview only.
              dangerouslySetInnerHTML={{ __html: c.body }}
            />
          </details>
        </div>
      ))}
    </div>
  );
}

/** Identity graph tab — the stitched identifiers. */
function IdentityPanel({ links }: { links: any[] }) {
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {links.map((l: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
          <Badge color={l.confidence >= 1 ? '#22c55e' : '#f59e0b'}>{l.type}</Badge>
          <code style={{ color: 'var(--text-primary)' }}>{l.value}</code>
          <span style={{ color: 'var(--text-muted)' }}>conf {Number(l.confidence).toFixed(2)}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>seen {fmtDate(l.lastSeenAt)}</span>
        </div>
      ))}
      {links.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No identifiers linked yet.</span>}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon size={20} style={{ color: color || 'var(--text-muted)' }} />
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: `${color}22`, color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function Flag({ color = '#94a3b8', children }: { color?: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: `1px solid ${color}`, color }}>{children}</span>
  );
}

const FUNNEL_ORDER = ['visit', 'product_view', 'add_to_cart', 'checkout', 'purchase'];
/** The full funnel path with every reached stage lit up (not just the furthest). */
function FunnelPath({ current, reached }: { current: string; reached: string[] }) {
  const currentRank = STAGE_RANK[current] ?? 0;
  const reachedSet = new Set(reached);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
      {FUNNEL_ORDER.map((stage, i) => {
        const isReached = reachedSet.has(stage) || (STAGE_RANK[stage] ?? 99) <= currentRank;
        const color = STAGE_META[stage]?.color || '#64748b';
        return (
          <React.Fragment key={stage}>
            {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 999,
                background: isReached ? `${color}22` : 'transparent',
                color: isReached ? color : 'var(--text-muted)',
                border: isReached ? 'none' : '1px dashed var(--border-card)',
                opacity: isReached ? 1 : 0.5,
              }}
            >
              {STAGE_META[stage]?.label || stage}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Show just the path + query of a URL (drop the origin) for a compact page list. */
function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + u.search) || url;
  } catch {
    return url;
  }
}

const EVENT_LABEL: Record<string, string> = {
  page_view: 'Page view',
  product_view: 'Product view',
  add_to_cart: 'Add to cart',
  element_click: 'Click',
  checkout_step: 'Checkout step',
  checkout_abandon: 'Checkout abandoned',
  checkout_complete: 'Purchase',
};
function eventLabel(t: string): string {
  return EVENT_LABEL[t] || String(t || 'event').replace(/_/g, ' ');
}
function fmtTime(iso: any): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return '';
  }
}

/** One row in the per-session event timeline: dot + rail + time + type + page. */
function EventRow({ event, last }: { event: any; last: boolean }) {
  const color = STAGE_META[event.canonicalStage]?.color || '#64748b';
  const page = event.pageTitle || (event.pageUrl ? shortPath(event.pageUrl) : null);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
      {/* vertical rail */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, marginTop: 5, flexShrink: 0 }} />
        {!last && <span style={{ flex: 1, width: 2, background: 'var(--border-card)' }} />}
      </div>
      {/* content */}
      <div style={{ paddingBottom: last ? 0 : 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(event.occurredAt)}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}22`, padding: '2px 7px', borderRadius: 999 }}>
            {eventLabel(event.eventType)}
          </span>
        </div>
        {page && (
          <div style={{ fontSize: 12.5, color: 'var(--text-primary)', wordBreak: 'break-all', marginTop: 2 }} title={event.pageUrl || ''}>
            {page}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, border: '1px dashed var(--border-card)', borderRadius: 12 }}>
      {text}
    </div>
  );
}

/** "Who's on the site now" — auto-polled active visitors, resolved to identity. */
function LiveNow({ visitors, count, onOpen }: { visitors: any[] | null; count: number; onOpen: (profileId: string) => void }) {
  return (
    <div style={{ border: '1px solid var(--border-card)', borderRadius: 12, background: 'var(--bg-card)', padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: visitors && visitors.length ? 12 : 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: count > 0 ? '#22c55e' : 'var(--text-muted)', animation: count > 0 ? 'pulse 1.5s ease-in-out infinite' : 'none' }} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Live now</h3>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {count > 0 ? `${count} visitor${count === 1 ? '' : 's'} active (last 5 min)` : 'no visitors active in the last 5 minutes'}
        </span>
      </div>
      {visitors && visitors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visitors.map((v: any, i: number) => {
            const clickable = v.identified && v.customerProfileId;
            return (
              <div
                key={i}
                onClick={() => clickable && onOpen(v.customerProfileId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--border-card)', background: 'var(--bg-page)', cursor: clickable ? 'pointer' : 'default',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 999, background: '#22c55e', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {v.identified ? v.email || v.name || 'Known customer' : 'Anonymous visitor'}
                </span>
                {v.segment && <Badge color={SEGMENT_COLOR[v.segment] || '#64748b'}>{v.segment}</Badge>}
                {v.totalLtv != null && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{fmtMoney(v.totalLtv)} LTV</span>}
                <Badge color={STAGE_META[v.funnelStage]?.color || '#64748b'}>{STAGE_META[v.funnelStage]?.label || v.funnelStage}</Badge>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{v.deviceType || '—'} · {v.channel || 'direct'} · {v.pageViewCount} pages</span>
                {clickable && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#22d3ee' }}>View 360 →</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  const c = color || '#22d3ee';
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${active ? c : 'var(--border-card)'}`,
        background: active ? `${c}22` : 'var(--bg-card)',
        color: active ? c : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: right ? 'right' : 'left' }}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', color: 'var(--text-primary)' }}>{children}</td>;
}
function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, fontSize: 13,
        border: '1px solid var(--border-card)', background: 'var(--bg-page)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
