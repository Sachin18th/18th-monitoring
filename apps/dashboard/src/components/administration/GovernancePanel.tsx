import React from 'react';
import { Card, Typography } from '@kpi-platform/ui';
import { 
  Database, 
  ShieldCheck, 
  Users, 
  Box, 
  KeyRound, 
  Settings,
  ArrowRight
} from 'lucide-react';

export interface GovernanceLink {
  id: string;
  label: string;
  icon: any;
  description: string;
}

export interface GovernancePanelProps {
  activeTab: string;
  onTabChange: (id: string) => void;
}

export const GovernancePanel: React.FC<GovernancePanelProps> = ({ activeTab, onTabChange }) => {
  const sections: GovernanceLink[] = [
    { id: 'integrations', label: 'Integrations & Connectors', icon: Database, description: 'Manage ERP, CRM, and API connections.' },
    { id: 'rbac', label: 'Identity & Access (RBAC)', icon: Users, description: 'User roles, permissions and audits.' },
    { id: 'projects', label: 'Project Environments', icon: Box, description: 'Manage Prod, Staging and QA setups.' },
    { id: 'alerts', label: 'Alerting Rules', icon: ShieldCheck, description: 'Thresholds, routing and SLAs.' },
    { id: 'api', label: 'API & Security Keys', icon: KeyRound, description: 'Access keys and security policies.' },
    { id: 'preferences', label: 'System Preferences', icon: Settings, description: 'Global defaults and visual branding.' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {sections.map((section) => (
        <Card 
          key={section.id}
          onClick={() => onTabChange(section.id)}
          className={`p-6 border-subtle transition-all cursor-pointer group hover:shadow-lg ${
            activeTab === section.id ? 'border-primary ring-2 ring-primary/10 bg-primary/5' : 'bg-surface hover:border-primary/30'
          }`}
        >
           <div className="flex items-start justify-between">
              <div className={`p-3 rounded-xl transition-all ${
                activeTab === section.id ? 'bg-primary text-white' : 'bg-muted text-text-muted group-hover:bg-primary/10 group-hover:text-primary'
              }`}>
                 <section.icon size={20} />
              </div>
              <ArrowRight size={14} className={`transition-all ${activeTab === section.id ? 'text-primary' : 'text-text-muted opacity-0 group-hover:opacity-100'}`} />
           </div>
           <div className="mt-6">
              <Typography variant="body" weight="bold" className={`text-sm ${activeTab === section.id ? 'text-primary' : ''}`}>
                 {section.label}
              </Typography>
              <Typography variant="micro" className="text-text-muted mt-1 block leading-relaxed">
                 {section.description}
              </Typography>
           </div>
        </Card>
      ))}
    </div>
  );
};
