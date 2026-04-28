'use client';
import React from 'react';

interface ClickableCardProps {
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Highlight border color on hover (default: var(--primary)) */
  accentColor?: string;
  disabled?: boolean;
}

/**
 * ClickableCard
 * Full-surface interactive card with proper hover, focus, and active states.
 * Use as a drop-in wrapper around any existing card content.
 */
export const ClickableCard: React.FC<ClickableCardProps> = ({
  onClick,
  href,
  children,
  className = '',
  style = {},
  accentColor = 'var(--primary)',
  disabled = false,
}) => {
  const baseStyle: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-xl)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'all 0.18s ease',
    display: 'block',
    width: '100%',
    textAlign: 'left',
    textDecoration: 'none',
    color: 'inherit',
    ...style,
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;
    const el = e.currentTarget;
    el.style.borderColor = accentColor;
    el.style.boxShadow = `0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px ${accentColor}22`;
    el.style.transform = 'translateY(-1px)';
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.style.borderColor = 'var(--border-subtle)';
    el.style.boxShadow = '';
    el.style.transform = '';
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;
    const el = e.currentTarget;
    el.style.transform = 'translateY(0px)';
  };

  const sharedProps = {
    style: baseStyle,
    className,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onMouseDown: handleMouseDown,
    onMouseUp: handleMouseLeave,
    tabIndex: disabled ? -1 : 0,
    'aria-disabled': disabled,
  };

  if (href && !disabled) {
    return (
      <a href={href} {...sharedProps}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      {...sharedProps}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </button>
  );
};
