'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { PageRestricted } from '@/components/PageRestricted';
import { formatMoneyCompact, formatMoneyFull, formatPct, formatPts, compactUnitLabel } from '@/lib/format-money';

const PAGE_KEY = 'observability/revenue';
const PERIODS = [
  { id: 'mtd', label: 'Month-to-date' },
  { id: 'last_month', label: 'Last month' },
  { id: 'custom', label: 'Custom' },
];

// Wireframe CSS (Tjori Daily-Pulse), scoped under .rev-pulse. Surfaces map to the
// app's theme tokens so it works in light + dark; the blue/navy accents, sizes,
// spacing and element positions match the reference exactly.
const CSS = `
.rev-pulse{--brand:#2563eb;--good:#16a34a;--bad:#dc2626;--warn:#d97706;
  --card:var(--bg-card);--ink:var(--text-primary);--muted:var(--text-muted);--line:var(--border-card);--track:var(--bg-input);
  --radius:14px;--shadow:0 1px 2px rgba(15,23,42,.06),0 4px 12px rgba(15,23,42,.05);max-width:1160px;margin:0 auto;}
.rev-pulse .topline{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:6px;flex-wrap:wrap;}
.rev-pulse h1{font-size:22px;margin:0;letter-spacing:-.02em;color:var(--ink);}
.rev-pulse h1 .dim{color:var(--muted);font-weight:600;}
.rev-pulse .sub{color:var(--muted);font-size:13px;margin-top:4px;}
.rev-pulse .controls{display:flex;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);
  border-radius:var(--radius);padding:12px 14px;box-shadow:var(--shadow);margin:18px 0;flex-wrap:wrap;}
.rev-pulse .ctrl{display:flex;flex-direction:column;gap:3px;}
.rev-pulse .ctrl label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;}
.rev-pulse .select{border:1px solid var(--line);background:var(--track);border-radius:9px;padding:7px 12px;font-size:13px;font-weight:600;color:var(--ink);min-width:140px;color-scheme:light dark;}
.rev-pulse .select option{background:var(--bg-card);color:var(--text-primary);}
.rev-pulse .seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;}
.rev-pulse .seg button{padding:7px 12px;font-size:12px;font-weight:600;color:var(--muted);background:var(--card);border:0;cursor:pointer;}
.rev-pulse .seg button.on{background:var(--brand);color:#fff;}
.rev-pulse .spacer{flex:1}
.rev-pulse .cur{font-size:12px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:10px;}
.rev-pulse .refresh{display:inline-flex;align-items:center;gap:6px;border:none;background:var(--brand);color:#fff;border-radius:9px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;}
.rev-pulse .zone-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:22px 2px 10px;}
.rev-pulse .headline{display:grid;grid-template-columns:1.4fr 1fr;gap:16px;}
.rev-pulse .headline.single{grid-template-columns:1fr;}
.rev-pulse .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px;}
.rev-pulse .k-label{font-size:13px;color:var(--muted);font-weight:600;}
.rev-pulse .k-big{font-size:46px;font-weight:800;letter-spacing:-.03em;line-height:1.05;margin:8px 0 2px;color:var(--ink);}
.rev-pulse .k-sub{font-size:12px;color:var(--muted);}
.rev-pulse .deltas{display:flex;gap:18px;margin-top:14px;}
.rev-pulse .delta{font-size:13px;font-weight:700;}
.rev-pulse .delta small{display:block;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;}
.rev-pulse .up{color:var(--good)} .rev-pulse .down{color:var(--bad)} .rev-pulse .flat{color:var(--muted)}
.rev-pulse .gross-line{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;color:var(--muted);}
.rev-pulse .gross-line b{color:var(--ink);}
.rev-pulse .pace{display:flex;flex-direction:column;justify-content:center;}
.rev-pulse .pace .row{display:flex;justify-content:space-between;font-size:13px;margin:3px 0;}
.rev-pulse .bar{height:12px;border-radius:999px;background:var(--track);overflow:hidden;margin:12px 0 6px;position:relative;}
.rev-pulse .bar i{display:block;height:100%;background:linear-gradient(90deg,#2563eb,#3b82f6);}
.rev-pulse .target-mark{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--ink);}
.rev-pulse .pace-state{font-size:13px;font-weight:700;margin-top:6px;}
.rev-pulse .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.rev-pulse .tile .k-label{font-size:12px}
.rev-pulse .tile .v{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:6px 0 4px;color:var(--ink);}
.rev-pulse .tile .d{font-size:12px;font-weight:700;}
.rev-pulse .spark{margin-top:10px;height:28px;}
.rev-pulse .zone3{display:grid;grid-template-columns:1.4fr 1fr;gap:16px;}
.rev-pulse .zone3-cat{margin-top:16px;}
.rev-pulse .chart-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;}
.rev-pulse .chart-head h3{margin:0;font-size:15px;color:var(--ink);}
.rev-pulse .legend{font-size:11px;color:var(--muted);}
.rev-pulse .legend b{display:inline-block;width:18px;height:3px;border-radius:2px;vertical-align:middle;margin:0 4px 0 10px;}
.rev-pulse .breakdown .brow{margin:10px 0;}
.rev-pulse .breakdown .blab{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;}
.rev-pulse .breakdown .blab .name{font-weight:600;color:var(--ink);}
.rev-pulse .breakdown .blab .val{color:var(--muted);font-weight:600;}
.rev-pulse .track{height:9px;background:var(--track);border-radius:999px;overflow:hidden;}
.rev-pulse .track i{display:block;height:100%;border-radius:999px;}
.rev-pulse .gr{font-size:11px;font-weight:700;margin-left:6px;}
.rev-pulse .brandbox .brand{margin:12px 0 14px;}
.rev-pulse .bhead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;}
.rev-pulse .bname{font-weight:700;font-size:14px;color:var(--ink);}
.rev-pulse .brev{font-size:12px;color:var(--muted);font-weight:600;}
.rev-pulse .bmargin{font-size:12px;color:var(--muted);margin-top:6px;}
.rev-pulse .bmargin b{color:var(--ink);}
.rev-pulse .mpct{font-weight:700;color:var(--ink);}
.rev-pulse .contrib{display:inline-block;margin-left:6px;font-weight:700;color:var(--good);}
.rev-pulse .contrib.dim{color:var(--warn);}
.rev-pulse .cat-bar{cursor:pointer;}
.rev-pulse .foot{color:var(--muted);font-size:11px;margin-top:24px;}
@media (max-width:900px){.rev-pulse .headline,.rev-pulse .zone3{grid-template-columns:1fr;}.rev-pulse .tiles{grid-template-columns:repeat(2,1fr);}}
`;

