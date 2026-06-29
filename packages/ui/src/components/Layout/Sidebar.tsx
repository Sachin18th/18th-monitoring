import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  LucideIcon,
  AlertCircle,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface NavItem {
  label: string;
  href: string;
  icon?: any;
  badge?: number | string;
}

export interface NavGroup {
  name: string;
  items: NavItem[];
}

interface SidebarProps {
  groups: NavGroup[];
  activeHref: string;
  onNavigate?: (href: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  logo?: React.ReactNode;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  groups,
  activeHref,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
  logo,
  className,
}) => {
  return (
    <aside
      className={cn(
        "ui-sidebar",
        isCollapsed && "collapsed",
        isMobileOpen && "mobile-open",
        className,
      )}
    >
      {/* Sidebar Header */}
      <div className="sidebar-header relative">
        <div className="logo-container">
          <div className="logo-mark">
            <div className="logo-badge">{logo || "18"}</div>
          </div>
          <div className="brand-copy">
            {/* <div className="brand-title">GRAVITY</div> */}
            <div className="brand-subtitle">18th Digitech</div>
          </div>
        </div>
        {/* <button 
          className={cn('collapse-toggle', isCollapsed && 'is-collapsed')} 
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={16} />}
        </button> */}
        <button
          className={cn("collapse-toggle", isCollapsed && "is-collapsed")}
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="sidebar-nav">
        {groups.map((group) => (
          <div key={group.name} className="nav-group">
            {isCollapsed ? (
              <div className="group-divider" />
            ) : (
              <h3 className="group-label">{group.name}</h3>
            )}
            <div className="group-list">
              {group.items.map((item) => {
                const isActive = activeHref.startsWith(item.href);
                return (
                  <button
                    key={item.href}
                    type="button"
                    className={cn("nav-item", isActive && "active")}
                    onClick={() => {
                      onNavigate?.(item.href);
                      onCloseMobile?.();
                    }}
                  >
                    {item.icon ? (
                      <item.icon
                        size={18}
                        strokeWidth={1.5}
                        className="nav-icon"
                      />
                    ) : (
                      <AlertCircle
                        size={18}
                        strokeWidth={1.5}
                        className="nav-icon"
                      />
                    )}
                    <span className="nav-label">{item.label}</span>
                    {!isCollapsed &&
                      item.badge !== undefined &&
                      item.badge !== 0 && (
                        <div className="nav-badge">{item.badge}</div>
                      )}

                    {isCollapsed && (
                      <div className="nav-tooltip">
                        <span>{item.label}</span>
                        {item.badge !== undefined && item.badge !== 0 && (
                          <span className="nav-tooltip-badge">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        {!isCollapsed ? (
          <div className="system-status">
            <div className="status-indicator" />
            <div className="status-copy">
              <span className="status-label">Live Feed</span>
              <span className="status-subtitle">System Nominal</span>
            </div>
          </div>
        ) : (
          <div className="system-status system-status--collapsed">
            <div className="status-indicator" />
          </div>
        )}
      </div>
    </aside>
  );
};