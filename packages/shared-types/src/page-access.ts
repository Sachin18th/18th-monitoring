export type ProjectPageKey =
  | 'overview'
  | 'observability/alerts'
  | 'observability/incidents'
  | 'performance'
  | 'rum'
  | 'observability/backend'
  | 'observability/failures'
  | 'observability/journeys'
  | 'observability/synthetic'
  | 'customers'
  | 'orders'
  | 'integrations'
  | 'alerts'
  | 'management/ingestion'
  | 'management/pipeline'
  | 'management/kpi'
  | 'management/monitoring'
  | 'management/audit'
  | 'settings'
  | 'management/users';

export type ProjectPageGroup =
  | 'Command Center'
  | 'Operational Surface'
  | 'System'
  | 'Data Platform'
  | 'Governance';

export interface ProjectPageAccessOption {
  key: ProjectPageKey;
  label: string;
  group: ProjectPageGroup;
  path: string;
  superAdminOnly?: boolean;
}

export const PROJECT_PAGE_ACCESS_OPTIONS: ProjectPageAccessOption[] = [
  { key: 'overview', label: 'Overview', group: 'Command Center', path: '/overview' },
  { key: 'observability/alerts', label: 'Alert Center', group: 'Command Center', path: '/observability/alerts' },
  { key: 'observability/incidents', label: 'Incident Center', group: 'Command Center', path: '/observability/incidents' },
  { key: 'performance', label: 'Performance', group: 'Operational Surface', path: '/performance' },
  { key: 'rum', label: 'Frontend RUM', group: 'Operational Surface', path: '/rum' },
  { key: 'observability/backend', label: 'Backend API', group: 'Operational Surface', path: '/observability/backend' },
  { key: 'observability/failures', label: 'Failure Intel', group: 'Operational Surface', path: '/observability/failures' },
  { key: 'observability/journeys', label: 'Journey Intel', group: 'Operational Surface', path: '/observability/journeys' },
  { key: 'observability/synthetic', label: 'Synthetic', group: 'Operational Surface', path: '/observability/synthetic' },
  { key: 'customers', label: 'Customers', group: 'Operational Surface', path: '/customers' },
  { key: 'orders', label: 'Orders', group: 'Operational Surface', path: '/orders' },
  { key: 'integrations', label: 'Integrations', group: 'System', path: '/integrations' },
  { key: 'alerts', label: 'Alerts', group: 'System', path: '/alerts' },
  { key: 'management/ingestion', label: 'Ingestion', group: 'Data Platform', path: '/management/ingestion' },
  { key: 'management/pipeline', label: 'Pipeline', group: 'Data Platform', path: '/management/pipeline' },
  { key: 'management/kpi', label: 'KPI Engine', group: 'Data Platform', path: '/management/kpi' },
  { key: 'management/monitoring', label: 'Monitoring', group: 'Data Platform', path: '/management/monitoring' },
  { key: 'management/audit', label: 'Audit & Activity', group: 'Governance', path: '/management/audit' },
  { key: 'settings', label: 'Configuration', group: 'Governance', path: '/settings', superAdminOnly: true },
  { key: 'management/users', label: 'Administration', group: 'Governance', path: '/management/users', superAdminOnly: true }
];

export const PROJECT_PAGE_KEYS = PROJECT_PAGE_ACCESS_OPTIONS.map((option) => option.key) as ProjectPageKey[];

export const PROJECT_PAGE_KEY_LOOKUP = Object.fromEntries(
  PROJECT_PAGE_ACCESS_OPTIONS.map((option) => [option.key, option])
) as Record<ProjectPageKey, ProjectPageAccessOption>;

export const PROJECT_PAGE_LABELS = Object.fromEntries(
  PROJECT_PAGE_ACCESS_OPTIONS.map((option) => [option.key, option.label])
) as Record<ProjectPageKey, string>;
