import React from 'react';
import { Card, Typography, Badge, OperationalTable, Column, Button } from '@kpi-platform/ui';
import { Database, Plus, RefreshCw, MoreVertical, ShieldCheck, ZapOff } from 'lucide-react';

export interface Connector {
  id: string;
  name: string;
  provider: string;
  status: 'active' | 'degraded' | 'disabled';
  lastSync: string;
  type: string;
}

export interface IntegrationsConfigProps {
  connectors: Connector[];
  onAdd: () => void;
  loading?: boolean;
}

export const IntegrationsConfig: React.FC<IntegrationsConfigProps> = ({
  connectors,
  onAdd,
  loading
}) => {
  const columns: Column<Connector>[] = [
    { 
      key: 'name', 
      header: 'Connector Name', 
      render: (val, row) => (
        <div className="flex items-center gap-3">
           <div className="p-2 rounded bg-muted">
              <Database size={14} className="text-text-muted" />
           </div>
           <div>
              <Typography variant="body" weight="bold" className="text-sm">{val}</Typography>
              <Typography variant="micro" className="text-text-muted">{row.provider}</Typography>
           </div>
        </div>
      )
    },
    { key: 'type', header: 'Type' },
    { 
      key: 'status', 
      header: 'Connection Status', 
      render: (val) => (
        <Badge 
          variant={val === 'active' ? 'success' : val === 'degraded' ? 'warning' : 'default'} 
          size="sm" 
          dot
        >
          {val.toUpperCase()}
        </Badge>
      )
    },
    { key: 'lastSync', header: 'Last Data Sync' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (_, row) => (
        <div className="flex gap-2">
           <button className="p-1.5 hover:bg-muted rounded text-text-muted transition-all">
              <RefreshCw size={14} />
           </button>
           <button className="p-1.5 hover:bg-muted rounded text-text-muted transition-all">
              <MoreVertical size={14} />
           </button>
        </div>
      )
    }
  ];

  return (
    <Card className="p-0 border-subtle overflow-hidden">
       <div className="p-4 border-b border-subtle flex justify-between items-center bg-muted/20">
          <div className="flex items-center gap-2">
             <ShieldCheck size={18} className="text-success" />
             <Typography variant="body" weight="bold" className="text-sm uppercase tracking-wider text-text-muted">
                System Connectors & Auth
             </Typography>
          </div>
          <Button size="sm" onClick={onAdd} className="flex items-center gap-2">
             <Plus size={14} /> New Connector
          </Button>
       </div>
       <div className="p-6 bg-surface">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
             <div className="p-4 rounded-xl border border-dashed border-subtle bg-muted/20 flex items-center gap-4">
                <div className="p-3 bg-white rounded-lg shadow-sm">
                   <ZapOff size={18} className="text-warning" />
                </div>
                <div>
                   <Typography variant="body" weight="bold" className="text-sm">Health Governance</Typography>
                   <Typography variant="micro" className="text-text-muted">Auto-disable connectors failing for &gt;10m.</Typography>
                </div>
                <Badge variant="warning" size="sm" className="ml-auto">ENABLED</Badge>
             </div>
             <div className="p-4 rounded-xl border border-dashed border-subtle bg-muted/20 flex items-center gap-4">
                <div className="p-3 bg-white rounded-lg shadow-sm">
                   <RefreshCw size={18} className="text-primary" />
                </div>
                <div>
                   <Typography variant="body" weight="bold" className="text-sm">Sync Policy</Typography>
                   <Typography variant="micro" className="text-text-muted">Aggressive diffing: 1m interval.</Typography>
                </div>
                <Badge variant="info" size="sm" className="ml-auto">OPTIMO</Badge>
             </div>
          </div>
          <OperationalTable 
            columns={columns} 
            data={connectors} 
            isLoading={loading}
          />
       </div>
    </Card>
  );
};
