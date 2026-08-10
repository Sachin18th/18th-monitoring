'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { UsersRound, Plus, Trash2, Pencil, Users, Send, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { PageHero } from '@/components/PageHero';
import { PageRestricted } from '@/components/PageRestricted';
import { useConfirm } from '@/components/ConfirmDialog';

const PAGE_KEY = 'observability/customer-groups';

type FieldDef = { key: string; label: string; type: 'number' | 'enum' | 'multienum'; ops: string[]; options?: string[] };
type Condition = { field: string; op: string; value: any };
type GoalDef = { key: string; label: string };

const OP_LABEL: Record<string, string> = {
  eq: 'is', neq: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'is any of', not_in: 'is none of', contains: 'includes',
};

const GROUP_COLORS = ['#a855f7', '#22c55e', '#f59e0b', '#22d3ee', '#ef4444', '#6366f1'];
const fmtMoney = (v: any) => (v != null ? `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—');

export default function CustomerGroupsPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();
  const { confirm, dialog } = useConfirm();

  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [goals, setGoals] = useState<GoalDef[]>([]);
  const [groups, setGroups] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any | null>(null); // group being edited/created ({} = new)
  const [membersFor, setMembersFor] = useState<any | null>(null); // group whose members are shown
  const [members, setMembers] = useState<{ total: number; members: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, any>>({}); // groupId → latest job
  const timers = useRef<Record<string, any>>({});

  const qs = useMemo(
    () => new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId || '') }).toString(),
    [projectId, connectorInstanceId],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token || !projectId) return;
      try {
        const perms = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
        if (active) setAllowed(Array.isArray(perms?.allowedPageKeys) ? perms.allowedPageKeys.map(String) : []);
      } catch {
        if (active) setAllowed([]);
      }
    })();
    return () => { active = false; };
  }, [apiFetch, projectId, token]);

  const loadFields = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/storefront/customer-groups/fields`, { suppressUnauthorizedRedirect: true });
      setFields(Array.isArray(res?.fields) ? res.fields : []);
      setGoals(Array.isArray(res?.goals) ? res.goals : []);
    } catch { /* ignore */ }
  }, [apiFetch]);

  const loadGroups = useCallback(async () => {
    if (!projectId || !connectorInstanceId) { setGroups(null); return; }
    try {
      const res = await apiFetch(`/api/storefront/customer-groups?${qs}`, { suppressUnauthorizedRedirect: true });
      setGroups(Array.isArray(res?.groups) ? res.groups : []);
    } catch { setGroups([]); }
  }, [apiFetch, projectId, connectorInstanceId, qs]);

  useEffect(() => { loadFields(); }, [loadFields]);
  useEffect(() => { loadGroups(); }, [loadGroups, connectorSelectionTick]);

  const saveGroup = useCallback(async (draft: any) => {
    setBusy(true);
    try {
      const body = { projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), name: draft.name, description: draft.description, color: draft.color, rules: draft.rules };
      if (draft.id) await apiFetch(`/api/storefront/customer-groups/${draft.id}`, { method: 'PUT', body });
      else await apiFetch(`/api/storefront/customer-groups`, { method: 'POST', body });
      setEditing(null);
      await loadGroups();
    } catch (e: any) {
      setNotice(e?.response?.status === 409 ? 'A group with that name already exists.' : 'Failed to save group.');
    } finally { setBusy(false); }
  }, [apiFetch, projectId, connectorInstanceId, loadGroups]);

  const deleteGroup = useCallback(async (id: string) => {
    if (!(await confirm({ title: 'Delete group', message: 'Delete this group? Customers are not affected — only the group definition is removed.', confirmLabel: 'Delete', danger: true }))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/storefront/customer-groups/${id}?${qs}`, { method: 'DELETE' });
      await loadGroups();
    } catch { setNotice('Failed to delete group.'); } finally { setBusy(false); }
  }, [apiFetch, qs, loadGroups, confirm]);

  const openMembers = useCallback(async (g: any) => {
    setMembersFor(g);
    setMembers(null);
    try {
      const res = await apiFetch(`/api/storefront/customer-groups/${g.id}/members?${qs}&limit=200`, { suppressUnauthorizedRedirect: true });
      setMembers({ total: res?.total ?? 0, members: Array.isArray(res?.members) ? res.members : [] });
    } catch { setMembers({ total: 0, members: [] }); }
  }, [apiFetch, qs]);

  // Poll one job until it stops RUNNING, updating per-group state.
  const pollJob = useCallback(async (groupId: string, jobId: string) => {
    try {
      const res = await apiFetch(`/api/storefront/campaign-jobs/${jobId}?${qs}`, { suppressUnauthorizedRedirect: true });
      const job = res?.job;
      if (job) {
        setJobs((prev) => ({ ...prev, [groupId]: job }));
        if (job.status === 'RUNNING') {
          timers.current[groupId] = setTimeout(() => pollJob(groupId, jobId), 2000);
          return;
        }
      }
    } catch { /* transient — retry once more below */ }
    // stopped or errored: refresh counts (drafts now exist)
    delete timers.current[groupId];
  }, [apiFetch, qs]);

  // Load recent jobs so last-run status shows on load; resume polling any RUNNING.
  const loadJobs = useCallback(async () => {
    if (!projectId || !connectorInstanceId) return;
    try {
      const res = await apiFetch(`/api/storefront/campaign-jobs?${qs}`, { suppressUnauthorizedRedirect: true });
      const list: any[] = Array.isArray(res?.jobs) ? res.jobs : [];
      const latest: Record<string, any> = {};
      for (const j of list) if (j.groupId && !latest[j.groupId]) latest[j.groupId] = j; // list is newest-first
      setJobs(latest);
      for (const [gid, j] of Object.entries(latest)) if (j.status === 'RUNNING' && !timers.current[gid]) pollJob(gid, j.id);
    } catch { /* ignore */ }
  }, [apiFetch, projectId, connectorInstanceId, qs, pollJob]);

  useEffect(() => {
    loadJobs();
    return () => { Object.values(timers.current).forEach(clearTimeout); timers.current = {}; };
  }, [loadJobs, connectorSelectionTick]);

  const runCampaign = useCallback(async (g: any, goal: string) => {
    const ok = await confirm({
      title: 'Run group campaign',
      message: `Generate ${goalLabel(goals, goal)} email drafts for the ${g.memberCount} member(s) of "${g.name}"? This runs in the background.`,
      confirmLabel: 'Generate',
    });
    if (!ok) return;
    setNotice(null);
    // optimistic RUNNING state
    setJobs((prev) => ({ ...prev, [g.id]: { status: 'RUNNING', processed: 0, total: g.memberCount, goal, label: g.name } }));
    try {
      const res = await apiFetch(`/api/storefront/customer-groups/${g.id}/run`, {
        method: 'POST',
        body: { projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), goal },
      });
      if (res?.jobId) pollJob(g.id, res.jobId);
    } catch {
      setNotice('Could not start the campaign run. Please try again.');
      setJobs((prev) => { const n = { ...prev }; delete n[g.id]; return n; });
    }
  }, [apiFetch, projectId, connectorInstanceId, goals, pollJob, confirm]);

  if (allowed !== null && !allowed.includes(PAGE_KEY)) return <PageRestricted pageKey={PAGE_KEY} />;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <PageHero
        icon={UsersRound}
        accent="#a855f7"
        eyebrow="CDP · Segmentation"
        title="Customer Groups"
        subtitle="Build rule-based, always-up-to-date customer segments — then target them with campaigns."
        right={
          connectorInstanceId ? (
            <button onClick={() => setEditing({ name: '', description: '', color: GROUP_COLORS[0], rules: { match: 'all', conditions: [] } })} disabled={busy} style={btn('#a855f7', '#fff', busy)}>
              <Plus size={14} /> New group
            </button>
          ) : null
        }
      />

      {!connectorInstanceId && <div style={panel()}>Select a store (connector) to manage its customer groups.</div>}

      {notice && (
        <div style={{ ...panel(), marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={14} /></button>
        </div>
      )}

      {connectorInstanceId && groups !== null && groups.length === 0 && (
        <div style={panel()}>No groups yet. Click <strong>New group</strong> to define a rule-based segment (e.g. LTV ≥ $1000 and ≥ 3 orders).</div>
      )}

      {connectorInstanceId && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {(groups || []).map((g) => (
            <div key={g.id} style={{ ...panel(), display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color || '#a855f7' }} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>{g.name}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <Users size={14} /> {g.memberCount}
                </span>
              </div>
              {g.description && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{g.description}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(g.rules?.conditions || []).slice(0, 6).map((c: Condition, i: number) => (
                  <span key={i} style={ruleChip()}>{ruleText(fields, c)}</span>
                ))}
                {(g.rules?.conditions || []).length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No conditions (matches nobody).</span>}
                {(g.rules?.conditions || []).length > 1 && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>match {g.rules.match === 'any' ? 'ANY' : 'ALL'}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                <button onClick={() => openMembers(g)} style={miniBtn()}><Users size={13} /> Members</button>
                <button onClick={() => setEditing(g)} style={miniBtn()}><Pencil size={13} /> Edit</button>
                <button onClick={() => deleteGroup(g.id)} style={miniBtn('#ef4444')}><Trash2 size={13} /> Delete</button>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Send size={13} style={{ color: 'var(--text-muted)' }} />
                  <select
                    defaultValue=""
                    disabled={busy || g.memberCount === 0 || jobs[g.id]?.status === 'RUNNING'}
                    onChange={(e) => { const v = e.target.value; e.currentTarget.value = ''; if (v) runCampaign(g, v); }}
                    style={{ ...input(), padding: '4px 8px', fontSize: 12 }}
                  >
                    <option value="" disabled>Run campaign…</option>
                    {goals.map((go) => <option key={go.key} value={go.key}>{go.label}</option>)}
                  </select>
                </div>
              </div>
              {jobs[g.id] && <JobStatus job={jobs[g.id]} goals={goals} />}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <GroupEditor
          fields={fields}
          initial={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={saveGroup}
          previewCount={async (rules) => {
            try {
              const res = await apiFetch(`/api/storefront/customer-groups/preview`, {
                method: 'POST',
                body: { projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), rules },
                suppressUnauthorizedRedirect: true,
              });
              return res?.memberCount ?? 0;
            } catch { return null; }
          }}
        />
      )}

      {membersFor && (
        <MembersModal group={membersFor} data={members} onClose={() => { setMembersFor(null); setMembers(null); }} />
      )}
      {dialog}
    </div>
  );
}

function JobStatus({ job, goals }: { job: any; goals: GoalDef[] }) {
  const gl = goalLabel(goals, job.goal);
  if (job.status === 'RUNNING') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#22d3ee', borderTop: '1px solid var(--border-card)', paddingTop: 8 }}>
        <Loader2 size={13} style={{ animation: 'cg-spin 1s linear infinite' }} />
        <span>Generating {gl} — {job.processed ?? 0}/{job.total ?? 0}…</span>
        <style>{`@keyframes cg-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }
  if (job.status === 'FAILED') {
    return <div style={{ fontSize: 12, color: '#ef4444', borderTop: '1px solid var(--border-card)', paddingTop: 8 }}>Run failed{job.error ? `: ${job.error}` : ''}.</div>;
  }
  // COMPLETED
  return (
    <div style={{ fontSize: 12, color: '#22c55e', borderTop: '1px solid var(--border-card)', paddingTop: 8 }}>
      ✓ {gl}: generated {job.generated ?? 0}, skipped {job.skipped ?? 0} of {job.total ?? 0}. Review on the Campaigns page.
    </div>
  );
}

// ── Rule builder ─────────────────────────────────────────────────────────────
function GroupEditor({
  fields, initial, busy, onCancel, onSave, previewCount,
}: {
  fields: FieldDef[]; initial: any; busy: boolean;
  onCancel: () => void; onSave: (d: any) => void; previewCount: (rules: any) => Promise<number | null>;
}) {
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  const [color, setColor] = useState(initial.color || GROUP_COLORS[0]);
  const [match, setMatch] = useState<'all' | 'any'>(initial.rules?.match === 'any' ? 'any' : 'all');
  const [conditions, setConditions] = useState<Condition[]>(initial.rules?.conditions?.length ? initial.rules.conditions : [newCondition(fields)]);
  const [count, setCount] = useState<number | null>(null);

  const rules = useMemo(() => ({ match, conditions: conditions.filter((c) => c.field && c.op) }), [match, conditions]);

  // Debounced live preview.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const n = await previewCount(rules);
      if (!cancelled) setCount(n);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [rules, previewCount]);

  const setCond = (i: number, patch: Partial<Condition>) => {
    setConditions((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };
  const fieldDef = (key: string) => fields.find((f) => f.key === key);

  return (
    <Modal onClose={onCancel} title={initial.id ? 'Edit group' : 'New customer group'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <Label>Name</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Big Spenders" style={input()} />
          </div>
          <div>
            <Label>Color</Label>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {GROUP_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: color === c ? '2px solid var(--text-primary)' : '1px solid var(--border-card)', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        </div>
        <div>
          <Label>Description (optional)</Label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this group for?" style={input()} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Label>Match</Label>
            <Toggle active={match === 'all'} onClick={() => setMatch('all')} label="ALL conditions" />
            <Toggle active={match === 'any'} onClick={() => setMatch('any')} label="ANY condition" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conditions.map((c, i) => {
              const fd = fieldDef(c.field);
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={c.field} onChange={(e) => { const nf = fieldDef(e.target.value); setCond(i, { field: e.target.value, op: nf?.ops[0] || 'eq', value: defaultValue(nf) }); }} style={input()}>
                    {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <select value={c.op} onChange={(e) => setCond(i, { op: e.target.value })} style={{ ...input(), maxWidth: 130 }}>
                    {(fd?.ops || []).map((op) => <option key={op} value={op}>{OP_LABEL[op] || op}</option>)}
                  </select>
                  <ValueInput fd={fd} op={c.op} value={c.value} onChange={(v) => setCond(i, { value: v })} />
                  <button onClick={() => setConditions((prev) => prev.filter((_, j) => j !== i))} style={{ ...miniBtn('#ef4444'), padding: '6px' }} title="Remove"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
          <button onClick={() => setConditions((prev) => [...prev, newCondition(fields)])} style={{ ...miniBtn(), marginTop: 8 }}><Plus size={13} /> Add condition</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border-card)', paddingTop: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {count === null ? 'Calculating…' : <><strong>{count}</strong> customer{count === 1 ? '' : 's'} match</>}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} style={miniBtn()}>Cancel</button>
            <button onClick={() => onSave({ id: initial.id, name, description, color, rules })} disabled={busy || !name.trim() || rules.conditions.length === 0} style={btn('#a855f7', '#fff', busy || !name.trim() || rules.conditions.length === 0)}>
              {initial.id ? 'Save changes' : 'Create group'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ValueInput({ fd, op, value, onChange }: { fd?: FieldDef; op: string; value: any; onChange: (v: any) => void }) {
  if (!fd) return null;
  const multi = op === 'in' || op === 'not_in' || fd.type === 'multienum';
  if (fd.type === 'number') {
    return <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder="value" style={{ ...input(), maxWidth: 130 }} />;
  }
  // enum / multienum
  const opts = fd.options || [];
  const arr: string[] = Array.isArray(value) ? value : value != null && value !== '' ? [String(value)] : [];
  if (multi) {
    return (
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {opts.map((o) => {
          const on = arr.includes(o);
          return (
            <button key={o} onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
              style={{ padding: '4px 9px', borderRadius: 999, fontSize: 11.5, cursor: 'pointer', border: `1px solid ${on ? '#a855f7' : 'var(--border-card)'}`, background: on ? '#a855f7' : 'transparent', color: on ? '#fff' : 'var(--text-muted)' }}>
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <select value={value ?? opts[0]} onChange={(e) => onChange(e.target.value)} style={input()}>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function MembersModal({ group, data, onClose }: { group: any; data: { total: number; members: any[] } | null; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title={`Members — ${group.name}`}>
      {data === null && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading members…</div>}
      {data && (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>{data.total} member{data.total === 1 ? '' : 's'}{data.members.length < data.total ? ` (showing ${data.members.length})` : ''}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflow: 'auto' }}>
            {data.members.map((m) => (
              <div key={m.customerProfileId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border-card)', borderRadius: 8, fontSize: 12.5 }}>
                <span style={{ fontWeight: 600 }}>{m.name}</span>
                {m.email && <span style={{ color: 'var(--text-muted)' }}>{m.email}</span>}
                {m.segment && <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{m.segment}</span>}
                <span style={{ marginLeft: m.segment ? 12 : 'auto', color: 'var(--text-muted)' }}>{fmtMoney(m.totalLtv)} · {m.orderCount} ord</span>
              </div>
            ))}
            {data.members.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No customers match this group's rules yet.</div>}
          </div>
        </>
      )}
    </Modal>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function newCondition(fields: FieldDef[]): Condition {
  const f = fields[0];
  return { field: f?.key || 'segment', op: f?.ops[0] || 'eq', value: defaultValue(f) };
}
function defaultValue(f?: FieldDef): any {
  if (!f) return '';
  if (f.type === 'number') return '';
  if (f.type === 'multienum' || false) return [];
  return f.options?.[0] ?? '';
}
function ruleText(fields: FieldDef[], c: Condition): string {
  const f = fields.find((x) => x.key === c.field);
  const label = f?.label || c.field;
  const val = Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '');
  return `${label} ${OP_LABEL[c.op] || c.op} ${val}`;
}
function goalLabel(goals: GoalDef[], key: string): string {
  return goals.find((g) => g.key === key)?.label || key;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', zIndex: 1000, overflow: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{children}</div>;

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? '#a855f7' : 'var(--border-card)'}`, background: active ? '#a855f7' : 'transparent', color: active ? '#fff' : 'var(--text-muted)' }}>{label}</button>
  );
}

function btn(bg: string, fg: string, disabled: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: bg, color: fg, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 };
}
function miniBtn(color?: string): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid var(--border-card)', background: 'transparent', color: color || 'var(--text-primary)', cursor: 'pointer' };
}
function panel(): React.CSSProperties {
  return { border: '1px solid var(--border-card)', borderRadius: 10, background: 'var(--bg-card)', padding: '14px 16px', color: 'var(--text-primary)' };
}
function input(): React.CSSProperties {
  return { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-card)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13, width: '100%' };
}
function ruleChip(): React.CSSProperties {
  return { padding: '3px 9px', borderRadius: 6, fontSize: 11.5, background: 'var(--bg-page)', border: '1px solid var(--border-card)', color: 'var(--text-primary)' };
}
