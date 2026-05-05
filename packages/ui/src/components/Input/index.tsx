import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: any;
  renderRight?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, icon, renderRight, type = 'text', ...props }, ref) => {
    const fallbackId = React.useId();
    const inputId = props.id ?? fallbackId;
    const descriptionId = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;

    const Icon = icon;

    return (
      <div className={cn('ui-input-wrapper', className)}>
        {label && <label className="input-label" htmlFor={inputId}>{label}</label>}
        <div className="input-container relative">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none transition-colors group-focus-within:text-primary">
              {React.isValidElement(icon) ? icon : (Icon && <Icon size={18} />)}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            className={cn(
              'ui-input', 
              error && 'has-error',
              icon && 'pl-11',
              renderRight && 'pr-11'
            )}
            aria-invalid={Boolean(error)}
            aria-describedby={descriptionId}
            {...props}
          />
          {renderRight && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
              {renderRight}
            </div>
          )}
        </div>
        {error && <span className="input-error mt-1.5" id={`${inputId}-error`}>{error}</span>}
        {!error && helperText && <span className="input-helper mt-1.5" id={`${inputId}-helper`}>{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
