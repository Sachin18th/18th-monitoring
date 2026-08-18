'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useConnectorPlatform } from '../../context/ConnectorPlatformContext';
import { NavGroup, formatBreadcrumbLabel, useTheme } from '@kpi-platform/ui';
import { PROJECT_PAGE_ACCESS_OPTIONS, ROLE_ACCESS, canAccessRoute, getDefaultProjectPathForRole, normalizeRole } from '@kpi-platform/shared-types';
import type { ConnectedStore } from '../../lib/ecommerceConnectors';
import {
  LayoutDashboard,
  Activity,
  Users,
  Package,
  Link2,
  Settings,
  Bell,
  UserCircle,
  ShieldCheck,
  ShieldAlert,
  BarChart3,
  Monitor,
  Server,
  Flame,
  Map,
  UserSearch,
  Megaphone,
  UsersRound,
  TrendingUp,
  AlertCircle,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Search,
  Home,
  Clock3,
  Sun,
  Moon
} from 'lucide-react';

const SIDEBAR_WIDTH = 200;
const TOPBAR_HEIGHT = 46;
const PROJECT_PERMISSION_STORAGE_PREFIX = 'project-page-permissions';

const buildPermissionCacheKey = (userId: string, projectId: string) =>
  `${PROJECT_PERMISSION_STORAGE_PREFIX}:${userId}:${projectId}`;

const normalizeAllowedPageKeys = (data: any): string[] => {
  const pageKeys = Array.isArray(data?.allowedPageKeys)
    ? data.allowedPageKeys
    : Array.isArray(data?.data?.allowedPageKeys)
      ? data.data.allowedPageKeys
      : Array.isArray(data?.pageKeys)
        ? data.pageKeys
        : Array.isArray(data?.data?.pageKeys)
          ? data.data.pageKeys
          : [];

  return pageKeys.map((value: any) => String(value));
};

const readCachedAllowedPageKeys = (userId: string, projectId: string): string[] | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(buildPermissionCacheKey(userId, projectId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.allowedPageKeys)
      ? parsed.allowedPageKeys.map((value: any) => String(value))
      : null;
  } catch (error) {
    console.warn('[DashboardShell] Failed to read cached page permissions:', error);
    return null;
  }
};

const cacheAllowedPageKeys = (userId: string, projectId: string, allowedPageKeys: string[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cacheKey = buildPermissionCacheKey(userId, projectId);
    const payload = JSON.stringify({
      allowedPageKeys,
      updatedAt: Date.now(),
    });

    window.localStorage.setItem(cacheKey, payload);
    window.dispatchEvent(
      new CustomEvent('kpi:project-permissions-updated', {
        detail: {
          cacheKey,
          userId,
          projectId,
          allowedPageKeys,
        },
      }),
    );
  } catch (error) {
    console.warn('[DashboardShell] Failed to cache page permissions:', error);
  }
};

