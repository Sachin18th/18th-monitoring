'use client';

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, Input, Typography, Badge } from '@kpi-platform/ui';
import { 
  ArrowRight, Lock, Mail, ShieldCheck, Activity, Layers3, 
  CheckCircle2, Eye, EyeOff, Command, ChevronRight, User, MousePointer2,
  Sparkles, Globe, Zap, AlertTriangle
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

const BrandLockup = () => (
  <div className="flex items-center gap-4 mb-10">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-premium shadow-primary/25 relative overflow-hidden group">
      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
      <Command size={28} className="relative z-10" />
    </div>
    <div className="flex flex-col">
      <span className="text-2xl font-black tracking-tighter text-text-primary leading-none">GRAVITY</span>
      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mt-1">Monitoring Platform</span>
    </div>
  </div>
);

const FeatureItem = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => (
  <div
    className="flex flex-col rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300 group"
    style={{ gap: 20, padding: '24px 22px' }}
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 group-hover:scale-110 transition-transform">
      <Icon size={24} />
    </div>
    <div>
      <Typography variant="h3" noMargin className="text-white group-hover:text-primary transition-colors">{title}</Typography>
      <Typography variant="caption" className="text-white/60 mt-3">{description}</Typography>
    </div>
  </div>
);

const RoleSelectorItem = ({ icon: Icon, title, description, isSelected, onClick }: any) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "w-full flex items-center rounded-xl border text-left transition-all duration-300 role-item",
      isSelected 
        ? "bg-primary/5 border-primary shadow-[0_0_20px_rgba(37,99,235,0.1)]" 
        : "bg-bg-muted/30 border-border-subtle hover:border-border-interactive hover:bg-bg-card"
    )}
    style={{ gap: 8, padding: '8px 12px', minHeight: 40, borderRadius: 12 }}
  >
    <div className={cn(
      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-all",
      isSelected ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-bg-card text-text-muted border-border-subtle"
    )}>
      <Icon size={12} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <Typography variant="body" weight="bold" noMargin className={isSelected ? "text-primary text-[11px] leading-none" : "text-text-primary text-[11px] leading-none"}>
          {title}
        </Typography>
        {isSelected && <ChevronRight size={12} className="text-primary animate-pulse" />}
      </div>
      <Typography variant="micro" className="truncate opacity-70 text-[9px] leading-tight tracking-[0.07em]">{description}</Typography>
    </div>
  </button>
);

