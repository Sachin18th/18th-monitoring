import React from 'react';
import { Card, Typography, Badge, OperationalTable, Column } from '@kpi-platform/ui';
import { Layers, TrendingUp, TrendingDown, Users } from 'lucide-react';

export interface CustomerSegment {
  name: string;
  size: number;
  active: number;
  conversion: number;
  growth: number;
}

export interface SegmentIntelligenceProps {
  segments: CustomerSegment[];
  onSelect: (segment: CustomerSegment) => void;
  loading?: boolean;
}

export const SegmentIntelligence: React.FC<SegmentIntelligenceProps> = ({
  segments,
  onSelect,
  loading
}) => {
  const columns: Column<CustomerSegment>[] = [
    { 
      key: 'name', 
      header: 'Strategic Segment', 
      render: (val) => (
        <div className="flex items-center gap-2">
           <div className="p-1 rounded-md bg-muted text-text-muted">
              <Users size={12} />
           </div>
           <Typography variant="body" weight="bold" className="text-sm">{val}</Typography>
        </div>
      )
    },
    { key: 'size', header: 'Population', align: 'right', render: (val) => val.toLocaleString() },
    { 
      key: 'conversion', 
      header: 'CR', 
      align: 'right', 
      render: (val) => <span className="font-bold text-primary">{val}%</span>
    },
    { 
      key: 'growth', 
      header: 'Growth', 
      align: 'right', 
      render: (val) => (
        <div className={`flex items-center justify-end gap-1 font-bold ${val >= 0 ? 'text-success' : 'text-error'}`}>
           {val >= 0 ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
           {Math.abs(val)}%
        </div>
      )
    }
  ];

  return (
    <Card className="p-0 overflow-hidden border-subtle h-full">
      <div className="p-4 border-b border-subtle flex justify-between items-center bg-muted/20">
         <div className="flex items-center gap-2">
            <Layers size={18} className="text-text-muted" />
            <Typography variant="body" weight="bold" className="text-sm uppercase tracking-wider text-text-muted">
               Behavioral Segmentation
            </Typography>
         </div>
      </div>
      <OperationalTable 
        columns={columns} 
        data={segments} 
        isDense 
        onRowClick={onSelect}
        isLoading={loading}
      />
    </Card>
  );
};