const CAT_SHADES = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];
const BRAND_SHADES = ['#2563eb', '#60a5fa', '#93c5fd', '#bfdbfe'];

export default function RevenuePulsePage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();

  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState('mtd');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  const currency = data?.currency || 'USD';
  const c = useCallback((n: number | null | undefined) => formatMoneyCompact(n, currency), [currency]);
  const full = useCallback((n: number | null | undefined) => formatMoneyFull(n, currency), [currency]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token || !projectId) return;
      try {
        const perms = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
        if (active) setAllowed(Array.isArray(perms?.allowedPageKeys) ? perms.allowedPageKeys.map(String) : []);
      } catch { if (active) setAllowed([]); }
    })();
    return () => { active = false; };
  }, [apiFetch, projectId, token]);

  const fetchData = useCallback(async () => {
    if (!projectId || !connectorInstanceId) { setData(null); setLoading(false); return; }
    if (period === 'custom' && (!customStart || !customEnd)) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), period });
      if (period === 'custom') { p.set('start_date', customStart); p.set('end_date', customEnd); }
      if (brand) p.set('brand', brand);
      if (category) p.set('category', category);
      const json = await apiFetch(`/api/storefront/revenue-pulse?${p.toString()}`, { suppressUnauthorizedRedirect: true });
      setData(json);
      if (!brand && !category && json) {
        setBrandOptions((json.by_brand || []).map((b: any) => b.brand));
        setCategoryOptions((json.by_category || []).map((cc: any) => cc.category));
      }
    } catch {
      setError('Failed to load revenue data. Check that orders have synced for this store.');
    } finally { setLoading(false); }
  }, [apiFetch, projectId, connectorInstanceId, period, brand, category, customStart, customEnd]);

  useEffect(() => { fetchData(); }, [fetchData, connectorSelectionTick]);

  const windowLabel = useMemo(() => {
    if (!data) return '';
    const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    return `${fmt(data.window.start)} – ${fmt(data.window.end)}`;
  }, [data]);

  if (allowed !== null && !allowed.includes(PAGE_KEY)) return <PageRestricted pageKey={PAGE_KEY} />;

  const h = data?.headline, t = data?.tiles, p = data?.pace;

  return (
    <div style={{ padding: '28px', background: 'var(--bg-page)', minHeight: '100vh' }}>
      <style>{CSS}{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div className="rev-pulse">
        <div className="topline">
          <div>
            <h1>Revenue Dashboard <span className="dim">/ Daily Pulse</span></h1>
            <div className="sub">The one screen you open every morning: are we growing, is the revenue healthy, where is it coming from.</div>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="controls">
          <div className="ctrl">
            <label>Brand (vendor)</label>
            <select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">All brands</option>
              {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="ctrl">
            <label>Category</label>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categoryOptions.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
            </select>
          </div>
          <div className="ctrl">
            <label>Period</label>
            <div className="seg">
              {PERIODS.map((per) => (
                <button key={per.id} className={period === per.id ? 'on' : ''} onClick={() => setPeriod(per.id)}>{per.label}</button>
              ))}
            </div>
          </div>
          {period === 'custom' && (
            <>
              <div className="ctrl"><label>From</label><input type="date" className="select" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></div>
              <div className="ctrl"><label>To</label><input type="date" className="select" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></div>
            </>
          )}
          <div className="spacer" />
          <div className="cur">
            <button className="refresh" onClick={fetchData} disabled={loading}><RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh</button>
            <span>{currency} · figures in {compactUnitLabel(currency)}</span>
          </div>
        </div>

        {!connectorInstanceId ? (
          <div className="card">Select a store (connector) to view its revenue.</div>
        ) : loading && !data ? (
          <div style={{ display: 'flex', height: 220, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading revenue pulse…</div>
        ) : error ? (
          <div className="card" style={{ borderColor: 'rgba(220,38,38,.4)', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--bad)' }}><AlertCircle size={18} /> {error}</div>
        ) : !data ? (
          period === 'custom' ? <div className="card">Pick a start and end date to view the custom range.</div> : null
        ) : (
          <>
            {/* ZONE 1 — Headline */}
            <div className="zone-label">Zone 1 · Headline — the 5-second glance</div>
            <div className={`headline ${p.applicable ? '' : 'single'}`}>
              <div className="card">
                <div className="k-label">Net Revenue · {periodTitle(period)} ({windowLabel})</div>
                <div className="k-big">{c(h.net_revenue)}</div>
                <div className="k-sub">Net Revenue = amount paid, net of discounts &amp; returns · incl. shipping &amp; tax</div>
                <div className="deltas">
                  <Delta value={data.comparisons.mom.revenue_growth} label="vs same days last month" />
                  <Delta value={data.comparisons.yoy.revenue_growth} label="vs same period last year" />
                </div>
                <div className="gross-line">Gross Revenue <b>{c(h.gross_revenue)}</b> &nbsp;·&nbsp; Returns <b>{c(h.returns)}</b> &nbsp;·&nbsp; Discounts <b>{c(h.discounts)}</b></div>
              </div>

              {p.applicable && (
                <div className="card pace">
                  <div className="k-label" style={{ marginBottom: 10 }}>Pace to target</div>
                  <div className="row"><span>Run-rate (month-end projection)</span><b>{c(p.run_rate)}</b></div>
                  <div className="row"><span>Monthly target (prior month +10%)</span><b>{c(p.target)}</b></div>
                  <div className="bar"><i style={{ width: `${Math.min(100, p.progress_pct)}%` }} /><span className="target-mark" style={{ left: '100%' }} /></div>
                  <div className="row" style={{ color: 'var(--text-muted)' }}>
                    <span>{data.window.days_elapsed} of {data.window.days_in_month} days elapsed ({p.elapsed_pct}%)</span>
                    <span>{p.pace_pct == null ? '—' : `${p.pace_pct}% of target pace`}</span>
                  </div>
                  <div className={`pace-state ${p.on_track ? 'up' : 'down'}`}>
                    {p.on_track ? `▲ On track — projected ${c(p.run_rate)}` : p.gap_per_day != null ? `▼ Behind — needs ${c(Math.abs(p.gap_per_day))}/day to close` : '▼ Behind target'}
                  </div>
                </div>
              )}
            </div>

            {/* ZONE 2 — Pulse tiles */}
            <div className="zone-label">Zone 2 · Pulse tiles — is this good revenue?</div>
            <div className="tiles">
              <Tile label="Orders" value={Number(t.orders).toLocaleString('en-US')} delta={<Delta value={t.orders_growth} label="MoM" inline />}>
                <Spark data={data.daily_trend} dataKey="orders" color="#2563eb" />
              </Tile>
              <Tile label="Avg Order Value" value={c(t.aov)} delta={<Delta value={t.aov_growth} label="MoM" inline />}>
                <Spark data={data.daily_trend} dataKey="aov" color="#2563eb" />
              </Tile>
              <Tile label="Gross Margin %" value={`${t.gross_margin_pct}%`} delta={<Delta value={t.gross_margin_delta_pts} label="MoM" pts inline />}>
                <Spark data={data.daily_trend} dataKey="net_revenue" color={t.gross_margin_delta_pts >= 0 ? '#16a34a' : '#dc2626'} />
              </Tile>
              <Tile label="Discount Rate %" value={`${t.discount_rate_pct}%`} delta={<Delta value={t.discount_rate_delta_pts} label="MoM" pts invert inline />}>
                <Spark data={data.daily_trend} dataKey="net_revenue" color="#d97706" />
              </Tile>
            </div>

            {/* ZONE 3 — Where it's coming from */}
            <div className="zone-label">Zone 3 · Where it&apos;s coming from</div>
            <div className="zone3">
              <div className="card">
                <div className="chart-head">
                  <h3>Daily revenue — this month vs last month</h3>
                  <div className="legend"><b style={{ background: '#2563eb' }} />This month<b style={{ background: '#94a3b8' }} />Last month</div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.daily_trend} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                    <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="0" stroke="var(--border-card)" vertical={false} />
                    <XAxis dataKey="day" hide />
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip formatter={(v: number, name) => [full(v), name === 'cum_net_revenue' ? 'This month' : 'Last month']} labelFormatter={(l) => `Day ${l}`} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }} />
                    <Area type="monotone" dataKey="cum_prev_net_revenue" stroke="#94a3b8" strokeWidth={2.5} fill="none" />
                    <Area type="monotone" dataKey="cum_net_revenue" stroke="#2563eb" strokeWidth={3} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="card brandbox">
                <div className="chart-head"><h3>Revenue &amp; margin by brand</h3><div className="legend">vendor</div></div>
                {data.by_brand.map((b: any, i: number) => (
                  <div className="brand" key={b.brand}>
                    <div className="bhead"><span className="bname">{b.brand}</span><span className="brev">{c(b.revenue)} · {b.revenue_share_pct}% of revenue</span></div>
                    <div className="track"><i style={{ width: `${b.revenue_share_pct}%`, background: BRAND_SHADES[i % BRAND_SHADES.length] }} /></div>
                    <div className="bmargin">Gross margin <b>{c(b.est_margin)}</b> · <span className="mpct">{b.est_margin_pct}%</span><span className={`contrib ${b.margin_share_pct < b.revenue_share_pct ? 'dim' : ''}`}>{b.margin_share_pct}% of total margin</span></div>
                  </div>
                ))}
                <div className="legend" style={{ display: 'block', marginTop: 8 }}>Margin est. (cost proxied from catalog price — no true COGS in source). The Brand filter swaps the whole view to one vendor.</div>
              </div>
            </div>

            {/* Category breakdown */}
            <div className="zone3-cat">
              <div className="card breakdown">
                <div className="chart-head"><h3>Revenue by category</h3><div className="legend">share · growth MoM</div></div>
                {data.by_category.slice(0, 12).map((cc: any, i: number) => (
                  <div className="brow cat-bar" key={cc.category} onClick={() => setCategory(cc.category)} title="Filter to this category">
                    <div className="blab">
                      <span className="name">{cc.category}</span>
                      <span className="val">{c(cc.revenue)} · {cc.revenue_share_pct}%
                        {cc.growth_mom_pct != null && <span className={`gr ${cc.growth_mom_pct >= 0 ? 'up' : 'down'}`}>{cc.growth_mom_pct >= 0 ? '▲' : '▼'}{Math.abs(cc.growth_mom_pct)}%</span>}
                      </span>
                    </div>
                    <div className="track"><i style={{ width: `${Math.max(2, cc.revenue_share_pct)}%`, background: CAT_SHADES[i % CAT_SHADES.length] }} /></div>
                  </div>
                ))}
                <div className="legend" style={{ display: 'block', marginTop: 10 }}>Click a bar → filters the whole dashboard to that category.</div>
              </div>
            </div>

            <div className="foot">Net of discounts &amp; returns. Monthly target auto-derived from prior month × 1.10. Adapted from the Tjori spec: store currency (not INR); no shipping/refund-date in source; COGS is a catalog-price proxy; windows in UTC.</div>
          </>
        )}
      </div>
    </div>
  );
}

function periodTitle(id: string) { return id === 'last_month' ? 'Last month' : id === 'custom' ? 'Custom' : 'Month-to-date'; }

function Delta({ value, label, pts = false, invert = false, inline = false }: { value: number | null; label: string; pts?: boolean; invert?: boolean; inline?: boolean }) {
  const favourable = value == null ? null : invert ? value < 0 : value > 0;
  const cls = favourable == null ? 'flat' : favourable ? 'up' : 'down';
  const arrow = value == null ? '' : value > 0 ? '▲ ' : value < 0 ? '▼ ' : '';
  if (inline) return <div className={`d ${cls}`}>{arrow}{pts ? formatPts(value) : formatPct(value)} {label}</div>;
  return (
    <div className={`delta ${cls}`}>{arrow}{pts ? formatPts(value) : formatPct(value)}<small>{label}</small></div>
  );
}

function Tile({ label, value, delta, children }: { label: string; value: string; delta: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card tile">
      <div className="k-label">{label}</div>
      <div className="v">{value}</div>
      {delta}
      {children}
    </div>
  );
}

function Spark({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) {
  return (
    <div className="spark">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}><Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} /></LineChart>
      </ResponsiveContainer>
    </div>
  );
}
