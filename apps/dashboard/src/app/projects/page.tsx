'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  ChevronDown,
  FolderKanban,
  Menu,
  Search,
  Settings,
  Sun,
  Moon,
  Users,
  X,
} from 'lucide-react';
import { PerformanceChart } from '../../components/ui/PerformanceChart';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '@kpi-platform/ui';

type ProjectSummary = {
  id: string;
  name: string;
  metricsSummary?: {
    activeUsers?: number;
    errorRate?: number;
  };
};

const timeFilters = [
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
] as const;

function formatValue(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function buildTrendData(range: string) {
  const factor = range === '7d' ? 1.12 : range === '30d' ? 1.22 : 1;

  return Array.from({ length: 12 }).map((_, index) => ({
    timestamp: `${String(index * 2).padStart(2, '0')}:00`,
    pageLoadTime: 220 + index * 8 * factor + Math.sin(index / 2) * 18,
    ttfb: 90 + index * 3 * factor + Math.cos(index / 2) * 7,
    fcp: 145 + index * 4 * factor + Math.sin(index / 3) * 9,
    lcp: 380 + index * 10 * factor + Math.cos(index / 4) * 16,
  }));
}

function getHealthTone(health: number) {
  if (health < 92) return 'critical';
  if (health < 97) return 'warning';
  return 'healthy';
}

function statusBadgeClass(tone: 'healthy' | 'warning' | 'critical' | 'live') {
  if (tone === 'healthy') return 'bg-[#052E16] text-[#22C55E]';
  if (tone === 'critical') return 'bg-[#450A0A] text-[#EF4444]';
  if (tone === 'live') return 'bg-[#0C1A40] text-[#60A5FA]';
  return 'bg-[#1C1500] text-[#F59E0B]';
}

function statusBadgeStyle(tone: 'healthy' | 'warning' | 'critical' | 'live', isDark: boolean): React.CSSProperties {
  if (isDark) return {};

  if (tone === 'healthy') {
    return { background: '#DCFCE7', color: '#166534' };
  }
  if (tone === 'critical') {
    return { background: '#FEE2E2', color: '#991B1B' };
  }
  if (tone === 'live') {
    return { background: '#DBEAFE', color: '#1E3A8A' };
  }

  return { background: '#FEF3C7', color: '#92400E' };
}

const pillBaseClass = 'inline-flex items-center rounded-full text-[10px] font-medium uppercase tracking-[0.08em]';
const pillBaseStyle: React.CSSProperties = {
  minHeight: 30,
  padding: '6px 12px',
  lineHeight: 1,
};

const MetricCard = ({
  title,
  value,
  icon: Icon,
  statusLabel,
  statusTone,
  secondaryTag,
  isDark,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  statusLabel: string;
  statusTone: 'healthy' | 'warning' | 'critical' | 'live';
  secondaryTag: string;
  isDark: boolean;
}) => {
  return (
    <article
      className="h-full rounded-xl transition-colors duration-150"
      style={{
        minHeight: 150,
        padding: '20px 22px',
        overflow: 'hidden',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-card)',
      }}
    >
      <div className="flex h-full flex-col justify-between gap-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] leading-none" style={{ color: 'var(--text-label)' }}>{title}</p>
          <div style={{ color: 'var(--text-label)' }}>
            <Icon size={16} />
          </div>
        </div>

        <p className="my-3 text-[30px] font-medium leading-none" style={{ color: 'var(--text-primary)' }}>{value}</p>

        <div className="mt-auto flex items-center justify-between gap-4">
          <span className={`${pillBaseClass} ${statusBadgeClass(statusTone)}`} style={{ ...pillBaseStyle, ...statusBadgeStyle(statusTone, isDark) }}>
            {statusLabel}
          </span>
          <span className="overflow-visible text-[11px] font-normal" style={{ color: 'var(--text-label)' }}>{secondaryTag}</span>
        </div>
      </div>
    </article>
  );
};

