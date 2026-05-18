import React from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@kpi-platform/ui';

export const LoginHeader = () => {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 px-8 py-8 flex items-center justify-between pointer-events-none">
            <Link href="/" className="flex items-center gap-3 pointer-events-auto group">
                <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                        18
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center p-0.5 shadow-sm">
                        <div className="w-full h-full bg-indigo-500 rounded-full" />
                    </div>
                </div>
                <div className="flex flex-col">
                    <span className="text-slate-900 dark:text-white font-bold tracking-tight leading-none text-xl transition-colors">18th Digitech</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-[0.25em] font-bold transition-colors mt-1">Enterprise Monitoring</span>
                </div>
            </Link>
            
            <div className="pointer-events-auto flex items-center gap-8">
                <Link 
                    href="/request-access" 
                    className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-semibold transition-all hover:translate-y-[-1px]"
                >
                    Don't have an account? <span className="text-blue-600 dark:text-blue-400 ml-1">Request Access</span>
                </Link>
                <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />
                <ThemeToggle className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl p-2" />
            </div>
        </header>
    );
};
