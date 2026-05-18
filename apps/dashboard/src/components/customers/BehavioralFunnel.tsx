import React from 'react';
import { Typography, Card, Badge } from '@kpi-platform/ui';
import { ArrowDown, AlertCircle } from 'lucide-react';

export interface FunnelStage {
  stage: string;
  count: number;
  percent: number;
}

export interface BehavioralFunnelProps {
  stages: FunnelStage[];
  loading?: boolean;
}

export const BehavioralFunnel: React.FC<BehavioralFunnelProps> = ({ stages, loading }) => {
  return (
    <Card className="p-6 h-full border-subtle">
      <div className="flex items-center justify-between mb-8">
         <Typography variant="h3" weight="bold" noMargin className="text-base uppercase tracking-wider text-text-muted">
            Conversion Journey Intelligence
         </Typography>
         <Badge variant="info" size="sm">Site-Wide Funnel</Badge>
      </div>

      {loading ? (
        <div className="space-y-4">
           {Array.from({ length: 5 }).map((_, i) => (
             <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />
           ))}
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map((stage, idx) => {
             const dropoff = idx > 0 ? (stages[idx-1].percent - stage.percent) : 0;
             return (
               <React.Fragment key={idx}>
                 {idx > 0 && (
                   <div className="flex flex-col items-center py-1 opacity-40">
                      <ArrowDown size={14} className="text-text-muted" />
                      {dropoff > 10 && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-error">
                           <AlertCircle size={10} />
                           {dropoff}% LEAKAGE
                        </div>
                      )}
                   </div>
                 )}
                 <div className="relative overflow-hidden group">
                    <div 
                      className="absolute inset-0 bg-primary/5 transition-all group-hover:bg-primary/10" 
                      style={{ width: `${stage.percent}%` }}
                    />
                    <div className="relative p-4 flex justify-between items-center bg-surface border border-subtle rounded-xl group-hover:border-primary/30 transition-all">
                       <div>
                          <Typography variant="body" weight="bold" className="text-sm">{stage.stage}</Typography>
                          <Typography variant="micro" className="text-text-muted">{stage.count.toLocaleString()} Users</Typography>
                       </div>
                       <div className="text-right">
                          <Typography variant="body" weight="bold" className="text-primary">{stage.percent}%</Typography>
                          <Typography variant="micro" className="text-text-muted">Conversion</Typography>
                       </div>
                    </div>
                 </div>
               </React.Fragment>
             );
          })}
        </div>
      )}
    </Card>
  );
};
