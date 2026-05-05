import React from 'react';
import { 
  Typography, 
  Badge, 
  OperationalTable, 
  Column,
  InformationState
} from '@kpi-platform/ui';
import { 
  History, 
  Zap, 
  AlertCircle, 
  RefreshCw, 
  Pause, 
  Play, 
  Key,
  ExternalLink,
  ChevronRight,
  Database,
  ArrowRight
} from 'lucide-react';

export interface DiagnosticDrawerContentProps {
  connector: any;
  syncHistory: any[];
  webhookActivity: any[];
  onAction: (action: string) => void;
}

export const DiagnosticDrawerContent: React.FC<DiagnosticDrawerContentProps> = ({
  connector,
  syncHistory,
  webhookActivity,
  onAction
}) => {
  const syncColumns: Column<any>[] = [
    { 
      key: 'timestamp', 
      header: 'Time', 
      render: (val) => new Date(val).toLocaleTimeString(),
      width: '100px'
    },
    { 
      key: 'type', 
      header: 'Type',
      render: (val) => <span className="text-xs font-semibold">{val}</span>
    },
    { 
      key: 'status', 
      header: 'Result',
      render: (val) => (
        <Badge variant={val === 'success' ? 'success' : 'error'} size="sm">
          {val.toUpperCase()}
        </Badge>
      )
    },
    { 
      key: 'records', 
      header: 'Hits',
      align: 'right'
    }
  ];

  const webhookColumns: Column<any>[] = [
    { key: 'id', header: 'Event ID', width: '100px', render: (val) => <span className="font-mono text-[10px]">{val}</span> },
    { key: 'event', header: 'Topic' },
    { 
      key: 'status', 
      header: 'Status',
      render: (val) => (
        <Badge variant={val === 'processed' ? 'success' : 'error'} size="sm">
          {val.toUpperCase()}
        </Badge>
      )
    }
  ];

  if (!connector) return <InformationState type="loading" />;

  return (
    <div className="space-y-8">
      {/* Quick Actions */}
      <section>
        <Typography variant="caption" weight="bold" className="text-text-muted uppercase tracking-wider mb-3 block">
          Control Operations
        </Typography>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => onAction('resync')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl font-bold hover:brightness-110 transition-all text-sm"
          >
            <RefreshCw size={16} />
            Run Sync Now
          </button>
          <button 
            onClick={() => onAction('reauth')}
            className="flex items-center justify-center gap-2 px-4 py-3 border border-subtle bg-surface text-text-primary rounded-xl font-bold hover:bg-muted transition-all text-sm"
          >
            <Key size={16} />
            Re-authenticate
          </button>
          <button 
            onClick={() => onAction('pause')}
            className="flex items-center justify-center gap-2 px-4 py-3 border border-subtle bg-surface text-text-primary rounded-xl font-bold hover:bg-muted transition-all text-sm"
          >
            <Pause size={16} />
            Pause Activity
          </button>
          <button 
            onClick={() => onAction('logs')}
            className="flex items-center justify-center gap-2 px-4 py-3 border border-subtle bg-surface text-text-primary rounded-xl font-bold hover:bg-muted transition-all text-sm"
          >
            <ExternalLink size={16} />
            External Logs
          </button>
        </div>
      </section>

      {/* Sync Performance */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History size={18} className="text-text-muted" />
            <Typography variant="h3" weight="bold" noMargin className="text-sm">
              Recent Sync Runs
            </Typography>
          </div>
          <button className="text-xs text-primary font-bold hover:underline flex items-center">
            View All <ChevronRight size={14} />
          </button>
        </div>
        <div className="border border-subtle rounded-xl overflow-hidden">
          <OperationalTable 
            columns={syncColumns} 
            data={syncHistory} 
            isDense 
          />
        </div>
      </section>

      {/* Webhook Stream */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-text-muted" />
            <Typography variant="h3" weight="bold" noMargin className="text-sm">
              Live Webhook Feed
            </Typography>
          </div>
          <button className="text-xs text-primary font-bold hover:underline flex items-center">
            Stream <ChevronRight size={14} />
          </button>
        </div>
        <div className="border border-subtle rounded-xl overflow-hidden">
          <OperationalTable 
            columns={webhookColumns} 
            data={webhookActivity} 
            isDense 
          />
        </div>
      </section>

      {/* Backend Dependencies */}
      <section className="p-4 bg-muted/50 rounded-2xl border border-subtle">
        <Typography variant="caption" weight="bold" className="text-text-muted uppercase tracking-wider mb-2 block">
          Source Connection Details
        </Typography>
        <div className="flex items-center gap-4">
          <div className="flex-1">
             <div className="flex items-center gap-2 mb-1">
               <Database size={14} className="text-text-muted" />
               <Typography variant="caption" weight="bold">API Endpoint</Typography>
             </div>
             <Typography variant="caption" className="font-mono bg-surface p-1 rounded border border-subtle block overflow-hidden text-ellipsis">
               {connector.endpoint || 'https://api.provider.com/v3'}
             </Typography>
          </div>
          <ArrowRight size={16} className="text-text-muted" />
          <div className="flex-1 text-right">
             <Typography variant="caption" weight="bold" className="block mb-1">Local Sink</Typography>
             <Badge variant="info" size="sm">INGESTION_V4</Badge>
          </div>
        </div>
      </section>
    </div>
  );
};