// ─── Main Component ──────────────────────────────────────────────────────────

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError('Invalid Credential.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectDemoRole = (roleEmail: string) => {
    setEmail(roleEmail);
    setPassword('Demo@1234!');
    setError('');
  };

  return (
    <div className="min-h-screen bg-bg-base relative overflow-hidden font-sans flex items-center justify-center selection:bg-primary/30">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-float" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] bg-secondary/10 blur-[100px] rounded-full animate-float" style={{ animationDelay: '-2s' }} />
        <div className="absolute top-[20%] right-[10%] w-[25%] h-[25%] bg-accent/5 blur-[80px] rounded-full animate-float" style={{ animationDelay: '-4s' }} />
      </div>

      <main className="relative z-10 w-full max-w-[1440px] px-6 lg:px-12 py-12 flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
        
        {/* Left: Branding & Value Prop */}
        <section className="auth-left flex-1 flex flex-col max-w-2xl text-center lg:text-left">
          <BrandLockup />
          
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 w-fit mb-8 self-center lg:self-start animate-fade-in">
              <Sparkles size={16} className="text-primary" />
              <Typography variant="micro" weight="bold" className="text-primary !mb-0">Enterprise Grade Observability</Typography>
          </div>

          <Typography variant="display" className="mb-8 !leading-[1.05] tracking-tightest">
            The next generation of <span className="text-primary italic">operational intelligence.</span>
          </Typography>

          <Typography variant="body" className="text-xl mb-12 opacity-80 leading-relaxed">
            Centralize telemetry, platform health, and business KPIs into one high-fidelity control surface. Built for modern commerce ecosystems.
          </Typography>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
            <FeatureItem icon={Zap} title="Live Metrics" description="Real-time stream of all critical signals." />
            <FeatureItem icon={Globe} title="Global Scale" description="Multi-region monitoring at your fingertips." />
            <FeatureItem icon={ShieldCheck} title="Secured" description="Enterprise-grade tenant isolation." />
          </div>

          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-8 opacity-60">
             <div className="flex items-center gap-2">
               <ShieldCheck size={18} />
               <Typography variant="micro" weight="bold">AES-256 Encryption</Typography>
             </div>
             <div className="flex items-center gap-2">
               <ShieldCheck size={18} />
               <Typography variant="micro" weight="bold">SOC 2 Compliant</Typography>
             </div>
          </div>
        </section>

        {/* Right: Login Interface */}
        <div className="flex w-full max-w-[520px] shrink-0 items-center justify-center h-screen animate-slide-in-right">
          <Card
            className="login-card !rounded-[24px] bg-white relative group"
              style={{ padding: '28px 32px', height: '85vh', maxHeight: '85vh' }}
          >
              <div className="text-center" style={{ marginBottom: 16 }}>
                <Typography variant="h2" weight="semibold" className="login-card-title mb-1">Workspace Login</Typography>
                <Typography variant="caption" className="login-card-subtitle">Access your operational command center.</Typography>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 12 }}>
                <Input
                  className="login-field"
                  label="Work Email"
                  placeholder="name@company.com"
                  icon={Mail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                  <Input
                    className="login-field"
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    icon={Lock}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    renderRight={
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-text-muted hover:text-text-primary transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    }
                  />
                  <div className="flex justify-end" style={{ paddingTop: 0 }}>
                    <button type="button" className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider">Forgot Password?</button>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-error-bg border border-error/20 rounded-2xl text-error-text text-sm font-bold flex items-center gap-3 animate-shake">
                    <AlertTriangle size={18} />
                    {error}
                  </div>
                )}

                <Button 
                  type="submit" 
                  variant="primary"
                  size="lg"
                  className="authorize-btn w-full rounded-2xl shadow-lg shadow-primary/20 text-[13px] font-bold"
                  style={{ height: 42, marginTop: 0, marginBottom: 12 }}
                  isLoading={isLoading}
                >
                  <span>Authorize Session</span>
                  <span className="authorize-icon"><ArrowRight size={18} /></span>
                </Button>
              </form>

              <div className="flex items-center gap-4" style={{ marginTop: 12, marginBottom: 8 }}>
                <div className="h-px flex-1 bg-border-subtle" />
                <Typography variant="micro" weight="bold" className="text-text-muted opacity-50 !mb-0 text-[10px] tracking-[0.09em]">Demo Environment</Typography>
                <div className="h-px flex-1 bg-border-subtle" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0' }}>
                <div className="grid grid-cols-2" style={{ columnGap: 8, rowGap: 8, marginBottom: 10 }}>
                  <RoleSelectorItem 
                    icon={ShieldCheck} 
                    title="Super Admin" 
                    description="Full Control" 
                    isSelected={email === 'superadmin@18thdigitech.com'}
                    onClick={() => selectDemoRole('superadmin@18thdigitech.com')}
                  />
                  <RoleSelectorItem 
                    icon={User} 
                    title="Project Admin" 
                    description="Management" 
                    isSelected={email === 'projectadmin@18thdigitech.com'}
                    onClick={() => selectDemoRole('projectadmin@18thdigitech.com')}
                  />
                  <RoleSelectorItem 
                    icon={Layers3} 
                    title="Ops Lead" 
                    description="Incident Control" 
                    isSelected={email === 'opslead@18thdigitech.com'}
                    onClick={() => selectDemoRole('opslead@18thdigitech.com')}
                  />
                  <RoleSelectorItem 
                    icon={Eye} 
                    title="Analyst" 
                    description="ReadOnly" 
                    isSelected={email === 'analyst@18thdigitech.com'}
                    onClick={() => selectDemoRole('analyst@18thdigitech.com')}
                  />
                </div>
              </div>
              
              {/* <div className="bg-gray-50 border border-gray-200 rounded-2xl text-center" style={{ marginTop: 0, padding: '8px 12px' }}>
                <Typography variant="micro" weight="bold" className="!mb-0 text-[10px] leading-tight text-gray-600">
                  SHARED DEMO PASSWORD: <span className="select-all font-mono text-primary bg-primary/10 px-2 py-0.5 rounded ml-1">Demo@1234!</span>
                </Typography>
              </div> */}
          </Card>
        </div>
      </main>

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, 30px); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
        .tracking-tightest {
          letter-spacing: -0.05em;

        /* Left panel: dark themed brand area */
        .auth-left {
          background: linear-gradient(180deg, rgba(6,10,22,0.98) 0%, rgba(12,20,36,0.98) 100%);
          color: #e6eefc;
          padding: 48px 48px 48px 56px;
          border-radius: 16px 0 0 16px;
        }
        .auth-left .text-2xl { color: #fff; }
        .auth-left .text-primary { color: #7fb3ff !important; }
        .auth-left .FeatureItem, .auth-left .feature { color: #dbeafe; }

        /* Right card: light panel */
        .login-card {
          border: 1px solid rgba(15,23,42,0.04) !important;
          box-shadow: 0 8px 24px rgba(11,20,35,0.06);
          background: #f6f8fa !important;
          border-radius: 16px !important;
        }

        /* Inputs inside right panel: dark bar look */
        .login-card .ui-input {
          background: #0f1724 !important;
          color: #fff !important;
          border: 1px solid rgba(255,255,255,0.04) !important;
          height: 44px !important;
          border-radius: 10px !important;
        }
        .login-card .ui-input::placeholder { color: rgba(255,255,255,0.5) !important; }
        .login-card .input-label { color: #6b7280 !important; font-size: 11px !important; }

        /* Role buttons: subtle blue outline and rounder corners */
        .login-card .role-item {
          border: 1px solid rgba(99,102,241,0.12) !important;
          background: #ffffff !important;
          box-shadow: 0 1px 0 rgba(16,24,40,0.02) inset;
          border-radius: 12px !important;
          padding: 8px 12px !important;
          min-height: 40px !important;
        }

        /* Shared demo password box */
        .login-card .shared-demo {
          background: #ffffff; border: 1px solid rgba(15,23,42,0.04); padding: 8px 12px; border-radius: 8px; margin-top: 6px; text-align: center; font-weight:700; color:#0f1724;
        }
        }

        .login-card .login-card-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .login-card .login-card-subtitle {
          font-size: 12px;
          margin-bottom: 16px;
        }

        /* Increase Workspace Login prominence */
        .login-card .login-card-title {
          font-size: 24px;
          font-weight: 700;
        }

        /* Authorize button: force single-row layout */
        .login-card .authorize-btn {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          white-space: nowrap !important;
        }
        .login-card .authorize-btn .authorize-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          margin-left: 6px;
        }

        /* Ensure SVGs inside buttons don't sit on the text baseline */
        .login-card .authorize-btn .authorize-icon svg,
        .login-card .authorize-btn svg {
          display: block;
        }

        /* Input padding when icon present: ensure placeholder and content don't overlap icons */
        .login-card .login-field .ui-input.pl-11 { padding-left: 44px !important; }
        .login-card .login-field .ui-input.pr-11 { padding-right: 44px !important; }

        /* Login card shadow: remove border and add layered shadow */
        .login-card {
          border: none !important;
          box-shadow: 0 6px 18px rgba(16,24,40,0.06);
          border-radius: 20px !important;
          width: 100%;
          max-width: 520px;
          height: 85vh;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
        }

        /* Responsive adjustments to preserve layout and avoid clipping.
           Use font-size scaling and enable internal scroll when viewport is too short.
        */
        @media (max-height: 699px) {
          .login-card {
            font-size: 90%;
            padding: 20px 20px;
            max-height: 85vh;
            overflow: auto;
          }
        }

        @media (min-height: 700px) and (max-height: 899px) {
          .login-card {
            font-size: 95%;
            padding: 24px 28px;
            overflow: auto;
          }
        }

        @media (min-height: 900px) {
          .login-card {
            font-size: 100%;
            padding: 28px 32px;
            overflow: visible;
          }
        }

        .login-card .login-field {
          gap: 4px;
        }

        .login-card .login-field .input-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.09em;
          margin-bottom: 4px;
        }

        .login-card .login-field .input-container {
          height: 40px;
        }

        .login-card .login-field .ui-input {
          height: 40px;
          font-size: 13px;
          padding-top: 0;
          padding-bottom: 0;
          padding-left: 12px;
          padding-right: 12px;
        }

        .login-card .login-field .input-container .absolute.left-4 {
          left: 12px;
        }

        .login-card .login-field .input-container .absolute.right-4 {
          right: 12px;
        }

        .login-card .login-field .input-container svg {
          width: 14px;
          height: 14px;
        }
      `}</style>
    </div>
  );
}