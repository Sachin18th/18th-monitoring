import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2, LucideIcon } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, leftIcon: LeftIcon, rightIcon: RightIcon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={isLoading || disabled}
        className={cn(
          'ui-button',
          `ui-button--${variant}`,
          `ui-button--${size}`,
          isLoading && 'is-loading',
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="animate-spin" size={18} />}
        {!isLoading && LeftIcon && <LeftIcon size={size === 'sm' ? 16 : 20} strokeWidth={2} />}
        {children && <span className="ui-button__text">{children}</span>}
        {!isLoading && RightIcon && <RightIcon size={size === 'sm' ? 16 : 20} strokeWidth={2} />}
      </button>
    );
  }
);

Button.displayName = 'Button';
