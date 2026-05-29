import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DiagnosticDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  className?: string;
}

export const DiagnosticDrawer: React.FC<DiagnosticDrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = '480px',
  className
}) => {
  // Prevent scrolling when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div 
        className={cn('ui-diagnostic-drawer', className)} 
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="drawer-header">
          <div className="header-content">
            <div className="header-text">
              <h2 className="drawer-title">{title}</h2>
              {subtitle && <div className="drawer-subtitle">{subtitle}</div>}
            </div>
          </div>
          <div className="header-actions">
            <button type="button" className="drawer-close-button" onClick={onClose} aria-label="Close drawer" title="Close drawer">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {children}
        </div>

        {footer && (
          <div className="drawer-footer">
            {footer}
          </div>
        )}
      </div>
    </>
  );
};
