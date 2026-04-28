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
      "w-full flex items-center rounded-2xl border text-left transition-all duration-300",
      isSelected 
        ? "bg-primary/5 border-primary shadow-[0_0_20px_rgba(37,99,235,0.1)]" 
        : "bg-bg-muted/30 border-border-subtle hover:border-border-interactive hover:bg-bg-card"
    )}
    style={{ gap: 16, padding: '14px 16px', minHeight: 84 }}
  >
    <div className={cn(
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all",
      isSelected ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-bg-card text-text-muted border-border-subtle"
    )}>
      <Icon size={20} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <Typography variant="body" weight="bold" noMargin className={isSelected ? "text-primary" : "text-text-primary"}>
          {title}
        </Typography>
        {isSelected && <ChevronRight size={16} className="text-primary animate-pulse" />}
      </div>
      <Typography variant="micro" className="truncate opacity-70">{description}</Typography>
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
      setError(err.message || 'Invalid email or password.');
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
        <section className="flex-1 flex flex-col max-w-2xl text-center lg:text-left">
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
        <div className="w-full max-w-[520px] shrink-0 animate-slide-in-right">
          <Card
            className="!rounded-[40px] border-border-subtle bg-bg-card/80 backdrop-blur-xl shadow-premium relative overflow-hidden group"
            style={{ padding: '36px 32px' }}
          >
              {/* Subtle top accent */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-secondary to-accent opacity-50" />
              
              <div className="text-center" style={{ marginBottom: 28 }}>
                <Typography variant="h2" weight="semibold" className="mb-2">Workspace Login</Typography>
                <Typography variant="caption">Access your operational command center.</Typography>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 20 }}>
                <Input
                  label="Work Email"
                  placeholder="name@company.com"
                  icon={Mail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Input
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
                  <div className="flex justify-end" style={{ paddingTop: 4 }}>
                    <button type="button" className="text-[11px] font-bold text-primary hover:underline uppercase tracking-wider">Forgot Password?</button>
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
                  className="w-full rounded-2xl shadow-lg shadow-primary/20 text-base"
                  style={{ marginTop: 8 }}
                  isLoading={isLoading}
                >
                  Authorize Session
                  <ArrowRight size={18} className="ml-2" />
                </Button>
              </form>

              <div className="flex items-center gap-4" style={{ marginTop: 26, marginBottom: 22 }}>
                <div className="h-px flex-1 bg-border-subtle" />
                <Typography variant="micro" weight="bold" className="text-text-muted opacity-50 !mb-0">Demo Environment</Typography>
                <div className="h-px flex-1 bg-border-subtle" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '2px 0' }}>
                <div className="grid grid-cols-2" style={{ columnGap: 12, rowGap: 12 }}>
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
                    isSelected={email === 'admin@18thdigitech.com'}
                    onClick={() => selectDemoRole('admin@18thdigitech.com')}
                  />
                  <RoleSelectorItem 
                    icon={Layers3} 
                    title="Ops Lead" 
                    description="Incident Control" 
                    isSelected={email === 'contributor@18thdigitech.com'}
                    onClick={() => selectDemoRole('contributor@18thdigitech.com')}
                  />
                  <RoleSelectorItem 
                    icon={Eye} 
                    title="Analyst" 
                    description="ReadOnly" 
                    isSelected={email === 'viewer@18thdigitech.com'}
                    onClick={() => selectDemoRole('viewer@18thdigitech.com')}
                  />
                </div>
              </div>
              
              <div className="bg-primary/5 border border-primary/10 rounded-2xl text-center" style={{ marginTop: 18, padding: '14px 16px' }}>
                <Typography variant="micro" weight="bold" className="!mb-0">
                  Shared Demo Password: <span className="select-all font-mono text-primary bg-primary/10 px-2 py-0.5 rounded ml-1">Demo@1234!</span>
                </Typography>
              </div>
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
        }
      `}</style>
    </div>
  );
}
