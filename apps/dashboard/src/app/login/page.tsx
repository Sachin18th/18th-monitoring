'use client';
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
        } catch (err) {
            setError('Invalid email or password');
        }
    };

    const quickLogin = (e: string, p: string) => {
        setEmail(e);
        setPassword(p);
    };

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#fff',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            <div style={{
                width: '400px',
                padding: '48px',
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(16px)',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <div style={{
                        width: '48px', height: '48px', margin: '0 auto 16px', borderRadius: '12px',
                        background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '24px', fontWeight: '800'
                    }}>K</div>
                    <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px' }}>Welcome Back</h1>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '14px', marginTop: '8px' }}>
                        KPI Monitoring & Observability
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>Email Address</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{
                                width: '100%', padding: '12px 16px', borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#fff', fontSize: '14px', outline: 'none', transition: 'all 0.2s'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>Password</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%', padding: '12px 16px', borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#fff', fontSize: '14px', outline: 'none'
                            }}
                        />
                    </div>

                    {error && <p style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center' }}>{error}</p>}

                    <button type="submit" style={{
                        marginTop: '12px', padding: '14px', borderRadius: '12px',
                        background: '#2563eb', color: '#fff', border: 'none',
                        fontWeight: '700', fontSize: '15px', cursor: 'pointer',
                        transition: 'transform 0.1s active'
                    }}>
                        Sign In
                    </button>
                </form>

                <div style={{ marginTop: '40px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', pt: '24px' }}>
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)', textAlign: 'center', marginBottom: '16px' }}>Demo Shortcuts</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {[
                            { r: 'Super Admin', e: 'superadmin@monitor.io' },
                            { r: 'Admin', e: 'admin@store001.com' },
                            { r: 'Customer', e: 'viewer@store001.com' }
                        ].map(role => (
                            <button 
                                key={role.e}
                                onClick={() => quickLogin(role.e, 'password123')}
                                style={{
                                    padding: '6px 12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.7)',
                                    fontSize: '11px', fontWeight: '600', cursor: 'pointer'
                                }}
                            >
                                {role.r}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
