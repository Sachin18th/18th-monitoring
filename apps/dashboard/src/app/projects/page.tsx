'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

export default function GlobalProjectsPage() {
    const { user, token, setProject, apiFetch } = useAuth();
    const [projects, setProjects] = useState<any[]>([]);
    const [filter, setFilter] = useState('');
    const router = useRouter();

    useEffect(() => {
        if (!token) return;
        apiFetch('/api/v1/projects')
            .then(data => setProjects(Array.isArray(data) ? data : []))
            .catch(e => console.error(e));
    }, [token, apiFetch]);

    const handleSelect = (pid: string) => {
        setProject(pid);
        router.push(`/project/${pid}/overview`);
    };

    const filtered = projects.filter(p => 
        p.name.toLowerCase().includes(filter.toLowerCase()) || 
        p.id.toLowerCase().includes(filter.toLowerCase())
    );

    if (!user) return null;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-app)',
            padding: '80px 40px',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <header style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    marginBottom: '64px' 
                }}>
                    <div>
                        <div style={{ 
                            fontSize: '12px', fontWeight: '800', color: 'var(--accent-blue)', 
                            textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' 
                        }}>
                            Organization Console
                        </div>
                        <h1 style={{ 
                            fontSize: '40px', fontWeight: '900', color: 'var(--text-primary)', 
                            letterSpacing: '-1.5px', margin: 0 
                        }}>
                            Project Portfolio
                        </h1>
                    </div>
                    
                    <div style={{ position: 'relative', width: '320px' }}>
                        <input 
                            type="text"
                            placeholder="Search projects..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            style={{
                                width: '100%', padding: '14px 20px', borderRadius: '12px',
                                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                color: 'var(--text-primary)', fontSize: '14px', outline: 'none'
                            }}
                        />
                        <span style={{ position: 'absolute', right: '16px', top: '14px', opacity: 0.5 }}>🔍</span>
                    </div>
                </header>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                    gap: '32px'
                }}>
                    {filtered.map(project => (
                        <div 
                            key={project.id}
                            onClick={() => handleSelect(project.id)}
                            style={{
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '24px',
                                padding: '40px',
                                cursor: 'pointer',
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: 'var(--shadow-sm)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-8px)';
                                e.currentTarget.style.borderColor = 'var(--accent-blue)';
                                e.currentTarget.style.boxShadow = 'var(--shadow-xl)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                                <div style={{
                                    width: '56px', height: '56px', borderRadius: '16px',
                                    background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '24px'
                                }}>🏢</div>
                                <div style={{
                                    padding: '6px 14px', borderRadius: '12px', 
                                    background: project.status === 'active' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                    color: project.status === 'active' ? '#22c55e' : '#f59e0b', 
                                    fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px'
                                }}>
                                    {project.status}
                                </div>
                            </div>

                            <h3 style={{ fontSize: '22px', fontWeight: '900', color: 'var(--text-primary)', marginBottom: '12px', letterSpacing: '-0.5px' }}>
                                {project.name}
                            </h3>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '32px', minHeight: '44px' }}>
                                {project.description}
                            </p>

                            <div style={{ 
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px',
                                padding: '20px 0', borderTop: '1px solid var(--border-light)',
                                marginBottom: '24px'
                            }}>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>Active Users</div>
                                    <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>{project.metricsSummary?.activeUsers?.toLocaleString() || '—'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>Error Rate</div>
                                    <div style={{ fontSize: '18px', fontWeight: '800', color: project.metricsSummary?.errorRate > 1 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                                        {project.metricsSummary?.errorRate || 0}%
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)', fontSize: '14px', fontWeight: '800' }}>
                                Launch Dashboard <span style={{ transition: 'transform 0.2s' }} className="arrow">→</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
