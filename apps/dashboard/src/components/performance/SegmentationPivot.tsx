import React from 'react';
import { Card, Typography, Badge, OperationalTable, Column } from '@kpi-platform/ui';
import { Layers, Globe, Smartphone, MousePointer2, ChevronRight } from 'lucide-react';

export interface PivotData {
  id?: string | number;
  dimension: string;
  count: number;
  p50: number;
  p95: number;
  errors: number;
  health: 'healthy' | 'warning' | 'critical';
}

export interface SegmentationPivotProps {
  title?: string;
  icon?: any;
  data?: PivotData[];
  onSelect?: (item: PivotData) => void;
  loading?: boolean;
}

export const SegmentationPivot: React.FC<SegmentationPivotProps> = ({
  title = "Regional Latency Distribution",
  icon: Icon = Globe,
  data = [],
  onSelect = () => {},
  loading
}) => {
  const columns: Column<PivotData>[] = [
    { 
      key: 'dimension', 
      header: 'Segment', 
      render: (val, row) => (
        <div className="flex items-center gap-2">
           <div className={`w-2 h-2 rounded-full ${row.health === 'critical' ? 'bg-error animate-pulse' : row.health === 'warning' ? 'bg-warning' : 'bg-success'}`} />
           <Typography variant="body" weight="bold" className="text-sm">{val}</Typography>
        </div>
      )
    },
    { key: 'count', header: 'Samples', align: 'right', render: (val) => val.toLocaleString() },
    { 
      key: 'p95', 
      header: 'p95 Latency', 
      align: 'right', 
      render: (val) => <span className={`font-mono font-bold ${val > 2500 ? 'text-error' : val > 1500 ? 'text-warning' : 'text-success'}`}>{val}ms</span>
    },
    { 
      key: 'errors', 
      header: 'Err %', 
      align: 'right', 
      render: (val) => <span className={`font-mono ${val > 1 ? 'text-error font-bold' : 'text-text-muted'}`}>{val}%</span>
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: () => <ChevronRight size={14} className="text-text-muted" />
    }
  ];

  return (
    <Card className="p-0 overflow-hidden border-subtle">
      <div className="p-4 border-b border-subtle flex justify-between items-center bg-muted/20">
         <div className="flex items-center gap-2">
            <Icon size={18} className="text-text-muted" />
            <Typography variant="body" weight="bold" className="text-sm uppercase tracking-wider text-text-muted">
               {title}
            </Typography>
         </div>
      </div>
      <OperationalTable 
        columns={columns as any} 
        data={data.map(d => ({ ...d, id: d.id || d.dimension })).slice(0, 5)} 
        isDense 
        onRowClick={onSelect}
        isLoading={loading}
        getRowKey={(item: any) => item.dimension || item.id}
      />
    </Card>
  );
};
