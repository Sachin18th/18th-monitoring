import React, { useEffect, useRef, useState } from 'react';
import { Search, Bell, User, ChevronDown, Menu } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Breadcrumbs, BreadcrumbItem } from './Breadcrumbs';
import { ThemeToggle } from '../ThemeToggle';
import { Button } from '../Button';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TopBarProps {
  breadcrumbs?: BreadcrumbItem[];
  onMenuClick?: () => void;
  onLogout?: () => void;
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  children?: React.ReactNode;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({ 
  breadcrumbs = [], 
  onMenuClick, 
  onLogout,
  user, 
  children, 
  className 
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const handleLogout = () => {
    setShowProfile(false);
    if (onLogout) onLogout();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setShowNotifications(false);
      }

      if (profileRef.current && !profileRef.current.contains(target)) {
        setShowProfile(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setShowProfile(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <header className={cn('ui-top-bar', className)}>
      <div className="top-bar-left">
        {onMenuClick && (
          <Button variant="ghost" size="icon" onClick={onMenuClick} className="sidebar-toggle">
            <Menu size={20} />
          </Button>
        )}
        <Breadcrumbs items={breadcrumbs} className="top-bar-breadcrumbs" />
      </div>

      <div className="top-bar-center">
        <div className="global-search-container">
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search monitoring, KPIs, alerts..." className="global-search-input" />
        </div>
      </div>

      <div className="top-bar-right">
        {children}
        
        <div className="header-actions">
          <ThemeToggle />
          
          <div className="notification-wrapper" ref={notificationRef}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="action-button relative" 
              onClick={() => setShowNotifications(!showNotifications)}
              aria-expanded={showNotifications}
              aria-haspopup="dialog"
            >
              <Bell size={20} />
              <span className="notification-badge" />
            </Button>
            
            {showNotifications && (
              <div className="dropdown-panel notifications-panel">
                <div className="panel-header">Notifications</div>
                <div className="panel-content empty">
                  <p>No new alerts in the last 24h</p>
                </div>
              </div>
            )}
          </div>

          <div className="profile-wrapper" ref={profileRef}>
            <button className="user-profile-button" onClick={() => setShowProfile(!showProfile)} aria-expanded={showProfile} aria-haspopup="menu">
              <div className="user-avatar">
                {user?.avatar ? <img src={user.avatar} alt={user.name} /> : <User size={18} />}
              </div>
              <div className="user-info">
                <span className="user-name">{user?.name || 'Administrator'}</span>
                <ChevronDown size={14} className={cn('chevron', showProfile && 'rotate')} />
              </div>
            </button>

            {showProfile && (
              <div className="dropdown-panel profile-panel">
                <div className="panel-item">Account Settings</div>
                <div className="panel-item">API Keys</div>
                <div className="panel-divider" />
                <div className="panel-item logout" onClick={handleLogout}>Sign Out</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
