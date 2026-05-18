export enum AlertSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export enum AlertStatus {
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  ACKNOWLEDGED = 'ACKNOWLEDGED'
}

export interface AlertRule {
  id: string;
  name: string;
  signalSource: 'rum' | 'api' | 'failure' | 'journey' | 'synthetic';
  condition: {
    metric: string;
    operator: '>' | '<' | '==';
    threshold: number;
    windowMinutes: number;
  };
  severity: AlertSeverity;
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  timestamp: string;
  message: string;
  siteId: string;
  evidence?: any;
}

export enum IncidentStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  MONITORING = 'MONITORING',
  RESOLVED = 'RESOLVED'
}

export interface Incident {
  id: string;
  title: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  siteId: string;
  createdAt: string;
  updatedAt: string;
  linkedAlertIds: string[];
  evidenceReferences: string[];
  impact?: string;
  owner?: string;
}
