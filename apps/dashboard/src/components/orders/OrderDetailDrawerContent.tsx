import React from 'react';
import { InformationState } from '@kpi-platform/ui';
import { Activity, Building2, Clock3, FileText, Link2, Mail, User } from 'lucide-react';

export interface OrderDetailDrawerContentProps {
  order: any;
  timeline: any[];
  reconciliation: any[];
  onAction: (action: string) => void;
  role?: string | null;
}

// Theme-aware styling via the app's CSS variables (works in light + dark), instead
// of the previous hardcoded light-only palette that looked broken on the dark shell.
const card: React.CSSProperties = { borderRadius: 12, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: 16 };
const label: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-label)', fontWeight: 600 };
const sectionTitle: React.CSSProperties = { ...label, display: 'block', marginBottom: 8 };
const valueText: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };
const pill = (bg: string, color: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', minHeight: 22, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600, background: bg, color });

/** True for a 40/64-char hex string — i.e. a PII hash, not a real email. */
const isHashLike = (s: string) => /^[a-f0-9]{40,64}$/i.test(s.trim());

export const OrderDetailDrawerContent: React.FC<OrderDetailDrawerContentProps> = ({ order, timeline = [] }) => {
  if (!order) return <InformationState type="loading" />;

  const amount = Number(order.amount ?? order.totalAmount ?? 0);
  const currency = String(order.currency || 'USD').trim().toUpperCase();
  const channel = String(order.channel || order.orderSource || order.sourceSystem || 'unknown').toLowerCase();
  const isOfflineChannel =
    channel === 'offline' || channel === 'pos' ||
    String(order.sourceSystem || '').toLowerCase() === 'csv' || order.metadata?.orderSource === 'offline';
  const channelLabel = isOfflineChannel ? 'OFFLINE' : channel === 'unknown' ? 'UNKNOWN' : channel.toUpperCase();

  const formatCurrency = (value: number) => {
    const symbols: Record<string, string> = { USD: '$', AUD: 'A$', INR: '₹', EUR: '€', GBP: '£' };
    const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    } catch {
      return symbols[currency] ? `${symbols[currency]}${n}` : `${currency} ${n}`;
    }
  };

  const metadata: Record<string, any> = order?.metadata && typeof order.metadata === 'object' ? order.metadata : {};

  type DrawerLineItem = { name: string; sku: string; quantity: number | null; unitPrice: number | null; lineTotal: number | null };
  const toNum = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const p = Number(v); return Number.isFinite(p) ? p : null; };

  const resolveLineItems = (): DrawerLineItem[] | null => {
    let raw: any[] | null = null;
    if (Array.isArray(metadata.lineItems)) raw = metadata.lineItems;
    else if (Array.isArray(metadata.adobeOrder?.items)) raw = metadata.adobeOrder.items;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.map((item: any) => {
      const name = String(item?.name || item?.title || item?.sku || 'Unnamed item');
      const sku = item?.sku != null ? String(item.sku) : '';
      const quantity = toNum(item?.quantity ?? item?.qty_ordered ?? item?.qty);
      const unitPrice = toNum(item?.price ?? item?.unitPrice);
      let lineTotal = toNum(item?.row_total ?? item?.lineTotal);
      if (lineTotal === null && unitPrice !== null && quantity !== null) lineTotal = unitPrice * quantity;
      return { name, sku, quantity, unitPrice, lineTotal };
    });
  };

  const resolveCustomer = (): { name: string | null; email: string | null; emailIsHashed: boolean } | null => {
    const sc = metadata.customer || {};
    const ao = metadata.adobeOrder || {};
    const bc = metadata.bigcommerceOrder?.billing_address || {};
    const firstName = sc.first_name || ao.customer_firstname || bc.first_name;
    const lastName = sc.last_name || ao.customer_lastname || bc.last_name;
    const composed = [firstName, lastName].filter((p) => typeof p === 'string' && p.trim()).join(' ').trim();
    const fallback = (typeof metadata.customerName === 'string' && metadata.customerName.trim()) || (typeof sc.name === 'string' && sc.name.trim()) || '';
    const name = composed || fallback || null;

    let email: string | null = null;
    let emailIsHashed = false;
    for (const c of [metadata.customerEmail, metadata.buyerEmail, metadata.email, sc.email, ao.customer_email, bc.email]) {
      if (typeof c === 'string' && c.trim()) {
        const v = c.trim();
        // PII scrub replaces the raw email with its hash — never surface the hash.
        if (isHashLike(v) || !v.includes('@')) { emailIsHashed = true; continue; }
        email = v; break;
      }
    }
    if (!name && !email && !emailIsHashed) return null;
    return { name, email, emailIsHashed };
  };

  const lineItems = resolveLineItems();
  const customer = resolveCustomer();

  const formatDateTime = (v: unknown) => {
    if (!v) return '—';
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  const normalizeKind = (e: any): 'success' | 'processed' | 'captured' => {
    const raw = String(e?.type || e?.status || e?.stage || e?.group || '').toLowerCase();
    if (/success|complete|verified|done/.test(raw)) return 'success';
    if (/process|queued|pending|captured/.test(raw)) return 'processed';
    return 'captured';
  };
  const timelineItems = timeline.map((e, i) => ({
    kind: normalizeKind(e),
    label: String(e?.title || e?.name || e?.label || `Event ${i + 1}`),
    source: String(e?.system || e?.source || e?.channel || e?.origin || 'CORE'),
    timestamp: formatDateTime(e?.time || e?.timestamp || e?.createdAt || e?.at),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Source id */}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 'none', width: 48, height: 48, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--accent, #22d3ee) 16%, transparent)', color: 'var(--accent, #22d3ee)' }}>
            <Link2 size={20} />
          </div>
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ ...mono, fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }} title={String(order.id || '-')}>{String(order.id || '-')}</div>
            <div style={label}>Source ID</div>
            <div style={{ ...mono, fontSize: 12, color: 'var(--text-muted)' }} title={String(order.externalOrderId || order.externalReferenceId || order.orderId || '-')}>{String(order.externalOrderId || order.externalReferenceId || order.orderId || '-')}</div>
            <span style={{ ...pill('var(--success-bg)', 'var(--success-text)'), marginTop: 2, width: 'max-content' }}>Integrity · Verified</span>
          </div>
        </div>
      </section>

      {/* Channel / Value */}
      <section>
        <div style={sectionTitle}>Order summary</div>
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>{isOfflineChannel ? <FileText size={13} /> : <Activity size={13} />} Channel</div>
              <div style={valueText}>{channelLabel}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...label, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginBottom: 6 }}><Building2 size={13} /> Value</div>
              <div style={{ ...valueText, fontSize: 16 }}>{formatCurrency(amount)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Line items */}
      <section>
        <div style={sectionTitle}>Order line items</div>
        <div style={card}>
          {lineItems && lineItems.length > 0 ? (
            lineItems.map((item, i) => (
              <div key={`${item.sku || 'item'}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: i === lineItems.length - 1 ? 'none' : '1px solid var(--border-card)', paddingTop: i === 0 ? 0 : 11 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</div>
                  <div style={{ ...mono, fontSize: 11, color: 'var(--text-label)', marginTop: 2 }}>{item.sku ? `SKU ${item.sku}` : 'SKU —'}</div>
                </div>
                <div style={{ flex: 'none', textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.lineTotal !== null ? formatCurrency(item.lineTotal) : '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.quantity ?? '—'} × {item.unitPrice !== null ? formatCurrency(item.unitPrice) : '—'}</div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}>Line items unavailable</div>
          )}
        </div>
      </section>

      {/* Customer reference */}
      <section>
        <div style={sectionTitle}>Customer reference</div>
        <div style={card}>
          {customer ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}><User size={13} /> Name</div>
                <div style={{ ...valueText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={customer.name || 'Not available'}>{customer.name || 'Not available'}</div>
              </div>
              <div style={{ minWidth: 0, textAlign: 'right' }}>
                <div style={{ ...label, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginBottom: 6 }}><Mail size={13} /> Email</div>
                {customer.email ? (
                  <div style={{ ...valueText, wordBreak: 'break-all' }} title={customer.email}>{customer.email}</div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }} title="Email is stored PII-hashed for this order">{customer.emailIsHashed ? 'Hashed (PII-protected)' : 'Not available'}</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}>Customer data not linked for this order</div>
          )}
        </div>
      </section>

      {/* Event lifecycle timeline */}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock3 size={16} style={{ flex: 'none', color: 'var(--text-label)' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Event lifecycle timeline</div>
          <span style={{ ...pill('var(--bg-input)', 'var(--text-muted)'), marginLeft: 'auto', textTransform: 'uppercase', fontSize: 10 }}>Core</span>
        </div>
        <div style={{ marginTop: 4, marginBottom: 4, paddingBottom: 8, borderBottom: '1px solid var(--border-card)', fontSize: 12, color: 'var(--text-muted)' }}>Unified state sync</div>
        {timelineItems.length === 0 ? (
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)', paddingTop: 8 }}>No lifecycle events for this order yet.</div>
        ) : (
          <div>
            {timelineItems.map((e, i) => {
              const dot = e.kind === 'success' ? 'var(--success-text)' : e.kind === 'processed' ? 'var(--warning-text)' : 'var(--accent, #22d3ee)';
              const kindLabel = e.kind.charAt(0).toUpperCase() + e.kind.slice(1);
              const showHeader = i === 0 || e.kind !== timelineItems[i - 1]?.kind;
              return (
                <React.Fragment key={`${e.label}-${i}`}>
                  {showHeader && <div style={{ ...label, fontSize: 10, padding: '8px 0 4px' }}>{kindLabel}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: showHeader ? 'none' : '1px solid var(--border-card)' }}>
                    <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 999, background: dot }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.label}>{e.label}</span>
                    <span style={{ ...pill('var(--bg-input)', 'var(--text-muted)'), fontSize: 10 }}>{e.source}</span>
                    <span style={{ ...mono, marginLeft: 'auto', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>{e.timestamp}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
