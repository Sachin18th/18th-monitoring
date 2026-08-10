'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { PageRestricted } from '@/components/PageRestricted';
import { formatMoneyCompact, formatMoneyFull } from '@/lib/format-money';

const PAGE_KEY = 'observability/product-analytics';
const PERIODS = [
  { id: 'last_30d', label: 'Last 30 days' },
  { id: 'mtd', label: 'This month' },
  { id: 'custom', label: 'Custom' },
];

// Wireframe CSS (Product Analytics), scoped under .prod-an. Surfaces map to theme
// tokens (light + dark); purple accent, sizes, positions match the reference.
const CSS = `
.prod-an{--brand:#5b5bf0;--brand2:#7c6cf7;--ink2:#1a2233;--good:#10b981;--bad:#ef4444;--warn:#f59e0b;--teal:#0ea5e9;
  --soft:color-mix(in srgb,#5b5bf0 10%,var(--bg-card));--softline:color-mix(in srgb,#5b5bf0 25%,var(--border-card));
  --card:var(--bg-card);--ink:var(--text-primary);--muted:var(--text-muted);--faint:var(--text-label);--line:var(--border-card);--track:var(--bg-input);
  --radius:18px;--shadow:0 1px 2px rgba(16,24,40,.04),0 6px 20px rgba(16,24,40,.06);max-width:1180px;margin:0 auto;}
.prod-an .top{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;flex-wrap:wrap;margin-bottom:22px;}
.prod-an h1{font-size:25px;margin:0;letter-spacing:-.025em;font-weight:800;color:var(--ink);}
.prod-an h1 span{color:var(--faint);font-weight:600;}
.prod-an .sub{color:var(--muted);font-size:13.5px;margin-top:6px;max-width:680px;line-height:1.5;}
.prod-an .sub b{color:var(--ink);}
.prod-an .controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:26px;}
.prod-an .pill{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:9px 14px;font-size:13px;font-weight:600;box-shadow:var(--shadow);}
.prod-an .pill .lab{color:var(--faint);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;}
.prod-an .pill select{border:none;background:transparent;color:var(--ink);font:inherit;font-weight:600;cursor:pointer;color-scheme:light dark;}
.prod-an .pill select option{background:var(--bg-card);color:var(--text-primary);}
.prod-an .seg{display:inline-flex;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow);}
.prod-an .seg button{padding:9px 14px;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer;background:transparent;border:0;}
.prod-an .seg button.on{background:var(--brand);color:#fff;}
.prod-an .grow{flex:1}
.prod-an .hero{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:14px;}
.prod-an .kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px;position:relative;overflow:hidden;}
.prod-an .kpi .lab{font-size:13px;color:var(--muted);font-weight:600;}
.prod-an .kpi .big{font-size:44px;font-weight:800;letter-spacing:-.035em;line-height:1.02;margin:14px 0 6px;color:var(--ink);}
.prod-an .kpi .delta{font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:5px;}
.prod-an .kpi .delta small{color:var(--faint);font-weight:600;}
.prod-an .up{color:var(--good)} .prod-an .down{color:var(--bad)} .prod-an .flat{color:var(--muted)}
.prod-an .kpi.primary{background:linear-gradient(150deg,#5b5bf0,#7c6cf7);border:none;color:#fff;}
.prod-an .kpi.primary .lab{color:rgba(255,255,255,.85)}
.prod-an .kpi.primary .big{color:#fff}
.prod-an .kpi.primary .delta,.prod-an .kpi.primary .delta small{color:#fff}
.prod-an .secnote{font-size:12px;color:var(--faint);margin:4px 2px 22px;}
.prod-an .sec-head{display:flex;align-items:baseline;gap:12px;margin:34px 2px 14px;}
.prod-an .sec-head h2{font-size:17px;margin:0;letter-spacing:-.01em;font-weight:700;color:var(--ink);}
.prod-an .sec-head .why{font-size:12.5px;color:var(--muted);}
.prod-an .anno{display:inline-flex;align-items:center;justify-content:center;width:21px;height:21px;border-radius:999px;background:var(--brand);color:#fff;font-size:11px;font-weight:700;flex:none;}
.prod-an .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px;}
.prod-an .chtabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;}
.prod-an .chtab{padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:transparent;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;}
.prod-an .chtab.on{background:var(--ink2);color:#fff;border-color:var(--ink2);}
.prod-an .funnel-mini{display:flex;gap:6px;align-items:center;margin:6px 0 22px;flex-wrap:wrap;}
.prod-an .step{flex:1;min-width:120px;background:var(--soft);border-radius:12px;padding:14px 16px;position:relative;}
.prod-an .step .sn{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--brand);font-weight:700;}
.prod-an .step .sv{font-size:24px;font-weight:800;letter-spacing:-.02em;margin-top:4px;color:var(--ink);}
.prod-an .step .sd{font-size:11.5px;color:var(--muted);margin-top:2px;}
.prod-an .arrow{color:var(--faint);font-size:18px;font-weight:700;flex:none;}
.prod-an .drop{position:absolute;top:14px;right:14px;font-size:11px;font-weight:700;color:var(--bad);}
.prod-an table.pf{width:100%;border-collapse:collapse;font-size:13px;}
.prod-an table.pf th{text-align:left;padding:10px 12px;color:var(--faint);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--line);}
.prod-an table.pf th.r,.prod-an table.pf td.r{text-align:right;}
.prod-an table.pf th.sortable{cursor:pointer;} .prod-an table.pf th.sorted{color:var(--brand);}
.prod-an table.pf td{padding:13px 12px;border-bottom:1px solid var(--line);vertical-align:middle;color:var(--ink);}
.prod-an .pname{font-weight:700;}
.prod-an .num{font-variant-numeric:tabular-nums;font-weight:700;}
.prod-an .bartiny{height:6px;border-radius:999px;background:var(--track);overflow:hidden;margin-top:5px;}
.prod-an .bartiny i{display:block;height:100%;background:linear-gradient(90deg,#5b5bf0,#7c6cf7);border-radius:999px;}
.prod-an .chip{display:inline-block;font-size:11px;font-weight:700;padding:3px 8px;border-radius:7px;}
.prod-an .chip.g{background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good);} .prod-an .chip.r{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad);} .prod-an .chip.y{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn);} .prod-an .chip.b{background:var(--soft);color:var(--brand);}
.prod-an .sku{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;color:var(--muted);font-weight:600;white-space:nowrap;}
.prod-an .pf-toolbar{display:flex;align-items:center;gap:10px;margin:2px 0 14px;flex-wrap:wrap;}
.prod-an .tb-lab{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:700;}
.prod-an .sortseg{display:inline-flex;background:var(--track);border:1px solid var(--line);border-radius:10px;overflow:hidden;}
.prod-an .sortseg button{padding:7px 13px;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer;background:transparent;border:0;}
.prod-an .sortseg button.on{background:var(--card);color:var(--brand);box-shadow:0 1px 2px rgba(16,24,40,.08);}
.prod-an .insight{margin-top:16px;font-size:12.5px;color:var(--muted);line-height:1.5;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:13px 15px;}
.prod-an .insight b{color:var(--ink);}
.prod-an .brand-row{padding:16px 0;border-bottom:1px solid var(--line);}
.prod-an .brand-row:last-child{border-bottom:none;}
.prod-an .bh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;flex-wrap:wrap;gap:6px;}
.prod-an .bn{font-weight:800;font-size:15px;color:var(--ink);}
.prod-an .bn .pvtag{font-size:11px;color:var(--faint);font-weight:600;margin-left:8px;}
.prod-an .bmet{font-size:12.5px;color:var(--muted);font-weight:600;}
.prod-an .bmet b{color:var(--ink);}
.prod-an .btrack{height:10px;background:var(--track);border-radius:999px;overflow:hidden;margin-top:4px;}
.prod-an .btrack i{display:block;height:100%;border-radius:999px;}
.prod-an .bstats{display:flex;gap:18px;margin-top:9px;flex-wrap:wrap;}
.prod-an .bstat{font-size:12px;color:var(--muted);}
.prod-an .bstat b{display:block;font-size:16px;color:var(--ink);font-weight:800;margin-top:1px;}
.prod-an .quad-wrap{display:grid;grid-template-columns:1.05fr 1fr;gap:18px;align-items:stretch;}
.prod-an .quad{position:relative;background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:14px;}
.prod-an .ur{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);}
.prod-an .ur:last-child{border-bottom:none;}
.prod-an .ur .rank{width:22px;height:22px;border-radius:7px;background:var(--soft);color:var(--brand);font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;flex:none;}
.prod-an .ur .info{flex:1;min-width:0;} .prod-an .ur .info .n{font-weight:700;font-size:13.5px;color:var(--ink);} .prod-an .ur .info .m{font-size:11.5px;color:var(--muted);margin-top:1px;}
.prod-an .ur .opp{text-align:right;font-size:11px;color:var(--faint);font-weight:600;} .prod-an .ur .opp b{display:block;font-size:15px;color:var(--good);font-weight:800;}
.prod-an details.expl{margin:0 0 16px;border:1px solid var(--line);border-radius:12px;background:var(--soft);overflow:hidden;}
.prod-an details.expl summary{cursor:pointer;list-style:none;padding:11px 15px;font-size:12.5px;font-weight:700;color:var(--brand);}
.prod-an details.expl summary::-webkit-details-marker{display:none;}
.prod-an details.expl .body{padding:13px 16px;font-size:12.5px;color:var(--ink);line-height:1.6;border-top:1px solid var(--line);}
.prod-an code{background:var(--soft);padding:2px 7px;border-radius:6px;color:var(--brand);font-size:12px;}
.prod-an .coverage{border-left:4px solid var(--warn);background:color-mix(in srgb,var(--warn) 8%,var(--bg-card));border-radius:10px;padding:12px 15px;margin:14px 0 0;font-size:12.5px;color:var(--muted);line-height:1.5;}
.prod-an .coverage b{color:var(--ink);}
.prod-an .foot{color:var(--faint);font-size:11.5px;margin-top:28px;line-height:1.6;}
@media (max-width:900px){.prod-an .hero{grid-template-columns:repeat(2,1fr);}.prod-an .quad-wrap{grid-template-columns:1fr;}}
`;

