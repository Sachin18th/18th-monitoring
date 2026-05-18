import React from 'react';
import { 
  Typography, 
  InformationState
} from '@kpi-platform/ui';
import { 
  History, 
  Package, 
  Search,
  Activity,
  Building2,
  Box,
  ArrowRightLeft
} from 'lucide-react';

export interface OrderDetailDrawerContentProps {
  order: any;
  timeline: any[];
  reconciliation: any[];
  onAction: (action: string) => void;
}

export const OrderDetailDrawerContent: React.FC<OrderDetailDrawerContentProps> = ({
  order,
  timeline = [],
  reconciliation = [],
  onAction
}) => {
  if (!order) return <InformationState type="loading" />;

  const amount = Number(order.amount ?? order.totalAmount ?? 0);
  const currency = String(order.currency || 'USD').trim().toUpperCase();
  const channel = String(order.channel || order.orderSource || order.sourceSystem || 'unknown').toLowerCase();
  const status = String(order.status || order.lifecycleState || order.normalizedStatus || 'unknown').toLowerCase();
  const syncStatus = String(order.syncStatus || 'synced').toLowerCase();
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

  const sectionTitleClassName = "text-[10px] uppercase tracking-[0.08em] text-[var(--text-label)]";
  const cardClassName = "rounded-[16px] border border-[var(--border-card)] bg-[var(--bg-card)] p-5";

  return (
    <div className="flex flex-col gap-5 p-6">
      <section className={cardClassName}>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] border border-[var(--border-card)] bg-primary/10 text-primary">
            <Package size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="min-w-0">
              <Typography
                variant="h3"
                weight="bold"
                noMargin
                className="truncate text-[15px] font-semibold text-[var(--text-primary)]"
              >
                {order.id}
              </Typography>
              <Typography variant="caption" className="mt-1 block text-[11px] text-[var(--text-muted)]">
                Source ID: <span className="font-mono">{order.externalOrderId || order.externalReferenceId || order.orderId || '-'}</span>
              </Typography>
              <span className="mt-3 inline-flex items-center rounded-full border border-[var(--border-input)] px-[10px] py-[3px] text-[10px]">
                {status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--border-card)] pt-4">
          <div>
            <Typography variant="caption" weight="bold" className={`${sectionTitleClassName} mb-1.5 block`}>
              Channel
            </Typography>
            <div className="flex items-center gap-2">
              {channel === 'online' ? <Activity size={16} /> : <Building2 size={16} />}
              <Typography variant="body" weight="semibold" className="text-[14px] font-medium text-[var(--text-primary)]">
                {channel.toUpperCase()}
              </Typography>
            </div>
          </div>
          <div>
            <Typography variant="caption" weight="bold" className={`${sectionTitleClassName} mb-1.5 block`}>
              Value
            </Typography>
            <Typography variant="body" weight="bold" className="text-[14px] font-medium text-[var(--text-primary)]">
              {formatAmount()}
            </Typography>
          </div>
        </div>
      </section>

      <section className={cardClassName}>
        <Typography variant="caption" weight="bold" className={`${sectionTitleClassName} mb-[14px] block`}>
          Order Control Layer
        </Typography>
        <div className="grid grid-cols-2 gap-[10px]">
          <button
            onClick={() => onAction('reprocess')}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-blue-400 px-[14px] py-[10px] text-[13px] font-medium text-white transition-all hover:brightness-110"
          >
            <Box size={16} />
            Reprocess Order
          </button>
          <button
            onClick={() => onAction('re-sync')}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-subtle bg-surface px-[14px] py-[10px] text-[13px] font-medium text-text-primary transition-all hover:bg-muted"
          >
            <ArrowRightLeft size={16} />
            Force Re-Sync
          </button>
        </div>
      </section>

      <section className={cardClassName}>
        <div className="mb-5 flex items-center gap-2">
          <History size={18} className="text-text-muted" />
          <Typography variant="h3" weight="bold" noMargin className="text-[14px] font-semibold text-[var(--text-primary)]">
            Event Lifecycle Timeline
          </Typography>
        </div>
        <div>
          {timeline.map((event, idx) => (
            <div
              key={idx}
              className={`flex flex-col gap-1 py-[14px] ${idx !== timeline.length - 1 ? 'border-b border-[var(--border-card)]' : ''}`}
            >
              <div className="flex items-center gap-[10px]">
                <div className={`h-[10px] w-[10px] shrink-0 rounded-full ${event.type === 'error' ? 'bg-error' : 'bg-success'}`} />
                <Typography variant="body" weight="bold" className="text-[13px] font-medium text-[var(--text-primary)]">
                  {event.title}
                </Typography>
                {event.system && (
                  <span className="ml-[6px] inline-flex items-center rounded-[6px] border border-[var(--border-input)] px-2 py-[2px] text-[10px] text-[var(--text-secondary)]">
                    {event.system}
                  </span>
                )}
              </div>
              <Typography variant="caption" className="mt-[2px] block pl-5 text-[11px] text-[var(--text-muted)]">
                {event.time}
              </Typography>
              {event.description && (
                <Typography variant="caption" className="block pl-5 text-[11px] text-[var(--text-muted)]">
                  {event.description}
                </Typography>
              )}
            </div>
          ))}
          {timeline.length === 0 && (
            <div className="py-[14px]">
              <Typography variant="caption" className="text-[11px] text-[var(--text-muted)]">
                No lifecycle events available for this order yet.
              </Typography>
            </div>
          )}
        </div>
      </section>

      <section className={cardClassName}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-text-muted" />
            <Typography variant="h3" weight="bold" noMargin className="text-[14px] font-semibold text-[var(--text-primary)]">
              Cross-System Reconciliation
            </Typography>
          </div>
          <span className="inline-flex items-center rounded-full border border-[var(--border-input)] px-[10px] py-[3px] text-[10px] text-[var(--text-secondary)]">
            {syncStatus === 'mismatch' ? 'MISMATCH DETECTED' : 'UNIFIED STATE'}
          </span>
        </div>
        <div>
          {reconciliation.map((sys, idx) => (
            <div
              key={idx}
              className={`flex min-h-[44px] items-center justify-between py-[10px] ${idx !== reconciliation.length - 1 ? 'border-b border-[var(--border-card)]' : ''}`}
            >
              <Typography variant="caption" weight="bold" className="text-[12px] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                {sys.name}
              </Typography>
              <div className="flex items-center justify-end">
                {sys.match ? (
                  <span className="inline-flex items-center rounded-[6px] border border-[rgba(34,197,94,0.3)] px-[10px] py-[3px] text-[10px] font-semibold text-[#22c55e]">
                    MATCH
                  </span>
                ) : (
                  <Typography variant="caption" weight="bold" className="text-[13px] font-medium text-[var(--text-primary)]">
                    {sys.value}
                  </Typography>
                )}
              </div>
            </div>
          ))}
          {reconciliation.length === 0 && (
            <div className="flex min-h-[44px] items-center py-[10px]">
              <Typography variant="caption" className="text-[11px] text-[var(--text-muted)]">
                No reconciliation data available for this order yet.
              </Typography>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
