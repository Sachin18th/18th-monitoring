import React from 'react';
import { 
  Typography, 
  Badge, 
  BadgeVariant, 
  OperationalTable, 
  Column,
  InformationState
} from '@kpi-platform/ui';
import { 
  History, 
  DollarSign, 
  Truck, 
  Package, 
  Search,
  Activity,
  CreditCard,
  Building2,
  Box,
  MapPin,
  ArrowRightLeft,
  ChevronRight
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

  const getStatusVariant = (status: string): BadgeVariant => {
    switch (status.toLowerCase()) {
      case 'shipped':
      case 'delivered':
      case 'paid': return 'success';
      case 'placed':
      case 'processing': return 'processing';
      case 'cancelled':
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Summary */}
      <section className="bg-muted/30 p-4 rounded-2xl border border-subtle">
        <div className="flex justify-between items-start mb-4">
          <div>
            <Typography variant="h3" weight="bold" noMargin>
              {order.id}
            </Typography>
            <Typography variant="caption" className="text-text-muted">
              Source ID: <span className="font-mono">{order.externalOrderId}</span>
            </Typography>
          </div>
          <Badge variant={getStatusVariant(order.status)} dot>
            {order.status.toUpperCase()}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4 py-3 border-t border-subtle">
           <div>
             <Typography variant="caption" weight="bold" className="text-text-muted mb-1 block">CHANNEL</Typography>
             <div className="flex items-center gap-2">
                {order.orderSource === 'online' ? <Activity size={14}/> : <Building2 size={14}/>}
                <Typography variant="body" weight="semibold" className="text-sm uppercase">{order.orderSource}</Typography>
             </div>
           </div>
           <div>
             <Typography variant="caption" weight="bold" className="text-text-muted mb-1 block">VALUE</Typography>
             <Typography variant="body" weight="bold" className="text-sm">${order.amount?.toFixed(2)}</Typography>
           </div>
        </div>
      </section>

      {/* Operational Controls */}
      <section>
        <Typography variant="caption" weight="bold" className="text-text-muted uppercase tracking-wider mb-3 block">
          Order Control Layer
        </Typography>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => onAction('reprocess')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl font-bold hover:brightness-110 transition-all text-sm"
          >
            <Box size={16} />
            Reprocess Order
          </button>
          <button 
            onClick={() => onAction('re-sync')}
            className="flex items-center justify-center gap-2 px-4 py-3 border border-subtle bg-surface text-text-primary rounded-xl font-bold hover:bg-muted transition-all text-sm"
          >
            <ArrowRightLeft size={16} />
            Force Re-Sync
          </button>
        </div>
      </section>

      {/* Lifecycle Timeline */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <History size={18} className="text-text-muted" />
          <Typography variant="h3" weight="bold" noMargin className="text-sm">
            Event Lifecycle Timeline
          </Typography>
        </div>
        <div className="space-y-4 ml-2">
          {timeline.map((event, idx) => (
            <div key={idx} className="flex gap-4 relative">
              {idx !== timeline.length - 1 && (
                <div className="absolute left-[7px] top-6 bottom-[-16px] w-[2px] bg-muted" />
              )}
              <div className={`mt-1.5 w-4 h-4 rounded-full border-4 border-surface z-10 ${event.type === 'error' ? 'bg-error' : 'bg-success'}`} />
              <div>
                <div className="flex items-center gap-2">
                   <Typography variant="body" weight="bold" className="text-sm">{event.title}</Typography>
                   {event.system && <Badge variant="default" size="sm">{event.system}</Badge>}
                </div>
                <Typography variant="caption" className="text-text-muted block">{event.time}</Typography>
                {event.description && <Typography variant="caption" className="mt-1 block bg-muted p-2 rounded text-text-secondary">{event.description}</Typography>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* System Reconciliation */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-text-muted" />
            <Typography variant="h3" weight="bold" noMargin className="text-sm">
              Cross-System Reconciliation
            </Typography>
          </div>
          <Badge variant={order.syncStatus === 'mismatch' ? 'error' : 'success'} size="sm">
            {order.syncStatus === 'mismatch' ? 'MISMATCH DETECTED' : 'UNIFIED STATE'}
          </Badge>
        </div>
        <div className="space-y-2">
          {reconciliation.map((sys, idx) => (
             <div key={idx} className="flex items-center justify-between p-3 border border-subtle rounded-xl bg-surface">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg text-text-muted">
                    {sys.icon || <Building2 size={16}/>}
                  </div>
                  <div>
                    <Typography variant="caption" weight="bold" className="block">{sys.name}</Typography>
                    <Typography variant="micro" className="text-text-muted uppercase">{sys.id}</Typography>
                  </div>
                </div>
                <div className="text-right">
                  <Typography variant="caption" weight="bold" className="block">{sys.value}</Typography>
                  <Badge variant={sys.match ? 'success' : 'error'} size="sm">{sys.match ? 'MATCH' : 'DIFF'}</Badge>
                </div>
             </div>
          ))}
        </div>
      </section>
    </div>
  );
};
