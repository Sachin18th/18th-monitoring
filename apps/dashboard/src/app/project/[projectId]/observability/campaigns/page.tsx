'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Megaphone, Sparkles, Mail, Send, RefreshCw, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { PageHero } from '@/components/PageHero';
import { PageRestricted } from '@/components/PageRestricted';
import { useConfirm } from '@/components/ConfirmDialog';
import { CampaignEditor } from '@/components/CampaignEditor';

const PAGE_KEY = 'observability/campaigns';

// Fused segment → trigger campaign goal (mirrors CampaignTriggerService.TRIGGERS).
const TRIGGER_RULES: Array<{ segment: string; goal: string; when: string }> = [
  { segment: 'HIGH_VALUE_ABANDONER', goal: 'cart_recovery', when: 'VIP/high-value customer abandoned a live cart' },
  { segment: 'CART_ABANDONER', goal: 'cart_recovery', when: 'Returning customer added to cart, no checkout' },
  { segment: 'LAPSED_REACTIVATING', goal: 'win_back', when: 'Lapsed buyer came back to browse' },
  { segment: 'NEW_HIGH_INTENT', goal: 'welcome_offer', when: 'No orders yet, strong live intent' },
  { segment: 'LOYAL_ACTIVE', goal: 'vip_appreciation', when: 'Loyal high-value customer, active recently' },
];

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
const fusedColor = (s: string) => FUSED_COLOR[s] || '#a855f7';
const fusedLabel = (s: string) => FUSED_LABEL[s] || s;

const STATUS_COLOR: Record<string, string> = { GENERATED: '#f59e0b', SENT: '#22c55e', FAILED: '#ef4444', SKIPPED: '#64748b' };
const goalLabel = (g: string) => String(g || '').replace(/_/g, ' ');
const fmtDate = (v: any) => (v ? new Date(v).toLocaleString() : '—');

type StatusFilter = 'ALL' | 'GENERATED' | 'SENT' | 'FAILED';

