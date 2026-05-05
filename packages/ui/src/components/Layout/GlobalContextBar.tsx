import React from 'react';
import {
  ChevronDown,
  Calendar,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Database,
  Globe,
  Search,
  User,
  Bell,
  Menu
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ThemeToggle } from '../ThemeToggle';
import { Breadcrumbs, BreadcrumbItem } from './Breadcrumbs';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type FreshnessStatus = 'healthy' | 'stale' | 'warning' | 'syncing';

export interface GlobalContextBarProps {
  projects?: Array<{ id: string; name: string }>;
  selectedProject?: string;
  onProjectChange?: (id: string) => void;
  environments?: string[];
  selectedEnvironment?: string;
  onEnvironmentChange?: (env: string) => void;
  dateRange?: string;
  onDateRangeClick?: () => void;
  lastUpdated?: string;
  onRefresh?: () => void;
  freshnessStatus?: FreshnessStatus;
  breadcrumbs?: BreadcrumbItem[];
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
  onMenuClick?: () => void;
  className?: string;
  showLogo?: boolean;
  logo?: React.ReactNode;
}

export const GlobalContextBar: React.FC<GlobalContextBarProps> = ({
  projects = [],
  selectedProject,
  onProjectChange,
  environments = ['Production', 'Staging', 'Development'],
  selectedEnvironment = 'Production',
  onEnvironmentChange,
  dateRange = 'Last 24 Hours',
  onDateRangeClick,
  lastUpdated = 'Just now',
  onRefresh,
  freshnessStatus = 'healthy',
  breadcrumbs = [],
  user,
  onLogout,
  onMenuClick,
  className,
  showLogo,
  logo
}) => {
  const getFreshnessIcon = () => {
    switch (freshnessStatus) {
      case 'healthy':
        return <CheckCircle2 size={12} className="text-success" />;
      case 'stale':
        return <Clock size={12} className="text-stale" />;
      case 'warning':
        return <AlertCircle size={12} className="text-warning" />;
      case 'syncing':
        return <RefreshCw size={12} className="text-processing animate-spin" />;
      default:
        return null;
    }
  };

  return (
    <div className={cn('ui-global-context-bar', className)}>
      <div className="flex items-center gap-4 min-w-0">
        {showLogo && logo && (
          <div className="mr-4">
            {logo}
          </div>
        )}

        {onMenuClick && !showLogo && (
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-bg-muted rounded-md text-text-muted"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
        )}

        {!showLogo && (
          <>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-bg-muted/60 border border-border-subtle rounded-full">
              <Database size={12} className="text-text-muted" />
              <select
                className="bg-transparent border-none text-[12px] font-bold outline-none cursor-pointer text-text-primary px-1"
                value={selectedProject}
                onChange={(e) => onProjectChange?.(e.target.value)}
                aria-label="Project"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <div className="w-px h-3 bg-border-subtle mx-1" />
              <Globe size={11} className="text-text-muted" />
              <select
                className="bg-transparent border-none text-[11px] font-bold outline-none cursor-pointer text-text-muted px-1"
                value={selectedEnvironment}
                onChange={(e) => onEnvironmentChange?.(e.target.value)}
                aria-label="Environment"
              >
                {environments.map((environment) => (
                  <option key={environment} value={environment}>
                    {environment}
                  </option>
                ))}
              </select>
            </div>

            <Breadcrumbs items={breadcrumbs} className="hidden xl:block" />
          </>
        )}
      </div>

      <div className="flex-1 flex justify-center px-4">
        <div className="relative w-full max-w-lg group">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Search operational intelligence..."
            className="w-full bg-bg-surface border border-border-subtle rounded-full pl-10 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all shadow-sm group-hover:border-border-interactive"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDateRangeClick}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-bg-surface border border-border-subtle rounded-full hover:border-border-interactive transition-all text-xs font-bold text-text-secondary shadow-sm"
        >
          <Calendar size={13} className="text-text-muted" />
          <span>{dateRange}</span>
          <ChevronDown size={13} className="text-text-muted" />
        </button>

        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border-subtle ml-1">
          <div className="flex flex-col items-end leading-none translate-y-[1px]">
            <span className="text-[9px] font-black text-text-muted uppercase tracking-widest opacity-60">Last Sync</span>
            <span className="text-[11px] font-mono font-bold text-text-primary whitespace-nowrap">{lastUpdated}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="p-1.5 hover:bg-bg-muted rounded-md text-text-muted hover:text-primary transition-all active:scale-90"
            aria-label="Refresh data"
          >
            <RefreshCw size={14} className={freshnessStatus === 'syncing' ? 'animate-spin' : ''} />
          </button>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
            {getFreshnessIcon()}
            {freshnessStatus}
          </span>
        </div>

        <div className="flex items-center gap-3 pl-3 border-l border-border-subtle">
          <div className="flex gap-1 items-center">
            <ThemeToggle />
            <button type="button" className="p-1.5 hover:bg-bg-muted rounded-md text-text-muted relative" aria-label="Notifications">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-error rounded-full ring-2 ring-surface-overlay" />
            </button>
          </div>

          <button
            type="button"
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-bg-muted/60 transition-all border border-transparent hover:border-border-subtle"
            aria-label="User menu"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-xs shadow-inner overflow-hidden">
              {user?.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : user?.name?.charAt(0) || <User size={16} />}
            </div>
            <ChevronDown size={14} className="text-text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
};
