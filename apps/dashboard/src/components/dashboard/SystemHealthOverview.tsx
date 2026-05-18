import React from 'react';
import { Typography, Badge, BadgeVariant, Card } from '@kpi-platform/ui';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ModuleHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'critical' | 'stale';
  count?: number;
  label?: string;
  icon: any;
  href: string;
}

export interface SystemHealthOverviewProps {
  modules: ModuleHealth[];
  overallStatus: BadgeVariant;
  overallLabel: string;
  loading?: boolean;
}

export const SystemHealthOverview: React.FC<SystemHealthOverviewProps> = ({
  modules,
  overallStatus,
  overallLabel,
  loading
}) => {
  const getStatusVariant = (s: string): BadgeVariant => {
    switch (s) {
      case 'healthy': return 'success';
      case 'degraded': return 'warning';
      case 'critical': return 'error';
      case 'stale': return 'stale';
      default: return 'default';
    }
  };

  const getBorderColor = () => {
    if (overallStatus === 'error') return 'border-red-500';
    if (overallStatus === 'warning') return 'border-amber-500';
    return 'border-green-500';
  };

  return (
    <Card className="p-0 overflow-hidden border-border-subtle shadow-sm rounded-2xl">
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] w-full min-h-[140px]">
        {/* Left Section: Primary Alert */}
        <div className={cn(
          "p-6 flex items-center gap-6 border-l-4 transition-colors duration-500",
          overallStatus === 'error' ? 'border-red-500 bg-red-500/5' : 
          overallStatus === 'warning' ? 'border-amber-500 bg-amber-500/5' : 
          'border-green-500 bg-green-500/5'
        )}>
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg border",
            overallStatus === 'success' ? 'text-success bg-white border-success/20' : 
            overallStatus === 'error' ? 'text-error bg-white border-error/20' : 
            'text-warning bg-white border-warning/20'
          )}>
            {overallStatus === 'success' ? <ShieldCheck size={36} strokeWidth={2.5} /> : <AlertCircle size={36} strokeWidth={2.5} />}
          </div>
          <div className="flex flex-col">
            <Typography variant="h2" weight="bold" className="text-2xl leading-tight">
              {overallLabel}
            </Typography>
            <Typography variant="body" className="text-text-muted text-sm font-medium">
              System-wide Health Aggregate
            </Typography>
            <div className="mt-2">
              <Badge variant={overallStatus} size="sm" dot>
                {overallStatus === 'success' ? 'ALL SYSTEMS NOMINAL' : 'ATTENTION REQUIRED'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Right Sections: Mini Stat Blocks */}
        {modules.map((module, idx) => {
          const Icon = module.icon;
          return (
            <a 
              key={idx} 
              href={module.href}
              className="p-6 flex flex-col gap-3 border-l border-border-subtle hover:bg-muted/30 transition-all group relative overflow-hidden"
            >
              {/* Top Row: Title + Icon */}
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <Icon size={16} className="text-text-muted group-hover:text-primary transition-colors" />
                  <Typography variant="caption" weight="bold" className="text-[11px] uppercase tracking-wider text-text-muted">
                    {module.name}
                  </Typography>
                </div>
              </div>

              {/* Status Row */}
              <div className="flex items-center gap-2 text-sm font-bold">
                <span className={`w-2.5 h-2.5 rounded-full ${module.status === 'healthy' ? 'bg-success' : module.status === 'degraded' ? 'bg-warning' : 'bg-error'} shadow-sm`} />
                <Typography variant="body" weight="bold" className="text-sm font-extrabold tracking-tight">
                  {module.status.toUpperCase()}
                </Typography>
              </div>

              {/* Metric Row */}
              {module.label && (
                <div className="mt-auto pt-1">
                  <Typography variant="body" className="text-xs font-semibold text-text-primary">
                    {module.label}
                  </Typography>
                </div>
              )}
              
              {/* Decoration */}
              <div className="absolute right-0 top-0 w-1 h-0 bg-primary group-hover:h-full transition-all" />
            </a>
          );
        })}
      </div>
    </Card>
  );
};
