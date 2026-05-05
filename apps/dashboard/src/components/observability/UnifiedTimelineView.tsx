import React from 'react';
import { Typography, Card, Badge } from '@kpi-platform/ui';
import { AlertCircle, History, Activity, Shield, User, Zap, ArrowRight } from 'lucide-react';

export interface TimelineEvent {
  id: string;
  type: 'alert' | 'audit' | 'activity';
  title: string;
  description: string;
  timestamp: string;
  severity?: 'critical' | 'warning' | 'info' | 'success';
}

export interface UnifiedTimelineViewProps {
  events: TimelineEvent[];
  loading?: boolean;
}

export const UnifiedTimelineView: React.FC<UnifiedTimelineViewProps> = ({ events, loading }) => {
  return (
    <Card className="p-6 border-subtle h-full">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-subtle">
         <div className="flex items-center gap-2">
            <History size={18} className="text-primary" />
            <Typography variant="h3" weight="bold" noMargin className="text-base uppercase tracking-wider text-text-muted">
               Unified Operational Timeline
            </Typography>
         </div>
         <Badge variant="info" size="sm" dot>Live Feed</Badge>
      </div>

      {loading ? (
        <div className="space-y-8 pl-4">
           {Array.from({ length: 4 }).map((_, i) => (
             <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
           ))}
        </div>
      ) : (
        <div className="space-y-0 border-l border-subtle ml-2 pl-6">
          {events.map((event, idx) => (
             <div key={event.id} className="relative pb-8 last:pb-0 group">
                {/* Connector Dot */}
                <div className={`absolute left-[-31px] top-1 w-2.5 h-2.5 rounded-full bg-surface border-2 transition-all ${
                  event.type === 'alert' ? 'border-error' : event.type === 'audit' ? 'border-primary' : 'border-success'
                }`} />
                
                <div className="flex justify-between items-start mb-1">
                   <div className="flex items-center gap-2">
                      <span className={`p-1 rounded bg-muted text-[10px] font-bold uppercase tracking-widest ${
                        event.type === 'alert' ? 'text-error' : event.type === 'audit' ? 'text-primary' : 'text-success'
                      }`}>
                         {event.type}
                      </span>
                      <Typography variant="body" weight="bold" className="text-sm group-hover:text-primary transition-colors cursor-pointer">
                         {event.title}
                      </Typography>
                   </div>
                   <Typography variant="micro" className="text-text-muted font-bold uppercase">{event.timestamp}</Typography>
                </div>
                
                <Typography variant="micro" className="text-text-muted block max-w-md">
                   {event.description}
                </Typography>

                <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-primary cursor-pointer">
                   <Typography variant="micro" weight="bold">Investigate Signal</Typography>
                   <ArrowRight size={10} />
                </div>
             </div>
          ))}
        </div>
      )}
    </Card>
  );
};
