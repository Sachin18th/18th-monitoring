// 'use client';
// import React, { useEffect } from 'react';
// import { X, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';
// import { clsx, type ClassValue } from 'clsx';
// import { twMerge } from 'tailwind-merge';

// function cn(...inputs: ClassValue[]) {
//     return twMerge(clsx(inputs));
// }

// export type ToastType = 'success' | 'error' | 'info' | 'loading';

// export interface Toast {
//     id: string;
//     message: string;
//     title?: string;
//     type: ToastType;
//     duration?: number;
// }

// interface ToastItemProps {
//     toast: Toast;
//     onClose: (id: string) => void;
// }

// const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
//     success: <CheckCircle2 size={18} className="text-green-500" />,
//     error:   <AlertCircle size={18} className="text-red-500" />,
//     info:    <Info size={18} className="text-blue-500" />,
//     loading: <Loader2 size={18} className="text-primary animate-spin" />
// };

// const TOAST_COLORS: Record<ToastType, string> = {
//     success: 'border-l-4 border-l-green-500 bg-green-50/80 dark:bg-green-950/40',
//     error:   'border-l-4 border-l-red-500 bg-red-50/80 dark:bg-red-950/40',
//     info:    'border-l-4 border-l-blue-500 bg-blue-50/80 dark:bg-blue-950/40',
//     loading: 'border-l-4 border-l-primary bg-primary/10 dark:bg-primary/20'
// };

// export const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose }) => {
//     useEffect(() => {
//         if (toast.type === 'loading') return;
//         const timer = setTimeout(() => onClose(toast.id), toast.duration || 5000);
//         return () => clearTimeout(timer);
//     }, [toast, onClose]);

//     return (
//         <div className={cn(
//             'relative flex self-start gap-4 w-full max-w-sm bg-bg-surface/95 backdrop-blur-md rounded-lg px-5 py-4 shadow-xl transition-all duration-300 animate-in slide-in-from-right-full overflow-hidden',
//             TOAST_COLORS[toast.type]
//         )}>
//             <div className="mt-0.5 shrink-0">
//                 {TOAST_ICONS[toast.type]}
//             </div>
//             <div className="flex-1 min-w-0">
//                 {toast.title && (
//                     <div className="text-xs font-bold uppercase tracking-wide text-text-primary mb-1.5">
//                         {toast.title}
//                     </div>
//                 )}
//                 <div className="text-sm text-text-muted leading-snug font-medium">
//                     {toast.message}
//                 </div>
//             </div>
//             {toast.type !== 'loading' && (
//                 <button 
//                     onClick={() => onClose(toast.id)}
//                     className="shrink-0 p-1.5 hover:bg-muted/50 dark:hover:bg-muted/30 rounded-full transition-colors text-text-muted hover:text-text-primary"
//                 >
//                     <X size={16} />
//                 </button>
//             )}
            
//             {/* Progress Bar (Manual Timer Visual) */}
//             {toast.type !== 'loading' && (
//                 <div className="absolute bottom-0 left-0 h-1 w-full overflow-hidden bg-transparent">
//                     <div 
//                         className={cn(
//                             "h-full",
//                             toast.type === 'success' ? 'bg-green-500' : 
//                             toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
//                         )}
//                         style={{ 
//                             animation: `toast-progress ${toast.duration || 5000}ms linear forwards` 
//                         }}
//                     />
//                 </div>
//             )}
//         </div>
//     );
// };

// export const ToastContainer: React.FC<{ toasts: Toast[]; removeToast: (id: string) => void }> = ({ 
//     toasts, 
//     removeToast 
// }) => {
//     return (
//         <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
//             {toasts.map((toast) => (
//                 <div key={toast.id} className="pointer-events-auto">
//                     <ToastItem toast={toast} onClose={removeToast} />
//                 </div>
//             ))}
//         </div>
//     );
// };

'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    CheckCircle2,
    AlertCircle,
    Info,
    Loader2,
} from 'lucide-react';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/* ────────────────────────────────────────────────────────────── */
/* Utils */
/* ────────────────────────────────────────────────────────────── */

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/* ────────────────────────────────────────────────────────────── */
/* Types */
/* ────────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────── */
/* Icon config */
/* ────────────────────────────────────────────────────────────── */

