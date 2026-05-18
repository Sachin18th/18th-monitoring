import React from 'react';
import { Card, Typography, Badge, BadgeVariant } from '@kpi-platform/ui';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface MetricSnapshot {
  label: string;
  value: string | number;
  unit?: string;
  status?: BadgeVariant;
}

export interface ModuleSnapshotProps {
  title: string;
  icon: LucideIcon;
  status: 'healthy' | 'degraded' | 'critical' | 'stale';
  metrics: MetricSnapshot[];
  href: string;
}

export const ModuleSnapshot: React.FC<ModuleSnapshotProps> = ({
  title,
  icon: Icon,
  status,
  metrics,
  href
}) => {
  const getStatusVariant = (): BadgeVariant => {
    switch (status) {
      case 'healthy': return 'success';
      case 'degraded': return 'warning';
      case 'critical': return 'error';
      case 'stale': return 'stale';
      default: return 'default';
    }
  };

  return (
    <Card padding="none" className="group overflow-hidden border-border-subtle shadow-sm hover:shadow-xl hover:border-border-interactive hover:-translate-y-1 transition-all duration-300 rounded-2xl bg-bg-surface flex flex-col h-full relative cursor-pointer">
      {/* Interactive Background Glow */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none",
        status === 'healthy' ? "bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.05),transparent)]" : 
        status === 'critical' ? "bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.08),transparent)]" : 
        "bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.08),transparent)]"
      )} />

      {/* Header Section */}
      <div className="p-5 pb-3 flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-sm",
            status === 'healthy' ? "bg-success/10 text-success" : status === 'critical' ? "bg-error/10 text-error" : "bg-warning/10 text-warning"
          )}>
            <Icon size={20} />
          </div>
          <div>
            <Typography variant="body" weight="bold" className="text-[13px] uppercase tracking-[0.1em] text-text-muted group-hover:text-text-primary transition-colors" noMargin>
              {title}
            </Typography>
            <Typography variant="micro" className="text-text-muted font-medium opacity-60">
              Operational Sub-system
            </Typography>
          </div>
        </div>
        <Badge variant={getStatusVariant()} size="sm" dot className="font-black text-[9px] px-2 py-0.5 shadow-sm">
          {status.toUpperCase()}
        </Badge>
      </div>

      {/* Primary Metrics Group */}
      <div className="px-5 py-2 flex-1 flex flex-col gap-4">
        {metrics.map((metric, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
             <div className="flex justify-between items-baseline">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted opacity-60">{metric.label}</span>
                <span className={cn(
                    "text-[10px] font-black",
                    metric.status === 'error' ? "text-error" : metric.status === 'success' ? "text-success" : "text-text-muted"
                )}>
                    {metric.unit || ''}
                </span>
             </div>
             <Typography variant="h3" weight="bold" className={cn(
                "text-2xl tracking-tighter transition-all group-hover:text-text-primary",
                metric.status === 'error' ? "text-error" : metric.status === 'success' ? "text-success" : "text-text-secondary"
             )} noMargin>
                {metric.value}
                {metric.unit && <span className="text-sm ml-0.5 opacity-60 font-bold">{metric.unit}</span>}
             </Typography>
          </div>
        ))}
      </div>

      {/* Footer Navigation CTA */}
      <div className="mt-auto border-t border-border-subtle/40 bg-muted/5 group-hover:bg-primary/5 p-3 px-5 flex items-center justify-between transition-colors">
        <span className="text-[10px] font-black uppercase tracking-wider text-text-muted group-hover:text-primary transition-colors">
          Domain Deep-Dive
        </span>
        <div className="w-6 h-6 rounded-lg bg-white border border-border-subtle flex items-center justify-center text-text-muted group-hover:text-primary group-hover:border-primary/30 transition-all group-hover:translate-x-1 shadow-sm">
           <ChevronRight size={14} />
        </div>
      </div>
    </Card>
  );
};
