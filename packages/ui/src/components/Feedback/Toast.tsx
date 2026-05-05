'use client';
import React, { useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface Toast {
    id: string;
    message: string;
    title?: string;
    type: ToastType;
    duration?: number;
}

interface ToastItemProps {
    toast: Toast;
    onClose: (id: string) => void;
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 size={18} className="text-green-500" />,
    error:   <AlertCircle size={18} className="text-red-500" />,
    info:    <Info size={18} className="text-blue-500" />,
    loading: <Loader2 size={18} className="text-primary animate-spin" />
};

const TOAST_COLORS: Record<ToastType, string> = {
    success: 'border-green-500/20 shadow-green-500/5',
    error:   'border-red-500/20 shadow-red-500/5',
    info:    'border-blue-500/20 shadow-blue-500/5',
    loading: 'border-primary/20 shadow-primary/5'
};

export const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose }) => {
    useEffect(() => {
        if (toast.type === 'loading') return;
        const timer = setTimeout(() => onClose(toast.id), toast.duration || 5000);
        return () => clearTimeout(timer);
    }, [toast, onClose]);

    return (
        <div className={cn(
            'flex flex-col w-full max-w-sm bg-bg-surface/90 backdrop-blur-md border rounded-2xl p-4 shadow-2xl transition-all duration-300 animate-in slide-in-from-right-full',
            TOAST_COLORS[toast.type]
        )}>
            <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                    {TOAST_ICONS[toast.type]}
                </div>
                <div className="flex-1 min-w-0">
                    {toast.title && (
                        <div className="text-xs font-black uppercase tracking-wider text-text-primary mb-1">
                            {toast.title}
                        </div>
                    )}
                    <div className="text-sm text-text-muted leading-relaxed font-medium">
                        {toast.message}
                    </div>
                </div>
                {toast.type !== 'loading' && (
                    <button 
                        onClick={() => onClose(toast.id)}
                        className="p-1 hover:bg-muted rounded-full transition-colors text-text-muted"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
            
            {/* Progress Bar (Manual Timer Visual) */}
            {toast.type !== 'loading' && (
                <div className="absolute bottom-0 left-0 h-0.5 bg-current opacity-20 w-full overflow-hidden rounded-b-2xl">
                    <div 
                        className={cn(
                            "h-full bg-current",
                            toast.type === 'success' ? 'bg-green-500' : 
                            toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                        )}
                        style={{ 
                            animation: `toast-progress ${toast.duration || 5000}ms linear forwards` 
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export const ToastContainer: React.FC<{ toasts: Toast[]; removeToast: (id: string) => void }> = ({ 
    toasts, 
    removeToast 
}) => {
    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
            {toasts.map((toast) => (
                <div key={toast.id} className="pointer-events-auto">
                    <ToastItem toast={toast} onClose={removeToast} />
                </div>
            ))}
        </div>
    );
};
