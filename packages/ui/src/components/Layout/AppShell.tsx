import React, { useState, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Sidebar, NavGroup } from './Sidebar';
import { TopBar } from './TopBar';
import { GlobalContextBar, FreshnessStatus } from './GlobalContextBar';
import { BreadcrumbItem } from './Breadcrumbs';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AppShellProps {
  children: React.ReactNode;
  navGroups: NavGroup[];
  activeHref: string;
  breadcrumbs?: BreadcrumbItem[];
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
  onNavigate?: (href: string) => void;
  logo?: React.ReactNode;
  className?: string;
  showSidebar?: boolean;
  defaultCollapsed?: boolean;

  // Context Bar Props
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
}

export const AppShell: React.FC<AppShellProps> = ({ 
  children, 
  navGroups, 
  activeHref, 
  breadcrumbs,
  user,
  onLogout,
  onNavigate,
  logo,
  className,
  showSidebar = true,
  defaultCollapsed = false,
  projects,
  selectedProject,
  onProjectChange,
  environments,
  selectedEnvironment,
  onEnvironmentChange,
  dateRange,
  onDateRangeClick,
  lastUpdated,
  onRefresh,
  freshnessStatus
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Load persistence from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    } else if (defaultCollapsed) {
      setIsCollapsed(true);
    }
  }, [defaultCollapsed]);

  const handleToggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem('sidebar-collapsed', String(nextState));
  };

  const handleMenuToggle = () => {
    setIsMobileOpen((open) => !open);
  };

  const handleCloseMobile = () => {
    setIsMobileOpen(false);
  };

  return (
    <div className={cn(
      'ui-app-shell', 
      isCollapsed && 'sidebar-collapsed', 
      !showSidebar && 'sidebar-hidden',
      className
    )}>
      {showSidebar && (
        <>
          <Sidebar 
            groups={navGroups} 
            activeHref={activeHref}
            onNavigate={onNavigate}
            isCollapsed={isCollapsed}
            onToggleCollapse={handleToggleCollapse}
            isMobileOpen={isMobileOpen}
            onCloseMobile={handleCloseMobile}
            logo={logo}
          />
          <button
            type="button"
            className={cn('sidebar-overlay', isMobileOpen && 'open')}
            onClick={handleCloseMobile}
            aria-label="Close navigation"
          />
        </>
      )}
      
      <div className="shell-main">
        <GlobalContextBar 
          projects={projects}
          selectedProject={selectedProject}
          onProjectChange={onProjectChange}
          environments={environments}
          selectedEnvironment={selectedEnvironment}
          onEnvironmentChange={onEnvironmentChange}
          dateRange={dateRange}
          onDateRangeClick={onDateRangeClick}
          lastUpdated={lastUpdated}
          onRefresh={onRefresh}
          freshnessStatus={freshnessStatus}
          breadcrumbs={breadcrumbs}
          user={user}
          onLogout={onLogout}
          onMenuClick={showSidebar ? handleMenuToggle : undefined}
          showLogo={!showSidebar}
          logo={logo}
        />
        <main className="shell-content">
          {children}
        </main>
      </div>
    </div>
  );
};
