import React from 'react';
import { 
  Card, 
  Typography, 
  Badge, 
  BadgeVariant 
} from '@kpi-platform/ui';
import { 
  Link2, 
  ShieldCheck, 
  RefreshCw, 
  Zap, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Activity
} from 'lucide-react';

export type ConnectorHealth = 'healthy' | 'degraded' | 'critical' | 'stale' | 'offline';

export interface ConnectorCardProps {
  id: string;
  name: string;
  provider: string;
  type: string;
  status: ConnectorHealth;
  healthScore: number;
  lastSync: string;
  lastWebhook?: string;
  metrics: {
    syncSuccess: number;
    webhookLatency: string;
    freshness: 'fresh' | 'delayed' | 'stale';
  };
  dimensions: {
    connectivity: boolean;
    auth: boolean;
    sync: boolean;
    webhook: boolean;
  };
  onInspect: (id: string) => void;
  onActionsClick?: (id: string) => void;
}

export const ConnectorCard: React.FC<ConnectorCardProps> = ({
  id,
  name,
  provider,
  type,
  status,
  healthScore,
  lastSync,
  lastWebhook,
  metrics,
  dimensions,
  onInspect,
  onActionsClick
}) => {
  const getStatusVariant = (s: ConnectorHealth): BadgeVariant => {
    switch (s) {
      case 'healthy': return 'success';
      case 'degraded': return 'warning';
      case 'critical': return 'error';
      case 'stale': return 'stale';
      case 'offline': return 'paused';
      default: return 'default';
    }
  };

  const DimensionIcon = ({ active, icon: Icon, label }: { active: boolean, icon: any, label: string }) => (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${active ? 'bg-success-bg text-success-text border border-success/20' : 'bg-error-bg text-error-text border border-error/20'}`} title={label}>
      <Icon size={12} />
      <span>{active ? 'OK' : 'FAIL'}</span>
    </div>
  );

  return (
    <Card 
      className="p-4 hover:border-primary/30 transition-all cursor-pointer group"
      onClick={() => onInspect(id)}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-text-secondary group-hover:bg-primary/5 group-hover:text-primary transition-colors">
            <Link2 size={20} />
          </div>
          <div>
            <Typography variant="h3" weight="bold" noMargin className="text-sm">
              {name}
            </Typography>
            <Typography variant="caption" className="text-text-muted">
              {provider} • {type}
            </Typography>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(status)} size="sm" dot>
            {status.toUpperCase()}
          </Badge>
          <button 
            className="p-1 hover:bg-muted rounded-md text-text-muted"
            onClick={(e) => { e.stopPropagation(); onActionsClick?.(id); }}
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* Health Dimensions */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <DimensionIcon active={dimensions.connectivity} icon={Activity} label="Connectivity" />
        <DimensionIcon active={dimensions.auth} icon={ShieldCheck} label="Authentication" />
        <DimensionIcon active={dimensions.sync} icon={RefreshCw} label="Sync Engine" />
        <DimensionIcon active={dimensions.webhook} icon={Zap} label="Webhook Listener" />
      </div>

      {/* Metrics & Freshness */}
      <div className="space-y-3 pt-3 border-t border-subtle">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-text-muted">
            <Clock size={14} />
            <Typography variant="caption">Last Sync</Typography>
          </div>
          <Typography variant="caption" weight="semibold">
            {lastSync}
          </Typography>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-text-muted">
            <Activity size={14} />
            <Typography variant="caption">Success Rate</Typography>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full ${healthScore > 90 ? 'bg-success' : healthScore > 70 ? 'bg-warning' : 'bg-error'}`}
                style={{ width: `${healthScore}%` }}
              />
            </div>
            <Typography variant="caption" weight="bold">
              {healthScore}%
            </Typography>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-text-muted">
            <Zap size={14} />
            <Typography variant="caption">Freshness</Typography>
          </div>
          <Badge 
            variant={metrics.freshness === 'fresh' ? 'success' : metrics.freshness === 'delayed' ? 'warning' : 'error'} 
            size="sm"
          >
            {metrics.freshness.toUpperCase()}
          </Badge>
        </div>
      </div>
    </Card>
  );
};