export const DashboardShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname() || '';
  const params = useParams();
  const router = useRouter();
  const { user, logout, isLoading, apiFetch, token, setProject } = useAuth();
  const { healthLevel, healthLabel, connectorsLoaded, selectedStoreLabel, storeOptions, setActiveStoreId, activeStoreId, connectedStores } = useConnectorPlatform();
  const { theme, toggleTheme, mounted } = useTheme();
  const normalizedRole = useMemo(() => normalizeRole(user?.role), [user?.role]);

  const projectId = (params.projectId as string) || '';
  const isProjectRoute = pathname.startsWith('/project/') && !!projectId;
  const isDark = mounted ? theme === 'dark' : false;

  const [availableProjects, setAvailableProjects] = React.useState<any[]>([]);
  const [hoveredHref, setHoveredHref] = React.useState<string | null>(null);
  const [showUserDropdown, setShowUserDropdown] = React.useState(false);
  const [showStoreDropdown, setShowStoreDropdown] = React.useState(false);
  const [allowedPageKeys, setAllowedPageKeys] = React.useState<string[] | null>(null);
  const [hasResolvedPagePermissions, setHasResolvedPagePermissions] = React.useState(false);
  type HeaderStore = ConnectedStore & {
    lastResyncAt?: string;
  };

  const selectedStore = useMemo(
    () => (connectedStores as HeaderStore[]).find((store) => store.connectorId === activeStoreId) || null,
    [activeStoreId, connectedStores],
  );

  useEffect(() => {
    if (!isLoading && user && isProjectRoute) {
      setProject(projectId);

      const isPrivilegedRole = normalizedRole === 'super_admin' || normalizedRole === 'admin';
      const isAssigned = user.assignedProjects?.includes(projectId);

      if (!isPrivilegedRole && !isAssigned) {
        console.warn(`[RBAC] Unauthorized access attempt to project ${projectId} by user ${user.id}`);
        router.push('/unauthorized');
      }
    }
  }, [user, projectId, isLoading, router, setProject, isProjectRoute, normalizedRole]);

  useEffect(() => {
    if (!token || !user || !isProjectRoute) return;

    // Only call the global projects endpoint for admin users.
    // Non-admin roles (Project Admin, Ops Lead, Operator, Viewer) may not have
    // permission to list all projects and would receive a 403. Use the
    // user's assignedProjects to populate the selector instead.
    const isPrivilegedRole = normalizedRole === 'super_admin' || normalizedRole === 'admin';

    if (isPrivilegedRole) {
      apiFetch('/api/v1/projects')
        .then((data) => {
          if (Array.isArray(data)) {
            setAvailableProjects(data);
          }
        })
        .catch((err) => console.error('[DashboardShell] Failed to load projects:', err));
    } else {
      // Build minimal project objects from assigned project IDs so non-admin
      // users can still switch between their projects without hitting a
      // privileged API.
      const assigned = user.assignedProjects || [];
      const list = assigned.map((id: string) => ({ id, name: id.toUpperCase() }));
      setAvailableProjects(list);
    }
  }, [token, user, apiFetch, isProjectRoute, normalizedRole]);

  useEffect(() => {
    if (!token || !projectId || !isProjectRoute || !user) {
      setAllowedPageKeys(null);
      setHasResolvedPagePermissions(false);
      return;
    }

    if (normalizedRole === 'super_admin') {
      const allPageKeys = PROJECT_PAGE_ACCESS_OPTIONS.map((option) => option.key);
      setAllowedPageKeys(allPageKeys);
      setHasResolvedPagePermissions(true);
      cacheAllowedPageKeys(user.id, projectId, allPageKeys);
      return;
    }

    const cachedPageKeys = readCachedAllowedPageKeys(user.id, projectId);
    if (cachedPageKeys) {
      setAllowedPageKeys(cachedPageKeys);
      setHasResolvedPagePermissions(true);
    } else {
      setAllowedPageKeys(null);
      setHasResolvedPagePermissions(false);
    }

    apiFetch(`/api/v1/user/permissions?projectId=${projectId}`)
      .then((data) => {
        const nextAllowedPageKeys = normalizeAllowedPageKeys(data);
        setAllowedPageKeys(nextAllowedPageKeys);
        setHasResolvedPagePermissions(true);
        cacheAllowedPageKeys(user.id, projectId, nextAllowedPageKeys);
      })
      .catch((err) => {
        console.error('[DashboardShell] Failed to load page permissions:', err);
        setAllowedPageKeys((current) => current ?? []);
        setHasResolvedPagePermissions(true);
      });
  }, [token, projectId, apiFetch, isProjectRoute, user, normalizedRole]);

  useEffect(() => {
    if (!projectId || !user?.id || typeof window === 'undefined') {
      return;
    }

    const cacheKey = buildPermissionCacheKey(user.id, projectId);

    const syncFromCache = () => {
      const cachedPageKeys = readCachedAllowedPageKeys(user.id, projectId);
      if (cachedPageKeys) {
        setAllowedPageKeys(cachedPageKeys);
        setHasResolvedPagePermissions(true);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === cacheKey) {
        syncFromCache();
      }
    };

    const handlePermissionUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ cacheKey?: string }>;
      if (!customEvent.detail?.cacheKey || customEvent.detail.cacheKey === cacheKey) {
        syncFromCache();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('kpi:project-permissions-updated', handlePermissionUpdate as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('kpi:project-permissions-updated', handlePermissionUpdate as EventListener);
    };
  }, [projectId, user?.id]);

  const navGroups = useMemo((): NavGroup[] => {
    if (!isProjectRoute) return [];

    const prefix = `/project/${projectId}`;
    const roleSidebarKeys = normalizedRole ? new Set(ROLE_ACCESS[normalizedRole].sidebar) : new Set<string>();
    const isVisible = (pageKey: string) => canAccessRoute(normalizedRole, pageKey as any) || roleSidebarKeys.has(pageKey as any);

    const groups: any[] = [
      {
        name: 'Command Center',
        items: [
          { label: 'Overview', href: `${prefix}/overview`, icon: LayoutDashboard, pageKey: 'overview' },
          { label: 'Alert Center', href: `${prefix}/observability/alerts`, icon: Bell, pageKey: 'observability/alerts' },
          // { label: 'Incident Center', href: `${prefix}/observability/incidents`, icon: Flame, pageKey: 'observability/incidents' }
        ]
      },
      {
        name: 'Operational Surface',
        items: [
          // { label: 'Performance', href: `${prefix}/performance`, icon: Activity, pageKey: 'performance' },
          { label: 'Frontend RUM', href: `${prefix}/rum`, icon: Monitor, pageKey: 'rum' },
          { label: 'Backend API', href: `${prefix}/observability/backend`, icon: Server, pageKey: 'observability/backend' },
          { label: 'Journey Intel', href: `${prefix}/observability/journeys`, icon: Map, pageKey: 'observability/journeys' },
          // Customer 360 is merged into the unified Customers page (/customers).
          { label: 'Campaigns', href: `${prefix}/observability/campaigns`, icon: Megaphone, pageKey: 'observability/campaigns' },
          { label: 'Customer Groups', href: `${prefix}/observability/customer-groups`, icon: UsersRound, pageKey: 'observability/customer-groups' },
          { label: 'Revenue', href: `${prefix}/observability/revenue`, icon: TrendingUp, pageKey: 'observability/revenue' },
          { label: 'Product Analytics', href: `${prefix}/observability/product-analytics`, icon: Package, pageKey: 'observability/product-analytics' },
          // { label: 'Synthetic', href: `${prefix}/observability/synthetic`, icon: Activity, pageKey: 'observability/synthetic' },
          { label: 'Customers', href: `${prefix}/customers`, icon: Users, pageKey: 'customers' },
          { label: 'Orders', href: `${prefix}/orders`, icon: Package, pageKey: 'orders' }
        ]
      },
      {
        name: 'System',
        items: [
          { label: 'Integrations', href: `${prefix}/integrations`, icon: Link2, pageKey: 'integrations' }
        ]
      }
    ];

    groups.push(
      {
        name: 'Data Platform',
        items: [
          { label: 'KPI Engine', href: `${prefix}/management/kpi`, icon: BarChart3, pageKey: 'management/kpi' },
          { label: 'Monitoring', href: `${prefix}/management/monitoring`, icon: ShieldAlert, pageKey: 'management/monitoring' }
        ]
      },
      {
        name: 'Governance',
        items: [
          { label: 'Audit & Activity', href: `${prefix}/management/audit`, icon: ShieldCheck, pageKey: 'management/audit' },
          // { label: 'Configuration', href: `${prefix}/settings`, icon: Settings, pageKey: 'settings' },
          { label: 'Administration', href: `${prefix}/management/users`, icon: UserCircle, pageKey: 'management/users' }
        ]
      }
    );

    return groups.map((group) => ({
      ...group,
      items: group.items
        .map((item) => ({
          ...item,
          icon: item.icon || AlertCircle
        }))
        .filter((item: any) => isVisible(item.pageKey))
    }));
  }, [projectId, normalizedRole, isProjectRoute]);

  const breadcrumbs = useMemo(() => {
    if (!isProjectRoute) return [];

    const segments = pathname.split('/').filter(Boolean);
    const items: { label: string; href: string; isLast: boolean }[] = [];
    let currentPath = '';

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      let label = formatBreadcrumbLabel(segment);
      if (segment === projectId) {
        label = `Project ${segment.toUpperCase()}`;
      }
      items.push({
        label,
        href: currentPath,
        isLast: index === segments.length - 1
      });
    });

    return items;
  }, [pathname, projectId, isProjectRoute]);

  const formatSyncTime = useCallback((value?: string | null) => {
    if (!value) return '—';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
  }, []);

  const selectedStoreSyncTime = formatSyncTime(
    selectedStore?.lastResyncAt || selectedStore?.lastSuccessfulSync || null,
  );

  const isPublicPage = pathname === '/login' || pathname === '/unauthorized';
  if (isPublicPage || isLoading) return <>{children}</>;
  if (!isProjectRoute) return <>{children}</>;

  const projects =
    availableProjects.length > 0
      ? availableProjects.map((p) => ({ id: p.id, name: p.name }))
      : user?.assignedProjects?.map((id) => ({ id, name: id.toUpperCase() })) || [];
  const selectedProjectName = projects.find((project) => project.id === projectId)?.name || '18th Digitech Creation';
  const currentPage = breadcrumbs[breadcrumbs.length - 1]?.label || 'Dashboard';
  const sectionLabel = pathname.includes('/management/')
    ? 'Management'
    : pathname.includes('/observability/')
      ? 'Observability'
      : 'Project';
  const userBadge = user?.name?.trim()?.charAt(0)?.toUpperCase() || user?.id?.toString()?.charAt(0)?.toUpperCase() || '1';
  const shellColors = {
    appBg: 'var(--bg-page)',
    appText: 'var(--text-primary)',
    sidebarBg: 'var(--bg-sidebar)',
    sidebarBorder: 'var(--border-sidebar)',
    brandBorder: 'var(--border-sidebar)',
    sectionLabel: 'var(--text-label)',
    navText: 'var(--text-secondary)',
    navHover: 'var(--bg-input)',
    navActiveBg: 'var(--bg-badge-active)',
    navActiveText: 'var(--text-primary)',
    navbarBg: 'var(--bg-nav)',
    navbarBorder: 'var(--border-nav)',
    borderSecondary: 'var(--border-secondary, var(--border-input))',
    borderTertiary: 'var(--border-tertiary, var(--border-card))',
    pillBorder: 'var(--border-card)',
    pillBg: 'transparent',
    pillText: 'var(--text-primary)',
    mutedText: 'var(--text-muted)',
    iconMuted: 'var(--text-secondary)',
    bgSecondary: 'var(--bg-secondary, rgba(148, 163, 184, 0.14))',
    bgInfo: 'var(--bg-info, rgba(59, 130, 246, 0.15))',
    textInfo: 'var(--text-info, #2563eb)',
    warningBg: 'var(--warning-bg, rgba(245, 158, 11, 0.18))',
    warningText: 'var(--warning-text, #92400e)',
    selectorBg: 'var(--bg-input)',
    selectorBorder: 'var(--border-secondary, var(--border-input))',
    selectorText: 'var(--text-primary)',
    selectorOptionBg: 'var(--bg-sidebar)',
    selectorOptionText: 'var(--text-primary)',
    selectorDisabledBg: 'var(--bg-page)',
    searchBg: 'var(--bg-input)',
    searchBorder: 'var(--border-input)',
    avatarBg: 'var(--primary)'
  };

  const healthTone =
    healthLevel === 'critical'
      ? { dot: '#ef4444', text: '#f87171', bg: 'rgba(239, 68, 68, 0.16)' }
      : healthLevel === 'warning'
        ? { dot: '#f59e0b', text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)' }
        : { dot: '#22c55e', text: '#22c55e', bg: 'rgba(34, 197, 94, 0.16)' };
  const isStoreSelectorDisabled = storeOptions.length === 0;
  const healthBadgeLabel = String(healthLabel || 'Healthy').toUpperCase();

  return (
    <div style={{ minHeight: '100vh', background: shellColors.appBg, color: shellColors.appText }}>
      <style jsx global>{`
        main > div[style*='position: fixed'][style*='bottom: 20px'][style*='border-radius: 999px'] {
          left: 216px !important;
        }

        .project-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          min-height: ${TOPBAR_HEIGHT}px;
          padding: 0 18px;
          overflow: visible;
          white-space: nowrap;
        }

        .project-header-zone {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .project-header-left {
          flex: 0 1 auto;
          min-width: 0;
        }

        .project-header-center {
          flex: 1 1 auto;
          justify-content: center;
          min-width: 0;
        }

        .project-header-right {
          flex: 0 0 auto;
          justify-content: flex-end;
          gap: 16px;
          min-width: 0;
        }

        .project-header-icon-button {
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          border-radius: 6px;
          cursor: pointer;
          flex-shrink: 0;
          transition: background-color 150ms ease, color 150ms ease;
        }

        .project-header-icon-button:hover {
          background: var(--bg-input);
          color: var(--text-primary);
        }

        .project-header-back-button:hover {
          background: var(--bg-input);
        }

        .project-header-project-name {
          display: inline-flex;
          align-items: center;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .project-header-env-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 8px;
          border-radius: 999px;
          border: none;
          background: ${shellColors.warningBg};
          color: ${shellColors.warningText};
          font-size: 11px;
          font-weight: 500;
          flex-shrink: 0;
        }

        .project-header-store-trigger {
          width: 208px;
          max-width: 208px;
          min-width: 208px;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 5px 10px;
          border-radius: 6px;
          border: 1px solid ${shellColors.selectorBorder};
          background: ${shellColors.selectorBg};
          color: ${shellColors.selectorText};
          cursor: pointer;
          flex-shrink: 0;
          transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
        }

        .project-header-store-trigger:hover {
          background: var(--bg-input);
        }

        .project-header-store-trigger:disabled {
          cursor: not-allowed;
          opacity: 0.65;
          background: ${shellColors.selectorDisabledBg};
        }

        .project-header-store-trigger-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 400;
          flex: 1 1 auto;
          text-align: left;
        }

        .project-header-store-menu {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          min-width: 208px;
          z-index: 60;
          overflow: hidden;
          border-radius: 8px;
          border: 1px solid var(--border-secondary, var(--border-input));
          background: var(--bg-sidebar);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .project-header-store-option {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          padding: 8px 12px;
          border: none;
          background: transparent;
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 400;
          cursor: pointer;
          text-align: left;
          transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
        }

        .project-header-store-option:hover {
          background: var(--bg-secondary, rgba(148, 163, 184, 0.14));
        }

        .project-header-store-option[data-active='true'] {
          background: var(--bg-info, rgba(59, 130, 246, 0.15));
          color: var(--text-info, #2563eb);
        }

        .project-header-hide-below-960 {
          display: inline-flex;
        }

        @media (max-width: 959px) {
          .project-header-hide-below-960 {
            display: none !important;
          }

          .project-header-row {
            gap: 12px;
            padding: 0 14px;
          }

          .project-header-store-trigger,
          .project-header-store-menu {
            min-width: 180px;
            width: 180px;
            max-width: 180px;
          }
        }
      `}</style>

      <aside
        style={{
          width: '200px',
          minWidth: '200px',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          background: shellColors.sidebarBg,
          borderRight: `1px solid ${shellColors.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 40,
          paddingBottom: '24px'
        }}
      >
        <div
          onClick={() => router.push('/projects')}
          style={{
            padding: '16px 16px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderBottom: `1px solid ${shellColors.brandBorder}`,
            marginBottom: '8px',
            flexShrink: 0,
            cursor: 'pointer'
          }}
        >
          <img
            src="/logo.svg"
            alt="18th Digitech"
            style={{ height: '24px', width: 'auto', flexShrink: 0, objectFit: 'contain' }}
          />
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
          {navGroups
            .filter((group) => Array.isArray(group.items) && group.items.length > 0)
            .map((group, groupIndex) => (
            <div key={group.name} style={{ overflow: 'visible' }}>
              <p
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: shellColors.sectionLabel,
                  fontWeight: 500,
                  padding: '0 16px',
                  marginTop: groupIndex === 0 ? '8px' : '20px',
                  marginBottom: '4px'
                }}
              >
                {group.name}
              </p>

              {group.items.map((item) => {
                const Icon = item.icon || AlertCircle;
                const isActive = pathname === item.href;
                const isHovered = hoveredHref === item.href;

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(item.href);
                    }}
                    onMouseEnter={() => setHoveredHref(item.href)}
                    onMouseLeave={() => setHoveredHref(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: isActive ? shellColors.navActiveText : shellColors.navText,
                      background: isActive ? shellColors.navActiveBg : isHovered ? shellColors.navHover : 'transparent',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      margin: '0 8px',
                      transition: 'background 0.15s ease, color 0.15s ease',
                      marginBottom: '2px'
                    }}
                  >
                    <Icon style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                    {item.badge ? (
                      <span
                        style={{
                          marginLeft: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '18px',
                          height: '18px',
                          borderRadius: '999px',
                          background: 'rgba(248,113,113,0.12)',
                          color: '#f87171',
                          fontSize: '10px',
                          padding: '0 6px',
                          flexShrink: 0
                        }}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main
        style={{
          marginLeft: '200px',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <nav className="project-header-row" style={{ background: shellColors.navbarBg, borderBottom: `1px solid ${shellColors.navbarBorder}`, position: 'sticky', top: 0, zIndex: 30, flexShrink: 0 }}>
          <div className="project-header-zone project-header-left">
            <button
              type="button"
              className="project-header-icon-button project-header-back-button"
              aria-label="Back to projects"
              title="Back to projects"
              onClick={() => router.push('/projects')}
            >
              <ChevronLeft style={{ width: '16px', height: '16px' }} />
            </button>

            <span className="project-header-project-name" title={selectedProjectName}>{selectedProjectName}</span>

            {/* Hold the badge until connectors have loaded — otherwise the empty-stores
                default flashes HEALTHY before real health (e.g. CRITICAL) resolves. */}
            {connectorsLoaded && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', borderRadius: '999px', background: healthTone.bg, color: healthTone.text, fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }} title={`Store health: ${healthBadgeLabel}`}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: healthTone.dot, flexShrink: 0 }} />
                {healthBadgeLabel}
              </span>
            )}
          </div>

          <div style={{ width: '1px', height: '20px', background: shellColors.borderTertiary, flexShrink: 0 }} />

          <div className="project-header-zone project-header-right">
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="project-header-store-trigger"
                onClick={() => setShowStoreDropdown((current) => !current)}
                disabled={isStoreSelectorDisabled}
                aria-expanded={showStoreDropdown}
                aria-haspopup="menu"
                title={selectedStoreLabel || 'Select store'}
              >
                <span className="project-header-store-trigger-label">{selectedStoreLabel || 'Select store'}</span>
                <ChevronDown
                  style={{
                    width: '14px',
                    height: '14px',
                    color: shellColors.iconMuted,
                    flexShrink: 0,
                    transform: showStoreDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 160ms ease'
                  }}
                />
              </button>

              {showStoreDropdown && !isStoreSelectorDisabled ? (
                <div className="project-header-store-menu" role="menu" aria-label="Store selector">
                  {storeOptions.map((option) => {
                    const isActive = option.id === activeStoreId;

                    return (
                      <button
                        key={option.key}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        data-active={isActive ? 'true' : 'false'}
                        className="project-header-store-option"
                        onClick={() => {
                          setActiveStoreId(option.id);
                          setShowStoreDropdown(false);
                        }}
                      >
                        <span
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span className="project-header-hide-below-960" style={{ fontSize: '10px', color: shellColors.pillText, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1, fontWeight: 400 }}>
                  LAST SYNC
                </span>
                <span style={{ fontSize: '10px', color: shellColors.mutedText, fontWeight: 400, lineHeight: 1, whiteSpace: 'nowrap' }} title={selectedStore?.lastResyncAt || selectedStore?.lastSuccessfulSync || undefined}>
                  {selectedStoreSyncTime}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <span className="project-header-hide-below-960" style={{ fontSize: '10px', color: shellColors.pillText, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1, fontWeight: 400 }}>
                STORE SCOPE
              </span>
              <span title={selectedStoreLabel} style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px', color: shellColors.mutedText, fontWeight: 400, lineHeight: 1 }}>
                {selectedStoreLabel}
              </span>
            </div>

             <button
              type="button"
              className="project-header-icon-button"
              onClick={() => router.push(`/project/${projectId}/integrations`)}
              aria-label="Open integrations"
              title="Open integrations"
            >
              <Link2 style={{ width: '16px', height: '16px' }} />
            </button>

            <button
              type="button"
              className="project-header-icon-button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {isDark ? (
                <Sun style={{ width: '16px', height: '16px' }} />
              ) : (
                <Moon style={{ width: '16px', height: '16px' }} />
              )}
            </button>

            <button
              type="button"
              className="project-header-icon-button"
              onClick={() => router.push(`/project/${projectId}/observability/alerts`)}
              aria-label="Notifications"
              title="Notifications"
              style={{ position: 'relative' }}
            >
              <Bell style={{ width: '16px', height: '16px' }} />
              <span style={{ position: 'absolute', top: '4px', right: '4px', width: '5px', height: '5px', borderRadius: '50%', background: '#ef4444' }} />
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <span
                  style={{
                    width: '21px',
                    height: '21px',
                    borderRadius: '50%',
                    background: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.12)',
                    fontSize: '10px',
                    fontWeight: 600,
                    flexShrink: 0
                  }}
                >
                  {userBadge}
                </span>
                <ChevronDown
                  style={{
                    width: '14px',
                    height: '14px',
                    color: shellColors.iconMuted,
                    flexShrink: 0,
                    transform: showUserDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 160ms ease'
                  }}
                />
              </button>
              {showUserDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: shellColors.sidebarBg,
                  border: `1px solid ${shellColors.borderSecondary}`,
                  borderRadius: '8px',
                  minWidth: '200px',
                  zIndex: 60,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                }}>
                  <div style={{ padding: '12px 14px', borderBottom: `1px solid ${shellColors.borderSecondary}` }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: shellColors.pillText }}>{user?.name || 'User'}</div>
                    <div style={{ fontSize: '11px', color: shellColors.mutedText, marginTop: '2px' }}>{user?.email || 'No email'}</div>
                    <div style={{ fontSize: '10px', color: shellColors.mutedText, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{user?.role || 'VIEWER'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setShowUserDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '13px',
                      transition: 'background 150ms'
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLButtonElement).style.background = 'transparent';
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </nav>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>{children}</div>

      </main>
    </div>
  );
};

// Store Selector Button Component
// const StoreSelectorButton = () => {
//   const { connectorInstanceId, connectorLabel, setConnectorInstanceId } = useConnectorFilter();
//   const { connectedStores } = useConnectorPlatform();
//   const [showDropdown, setShowDropdown] = React.useState(false);

//   const displayLabel = connectorLabel || 'Select Store';

//   const handleStoreChange = (instanceId: string | null) => {
//     setConnectorInstanceId(instanceId);
//     setShowDropdown(false);
//     // Trigger refetch of data when store changes
//     window.dispatchEvent(new CustomEvent('connectorFilterChanged', { detail: { connectorInstanceId: instanceId } }));
//   };

//   return (
//     <div style={{ position: 'relative' }}>
//       <button
//         type="button"
//         onClick={() => setShowDropdown(!showDropdown)}
//         style={{
//           display: 'flex',
//           alignItems: 'center',
//           gap: '8px',
//           padding: '6px 12px',
//           borderRadius: '8px',
//           border: `1px solid var(--border-pill)`,
//           background: 'var(--bg-pill)',
//           fontSize: '12px',
//           color: 'var(--text-pill)',
//           cursor: 'pointer',
//           flexShrink: 0,
//           whiteSpace: 'nowrap'
//         }}
//       >
//         <span>{displayLabel}</span>
//         <ChevronDown style={{ width: '14px', height: '14px', color: 'var(--text-secondary)', flexShrink: 0, transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }} />
//       </button>

//       {showDropdown && (
//         <div
//           style={{
//             position: 'absolute',
//             top: '100%',
//             right: 0,
//             marginTop: '4px',
//             background: 'var(--bg-sidebar)',
//             border: `1px solid var(--border-pill)`,
//             borderRadius: '8px',
//             minWidth: '180px',
//             zIndex: 50,
//             boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
//             maxHeight: '300px',
//             overflowY: 'auto'
//           }}
//         >
//           <button
//             type="button"
//             onClick={() => setShowDropdown(false)}
//             style={{
//               width: '100%',
//               padding: '10px 12px',
//               textAlign: 'left',
//               border: 'none',
//               background: 'var(--bg-nav-active)',
//               color: 'var(--text-nav-active)',
//               cursor: 'default',
//               fontSize: '13px',
//               borderBottom: `1px solid var(--border-pill)`,
//               transition: 'background 150ms'
//             }}
//           >
//             Select a project store
//           </button>

//           {connectedStores && Array.isArray(connectedStores) && connectedStores.length > 0 ? (
//             connectedStores.map((store) => (
//               <button
//                 key={store.connectorId}
//                 type="button"
//                 onClick={() => handleStoreChange(store.connectorId)}
//                 style={{
//                   width: '100%',
//                   padding: '10px 12px',
//                   textAlign: 'left',
//                   border: 'none',
//                   background: connectorInstanceId === store.connectorId ? 'var(--bg-nav-active)' : 'transparent',
//                   color: connectorInstanceId === store.connectorId ? 'var(--text-nav-active)' : 'var(--text-pill)',
//                   cursor: 'pointer',
//                   fontSize: '13px',
//                   borderBottom: `1px solid var(--border-pill)`,
//                   transition: 'background 150ms'
//                 }}
//                 onMouseEnter={(e) => {
//                   if (connectorInstanceId !== store.connectorId) {
//                     (e.target as HTMLButtonElement).style.background = 'var(--bg-nav-hover)';
//                   }
//                 }}
//                 onMouseLeave={(e) => {
//                   if (connectorInstanceId !== store.connectorId) {
//                     (e.target as HTMLButtonElement).style.background = 'transparent';
//                   }
//                 }}
//               >
//                 {store.connectionLabel || store.name || `${store.platform}`}
//               </button>
//             ))
//           ) : (
//             <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
//               No stores connected
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// };
