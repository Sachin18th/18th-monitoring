'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ShoppingCart, CheckCircle2, XCircle } from 'lucide-react';

/**
 * CheckoutFunnel — initiated checkouts vs completed (success) vs abandoned
 * (failure), from GET /api/storefront/checkout-funnel (storefront_sessions
 * checkout flags). Self-contained; theme-aware via CSS variables.
 */
export function CheckoutFunnel({ projectId, connectorInstanceId, apiFetch, connectorSelectionTick }: {
  projectId: string; connectorInstanceId: string | null; apiFetch: any; connectorSelectionTick?: number;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ projectId: String(projectId), ...(connectorInstanceId ? { connectorInstanceId: String(connectorInstanceId) } : {}) });
      const res = await apiFetch(`/api/storefront/checkout-funnel?${p.toString()}`, { suppressUnauthorizedRedirect: true });
      setData(res || null);
    } catch { setData(null); } finally { setLoading(false); }
  }, [apiFetch, projectId, connectorInstanceId]);

  useEffect(() => { load(); }, [load, connectorSelectionTick]);

  const d = data || { initiated: 0, success: 0, failed: 0, successRate: 0, failureRate: 0 };
  const successPct = d.initiated ? (d.success / d.initiated) * 100 : 0;

  const card: React.CSSProperties = { borderRadius: 16, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '20px 22px' };
  const tile: React.CSSProperties = { flex: 1, minWidth: 130, border: '1px solid var(--border-card)', borderRadius: 12, padding: '14px 16px', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', gap: 6 };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-label)' }}>Checkout funnel</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Initiated checkouts and how many completed vs. were abandoned</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 750, color: successPct >= 50 ? 'var(--success-text)' : 'var(--warning-text)', fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : `${d.successRate}%`}</div>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-label)', fontWeight: 700 }}>Success rate</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={tile}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-label)', fontWeight: 700 }}><ShoppingCart size={14} /> Initiated</div>
          <div style={{ fontSize: 28, fontWeight: 750, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : d.initiated.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: 'var(--text-label)' }}>reached checkout</div>
        </div>
        <div style={tile}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--success-text)', fontWeight: 700 }}><CheckCircle2 size={14} /> Completed</div>
          <div style={{ fontSize: 28, fontWeight: 750, lineHeight: 1, color: 'var(--success-text)', fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : d.success.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: 'var(--text-label)' }}>purchase completed</div>
        </div>
        <div style={tile}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--error-text)', fontWeight: 700 }}><XCircle size={14} /> Abandoned</div>
          <div style={{ fontSize: 28, fontWeight: 750, lineHeight: 1, color: 'var(--error-text)', fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : d.failed.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: 'var(--text-label)' }}>
            {!loading && d.paymentErrors > 0 ? <>incl. <b style={{ color: 'var(--error-text)' }}>{d.paymentErrors}</b> failed at payment</> : 'no purchase followed'}
          </div>
        </div>
      </div>

      {/* success vs abandoned bar */}
      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--bg-input)' }} role="img" aria-label={`${d.successRate}% completed`}>
        <span style={{ width: `${successPct}%`, background: 'var(--success-text)' }} />
        <span style={{ width: `${100 - successPct}%`, background: 'color-mix(in srgb, var(--error-text) 60%, transparent)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        <span><span style={{ color: 'var(--success-text)' }}>■</span> {loading ? '—' : `${d.success} completed`}</span>
        <span>{loading ? '—' : `${d.failed} abandoned`} <span style={{ color: 'var(--error-text)' }}>■</span></span>
      </div>
    </div>
  );
}
