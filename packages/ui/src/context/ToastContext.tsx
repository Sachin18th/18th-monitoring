'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast, ToastType, ToastContainer } from '../components/Feedback/Toast';

interface ToastContextType {
    showToast: (message: string, options?: { title?: string; type?: ToastType; duration?: number }) => string;
    removeToast: (id: string) => void;
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, options: { title?: string; type?: ToastType; duration?: number } = {}) => {
        const id = Math.random().toString(36).substring(2, 9);
        const { title, type = 'info', duration = 5000 } = options;

        const newToast: Toast = { id, message, title, type, duration };
        setToasts((prev) => [...prev, newToast]);

        return id;
    }, []);

    const success = useCallback((message: string, title?: string) => 
        showToast(message, { type: 'success', title: title || 'Success' }), [showToast]);

    const error = useCallback((message: string, title?: string) => 
        showToast(message, { type: 'error', title: title || 'Error' }), [showToast]);

    return (
        <ToastContext.Provider value={{ showToast, removeToast, success, error }}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
