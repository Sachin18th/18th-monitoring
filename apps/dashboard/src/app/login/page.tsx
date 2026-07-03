'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, Input, Typography } from '@kpi-platform/ui';
import { ArrowRight, Command, Lock, Mail, AlertTriangle, ArrowLeft } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const RESEND_COOLDOWN_SECONDS = 30;

type Step = 'email' | 'code';

export default function LoginPage() {
  const { login, establishSession } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [usePassword, setUsePassword] = useState(false);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const requestCode = async () => {
    setError('');
    setInfo('');
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE}/api/v1/auth/otp/request`, { email });
      setStep('code');
      setInfo(`We sent a 6-digit code to ${email}. It expires in 10 minutes.`);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email) return;
    await requestCode();
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/v1/auth/otp/verify`, { email, code });
      const { token, user } = res.data.data;
      establishSession(token, user);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Invalid or expired code.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError('Invalid credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const backToEmail = () => {
    setStep('email');
    setCode('');
    setError('');
    setInfo('');
  };

  const ErrorBanner = () =>
    error ? (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
        <AlertTriangle size={16} />
        <span>{error}</span>
      </div>
    ) : null;

    
  return (
    <div className="login-shell flex min-h-screen items-center justify-center bg-[#f6f8fa] px-4 py-12">
      <div className="w-full max-w-[420px]">
        {/* Brand */}
        <div className="flex flex-col items-center text-center" style={{ marginBottom: '40px' }}>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#2563eb] text-white shadow-md shadow-blue-500/20">
            <Command size={22} />
          </div>
          <span className="text-lg font-black tracking-tight text-[#0f1724]">KPI</span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563eb]">
            Monitoring Platform
          </span>
        </div>

        <Card className="!rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white" style={{ padding: '28px 28px' }}>
          {/* ── EMAIL STEP ──────────────────────────────────────────── */}
          {step === 'email' && (
            <>
              <div className="mb-6 text-center">
                <Typography variant="h2" weight="semibold" noMargin className="text-[#0f1724]">
                  Welcome back
                </Typography>
                <Typography variant="caption" className="mt-1 text-[#64748b]">
                  {usePassword
                    ? 'Sign in with your email and password.'
                    : 'Enter your email and we’ll send you a login code.'}
                </Typography>
              </div>

              {!usePassword ? (
                <form onSubmit={handleSendCode} className="flex flex-col gap-4">
                  <Input
                    label="Email address"
                    type="email"
                    placeholder="name@company.com"
                    icon={Mail}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                  <ErrorBanner />
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full rounded-xl"
                    isLoading={isLoading}
                  >
                    Send code
                    <ArrowRight size={18} className="ml-2" />
                  </Button>
                </form>
              ) : (
                <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
                  <Input
                    label="Email address"
                    type="email"
                    placeholder="name@company.com"
                    icon={Mail}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    icon={Lock}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <ErrorBanner />
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full rounded-xl"
                    isLoading={isLoading}
                  >
                    Sign in
                    <ArrowRight size={18} className="ml-2" />
                  </Button>
                </form>
              )}

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-[rgba(15,23,42,0.08)]" />
                <span className="text-xs text-[#94a3b8]">or</span>
                <div className="h-px flex-1 bg-[rgba(15,23,42,0.08)]" />
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setUsePassword((v) => !v);
                    setError('');
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#475569] hover:text-[#0f1724]"
                >
                  <Lock size={14} />
                  {usePassword ? 'Sign in with a code instead' : 'Sign in with password instead'}
                </button>
              </div>
            </>
          )}

          {/* ── CODE STEP ───────────────────────────────────────────── */}
          {step === 'code' && (
            <>
              <div className="mb-6 text-center">
                <Typography variant="h2" weight="semibold" noMargin className="text-[#0f1724]">
                  Enter your code
                </Typography>
                <Typography variant="caption" className="mt-1 text-[#64748b]">
                  {info || `We sent a 6-digit code to ${email}.`}
                </Typography>
              </div>

              <form onSubmit={handleVerify} className="flex flex-col gap-4">
                <Input
                  label="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center !text-2xl !tracking-[0.5em]"
                  required
                  autoFocus
                />
                <ErrorBanner />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full rounded-xl"
                  isLoading={isLoading}
                  disabled={code.length !== 6}
                >
                  Verify
                  <ArrowRight size={18} className="ml-2" />
                </Button>
              </form>

              <div className="mt-5 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={backToEmail}
                  className="inline-flex items-center gap-1 font-semibold text-[#64748b] hover:text-[#0f1724]"
                >
                  <ArrowLeft size={14} />
                  Use a different email
                </button>
                <button
                  type="button"
                  onClick={requestCode}
                  disabled={cooldown > 0 || isLoading}
                  className="font-bold text-[#2563eb] hover:underline disabled:cursor-not-allowed disabled:text-[#94a3b8] disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
                </button>
              </div>
            </>
          )}
        </Card>

        <p className="text-center text-xs text-[#94a3b8]" style={{ marginTop: '40px' }}>
          © {new Date().getFullYear()} Gravity Monitoring Platform. All rights reserved.
        </p>
      </div>

      <style jsx global>{`
        .login-shell .ui-input {
          background: #ffffff;
          color: #0f1724;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 10px;
          height: 44px;
        }
        .login-shell .ui-input::placeholder {
          color: #94a3b8;
        }
        .login-shell .input-label {
          color: #334155;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0;
          text-transform: none;
          margin-bottom: 6px;
        }
      `}</style>
    </div>
  );
}