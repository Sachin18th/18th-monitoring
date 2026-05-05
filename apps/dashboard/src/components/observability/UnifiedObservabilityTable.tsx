import React, { useState } from 'react';
import { Card, Typography, Badge, OperationalTable, Column } from '@kpi-platform/ui';
import { 
  AlertCircle, 
  History, 
  Activity, 
  Search, 
  Filter, 
  ChevronRight,
  User,
  Shield,
  Clock,
  Zap
} from 'lucide-react';

export interface UnifiedObservabilityTableProps {
  alerts: any[];
  audit: any[];
  activity: any[];
  onRowClick: (type: 'alert' | 'audit' | 'activity', item: any) => void;
  loading?: boolean;
}

export const UnifiedObservabilityTable: React.FC<UnifiedObservabilityTableProps> = ({
  alerts,
  audit,
  activity,
  onRowClick,
  loading
}) => {
  const [activeTab, setActiveTab] = useState<'alerts' | 'audit' | 'activity'>('alerts');

  const alertColumns: Column<any>[] = [
    { 
      key: 'severity', 
      header: 'Severity', 
      render: (val) => (
        <Badge variant={val === 'critical' ? 'error' : 'warning'} size="sm" dot>
          {val.toUpperCase()}
        </Badge>
      )
    },
    { 
      key: 'module', 
      header: 'Module', 
      render: (val) => (
        <div className="flex items-center gap-2">
           <Zap size={14} className="text-text-muted" />
           <Typography variant="body" weight="bold" className="text-sm">{val}</Typography>
        </div>
      )
    },
    { key: 'message', header: 'Incident Description', flex: 1 },
    { 
      key: 'status', 
      header: 'Lifecycle', 
      render: (val) => (
        <Badge variant={val === 'active' ? 'error' : 'default'} size="sm">{val.toUpperCase()}</Badge>
      )
    },
    { key: 'triggeredAt', header: 'Time', align: 'right' },
    { key: 'actions', header: '', align: 'right', render: () => <ChevronRight size={14} className="text-text-muted" /> }
  ];

  const auditColumns: Column<any>[] = [
    { 
      key: 'actor', 
      header: 'Actor', 
      render: (val) => (
        <div className="flex items-center gap-2">
           <User size={14} className="text-text-muted" />
           <Typography variant="body" weight="bold" className="text-sm">{val}</Typography>
        </div>
      )
    },
    { key: 'action', header: 'Action', render: (val) => <span className="font-bold">{val}</span> },
    { key: 'entity', header: 'Target Entity' },
    { key: 'value', header: 'Transformation', flex: 1, render: (val) => <span className="font-mono text-xs text-text-muted">{val}</span> },
    { key: 'timestamp', header: 'Logged At', align: 'right' },
    { key: 'actions', header: '', align: 'right', render: () => <ChevronRight size={14} className="text-text-muted" /> }
  ];

  const activityColumns: Column<any>[] = [
    { 
      key: 'status', 
      header: 'Status', 
      render: (val) => (
        <Badge variant={val === 'processing' ? 'info' : 'success'} size="sm" dot>
          {val.toUpperCase()}
        </Badge>
      )
    },
    { key: 'type', header: 'Event', render: (val) => <span className="font-bold">{val}</span> },
    { key: 'entity', header: 'Entity' },
    { key: 'description', header: 'Context', flex: 1 },
    { key: 'timestamp', header: 'Time', align: 'right' },
    { key: 'actions', header: '', align: 'right', render: () => <ChevronRight size={14} className="text-text-muted" /> }
  ];

  const getData = () => {
    if (activeTab === 'alerts') return alerts;
    if (activeTab === 'audit') return audit;
    return activity;
  };

  const getColumns = () => {
    if (activeTab === 'alerts') return alertColumns;
    if (activeTab === 'audit') return auditColumns;
    return activityColumns;
  };

  return (
    <Card className="p-0 border-subtle overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center p-4 gap-4 bg-muted/20 border-b border-subtle">
         <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-subtle">
            <button 
              onClick={() => setActiveTab('alerts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'alerts' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:bg-muted'}`}
            >
               <AlertCircle size={16} /> 
               Alerts 
               {alerts.length > 0 && <span className="bg-white/20 px-1.5 rounded text-[10px]">{alerts.length}</span>}
            </button>
            <button 
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'audit' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:bg-muted'}`}
            >
               <Shield size={16} /> Audit Logs
            </button>
            <button 
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'activity' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:bg-muted'}`}
            >
               <Activity size={16} /> Activity
            </button>
         </div>

         <div className="flex items-center gap-2">
            <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
               <input 
                 type="text" 
                 placeholder={`Search ${activeTab}...`} 
                 className="bg-surface border border-subtle rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-primary w-full md:w-56 transition-all"
               />
            </div>
            <button className="p-2 rounded-lg border border-subtle bg-surface hover:bg-muted transition-all">
               <Filter size={14} className="text-text-muted" />
            </button>
         </div>
      </div>

      <OperationalTable 
        columns={getColumns()} 
        data={getData()} 
        isLoading={loading}
        onRowClick={(row) => onRowClick(activeTab.slice(0, -1) as any, row)}
        getRowKey={(item) => item.alertId || item.id}
      />
    </Card>
  );
};
