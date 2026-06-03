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
  RefreshCw,
  Search,
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

  const formatAmount = () => {
    const formatNumericAmount = (value: number) =>
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);

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
      }).format(amount);
    } catch {
      const symbol = currencySymbolMap[currency];
      if (symbol) {
        return `${symbol}${formatNumericAmount(amount)}`;
      }

      return `${currency} ${formatNumericAmount(amount)}`;
    }
  };

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
    <div className="flex flex-col gap-3">
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

      {canWrite || canRetriggerSync ? (
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
      ) : null}

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

      <section className={cardClassName}>
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
      </section>
    </div>
  );
};