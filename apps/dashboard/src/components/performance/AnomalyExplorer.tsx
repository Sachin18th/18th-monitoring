import React from 'react';
import { Typography, Card, Badge, BadgeVariant } from '@kpi-platform/ui';
import { AlertTriangle, TrendingUp, MapPin, Smartphone, Server, ArrowRight } from 'lucide-react';

export interface PerformanceAnomaly {
  id: string;
  metric: string;
  severity: 'critical' | 'warning' | 'info';
  impact: string;
  scope: string;
  window: string;
  deviation: string;
}

export interface AnomalyExplorerProps {
  anomalies: PerformanceAnomaly[];
  onInspect: (anomaly: PerformanceAnomaly) => void;
  loading?: boolean;
}

export const AnomalyExplorer: React.FC<AnomalyExplorerProps> = ({ anomalies, onInspect, loading }) => {
  const getIcon = (impact?: string) => {
    const normalizedImpact = impact || '';
    if (normalizedImpact.includes('Region')) return <MapPin size={16} />;
    if (normalizedImpact.includes('Browser') || normalizedImpact.includes('Device')) return <Smartphone size={16} />;
    return <Server size={16} />;
  };

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={18} className="text-error" />
        <Typography variant="h3" weight="bold" noMargin className="text-base uppercase tracking-wider text-text-muted">
           Detected Performance Anomalies
        </Typography>
      </div>

      {loading ? (
        <div className="h-24 bg-muted animate-pulse rounded-2xl" />
      ) : anomalies.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-subtle">
           <Typography variant="body" className="text-text-muted">No active anomalies detected in the last 24h.</Typography>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {anomalies.map((anom) => (
            <Card 
              key={anom.id} 
              className={`p-4 border-l-4 group cursor-pointer hover:bg-muted/30 transition-all ${
                anom.severity === 'critical' ? 'border-l-error' : anom.severity === 'warning' ? 'border-l-warning' : 'border-l-info'
              }`}
              onClick={() => onInspect(anom)}
            >
              <div className="flex justify-between items-start mb-3">
                 <div className="flex items-center gap-2">
                    <Badge variant={anom.severity === 'critical' ? 'error' : 'warning'} size="sm">
                       {anom.severity.toUpperCase()}
                    </Badge>
                    <Typography variant="body" weight="bold" className="text-sm">
                       {anom.metric} Regression
                    </Typography>
                 </div>
                 <Typography variant="caption" weight="bold" className="text-error">
                    {anom.deviation}
                 </Typography>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                 <div className="flex items-center gap-2 text-text-secondary">
                    {getIcon(anom.impact)}
                    <Typography variant="caption" className="font-medium">{anom.impact}</Typography>
                 </div>
                 <div className="flex items-center gap-2 text-text-secondary">
                    <Server size={16} />
                    <Typography variant="caption" className="font-medium">{anom.scope}</Typography>
                 </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-subtle">
                 <Typography variant="micro" className="text-text-muted">Window: {anom.window}</Typography>
                 <div className="flex items-center gap-1 text-primary group-hover:gap-2 transition-all">
                    <Typography variant="micro" weight="bold">Deep Analysis</Typography>
                    <ArrowRight size={12} />
                 </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
