import React, { useState } from 'react';
import { Card, Typography, Badge } from '@kpi-platform/ui';
import { PerformanceChart } from '../ui/PerformanceChart';
import { Activity, Layers, Filter } from 'lucide-react';

export interface PerformanceTrendExplorerProps {
  data?: any[];
  trends?: any[];
  loading?: boolean;
  activeMetric?: string;
  onMetricChange?: (metric: string) => void;
}

export const PerformanceTrendExplorer: React.FC<PerformanceTrendExplorerProps> = ({ 
  data, 
  trends,
  loading 
}) => {
  const chartData = data || trends || [];
  const [activePercentiles, setActivePercentiles] = useState(['p50', 'p95', 'p99']);

  const togglePercentile = (p: string) => {
    setActivePercentiles(prev => 
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  return (
    <Card className="p-6 mb-8 overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <Activity size={18} className="text-primary" />
              <Typography variant="h3" weight="bold" noMargin className="text-base uppercase tracking-wider text-text-muted">
                 Technical Performance Intelligence
              </Typography>
           </div>
           <Typography variant="caption" className="text-text-muted">
              Rolling percentile distribution with 1m resolution (Site-wide)
           </Typography>
        </div>

        <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-xl border border-subtle">
           {['p50', 'p75', 'p90', 'p95', 'p99'].map((p) => (
              <button
                key={p}
                onClick={() => togglePercentile(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activePercentiles.includes(p) 
                    ? 'bg-surface text-primary shadow-sm border border-subtle' 
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {p.toUpperCase()}
              </button>
           ))}
        </div>
      </div>

      <div className="relative h-[350px]">
        {loading ? (
          <div className="absolute inset-0 bg-muted/20 animate-pulse rounded-xl" />
        ) : (
          <PerformanceChart data={chartData} title="" />
        )}

        {/* Intelligence Overlay Markers (Mocked for now) */}
        <div className="absolute top-1/2 left-1/4 group">
           <div className="w-1 h-32 bg-primary/20 absolute bottom-[-16px]" />
           <div className="absolute bottom-[116px] left-[-8px] p-2 bg-primary text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-20">
              <Typography variant="micro" weight="bold" className="block text-white">REPLY RELEASE v2.4.1</Typography>
              <Typography variant="micro" className="text-white/80">Impact: -12% p95 Latency</Typography>
           </div>
           <div className="w-4 h-4 rounded-full bg-primary border-4 border-surface shadow-md absolute bottom-[116px] left-[-7px]" />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between py-4 border-t border-subtle">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-primary" />
               <Typography variant="micro" weight="bold" className="text-text-primary">CORE LATENCY</Typography>
            </div>
            <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-sm bg-muted" />
               <Typography variant="micro" weight="bold" className="text-text-muted">HISTORICAL AVG</Typography>
            </div>
         </div>
         <Badge variant="info" size="sm" dot>ANOMALY SCALING ACTIVE</Badge>
      </div>
    </Card>
  );
};
