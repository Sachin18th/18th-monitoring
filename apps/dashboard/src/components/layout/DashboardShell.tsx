'use client';

import React, { useMemo, useEffect } from 'react';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useConnectorPlatform } from '../../context/ConnectorPlatformContext';
import { NavGroup, formatBreadcrumbLabel, useTheme } from '@kpi-platform/ui';
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
  GitMerge,
  Database,
  ShieldAlert,
  BarChart3,
  Monitor,
  Server,
  Flame,
  Map,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Home,
  Clock3,
  Sun,
  Moon
} from 'lucide-react';

const SIDEBAR_WIDTH = 200;
const TOPBAR_HEIGHT = 52;

export const DashboardShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname() || '';
  const params = useParams();
  const router = useRouter();
  const { user, logout, isLoading, apiFetch, token, setProject } = useAuth();
  const { healthLevel, healthLabel, selectedStoreLabel, storeOptions, setActiveStoreId, activeStoreId } = useConnectorPlatform();
  const { theme, toggleTheme, mounted } = useTheme();

  const projectId = (params.projectId as string) || '';
  const isProjectRoute = pathname.startsWith('/project/') && !!projectId;
  const isDark = mounted ? theme === 'dark' : false;

  const [selectedEnv, setSelectedEnv] = React.useState('Production');
  const [lastRefreshed, setLastRefreshed] = React.useState(new Date().toLocaleTimeString());
  const [availableProjects, setAvailableProjects] = React.useState<any[]>([]);
  const [alertCount, setAlertCount] = React.useState<number>(0);
  const [hoveredHref, setHoveredHref] = React.useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user && isProjectRoute) {
      setProject(projectId);

      const isSuperAdmin = user.role === 'SUPER_ADMIN';
      const isTenantAdmin = user.role === 'TENANT_ADMIN';
      const isAssigned = user.assignedProjects?.includes(projectId);

      if (!isSuperAdmin && !isTenantAdmin && !isAssigned) {
        console.warn(`[RBAC] Unauthorized access attempt to project ${projectId} by user ${user.id}`);
        router.push('/unauthorized');
      }
    }
  }, [user, projectId, isLoading, router, setProject, isProjectRoute]);

  useEffect(() => {
    if (!token || !user || !isProjectRoute) return;

    // Only call the global projects endpoint for admin users.
    // Non-admin roles (Project Admin, Ops Lead, Operator, Viewer) may not have
    // permission to list all projects and would receive a 403. Use the
    // user's assignedProjects to populate the selector instead.
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const isTenantAdmin = user.role === 'TENANT_ADMIN';

    if (isSuperAdmin || isTenantAdmin) {
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
  }, [token, user, apiFetch, isProjectRoute]);

  useEffect(() => {
    if (!token || !projectId || !isProjectRoute || !user?.tenantId) return;

    const fetchAlerts = () => {
      apiFetch(`/api/v1/tenants/${user.tenantId}/projects/${projectId}/alerts?status=active`)
        .then((data) => {
          const criticalCount = data?.data?.alerts?.filter((a: any) => a.severity === 'critical')?.length || 0;
          setAlertCount(criticalCount);
        })
        .catch((err) => console.error('[DashboardShell] Failed to load alerts:', err));
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [token, projectId, apiFetch, isProjectRoute, user?.tenantId]);

  const navGroups = useMemo((): NavGroup[] => {
    if (!isProjectRoute) return [];

    const prefix = `/project/${projectId}`;
    const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'PROJECT_ADMIN';

    const groups: NavGroup[] = [
      {
        name: 'Command Center',
        items: [
          { label: 'Overview', href: `${prefix}/overview`, icon: LayoutDashboard },
          { label: 'Alert Center', href: `${prefix}/observability/alerts`, icon: Bell },
          { label: 'Incident Center', href: `${prefix}/observability/incidents`, icon: Flame }
        ]
      },
      {
        name: 'Operational Surface',
        items: [
          { label: 'Performance', href: `${prefix}/performance`, icon: Activity },
          { label: 'Frontend RUM', href: `${prefix}/rum`, icon: Monitor },
          { label: 'Backend API', href: `${prefix}/observability/backend`, icon: Server },
          { label: 'Failure Intel', href: `${prefix}/observability/failures`, icon: ShieldAlert },
          { label: 'Journey Intel', href: `${prefix}/observability/journeys`, icon: Map },
          { label: 'Synthetic', href: `${prefix}/observability/synthetic`, icon: Activity },
          { label: 'Customers', href: `${prefix}/customers`, icon: Users },
          { label: 'Orders', href: `${prefix}/orders`, icon: Package }
        ]
      },
      {
        name: 'System',
        items: [
          { label: 'Integrations', href: `${prefix}/integrations`, icon: Link2 },
          { label: 'Alerts', href: `${prefix}/alerts`, icon: Bell, badge: alertCount }
        ]
      }
    ];

    if (isAdmin) {
      groups.push(
        {
          name: 'Data Platform',
          items: [
            { label: 'Ingestion', href: `${prefix}/management/ingestion`, icon: Database },
            { label: 'Pipeline', href: `${prefix}/management/pipeline`, icon: GitMerge },
            { label: 'KPI Engine', href: `${prefix}/management/kpi`, icon: BarChart3 },
            { label: 'Monitoring', href: `${prefix}/management/monitoring`, icon: ShieldAlert }
          ]
        },
        {
          name: 'Governance',
          items: [
            { label: 'Audit & Activity', href: `${prefix}/management/audit`, icon: ShieldCheck },
            { label: 'Configuration', href: `${prefix}/settings`, icon: Settings },
            { label: 'Administration', href: `${prefix}/management/users`, icon: UserCircle }
          ]
        }
      );
    }

    return groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        icon: item.icon || AlertCircle
      }))
    }));
  }, [projectId, user?.role, alertCount, isProjectRoute]);

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

  const handleRefresh = () => {
    setLastRefreshed(new Date().toLocaleTimeString());
  };

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
    pillBorder: 'var(--border-card)',
    pillBg: 'transparent',
    pillText: 'var(--text-primary)',
    mutedText: 'var(--text-muted)',
    iconMuted: 'var(--text-secondary)',
    searchBg: 'var(--bg-input)',
    searchBorder: 'var(--border-input)',
    avatarBg: 'var(--primary)'
  };

  const healthTone =
    healthLevel === 'critical'
      ? { dot: '#ef4444', text: '#f87171' }
      : healthLevel === 'warning'
        ? { dot: '#f59e0b', text: '#f59e0b' }
        : { dot: '#22c55e', text: '#22c55e' };

  return (
    <div style={{ minHeight: '100vh', background: shellColors.appBg, color: shellColors.appText }}>
      <style jsx global>{`
        main > div[style*='position: fixed'][style*='bottom: 20px'][style*='border-radius: 999px'] {
          left: 216px !important;
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
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700
            }}
          >
            18
          </div>
          <span style={{ fontSize: '13px', fontWeight: 500, color: shellColors.pillText, whiteSpace: 'nowrap' }}>18th Digitech</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
          {navGroups.map((group, groupIndex) => (
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
        <nav
          style={{
            height: '52px',
            width: '100%',
            background: shellColors.navbarBg,
            borderBottom: `1px solid ${shellColors.navbarBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            flexShrink: 0,
            gap: '12px'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
              minWidth: 0,
              overflow: 'hidden'
            }}
          >
            <button
              type="button"
              onClick={() => router.push('/projects')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: `1px solid ${shellColors.pillBorder}`,
                background: shellColors.pillBg,
                fontSize: '13px',
                color: shellColors.pillText,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{selectedProjectName}</span>
              <ChevronDown style={{ width: '14px', height: '14px', color: shellColors.iconMuted, flexShrink: 0 }} />
            </button>

            <button
              type="button"
              onClick={() => setSelectedEnv(selectedEnv === 'Production' ? 'Staging' : 'Production')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: `1px solid ${shellColors.pillBorder}`,
                background: shellColors.pillBg,
                fontSize: '13px',
                color: shellColors.pillText,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#f59e0b',
                  flexShrink: 0
                }}
              />
              <span>{selectedEnv}</span>
              <ChevronDown style={{ width: '14px', height: '14px', color: shellColors.iconMuted, flexShrink: 0 }} />
            </button>

            <select
              value={activeStoreId}
              onChange={(event) => setActiveStoreId(event.target.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: `1px solid ${shellColors.pillBorder}`,
                background: shellColors.pillBg,
                fontSize: '13px',
                color: shellColors.pillText,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                outline: 'none',
                maxWidth: '220px'
              }}
            >
              {storeOptions.map((option) => (
                <option key={option.key} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => router.push(`/project/${projectId}/integrations`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: `1px solid ${pathname.includes('/integrations') ? shellColors.navActiveBg : shellColors.pillBorder}`,
                background: pathname.includes('/integrations') ? shellColors.navActiveBg : shellColors.pillBg,
                fontSize: '13px',
                color: pathname.includes('/integrations') ? shellColors.navActiveText : shellColors.pillText,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <Link2 style={{ width: '14px', height: '14px', color: pathname.includes('/integrations') ? shellColors.navActiveText : shellColors.iconMuted, flexShrink: 0 }} />
              <span>Connectors</span>
            </button>

            {/* <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: 0,
                overflow: 'hidden',
                color: shellColors.mutedText,
                fontSize: '12px'
              }}
            >
              <Home style={{ width: '14px', height: '14px', color: shellColors.mutedText, flexShrink: 0 }} />
              {[
                { label: 'Project', href: `/project/${projectId}/overview`, active: false },
                { label: `Project: ${projectId.toUpperCase()}`, href: `/project/${projectId}/overview`, active: false },
                { label: sectionLabel, href: '#', active: false },
                { label: currentPage, href: pathname, active: true }
              ].map((crumb, index) => (
                <React.Fragment key={`${crumb.label}-${index}`}>
                  <ChevronRight style={{ width: '12px', height: '12px', color: shellColors.mutedText, flexShrink: 0 }} />
                  <button
                    type="button"
                    onClick={() => {
                      if (!crumb.active && crumb.href !== '#') {
                        router.push(crumb.href);
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      fontSize: '12px',
                      color: crumb.active ? shellColors.pillText : shellColors.mutedText,
                      fontWeight: crumb.active ? 500 : 400,
                      cursor: crumb.active || crumb.href === '#' ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div> */}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '220px',
                padding: '6px 14px',
                background: shellColors.searchBg,
                border: `1px solid ${shellColors.searchBorder}`,
                borderRadius: '999px',
                flexShrink: 1
              }}
            >
              <Search style={{ width: '14px', height: '14px', color: shellColors.mutedText, flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search operational intelligence..."
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '12px',
                  color: shellColors.pillText
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <button
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: `1px solid ${shellColors.pillBorder}`,
                background: shellColors.pillBg,
                fontSize: '12px',
                color: shellColors.pillText,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Clock3 style={{ width: '16px', height: '16px', color: shellColors.iconMuted }} />
              Last 24 Hours
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '9px',
                  color: shellColors.mutedText,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em'
                }}
              >
                Last Sync
              </span>
              <span style={{ fontSize: '11px', color: shellColors.mutedText }}>{lastRefreshed}</span>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: `1px solid ${shellColors.pillBorder}`,
                background: shellColors.pillBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <RefreshCw style={{ width: '16px', height: '16px', color: shellColors.iconMuted }} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: healthTone.dot, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: healthTone.text, fontWeight: 500, letterSpacing: '0.06em' }}>{healthLabel}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, flexShrink: 0 }}>
              <span style={{ fontSize: '9px', color: shellColors.mutedText, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Store Scope</span>
              <span style={{ fontSize: '11px', color: shellColors.mutedText }}>{selectedStoreLabel}</span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: `1px solid ${shellColors.pillBorder}`,
                background: shellColors.pillBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              {isDark ? (
                <Sun style={{ width: '16px', height: '16px', color: shellColors.iconMuted }} />
              ) : (
                <Moon style={{ width: '16px', height: '16px', color: shellColors.iconMuted }} />
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push(`/project/${projectId}/alerts`)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: `1px solid ${shellColors.pillBorder}`,
                background: shellColors.pillBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                position: 'relative'
              }}
            >
              <Bell style={{ width: '16px', height: '16px', color: shellColors.iconMuted }} />
              <span
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '6px',
                  height: '6px',
                  background: '#ef4444',
                  borderRadius: '50%'
                }}
              />
            </button>

            <button
              type="button"
              onClick={logout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <span
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: shellColors.avatarBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  color: '#fff',
                  fontWeight: 500
                }}
              >
                {userBadge}
              </span>
              <ChevronDown style={{ width: '14px', height: '14px', color: shellColors.iconMuted }} />
            </button>
          </div>
        </nav>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>{children}</div>
      </main>
    </div>
  );
};