export default function CampaignsPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();
  const { confirm, dialog } = useConfirm();

  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [campaigns, setCampaigns] = useState<any[] | null>(null);
  const [segments, setSegments] = useState<Array<{ segment: string; count: number }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [triggerFilter, setTriggerFilter] = useState<string>('ALL');
  const [editing, setEditing] = useState<any | null>(null);
  const [genTrigger, setGenTrigger] = useState<string>('ALL'); // scope for "Generate drafts"

  // Allowed page keys (in-page guard).
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

  const loadCampaigns = useCallback(async () => {
    if (!projectId || !connectorInstanceId) {
      setCampaigns(null);
      return;
    }
    try {
      const qs = new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), limit: '200' });
      const res = await apiFetch(`/api/storefront/campaigns?${qs.toString()}`, { suppressUnauthorizedRedirect: true });
      setCampaigns(Array.isArray(res?.messages) ? res.messages : []);
    } catch {
      setCampaigns([]);
    }
  }, [apiFetch, projectId, connectorInstanceId]);

  const loadSegments = useCallback(async () => {
    if (!projectId || !connectorInstanceId) {
      setSegments(null);
      return;
    }
    try {
      const qs = new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId) });
      const res = await apiFetch(`/api/storefront/segments?${qs.toString()}`, { suppressUnauthorizedRedirect: true });
      setSegments(Array.isArray(res?.fused) ? res.fused : []);
    } catch {
      setSegments(null);
    }
  }, [apiFetch, projectId, connectorInstanceId]);

  useEffect(() => {
    loadCampaigns();
    loadSegments();
  }, [loadCampaigns, loadSegments, connectorSelectionTick]);

  // Generate drafts store-wide — for all matching triggers, or one chosen trigger.
  const generateAll = useCallback(async () => {
    if (!projectId || !connectorInstanceId) return;
    setBusy(true);
    setRunResult(null);
    try {
      const res = await apiFetch(`/api/storefront/campaigns/run`, {
        method: 'POST',
        body: {
          projectId: String(projectId),
          connectorInstanceId: String(connectorInstanceId),
          ...(genTrigger !== 'ALL' ? { trigger: genTrigger } : {}),
        },
      });
      setRunResult(res || {});
      await loadCampaigns();
    } catch {
      setRunResult({ error: true });
      await loadCampaigns();
    } finally {
      setBusy(false);
    }
  }, [apiFetch, projectId, connectorInstanceId, loadCampaigns, genTrigger]);

  const sendOne = useCallback(
    async (id: string) => {
      if (!projectId || !connectorInstanceId) return;
      setBusy(true);
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
        setBusy(false);
      }
    },
    [apiFetch, projectId, connectorInstanceId, loadCampaigns],
  );

  const deleteOne = useCallback(
    async (id: string) => {
      if (!projectId || !connectorInstanceId) return;
      if (!(await confirm({ title: 'Delete campaign', message: 'Delete this campaign message? This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
      setBusy(true);
      try {
        await apiFetch(`/api/storefront/campaigns/${id}?${new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId) }).toString()}`, {
          method: 'DELETE',
          suppressUnauthorizedRedirect: true,
        });
        await loadCampaigns();
      } catch {
        /* surfaced on refresh */
      } finally {
        setBusy(false);
      }
    },
    [apiFetch, projectId, connectorInstanceId, loadCampaigns, confirm],
  );

  const saveEdit = useCallback(
    async (id: string, patch: { subject: string; body: string }) => {
      if (!projectId || !connectorInstanceId) return;
      setBusy(true);
      try {
        await apiFetch(`/api/storefront/campaigns/${id}`, {
          method: 'PUT',
          body: { projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), ...patch },
          suppressUnauthorizedRedirect: true,
        });
        setEditing(null);
        await loadCampaigns();
      } catch {
        /* surfaced on refresh */
      } finally {
        setBusy(false);
      }
    },
    [apiFetch, projectId, connectorInstanceId, loadCampaigns],
  );

  const sendAll = useCallback(async () => {
    if (!projectId || !connectorInstanceId) return;
    const pending = (campaigns || []).filter((c) => c.status === 'GENERATED').length;
    if (!pending) return;
    if (!(await confirm({ title: 'Send all drafts', message: `Send all ${pending} draft${pending === 1 ? '' : 's'} now? This emails real customers.`, confirmLabel: 'Send all' }))) return;
    setBusy(true);
    setRunResult(null);
    try {
      const res = await apiFetch(`/api/storefront/campaigns/send-batch`, {
        method: 'POST',
        body: { projectId: String(projectId), connectorInstanceId: String(connectorInstanceId) },
      });
      setRunResult({ batch: res || {} });
      await loadCampaigns();
    } catch {
      setRunResult({ error: true });
      await loadCampaigns();
    } finally {
      setBusy(false);
    }
  }, [apiFetch, projectId, connectorInstanceId, campaigns, loadCampaigns, confirm]);

  const stats = useMemo(() => {
    const list = campaigns || [];
    return {
      total: list.length,
      generated: list.filter((c) => c.status === 'GENERATED').length,
      sent: list.filter((c) => c.status === 'SENT').length,
      failed: list.filter((c) => c.status === 'FAILED').length,
    };
  }, [campaigns]);

  const filtered = useMemo(() => {
    let list = campaigns || [];
    if (statusFilter !== 'ALL') list = list.filter((c) => c.status === statusFilter);
    if (triggerFilter !== 'ALL') list = list.filter((c) => c.trigger === triggerFilter);
    return list;
  }, [campaigns, statusFilter, triggerFilter]);

  const segCount = (seg: string) => segments?.find((s) => s.segment === seg)?.count ?? 0;

  const runSummary = (() => {
    if (!runResult) return null;
    if (runResult.error) return 'Request timed out — it may still have completed. The list below reflects the latest state.';
    if (runResult.batch) {
      const b = runResult.batch;
      return `✓ Sent ${b.sent ?? 0} of ${b.total ?? 0}${b.failed ? `, ${b.failed} failed` : ''}.`;
    }
    const gen = runResult.generated ?? 0;
    const skip = runResult.skipped ?? 0;
    if (gen > 0) return `✓ Generated ${gen} draft${gen === 1 ? '' : 's'}${skip ? `, skipped ${skip}` : ''}.`;
    if (skip > 0) return `No new drafts — skipped ${skip} (${Object.keys(runResult.reasons || {}).join(', ') || 'no match / cooldown'}).`;
    return 'No customers currently match a trigger.';
  })();

  if (allowed !== null && !allowed.includes(PAGE_KEY)) {
    return <PageRestricted pageKey={PAGE_KEY} />;
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <PageHero
        icon={Megaphone}
        accent="#a855f7"
        eyebrow="CDP · Activation"
        title="Campaigns"
        subtitle="Personalized emails triggered by fused segments (history × live behavior)."
        right={
          connectorInstanceId ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={genTrigger}
                onChange={(e) => setGenTrigger(e.target.value)}
                disabled={busy}
                title="Which trigger to generate drafts for"
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12.5, cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                <option value="ALL">All triggers</option>
                {TRIGGER_RULES.map((r) => (
                  <option key={r.segment} value={r.segment}>{fusedLabel(r.segment)} ({segCount(r.segment)})</option>
                ))}
              </select>
              <button onClick={generateAll} disabled={busy} style={btn('#22d3ee', '#04252b', busy)}>
                <Sparkles size={14} /> {busy ? 'Working…' : 'Generate drafts'}
              </button>
              <button onClick={sendAll} disabled={busy || stats.generated === 0} style={btn('#22c55e', '#04250f', busy || stats.generated === 0)}>
                <Send size={14} /> Send all ({stats.generated})
              </button>
              <button onClick={loadCampaigns} disabled={busy} title="Refresh" style={btn('transparent', 'var(--text-primary)', busy, true)}>
                <RefreshCw size={14} />
              </button>
            </div>
          ) : null
        }
      />

      {!connectorInstanceId && (
        <div style={panel()}>Select a store (connector) to view its campaigns.</div>
      )}

      {connectorInstanceId && (
        <>
          {/* Trigger rules reference */}
          <div style={{ ...panel(), marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Trigger rules</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
              {TRIGGER_RULES.map((r) => (
                <div key={r.segment} style={{ border: '1px solid var(--border-card)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg-page)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <Badge color={fusedColor(r.segment)}>⚡ {fusedLabel(r.segment)}</Badge>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{segCount(r.segment)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>{r.when}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>→ {goalLabel(r.goal)}</div>
                </div>
              ))}
            </div>
          </div>

          {runSummary && (
            <div style={{ ...panel(), marginBottom: 16, fontSize: 12.5 }}>{runSummary}</div>
          )}

          {/* Stats + filters */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatChip label="Total" value={stats.total} />
              <StatChip label="Drafts" value={stats.generated} color="#f59e0b" />
              <StatChip label="Sent" value={stats.sent} color="#22c55e" />
              <StatChip label="Failed" value={stats.failed} color="#ef4444" />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['ALL', 'GENERATED', 'SENT', 'FAILED'] as StatusFilter[]).map((s) => (
                <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} label={s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <Chip active={triggerFilter === 'ALL'} onClick={() => setTriggerFilter('ALL')} label="All triggers" />
            {TRIGGER_RULES.map((r) => (
              <Chip key={r.segment} active={triggerFilter === r.segment} onClick={() => setTriggerFilter(r.segment)} label={fusedLabel(r.segment)} color={fusedColor(r.segment)} />
            ))}
          </div>

          {/* List */}
          {campaigns === null && <div style={panel()}>Loading campaigns…</div>}
          {campaigns !== null && filtered.length === 0 && (
            <div style={panel()}>
              No campaigns match. Click <strong>Generate drafts</strong> to create personalized emails for customers who match a trigger.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((c: any) => (
              <div key={c.id} style={{ border: '1px solid var(--border-card)', borderRadius: 10, background: 'var(--bg-card)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.customer?.name || 'Unknown'}</span>
                  {c.customer?.email && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.customer.email}</span>}
                  <Badge color={fusedColor(c.trigger)}>⚡ {fusedLabel(c.trigger)}</Badge>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{goalLabel(c.goal)}</span>
                  <Badge color={STATUS_COLOR[c.status] || '#64748b'}>{c.status}</Badge>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>via {c.generator}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(c.sentAt || c.createdAt)}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {c.status !== 'SENT' && (
                      <button onClick={() => setEditing(c)} disabled={busy} title="Edit" style={{ ...btn('transparent', 'var(--text-primary)', busy, true), padding: '5px 10px', fontSize: 12.5 }}>
                        <Pencil size={13} /> Edit
                      </button>
                    )}
                    {c.status === 'GENERATED' && (
                      <button onClick={() => sendOne(c.id)} disabled={busy} style={{ ...btn('#22c55e', '#04250f', busy), padding: '5px 12px', fontSize: 12.5 }}>
                        <Mail size={13} /> Send
                      </button>
                    )}
                    <button onClick={() => deleteOne(c.id)} disabled={busy} title="Delete" style={{ ...btn('transparent', '#ef4444', busy, true), padding: '5px 10px', fontSize: 12.5 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{c.subject}</div>
                {c.status === 'FAILED' && c.reason && (
                  <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 6 }}>Failed: {c.reason}</div>
                )}
                <details>
                  <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#22d3ee' }}>Preview email</summary>
                  <div
                    style={{ marginTop: 10, border: '1px solid var(--border-card)', borderRadius: 6, padding: 12, background: '#fff', maxHeight: 420, overflow: 'auto' }}
                    // Body generated by our PitchService/Claude (no scripts). Internal preview only.
                    dangerouslySetInnerHTML={{ __html: c.body }}
                  />
                </details>
              </div>
            ))}
          </div>
        </>
      )}
      {editing && <CampaignEditor campaign={editing} busy={busy} onSave={saveEdit} onClose={() => setEditing(null)} />}
      {dialog}
    </div>
  );
}

function btn(bg: string, fg: string, disabled: boolean, bordered = false): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    border: bordered ? '1px solid var(--border-card)' : 'none', background: bg, color: fg,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  };
}

function panel(): React.CSSProperties {
  return { border: '1px solid var(--border-card)', borderRadius: 10, background: 'var(--bg-card)', padding: '14px 16px', color: 'var(--text-primary)' };
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, border: '1px solid var(--border-card)', borderRadius: 8, padding: '6px 12px', background: 'var(--bg-card)' }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: `1px solid ${active ? color || '#22d3ee' : 'var(--border-card)'}`,
        background: active ? color || '#22d3ee' : 'transparent',
        color: active ? '#04252b' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, color, background: `${color}1a`, border: `1px solid ${color}55` }}>
      {children}
    </span>
  );
}