const ProjectCard = ({
  project,
  onOpen,
  isPending,
  isDark,
}: {
  project: ProjectSummary;
  onOpen: (projectId: string) => void;
  isPending: boolean;
  isDark: boolean;
}) => {
  const traffic = project.metricsSummary?.activeUsers || 0;
  const health = Math.max(0, 100 - (project.metricsSummary?.errorRate || 0));
  const tone = getHealthTone(health);

  return (
    <button
      type="button"
      onClick={() => onOpen(project.id)}
      aria-busy={isPending}
      className="group flex w-full flex-col rounded-xl text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
      style={{
        minHeight: 180,
        minWidth: 280,
        maxWidth: '100%',
        padding: '20px 22px',
        overflow: 'hidden',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-card)',
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-medium leading-[1.3] break-words" style={{ color: 'var(--text-primary)' }}>{project.name}</p>
            <p className="mb-3 mt-1 font-mono text-[11px] font-normal leading-[1.3] break-all" style={{ color: 'var(--text-label)' }}>
              ID: {project.id.toUpperCase()}
            </p>
          </div>

          <span
            className={`${pillBaseClass} gap-1 ${isDark ? statusBadgeClass(tone) : ''}`}
            style={{ ...pillBaseStyle, ...statusBadgeStyle(tone, isDark) }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {tone}
          </span>
        </div>

        <div className="mb-3 h-px" style={{ background: 'var(--border-card)' }} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-label)' }}>Live traffic</p>
            <p className="mt-2 text-[22px] font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>{formatValue(traffic)}</p>
          </div>

          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-label)' }}>System health</p>
            <div className="mt-2 inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
              <p className="text-[22px] font-medium leading-tight text-[#22C55E]">{health.toFixed(0)}%</p>
            </div>
          </div>
        </div>

        <span className="mt-4 inline-flex min-h-[36px] items-center text-[12px] font-medium text-[#3B82F6] group-hover:underline">
          {isPending ? 'Launching workspace...' : 'Launch workspace'}
          <ArrowRight size={16} className="ml-1" />
        </span>
      </div>
    </button>
  );
};

