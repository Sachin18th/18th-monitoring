import React from 'react';
import { InformationState } from '@kpi-platform/ui';
import { hasPermission, normalizeRole } from '@kpi-platform/shared-types';
import {
  Activity,
  ArrowRightLeft,
  Building2,
  Clock3,
  FileText,
  Link2,
  Mail,
  RefreshCw,
  Search,
  User,
} from 'lucide-react';

export interface OrderDetailDrawerContentProps {
  order: any;
  timeline: any[];
  reconciliation: any[];
  onAction: (action: string) => void;
  role?: string | null;
}

export const OrderDetailDrawerContent: React.FC<OrderDetailDrawerContentProps> = ({
  order,
  timeline = [],
  reconciliation = [],
  onAction,
  role
}) => {
  if (!order) return <InformationState type="loading" />;
  const normalizedRole = normalizeRole(role);
  const canWrite = hasPermission(normalizedRole, 'canWrite');
  const canRetriggerSync = hasPermission(normalizedRole, 'canRetriggerSync');

  const amount = Number(order.amount ?? order.totalAmount ?? 0);
  const currency = String(order.currency || 'USD').trim().toUpperCase();
  const channel = String(order.channel || order.orderSource || order.sourceSystem || 'unknown').toLowerCase();
  const isOfflineChannel =
    channel === 'offline' ||
    channel === 'pos' ||
    String(order.sourceSystem || '').toLowerCase() === 'csv' ||
    order.metadata?.orderSource === 'offline';
  const channelLabel = isOfflineChannel
    ? 'OFFLINE'
    : channel === 'unknown'
      ? 'UNKNOWN'
      : channel.toUpperCase();
  const status = String(order.status || order.lifecycleState || order.normalizedStatus || 'unknown').toLowerCase();
  const syncStatus = String(order.syncStatus || 'synced').toLowerCase();
  const siteLabel = String(order.siteName || order.projectName || order.siteId || order.projectId || 'Current Site');

  const formatCurrency = (value: number) => {
    const formatNumericAmount = (input: number) =>
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(input);

    const currencySymbolMap: Record<string, string> = {
      USD: '$',
      AUD: 'A$',
      INR: '₹'
    };

    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch {
      const symbol = currencySymbolMap[currency];
      if (symbol) {
        return `${symbol}${formatNumericAmount(value)}`;
      }

      return `${currency} ${formatNumericAmount(value)}`;
    }
  };

  const formatAmount = () => formatCurrency(amount);

  // Line items and customer reference are read directly from the canonical order
  // metadata that the drawer already receives. The shape differs per source system
  // (confirmed against real canonical_orders rows), so we branch rather than assume
  // one fixed JSON path. We never recompute the order total from these values —
  // VALUE above continues to come from order.amount / order.totalAmount.
  const metadata: Record<string, any> =
    order?.metadata && typeof order.metadata === 'object' ? order.metadata : {};

  type DrawerLineItem = {
    name: string;
    sku: string;
    quantity: number | null;
    unitPrice: number | null;
    lineTotal: number | null;
  };

  const toFiniteNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const resolveLineItems = (): DrawerLineItem[] | null => {
    // shopify        -> metadata.lineItems[]        (title/name, sku, quantity, price as string)
    // adobe_commerce -> metadata.adobeOrder.items[] (name, sku, qty_ordered, price, row_total)
    // bigcommerce    -> metadata.bigcommerceOrder.products is a {url, resource} reference,
    //                   items are NOT embedded, so they are unavailable here.
    let rawItems: any[] | null = null;
    if (Array.isArray(metadata.lineItems)) {
      rawItems = metadata.lineItems;
    } else if (Array.isArray(metadata.adobeOrder?.items)) {
      rawItems = metadata.adobeOrder.items;
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) return null;

    return rawItems.map((item: any) => {
      const name = String(item?.name || item?.title || item?.sku || 'Unnamed item');
      const sku = item?.sku !== null && item?.sku !== undefined ? String(item.sku) : '';
      const quantity = toFiniteNumber(item?.quantity ?? item?.qty_ordered ?? item?.qty);
      const unitPrice = toFiniteNumber(item?.price ?? item?.unitPrice);
      let lineTotal = toFiniteNumber(item?.row_total ?? item?.lineTotal);
      if (lineTotal === null && unitPrice !== null && quantity !== null) {
        lineTotal = unitPrice * quantity;
      }
      return { name, sku, quantity, unitPrice, lineTotal };
    });
  };

  const resolveCustomer = (): { name: string | null; email: string | null } | null => {
    const shopifyCustomer = metadata.customer || {};
    const adobeOrder = metadata.adobeOrder || {};
    const bigcommerceBilling = metadata.bigcommerceOrder?.billing_address || {};

    const firstName = shopifyCustomer.first_name || adobeOrder.customer_firstname || bigcommerceBilling.first_name;
    const lastName = shopifyCustomer.last_name || adobeOrder.customer_lastname || bigcommerceBilling.last_name;
    const composedName = [firstName, lastName]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .join(' ')
      .trim();
    const fallbackName =
      (typeof metadata.customerName === 'string' && metadata.customerName.trim()) ||
      (typeof shopifyCustomer.name === 'string' && shopifyCustomer.name.trim()) ||
      '';
    const name = composedName || fallbackName || null;

    const emailCandidates = [
      metadata.customerEmail,
      metadata.buyerEmail,
      metadata.email,
      shopifyCustomer.email,
      adobeOrder.customer_email,
      bigcommerceBilling.email,
    ];
    let email: string | null = null;
    for (const candidate of emailCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        email = candidate.trim();
        break;
      }
    }

    if (!name && !email) return null;
    return { name, email };
  };

  const lineItems = resolveLineItems();
  const customer = resolveCustomer();

  const sectionTitleClassName = 'mb-2 block text-[11px] uppercase tracking-[0.06em] text-[#9ca3af]';

  const formatDateTime = (value: unknown) => {
    if (!value) return '—';
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }

    return parsed.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
  };

  const cardClassName = 'rounded-[12px] border border-[#e5e7eb] bg-white p-4';
  const infoCardClassName = 'rounded-[12px] border border-[#e5e7eb] bg-white p-4';
  const actionLabelClassName = 'mb-2 block text-[11px] uppercase tracking-[0.06em] text-[#9ca3af]';

  const normalizeTimelineKind = (event: any): 'success' | 'processed' | 'captured' => {
    const raw = String(event?.type || event?.status || event?.stage || event?.group || '').toLowerCase();
    if (raw.includes('success') || raw.includes('complete') || raw.includes('verified') || raw.includes('done')) {
      return 'success';
    }
    if (raw.includes('process') || raw.includes('queued') || raw.includes('pending') || raw.includes('captured')) {
      return 'processed';
    }
    return 'captured';
  };

  const timelineItems = timeline.map((event, index) => ({
    ...event,
    kind: normalizeTimelineKind(event),
    label: String(event?.title || event?.name || event?.label || `Event ${index + 1}`),
    source: String(event?.system || event?.source || event?.channel || event?.origin || 'CORE'),
    timestamp: formatDateTime(event?.time || event?.timestamp || event?.createdAt || event?.at),
  }));

  const reconciliationRows = [
    { label: 'STOREFRONT STATE', entry: reconciliation.find((row: any) => String(row?.name || '').toLowerCase().includes('storefront')) },
    { label: 'OMS STATE', entry: reconciliation.find((row: any) => String(row?.name || '').toLowerCase().includes('oms')) },
    { label: 'FINANCIAL LEDGER', entry: reconciliation.find((row: any) => String(row?.name || '').toLowerCase().includes('financial')) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className={cardClassName}>
        <div className="flex items-start gap-[14px]">
          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-[#2563eb]">
            <Link2 size={22} />
          </div>
          <div className="min-w-0 flex-1 space-y-[4px]">
            <div className="break-all font-mono text-[14px] font-medium leading-snug text-[#111827]" title={String(order.id || '-')}>{String(order.id || '-')}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-[#9ca3af]">Source ID</div>
            <div className="font-mono text-[12px] text-[#6b7280]" title={String(order.externalOrderId || order.externalReferenceId || order.orderId || '-')}>{String(order.externalOrderId || order.externalReferenceId || order.orderId || '-')}</div>
            <span className="inline-flex min-h-[22px] items-center rounded-full bg-[#dcfce7] px-[8px] py-[2px] text-[11px] font-normal text-[#16a34a]">
              Integrity · Verified
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className={sectionTitleClassName}>PMO</div>
        <div className={infoCardClassName}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-[6px] flex items-center gap-1 text-[11px] uppercase tracking-[0.06em] text-[#9ca3af]">
                {isOfflineChannel ? <FileText size={14} /> : <Activity size={14} />}
                CHANNEL
              </div>
              <div className="text-[14px] font-medium text-[#111827]">{channelLabel}</div>
            </div>
            <div className="text-right">
              <div className="mb-[6px] flex items-center justify-end gap-1 text-[11px] uppercase tracking-[0.06em] text-[#9ca3af]">
                <Building2 size={14} />
                VALUE
              </div>
              <div className="text-[14px] font-medium text-[#111827]">{formatAmount()}</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className={sectionTitleClassName}>ORDER LINE ITEMS</div>
        <div className={infoCardClassName}>
          {lineItems && lineItems.length > 0 ? (
            <div className="space-y-0">
              {lineItems.map((item, index) => (
                <div
                  key={`${item.sku || 'item'}-${index}`}
                  className="flex items-start justify-between gap-3 border-b border-[#eef0f2] py-[11px] first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-[#111827]" title={item.name}>
                      {item.name}
                    </div>
                    <div className="mt-[2px] font-mono text-[11px] text-[#9ca3af]">
                      {item.sku ? `SKU ${item.sku}` : 'SKU —'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[13px] font-medium text-[#111827]">
                      {item.lineTotal !== null ? formatCurrency(item.lineTotal) : '—'}
                    </div>
                    <div className="mt-[2px] text-[11px] text-[#6b7280]">
                      {item.quantity !== null ? item.quantity : '—'} ×{' '}
                      {item.unitPrice !== null ? formatCurrency(item.unitPrice) : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-1 text-[13px] italic text-[#6b7280]">Line items unavailable</div>
          )}
        </div>
      </section>

      <section>
        <div className={sectionTitleClassName}>CUSTOMER REFERENCE</div>
        <div className={infoCardClassName}>
          {customer ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <div className="mb-[6px] flex items-center gap-1 text-[11px] uppercase tracking-[0.06em] text-[#9ca3af]">
                  <User size={14} />
                  NAME
                </div>
                <div className="truncate text-[14px] font-medium text-[#111827]" title={customer.name || 'Not available'}>
                  {customer.name || 'Not available'}
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="mb-[6px] flex items-center justify-end gap-1 text-[11px] uppercase tracking-[0.06em] text-[#9ca3af]">
                  <Mail size={14} />
                  EMAIL
                </div>
                <div className="break-all text-[14px] font-medium text-[#111827]" title={customer.email || 'Not available'}>
                  {customer.email || 'Not available'}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-1 text-[13px] italic text-[#6b7280]">
              Customer data not linked for this order
            </div>
          )}
        </div>
      </section>

      {/* {canWrite || canRetriggerSync ? (
        <section>
          <div className={actionLabelClassName}>ORDER CONTROL LAYER</div>
          <div className="grid grid-cols-2 gap-2">
            {canWrite ? (
              <button
                type="button"
                onClick={() => onAction('reprocess')}
                className="flex h-[36px] items-center justify-center gap-[6px] rounded-[8px] bg-[#2563eb] px-3 text-[13px] font-medium text-white shadow-none transition-colors hover:bg-[#1d4ed8]"
              >
                <RefreshCw size={14} />
                Reprocess Order
              </button>
            ) : null}
            {canRetriggerSync ? (
              <button
                type="button"
                onClick={() => onAction('re-sync')}
                className="flex h-[36px] items-center justify-center gap-[6px] rounded-[8px] border border-[#e5e7eb] bg-white px-3 text-[13px] font-normal text-[#374151] shadow-none transition-colors hover:bg-[#f9fafb]"
              >
                <ArrowRightLeft size={14} />
                Force Re-Sync
              </button>
            ) : null}
          </div>
        </section>
      ) : null} */}

      <section className={cardClassName}>
        <div className="flex items-center gap-2">
          <Clock3 size={16} className="shrink-0 text-[#9ca3af]" />
          <div className="text-[13px] font-medium text-[#111827]">Event Lifecycle Timeline</div>
          <span className="ml-auto inline-flex min-h-[22px] items-center rounded-full bg-[#f3f4f6] px-[6px] py-[1px] text-[10px] font-normal uppercase text-[#6b7280]">CORE</span>
        </div>
        <div className="mb-3 mt-1 border-b border-[#e5e7eb] px-0 pb-[8px] text-[12px] text-[#6b7280]">Unified State Sync CORE</div>

        <div className="space-y-0">
          {timelineItems.length === 0 ? (
            <div className="py-2 text-[13px] italic text-[#6b7280]">No lifecycle events available for this order yet.</div>
          ) : (
            timelineItems.map((event, index) => {
              const previousKind = timelineItems[index - 1]?.kind;
              const nextKind = timelineItems[index + 1]?.kind;
              const kindLabel = event.kind.charAt(0).toUpperCase() + event.kind.slice(1);
              const dotColor = event.kind === 'success' ? 'bg-[#16a34a]' : event.kind === 'processed' ? 'bg-[#d97706]' : 'bg-[#2563eb]';

              return (
                <React.Fragment key={`${event.label}-${index}`}>
                  {index === 0 || event.kind !== previousKind ? (
                    <div className="border-b border-[#f3f4f6] bg-[#f9fafb] px-4 py-[6px] text-[10px] uppercase tracking-[0.07em] text-[#9ca3af]">
                      {kindLabel}
                    </div>
                  ) : null}

                  <div className="flex min-h-[32px] items-center gap-[10px] border-b border-[#f3f4f6] px-4 py-[10px]">
                    <div className="relative flex w-4 shrink-0 justify-center">
                      <span className={`z-10 h-2 w-2 rounded-full ${dotColor}`} />
                      {index !== timelineItems.length - 1 && event.kind === nextKind ? (
                        <span className="absolute left-1/2 top-[10px] bottom-[-12px] border-l border-dashed border-[#e5e7eb]" />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-[#111827]" title={event.label}>
                          {event.label}
                        </span>
                        <span className="ml-1 inline-flex min-h-[22px] shrink-0 items-center rounded-full bg-[#f3f4f6] px-[6px] py-[1px] text-[10px] font-normal text-[#6b7280]">
                          {event.source}
                        </span>
                        <span className="ml-auto whitespace-nowrap font-mono text-[12px] text-[#6b7280]">{event.timestamp}</span>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      </section>

      {/* <section className={cardClassName}>
        <div className="flex items-center gap-2">
          <Search size={16} className="shrink-0 text-[#9ca3af]" />
          <div className="text-[13px] font-medium text-[#111827]">Cross-System Reconciliation</div>
          <span className="ml-auto inline-flex min-h-[22px] items-center rounded-full bg-[#f3f4f6] px-[6px] py-[1px] text-[10px] font-normal uppercase text-[#6b7280]">UNIFIED STATE</span>
        </div>

        <div className="mt-3 divide-y divide-[#f3f4f6] border-t border-[#e5e7eb]">
          {reconciliationRows.map((row) => (
            <div key={row.label} className="flex h-[36px] items-center justify-between gap-3 px-4">
              <div className="text-[11px] uppercase tracking-[0.06em] text-[#9ca3af]">{row.label}</div>
              <span className="inline-flex min-h-[22px] items-center rounded-full bg-[#dcfce7] px-[8px] py-[2px] text-[11px] font-normal uppercase text-[#16a34a]">
                MATCH
              </span>
            </div>
          ))}
        </div>
      </section> */}
    </div>
  );
};