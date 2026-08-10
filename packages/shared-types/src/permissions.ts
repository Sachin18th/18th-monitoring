import type { ProjectPageKey } from './page-access';
import { resolveProjectPageKeyFromPath } from './page-access';

export type AppRole = 'super_admin' | 'admin' | 'ops_lead' | 'analyst';

export type LegacyRole =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'PROJECT_ADMIN'
  | 'OPERATOR'
  | 'VIEWER'
  | 'CUSTOMER';

export type AnyRole = AppRole | LegacyRole | string | null | undefined;

export type SidebarRouteKey = ProjectPageKey | 'question';

export type RoleAccess = {
  sidebar: SidebarRouteKey[];
  canWrite: boolean;
  canDelete: boolean;
  canConfigure: boolean;
  canManageUsers: boolean;
  canManageTenants: boolean;
  canManageConnectors: boolean;
  canRetriggerSync: boolean;
  canEscalate: boolean;
};

const ROLE_ALIASES: Record<string, AppRole> = {
  super_admin: 'super_admin',
  SUPER_ADMIN: 'super_admin',
  tenant_admin: 'admin',
  TENANT_ADMIN: 'admin',
  project_admin: 'admin',
  PROJECT_ADMIN: 'admin',
  admin: 'admin',
  ADMIN: 'admin',
  ops_lead: 'ops_lead',
  OPS_LEAD: 'ops_lead',
  operator: 'ops_lead',
  OPERATOR: 'ops_lead',
  analyst: 'analyst',
  ANALYST: 'analyst',
  viewer: 'analyst',
  VIEWER: 'analyst',
  customer: 'analyst',
  CUSTOMER: 'analyst',
};

export const ROLE_ACCESS: Record<AppRole, RoleAccess> = {
  super_admin: {
    sidebar: [
      'overview',
      'observability/alerts',
      'observability/incidents',
      'performance',
      'rum',
      'observability/backend',
      'observability/journeys',
      'observability/customer-360',
      'observability/campaigns',
      'observability/customer-groups',
      'observability/revenue',
      'observability/product-analytics',
      'observability/synthetic',
      'customers',
      'orders',
      'integrations',
      'alerts',
      'question',
      'management/ingestion',
      'management/pipeline',
      'management/kpi',
      'management/monitoring',
      'management/audit',
      'settings',
      'management/users',
    ],
    canWrite: true,
    canDelete: true,
    canConfigure: true,
    canManageUsers: true,
    canManageTenants: true,
    canManageConnectors: true,
    canRetriggerSync: true,
    canEscalate: true,
  },
  admin: {
    sidebar: [
      'overview',
      'observability/alerts',
      'observability/incidents',
      'performance',
      'rum',
      'observability/backend',
      'observability/journeys',
      'observability/customer-360',
      'observability/campaigns',
      'observability/customer-groups',
      'observability/revenue',
      'observability/product-analytics',
      'observability/synthetic',
      'customers',
      'orders',
      'integrations',
      'alerts',
      'question',
      'management/ingestion',
      'management/pipeline',
      'management/kpi',
      'management/monitoring',
      'management/audit',
      'settings',
      'management/users',
    ],
    canWrite: true,
    canDelete: true,
    canConfigure: true,
    canManageUsers: true,
    canManageTenants: false,
    canManageConnectors: true,
    canRetriggerSync: true,
    canEscalate: true,
  },
  ops_lead: {
    sidebar: [
      'overview',
      'observability/alerts',
      'observability/incidents',
      'performance',
      'rum',
      'observability/backend',
      'observability/journeys',
      'observability/customer-360',
      'observability/campaigns',
      'observability/customer-groups',
      'observability/revenue',
      'observability/product-analytics',
      'customers',
      'orders',
      'alerts',
      'management/monitoring',
    ],
    canWrite: false,
    canDelete: false,
    canConfigure: false,
    canManageUsers: false,
    canManageTenants: false,
    canManageConnectors: false,
    canRetriggerSync: true,
    canEscalate: true,
  },
  analyst: {
    sidebar: [
      'overview',
      'performance',
      'rum',
      'observability/journeys',
      'observability/customer-360',
      'observability/campaigns',
      'observability/customer-groups',
      'observability/revenue',
      'observability/product-analytics',
      'customers',
      'orders',
      'question',
      'management/kpi',
    ],
    canWrite: false,
    canDelete: false,
    canConfigure: false,
    canManageUsers: false,
    canManageTenants: false,
    canManageConnectors: false,
    canRetriggerSync: false,
    canEscalate: false,
  },
};

export const normalizeRole = (role: AnyRole): AppRole | null => {
  if (!role) {
    return null;
  }

  return ROLE_ALIASES[String(role)] || null;
};

export const canAccessRoute = (role: AnyRole, routeKey: SidebarRouteKey) => {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return false;
  }

  return ROLE_ACCESS[normalizedRole]?.sidebar.includes(routeKey) ?? false;
};

/**
 * Decide whether a role may view a project route, given its URL.
 *
 * This is the single decision point used by both the server-side middleware and
 * the client-side route guard. It maps the URL to a page key via
 * {@link resolveProjectPageKeyFromPath} and defers the actual allow/deny to
 * {@link canAccessRoute}, which reads {@link ROLE_ACCESS}. There is no separate
 * role→route table anywhere else.
 *
 * Because `super_admin` and `admin` carry every page key in their sidebar set,
 * they pass through all routes. `ops_lead` and `analyst` only pass routes inside
 * their permission set.
 *
 * The bare `/management` hub (and any unrecognised sub-route) resolves to a
 * `null` page key and is treated as governance-only (super_admin / admin).
 */
export const canAccessProjectPath = (role: AnyRole, pathname: string): boolean => {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return false;
  }

  const pageKey = resolveProjectPageKeyFromPath(pathname);

  if (!pageKey) {
    return normalizedRole === 'super_admin' || normalizedRole === 'admin';
  }

  return canAccessRoute(normalizedRole, pageKey);
};

export const hasPermission = (role: AnyRole, permissionKey: keyof Omit<RoleAccess, 'sidebar'>) => {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return false;
  }

  return Boolean(ROLE_ACCESS[normalizedRole]?.[permissionKey]);
};

export const getDefaultProjectPathForRole = (role: AnyRole) => {
  const normalizedRole = normalizeRole(role);

  switch (normalizedRole) {
    case 'ops_lead':
      return '/orders';
    case 'analyst':
      return '/performance';
    case 'super_admin':
    case 'admin':
    default:
      return '/overview';
  }
};