const ICON_CONFIG = {
    success: {
        icon: CheckCircle2,
        iconClass: 'text-emerald-500',
        ringClass:
            'bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-200 dark:ring-emerald-500/20',
    },

    error: {
        icon: AlertCircle,
        iconClass: 'text-red-500',
        ringClass:
            'bg-red-100/70 dark:bg-red-500/15 ring-1 ring-red-200 dark:ring-red-500/20',
    },

    info: {
        icon: Info,
        iconClass: 'text-blue-500',
        ringClass:
            'bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-200 dark:ring-blue-500/20',
    },

    loading: {
        icon: Loader2,
        iconClass: 'text-violet-500 animate-spin',
        ringClass:
            'bg-violet-50 dark:bg-violet-500/10 ring-1 ring-violet-200 dark:ring-violet-500/20',
    },
} satisfies Record<
    ToastType,
    {
        icon: React.ElementType;
        iconClass: string;
        ringClass: string;
    }
>;

/* ────────────────────────────────────────────────────────────── */
/* Toast Item */
/* ────────────────────────────────────────────────────────────── */

export const ToastItem: React.FC<ToastItemProps> = ({
    toast,
    onClose,
}) => {
    const [visible, setVisible] = useState(false);

    const duration = toast.duration ?? 5000;

    /* Mount animation */
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            setVisible(true);
        });

        return () => cancelAnimationFrame(raf);
    }, []);

    /* Auto dismiss */
    useEffect(() => {
        if (toast.type === 'loading') return;

        const timer = setTimeout(() => {
            onClose(toast.id);
        }, duration);

        return () => clearTimeout(timer);
    }, [toast.id, toast.type, duration, onClose]);

    const {
        icon: Icon,
        iconClass,
        ringClass,
    } = ICON_CONFIG[toast.type];

    return (
        <div
            className={cn(
                '!relative !grid !w-full',
                '!min-w-[340px] !max-w-[min(560px,calc(100vw-24px))] !grid-cols-[auto_minmax(0,1fr)] !items-center !gap-4',
                '!border !border-border-subtle !bg-surface-overlay !text-text-primary',
                '!rounded-[18px] !overflow-hidden',
                '!px-4 !py-4 !pr-14',
                '!shadow-[0_18px_50px_rgba(0,0,0,0.35)]',
                '!backdrop-blur-xl',
                '!transition-all !duration-300 !ease-out',
                visible
                    ? '!translate-x-0 !opacity-100'
                    : '!translate-x-8 !opacity-0'
            )}
        >
            {/* Icon */}
            <div
                className={cn(
                    '!flex !h-10 !w-10 !shrink-0 !items-center !justify-center !self-center !rounded-full',
                    ringClass
                )}
            >
                <Icon size={16} className={iconClass} />
            </div>

            {/* Content */}
            <div className="!min-w-0 !self-center !pt-0">
                {toast.title && (
                    <p className="!mb-1.5 !break-words !text-[12px] !font-semibold !leading-none !text-text-primary">
                        {toast.title}
                    </p>
                )}

                <p className="!break-words !text-[13px] !leading-[1.45] !text-text-secondary">
                    {toast.message}
                </p>
            </div>

            {/* Close Button */}
            {toast.type !== 'loading' && (
                <button
                    onClick={() => onClose(toast.id)}
                    aria-label="Dismiss"
                    className={cn(
                        '!absolute !right-3 !top-1/2 !flex !h-8 !w-8 !-translate-y-1/2 !items-center !justify-center !rounded-full',
                        '!text-text-muted hover:!text-text-primary',
                        'hover:!bg-bg-muted',
                        '!transition-all !duration-200'
                    )}
                >
                    <X size={14} strokeWidth={2.5} />
                </button>
            )}
        </div>
    );
};

/* ────────────────────────────────────────────────────────────── */
/* Toast Container */
/* ────────────────────────────────────────────────────────────── */

interface ToastContainerProps {
    toasts: Toast[];
    removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
    toasts,
    removeToast,
}) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const node = (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex max-w-[calc(100vw-16px)] flex-col gap-2.5 sm:bottom-6 sm:right-6">
            {toasts.map((toast) => (
                <div key={toast.id} className="pointer-events-auto">
                    <ToastItem
                        toast={toast}
                        onClose={removeToast}
                    />
                </div>
            ))}
        </div>
    );

    if (!mounted || typeof document === 'undefined') return null;

    return createPortal(node, document.body);
};
