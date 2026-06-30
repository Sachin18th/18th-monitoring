import React from 'react';
import { 
  Card, 
  Typography, 
  Badge, 
  BadgeVariant 
} from '@kpi-platform/ui';
import {
  RefreshCw,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  Key
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
  onResync?: (id: string) => void;
  onReauth?: (id: string) => void;
  isResyncDisabled?: boolean;
  isResyncRunning?: boolean;
  isSelected?: boolean;
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
  onActionsClick,
  onResync,
  onReauth,
  isResyncDisabled = false,
  isResyncRunning = false,
  isSelected = false
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

  const statusLabel = status.toUpperCase();

  const StatusPill = ({ active, label }: { active: boolean; label: string }) => (
    <div
      className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${active ? 'bg-success-bg text-success-text border border-success/20' : 'bg-error-bg text-error-text border border-error/20'}`}
    >
      {active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      <span>{label} {active ? 'ok' : 'fail'}</span>
    </div>
  );

  return (
    <Card
      className={`p-5 transition-all cursor-pointer group ${isSelected ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'hover:border-primary/30'}`}
      onClick={() => onInspect(id)}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <Typography variant="h3" weight="bold" noMargin className="text-base">
            {name}
          </Typography>
          <Typography variant="caption" className="text-text-muted">
            {provider} • {type}
          </Typography>
        </div>
        <Badge variant={getStatusVariant(status)} size="sm" dot>
          {statusLabel}
        </Badge>
      </div>

      {/* Health Dimensions */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatusPill active={dimensions.connectivity} label="Connection" />
        <StatusPill active={dimensions.sync} label="Sync" />
        <StatusPill active={dimensions.auth} label="Auth" />
      </div>

      {/* Metrics & Freshness */}
      <div className="space-y-3 pt-3 border-t border-subtle">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-text-muted">
            <Clock size={14} />
            <Typography variant="caption">Last sync</Typography>
          </div>
          <Typography variant="caption" weight="semibold">
            {lastSync}
          </Typography>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-text-muted">
            <Activity size={14} />
            <Typography variant="caption">Success rate</Typography>
          </div>
          <Typography
            variant="caption"
            weight="bold"
            className={healthScore > 90 ? 'text-success-text' : healthScore > 70 ? 'text-warning-text' : 'text-error-text'}
          >
            {healthScore}%
          </Typography>
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

      <div className="mt-4 border-t border-subtle pt-4 flex gap-2">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isResyncDisabled || !onResync}
          onClick={(e) => {
            e.stopPropagation();
            onResync?.(id);
          }}
        >
          <RefreshCw size={14} className={isResyncRunning ? 'animate-spin' : ''} />
          {isResyncRunning ? 'Syncing...' : 'Re-Sync Data'}
        </button>
        {onReauth && (
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary/15"
            onClick={(e) => {
              e.stopPropagation();
              onReauth(id);
            }}
          >
            <Key size={14} />
            Re-authenticate
          </button>
        )}
      </div>
    </Card>
  );
};
