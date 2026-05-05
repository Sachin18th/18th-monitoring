import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

export const LoginFooter = () => {
  return (
    <footer className="fixed bottom-0 left-0 right-0 p-8 flex items-center justify-between text-[11px] font-medium text-slate-400 dark:text-slate-500 pointer-events-none">
      <div className="flex items-center gap-6 pointer-events-auto">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-blue-500/50" />
          <span>AES-256 Encryption</span>
        </div>
        <div className="flex items-center gap-2">
          <Lock size={14} className="text-blue-500/50" />
          <span>SOC2 Type II Compliant</span>
        </div>
      </div>

      <div className="flex items-center gap-6 pointer-events-auto">
        <a href="/privacy" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Privacy Policy</a>
        <a href="/terms" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Terms of Service</a>
        <span className="text-slate-300 dark:text-slate-800">|</span>
        <span>&copy; 2026 18th Digitech</span>
      </div>
    </footer>
  );
};