export default function ProjectsPage() {
  const { user, token, apiFetch, setProject } = useAuth();
  const { theme, toggleTheme, mounted } = useTheme();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [showAttentionAlert, setShowAttentionAlert] = useState(true);

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    apiFetch('/api/v1/projects')
      .then((data) => {
        const results = Array.isArray(data) ? data : [];
        const authorized = results.filter(
          (project) =>
            ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user?.role || '') ||
            user?.assignedProjects?.includes(project.id),
        );
        setProjects(authorized);
      })
      .catch((error) => console.error(error))
      .finally(() => setLoading(false));
  }, [token, apiFetch, user?.assignedProjects, user?.role]);

  const metrics = useMemo(() => {
    const totalUsers = projects.reduce(
      (sum, project) => sum + (project.metricsSummary?.activeUsers || 0),
      0,
    );
    const totalErrors = projects.reduce(
      (sum, project) => sum + (project.metricsSummary?.errorRate || 0),
      0,
    );
    const projectsAtRisk = projects.filter(
      (project) => (project.metricsSummary?.errorRate || 0) > 0,
    ).length;
    const avgHealth = projects.length > 0 ? Math.max(0, 100 - totalErrors / projects.length) : 100;

    return {
      totalProjects: projects.length,
      totalUsers,
      avgHealth: avgHealth.toFixed(1),
      projectsAtRisk,
    };
  }, [projects]);

  const trendData = useMemo(() => buildTrendData(selectedRange), [selectedRange]);
  const isDark = mounted ? theme === 'dark' : true;

  const openProject = (projectId: string) => {
    setPendingProjectId(projectId);
    setProject(projectId);
    router.push(`/project/${projectId}/overview`);
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen px-7 py-6" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', padding: '0 28px', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div className="h-12 animate-pulse rounded-xl" style={{ background: 'var(--bg-card)' }} />
          <div className="h-24 animate-pulse rounded-xl" style={{ background: 'var(--bg-card)' }} />
          <div className="grid grid-cols-1 gap-[14px] xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[164px] animate-pulse rounded-xl" style={{ background: 'var(--bg-card)' }} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="h-[340px] animate-pulse rounded-xl lg:col-span-8" style={{ background: 'var(--bg-card)' }} />
            <div className="h-[340px] animate-pulse rounded-xl lg:col-span-4" style={{ background: 'var(--bg-card)' }} />
          </div>
        </div>
      </div>
    );
  }

  const displayName = user.name || '18th Super Admin';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <header className="sticky top-0 z-40 h-[52px]" style={{ borderBottom: '1px solid var(--border-nav)', background: 'var(--bg-nav)' }}>
        <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', padding: '0 28px' }}>
          <div className="flex h-full items-center justify-between gap-4">
            <div className="flex min-w-[220px] items-center gap-3">
              <button
                type="button"
                aria-label="Open navigation"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150"
                style={{ border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
              >
                <Menu size={16} />
              </button>

              <div className="flex h-6 w-6 items-center justify-center rounded bg-[#1E2D4A] text-[#3B82F6]">
                <FolderKanban size={16} />
              </div>
              <span className="text-[13px] font-normal" style={{ color: 'var(--text-secondary)' }}>Projects</span>
            </div>

            <div className="hidden w-full max-w-[38%] lg:block">
              <label className="flex h-[36px] items-center gap-2 rounded-full px-4" style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search operational intelligence..."
                  className="w-full bg-transparent text-[13px] font-normal focus:outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
              </label>
            </div>

            <div className="flex items-center gap-4">
              <div className="inline-flex h-[36px] items-center rounded-full p-1" style={{ border: '1px solid var(--border-card)', background: 'var(--bg-card)' }}>
                {timeFilters.map((filter) => {
                  const active = selectedRange === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setSelectedRange(filter.value)}
                      className={`inline-flex h-[28px] min-w-[48px] items-center justify-center rounded-full px-3 text-[12px] font-medium transition-colors duration-150 ${
                        active ? 'text-[#3B82F6]' : ''
                      }`}
                      style={active ? { background: 'var(--bg-badge-active)' } : { color: 'var(--text-secondary)' }}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150"
                style={{ border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-secondary)' }}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              <button
                type="button"
                aria-label="Notifications"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150"
                style={{ border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
              >
                <Bell size={16} />
                {metrics.projectsAtRisk > 0 && (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#EF4444]" />
                )}
              </button>

              <button
                type="button"
                className="inline-flex h-[36px] items-center gap-2 rounded-full px-3 text-left transition-colors duration-150"
                style={{ border: '1px solid var(--border-card)', background: 'var(--bg-card)' }}
              >
                <div className="h-7 w-7 rounded-full bg-[#1E2D4A]" />
                <div className="hidden sm:block">
                  <div className="text-[12px] font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
                  <div className="text-[10px] font-normal" style={{ color: 'var(--text-secondary)' }}>SUPER ADMIN</div>
                </div>
                <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main style={{ width: '100%', maxWidth: 1280, margin: '0 auto', padding: '28px 28px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <section>
            <div className="mb-2 flex items-center gap-3">
              <h1 className="text-[20px] font-medium" style={{ color: 'var(--text-primary)' }}>Portfolio Command Center</h1>
              <span className="inline-flex items-center gap-1 rounded-md bg-[#14532D] text-[10px] font-medium uppercase tracking-[0.08em] text-[#22C55E]" style={pillBaseStyle}>
                <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                Live
              </span>
            </div>
            <p className="max-w-[520px] text-[13px] font-normal leading-[1.6]" style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
              Consolidated operational surface for authorized project streams with clear spacing, reduced noise,
              and fast workspace access.
            </p>
          </section>

          {showAttentionAlert && metrics.projectsAtRisk > 0 && (
            <section
              className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-4 py-2.5"
              style={{
                marginBottom: 24,
                border: isDark ? '1px solid #3A2A00' : '1px solid #FCD34D',
                background: isDark ? '#1C1500' : '#FFFBEB',
              }}
            >
              <div className="inline-flex items-center gap-2 text-[12px] font-normal" style={{ color: isDark ? '#F59E0B' : '#92400E' }}>
                <AlertTriangle size={16} />
                <span>
                  {metrics.projectsAtRisk} {metrics.projectsAtRisk === 1 ? 'project needs' : 'projects need'} attention
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAttentionAlert(false)}
                aria-label="Dismiss alert"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150"
                style={{ color: isDark ? '#F59E0B' : '#92400E', background: 'transparent' }}
              >
                <X size={16} />
              </button>
            </section>
          )}

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4" style={{ gap: 20 }}>
            <MetricCard
              title="Active projects"
              value={formatValue(metrics.totalProjects)}
              icon={Building2}
              statusLabel="Healthy"
              statusTone="healthy"
              secondaryTag="Global scope"
              isDark={isDark}
            />
            <MetricCard
              title="Portfolio health"
              value={`${metrics.avgHealth}%`}
              icon={Activity}
              statusLabel={Number(metrics.avgHealth) < 95 ? 'Critical' : 'Healthy'}
              statusTone={Number(metrics.avgHealth) < 95 ? 'critical' : 'healthy'}
              secondaryTag="Avg quality"
              isDark={isDark}
            />
            <MetricCard
              title="Active operators"
              value={formatValue(metrics.totalUsers)}
              icon={Users}
              statusLabel="Live sessions"
              statusTone="live"
              secondaryTag="Connected"
              isDark={isDark}
            />
            <MetricCard
              title="Incident surface"
              value={formatValue(metrics.projectsAtRisk)}
              icon={AlertTriangle}
              statusLabel={metrics.projectsAtRisk > 0 ? 'Critical' : 'Healthy'}
              statusTone={metrics.projectsAtRisk > 0 ? 'critical' : 'healthy'}
              secondaryTag="Open alerts"
              isDark={isDark}
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-12" style={{ gap: 20 }}>
            <div
              className="overflow-hidden rounded-xl lg:col-span-8"
              style={{ padding: '20px 22px', background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="mb-1 text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>Cross-portfolio Trendline</h2>
                  <p className="mb-4 text-[12px] font-normal" style={{ color: 'var(--text-secondary)' }}>
                    Synthetic performance pattern for the selected time range.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-normal" style={{ color: 'var(--text-secondary)' }}>
                    <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
                    PAGE LOAD
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-normal" style={{ color: 'var(--text-secondary)' }}>
                    <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                    LCP
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-normal" style={{ color: 'var(--text-secondary)' }}>
                    <span className="h-2 w-2 rounded-full bg-[#60A5FA]" />
                    FCP
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-normal" style={{ color: 'var(--text-secondary)' }}>
                    <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                    TTFB
                  </span>
                </div>
              </div>

              <div className="rounded-lg px-3 py-2" style={{ border: '1px solid var(--border-input)', background: 'var(--bg-input)' }}>
                <div className="min-h-[240px]">
                  <PerformanceChart data={trendData} title="" height={260} />
                </div>
              </div>
            </div>

            <div
              className="overflow-hidden rounded-xl lg:col-span-4"
              style={{ padding: '20px 22px', background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-label)' }}>Operator identity</p>
                  <p className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>18th Super Admin</p>
                  <p className="text-[12px] font-normal" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                </div>
                <span
                  className="inline-flex items-center rounded-md text-[10px] font-medium uppercase tracking-[0.08em]"
                  style={{
                    ...pillBaseStyle,
                    background: isDark ? '#0C1A40' : '#DBEAFE',
                    color: isDark ? '#3B82F6' : '#1E3A8A',
                  }}
                >
                  SUPER ADMIN
                </span>
              </div>

              <div className="my-4 h-px" style={{ background: 'var(--border-card)' }} />

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-label)' }}>Authorized scope</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
                      {metrics.totalProjects || 1} {metrics.totalProjects === 1 ? 'Workspace' : 'Workspaces'}
                    </p>
                    <Settings size={14} style={{ color: 'var(--text-secondary)' }} />
                  </div>
                </div>

                <div className="space-y-2">
                  <span
                    className="inline-flex items-center rounded-full text-[10px] font-medium uppercase tracking-[0.08em]"
                    style={{
                      ...pillBaseStyle,
                      background: isDark ? '#1C2D50' : '#DBEAFE',
                      color: isDark ? '#60A5FA' : '#1E40AF',
                    }}
                  >
                    Portfolio intelligence
                  </span>
                  <p className="max-h-[64px] overflow-hidden text-[12px] font-normal leading-[1.7]" style={{ color: 'var(--text-muted)' }}>
                    Monitoring {metrics.totalProjects} active streams with a stable operational surface designed
                    for low-friction scanning and quick workspace launch.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>Attention surface</span>
                    <span className="font-normal" style={{ color: 'var(--text-primary)' }}>{metrics.projectsAtRisk} projects</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>Scanning effort</span>
                    <span className="font-normal" style={{ color: 'var(--text-primary)' }}>Low</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>Navigation depth</span>
                    <span className="font-normal" style={{ color: 'var(--text-primary)' }}>Portfolio first</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={{ border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                  <FolderKanban size={16} />
                </div>
                <h2 className="text-[16px] font-medium" style={{ color: 'var(--text-primary)' }}>Project Portfolio</h2>
              </div>

              <span className="inline-flex items-center rounded-lg bg-[#0C1A40] text-[11px] font-medium text-[#60A5FA]" style={{ minHeight: 30, padding: '6px 12px', lineHeight: 1 }}>
                {metrics.totalProjects || 1} {metrics.totalProjects === 1 ? 'active stream' : 'active streams'}
              </span>
            </div>

            <p className="text-[12px] font-normal" style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>Each card is a direct launch point into a project workspace.</p>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={openProject}
                  isPending={pendingProjectId === project.id}
                  isDark={isDark}
                />
              ))}

              {!projects.length && (
                <div
                  className="col-span-full rounded-xl border border-dashed py-10 text-center"
                  style={{ paddingLeft: 22, paddingRight: 22, borderColor: 'var(--border-card)', background: 'var(--bg-card)' }}
                >
                  <p className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>No projects assigned</p>
                  <p className="mt-1 text-[12px] font-normal" style={{ color: 'var(--text-secondary)' }}>Ask an administrator to grant workspace access.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <div className="fixed z-50" style={{ bottom: 20, left: 28 }}>
        <div className="inline-flex min-h-[36px] items-center rounded-full text-[11px] font-normal" style={{ padding: '6px 14px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
          <span className="mr-1.5 h-[6px] w-[6px] rounded-full bg-[#22C55E]" />
          <span className="text-[#22C55E]">Live feed</span>
          <span className="ml-1">System nominal</span>
        </div>
      </div>
    </div>
  );
}
