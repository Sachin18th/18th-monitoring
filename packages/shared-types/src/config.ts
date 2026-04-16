// 1. KPI Definition Config 
export interface KPIConfig {
  metricKey: string;
  type: 'value' | 'count';
  aggregation: string;
  thresholds?: {
    warning: number;
    critical: number;
    operator: 'gt' | 'lt';
  };
}

// 2. Widget Definition Config
export interface WidgetConfig {
  widgetId: string;
  type: 'line_chart' | 'stat_card' | 'table';
  title: string;
  metricKeys: string[];
  options?: {
    refreshIntervalMs?: number;
    colorScheme?: string;
    layout?: { w: number, h: number };
  };
}

// 3. Connector Definition Config
export interface ConnectorConfig {
  connectorId: string;
  type: 'magento2' | 'sap' | 'custom_webhook';
  status: 'active' | 'paused';
  authType: 'oauth2' | 'apiKey';
  credentialsVaultKey: string; 
  syncScheduleConfig: string; // Cron syntax
}

// Top-Level Project Config payload
export interface ProjectConfigPayload {
  tracking: Record<string, any>;
  sampling: { rate: number };
  metrics: KPIConfig[];
  widgets: WidgetConfig[];
  connectors: ConnectorConfig[];
  orderSourceRules: any[]; 
}