const PF_LIMIT = 10;

export default function ProductAnalyticsPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();

  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState('last_30d');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  const [ch, setCh] = useState('all');
  const [sortKey, setSortKey] = useState<'pv' | 'atc' | 'co' | 'cvr'>('pv');
  const [pfExpanded, setPfExpanded] = useState(false);

  const currency = data?.currency || 'USD';
  const c = useCallback((n: any) => formatMoneyCompact(n, currency), [currency]);
  const full = useCallback((n: any) => formatMoneyFull(n, currency), [currency]);

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
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ projectId: String(projectId), connectorInstanceId: String(connectorInstanceId), period });
      if (brand) p.set('brand', brand);
      if (category) p.set('category', category);
      const json = await apiFetch(`/api/storefront/product-analytics?${p.toString()}`, { suppressUnauthorizedRedirect: true });
      setData(json);
      if (!brand && !category && json) {
        setBrandOptions((json.brands || []).map((b: any) => b.brand));
        setCategoryOptions(json.categories || []);
      }
      if (json && !json.channels?.some((x: any) => x.key === ch)) setCh('all');
    } catch { setError('Failed to load product analytics.'); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, projectId, connectorInstanceId, period, brand, category]);

  useEffect(() => { fetchData(); }, [fetchData, connectorSelectionTick]);

  const channel = useMemo(() => (data?.channels || []).find((x: any) => x.key === ch) || data?.channels?.[0] || null, [data, ch]);
  const sortedProducts = useMemo(() => {
    if (!channel) return [];
    return [...channel.products].sort((a: any, b: any) => b[sortKey] - a[sortKey]);
  }, [channel, sortKey]);
  const maxPv = useMemo(() => Math.max(1, ...sortedProducts.map((x: any) => x.pv)), [sortedProducts]);
  const shownProducts = pfExpanded ? sortedProducts : sortedProducts.slice(0, PF_LIMIT);

  if (allowed !== null && !allowed.includes(PAGE_KEY)) return <PageRestricted pageKey={PAGE_KEY} />;

  const h = data?.hero;
  const funnelSteps = channel ? [
    { n: 'Pageviews', v: channel.steps.pageviews, rate: null },
    { n: 'Add-to-cart', v: channel.steps.atc, rate: channel.rates.atc },
    { n: 'Reached checkout', v: channel.steps.checkout, rate: channel.rates.checkout },
    { n: 'Purchase', v: channel.steps.purchase, rate: channel.rates.cvr },
  ] : [];

  return (
    <div style={{ padding: '34px 28px 60px', background: 'var(--bg-page)', minHeight: '100vh' }}>
      <style>{CSS}{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div className="prod-an">
        <div className="top">
          <div>
            <h1>Product Analytics <span>/ Dashboard</span></h1>
            <div className="sub">How each product performs and converts — by channel, by brand, and where hidden winners are starving for traffic. <b>No COGS / margin</b> (cost data unavailable).</div>
          </div>
        </div>

        <div className="controls">
          <div className="pill"><span className="lab">Brand</span>
            <select value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">All brands</option>{brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}</select>
          </div>
          <div className="pill"><span className="lab">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categoryOptions.map((cc) => <option key={cc} value={cc}>{cc}</option>)}</select>
          </div>
          <div className="seg">{PERIODS.map((per) => <button key={per.id} className={period === per.id ? 'on' : ''} onClick={() => setPeriod(per.id)}>{per.label}</button>)}</div>
          <div className="grow" />
          <button className="pill" onClick={fetchData} disabled={loading} style={{ cursor: 'pointer' }}><RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh</button>
          <div className="pill"><span className="lab">Source</span><span>Storefront tracking + Orders</span></div>
        </div>

        {!connectorInstanceId ? (
          <div className="card">Select a store (connector) to view product analytics.</div>
        ) : loading && !data ? (
          <div style={{ display: 'flex', height: 220, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading product analytics…</div>
        ) : error ? (
          <div className="card" style={{ color: 'var(--bad)' }}>{error}</div>
        ) : !data ? null : (
          <>
            {/* HERO */}
            <div className="hero">
              <div className="kpi primary">
                <div className="lab">Avg Conversion Rate</div>
                <div className="big">{h.cvr}%</div>
                <Delta value={h.cvr_delta_pts} pts label="vs prev period" light />
              </div>
              <div className="kpi">
                <div className="lab">Product Pageviews</div>
                <div className="big">{Number(h.pageviews).toLocaleString('en-US')}</div>
                <Delta value={h.pageviews_growth} label="vs prev period" />
              </div>
              <div className="kpi">
                <div className="lab">Units Sold</div>
                <div className="big">{Number(h.units).toLocaleString('en-US')}</div>
                <Delta value={h.units_growth} label="vs prev period" />
              </div>
              <div className="kpi">
                <div className="lab">Product Revenue</div>
                <div className="big">{c(h.revenue)}</div>
                <Delta value={h.revenue_growth} label="vs prev period" />
              </div>
            </div>
            <div className="secnote">Conversion rate is the lead metric — product-market fit at the page level, independent of how much traffic you bought.</div>

            {/* SECTION 1 — channel funnel */}
            <div className="sec-head"><span className="anno">1</span><h2>Product funnel by channel</h2><span className="why">Which products each channel sends traffic to — and where they drop off on the way to purchase.</span></div>
            <div className="card">
              <div className="chtabs">
                {(data.channels || []).map((x: any) => <div key={x.key} className={`chtab ${ch === x.key ? 'on' : ''}`} onClick={() => { setCh(x.key); setPfExpanded(false); }}>{x.label}</div>)}
              </div>
              <div className="funnel-mini">
                {funnelSteps.map((s, i) => (
                  <React.Fragment key={s.n}>
                    <div className="step">
                      <div className="sn">{s.n}</div>
                      <div className="sv">{Number(s.v).toLocaleString('en-US')}</div>
                      <div className="sd">{s.rate == null ? 'top of funnel' : `= ${s.rate}% of pageviews`}</div>
                    </div>
                    {i < funnelSteps.length - 1 && <span className="arrow">▶</span>}
                  </React.Fragment>
                ))}
              </div>
              <div className="pf-toolbar">
                <span className="tb-lab">Sort by</span>
                <div className="sortseg">
                  {([['pv', 'Pageviews'], ['atc', 'Add-to-cart'], ['co', 'Checkout'], ['cvr', 'Conv rate']] as const).map(([k, l]) => (
                    <button key={k} className={sortKey === k ? 'on' : ''} onClick={() => setSortKey(k)}>{l}</button>
                  ))}
                </div>
              </div>
              <table className="pf">
                <thead><tr>
                  <th>Product</th><th>SKU</th>
                  <th className={`r sortable ${sortKey === 'pv' ? 'sorted' : ''}`} onClick={() => setSortKey('pv')}>Pageviews</th>
                  <th className={`r sortable ${sortKey === 'atc' ? 'sorted' : ''}`} onClick={() => setSortKey('atc')}>Add-to-cart</th>
                  <th className={`r sortable ${sortKey === 'co' ? 'sorted' : ''}`} onClick={() => setSortKey('co')}>Reached checkout</th>
                  <th className={`r sortable ${sortKey === 'cvr' ? 'sorted' : ''}`} onClick={() => setSortKey('cvr')}>Purchase CVR</th>
                </tr></thead>
                <tbody>
                  {shownProducts.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--text-label)', textAlign: 'center', padding: 24 }}>No tracked product activity in this window / channel yet.</td></tr>}
                  {shownProducts.map((x: any) => {
                    const cvrChip = x.cvr >= 4 ? 'chip g' : x.cvr < 2 ? 'chip r' : 'chip y';
                    return (
                      <tr key={x.name}>
                        <td><div className="pname">{x.name}</div><span className="chip b">{x.brand}</span></td>
                        <td><span className="sku">{x.sku || '—'}</span></td>
                        <td className={`r ${sortKey === 'pv' ? 'sorted' : ''}`}><div className="num">{Number(x.pv).toLocaleString('en-US')}</div><div className="bartiny"><i style={{ width: `${Math.round((x.pv / maxPv) * 100)}%` }} /></div></td>
                        <td className="r"><span className="num">{x.atc}%</span></td>
                        <td className="r"><span className="num">{x.co}%</span></td>
                        <td className="r"><span className={cvrChip}>{x.cvr}%</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sortedProducts.length > PF_LIMIT && (
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <button className="chtab" onClick={() => setPfExpanded((v) => !v)}>{pfExpanded ? 'Show fewer ▴' : `Show all ${sortedProducts.length} products ▾`}</button>
                </div>
              )}
              <div className="coverage"><b>Data note:</b> funnel counts &amp; conversion come from the storefront pixel (still ramping) — treat product-level CVR as directional. <b>Units, revenue &amp; AOV are exact</b> (from orders). Per-product CVR is clamped to 100% and shown across all channels.</div>
            </div>

            {/* SECTION 2 — brand */}
            <div className="sec-head"><span className="anno">2</span><h2>Performance by brand</h2><span className="why">Vendors side by side — traffic, conversion and revenue contribution.</span></div>
            <div className="card">
              {(data.brands || []).length === 0 && <div style={{ color: 'var(--text-label)' }}>No brand data yet.</div>}
              {(data.brands || []).map((b: any, i: number) => (
                <div className="brand-row" key={b.brand}>
                  <div className="bh">
                    <span className="bn">{b.brand} <span className="pvtag">{Number(b.pageviews).toLocaleString('en-US')} pageviews · {b.traffic_pct}% of traffic</span></span>
                    <span className="bmet">Revenue <b>{c(b.revenue)}</b> · {b.revenue_share_pct}% share</span>
                  </div>
                  <div className="btrack"><i style={{ width: `${b.revenue_share_pct}%`, background: i === 0 ? 'linear-gradient(90deg,#5b5bf0,#7c6cf7)' : i === 1 ? 'linear-gradient(90deg,#0ea5e9,#38bdf8)' : 'linear-gradient(90deg,#10b981,#34d399)' }} /></div>
                  <div className="bstats">
                    <div className="bstat">Conversion rate <b>{b.cvr}%</b></div>
                    <div className="bstat">Units <b>{Number(b.units).toLocaleString('en-US')}</b></div>
                    <div className="bstat">AOV <b>{c(b.aov)}</b></div>
                    <div className="bstat">Active SKUs <b>{Number(b.skus).toLocaleString('en-US')}</b></div>
                  </div>
                </div>
              ))}
            </div>

            {/* SECTION 3 — underrated */}
            <div className="sec-head"><span className="anno">3</span><h2>Top underrated products</h2><span className="why">High conversion rate, below-average pageviews — proven winners starving for traffic.</span></div>
            <div className="card">
              <details className="expl">
                <summary>❔ How is the opportunity value calculated?</summary>
                <div className="body"><code>Opportunity = (catalog avg pageviews − product pageviews) × product CVR × AOV</code><div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Extra revenue if we lifted this product's traffic to the catalog average ({data.catalog_avg?.pageviews} views), assuming it keeps converting at its current rate. A ranking estimate, not a forecast.</div></div>
              </details>
              <div className="quad-wrap">
                <div className="quad"><Quad products={data.channels?.[0]?.products || []} avgPv={data.catalog_avg?.pageviews || 0} avgCvr={data.catalog_avg?.cvr || 0} /></div>
                <div>
                  {(data.underrated || []).length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-label)', padding: '12px 0' }}>No underrated products yet — they appear as pageview coverage grows (needs ≥ 3 tracked views per product).</div>
                  ) : (data.underrated || []).map((u: any, i: number) => (
                    <div className="ur" key={u.name}>
                      <div className="rank">{i + 1}</div>
                      <div className="info"><div className="n">{u.name} <span className="chip b">{u.brand}</span></div><div className="m">CVR <b style={{ color: 'var(--good)' }}>{u.cvr}%</b> · {Number(u.pageviews).toLocaleString('en-US')} views <span className="chip y">{u.pct_below_avg}% below avg traffic</span></div></div>
                      <div className="opp"><span>opportunity</span><b>+{c(u.opportunity)}</b></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="insight"><b>Why this matters:</b> these products already convert above the catalog average but sit below average traffic — the cheapest growth is sending more traffic to a page that already converts. <b>Action:</b> feature them in ads, homepage, and email.</div>
            </div>

            <div className="foot">Ported from the ai-agent-ecom GA4 design, running on 18th-monitoring's own storefront tracking + orders (no GA4). Channels = our acquisition attribution. No COGS/margin or per-product return rate (not available). Figures fill in as tracking data accumulates.</div>
          </>
        )}
      </div>
    </div>
  );
}

function Delta({ value, label, pts = false, light = false }: { value: number | null; label: string; pts?: boolean; light?: boolean }) {
  const cls = value == null ? 'flat' : value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const arrow = value == null ? '' : value > 0 ? '▲ ' : value < 0 ? '▼ ' : '';
  const txt = value == null ? '—' : `${Math.abs(value).toFixed(1)}${pts ? ' pts' : '%'}`;
  return <div className={`delta ${light ? '' : cls}`}>{arrow}{txt} <small>{label}</small></div>;
}

// Scatter: pageviews (x) vs CVR (y); dashed catalog-average guides; top-left = underrated.
function Quad({ products, avgPv, avgCvr }: { products: any[]; avgPv: number; avgCvr: number }) {
  const pts = products.filter((p) => p.pv > 0);
  const maxPv = Math.max(avgPv * 2, ...pts.map((p) => p.pv), 1);
  const maxCvr = Math.max(avgCvr * 2, ...pts.map((p) => p.cvr), 1);
  const X = (pv: number) => 50 + (pv / maxPv) * 354;
  const Y = (cvr: number) => 262 - (cvr / maxCvr) * 242;
  const avgX = X(avgPv), avgY = Y(avgCvr);
  return (
    <svg viewBox="0 0 420 300" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto' }}>
      <line x1="50" y1="20" x2="50" y2="262" stroke="var(--border-card)" strokeWidth="1.5" />
      <line x1="50" y1="262" x2="404" y2="262" stroke="var(--border-card)" strokeWidth="1.5" />
      <line x1={avgX} y1="20" x2={avgX} y2="262" stroke="var(--border-card)" strokeDasharray="4 4" />
      <line x1="50" y1={avgY} x2="404" y2={avgY} stroke="var(--border-card)" strokeDasharray="4 4" />
      <rect x="50" y="20" width={Math.max(0, avgX - 50)} height={Math.max(0, avgY - 20)} fill="#5b5bf0" opacity="0.08" />
      <text x="58" y="36" fontSize="10.5" fontWeight="700" fill="#5b46d6">UNDERRATED · push traffic here</text>
      <text x="220" y="285" fontSize="10.5" fill="var(--text-label)">Pageviews → (dashed = catalog avg)</text>
      <text x="40" y="18" fontSize="10.5" fill="var(--text-label)" transform="rotate(-90 40 18)" textAnchor="end">Conversion rate ↑</text>
      {pts.map((p, i) => {
        const under = p.pv < avgPv && p.cvr >= avgCvr;
        return <circle key={i} cx={X(p.pv)} cy={Y(p.cvr)} r={under ? 7 : 5} fill={under ? '#5b5bf0' : 'var(--border-card)'} />;
      })}
    </svg>
  );
}
