'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

export const TopBar = ({ projectId }: { projectId: string }) => {
    const { user, token, apiFetch } = useAuth();
    const [projects, setProjects] = useState<any[]>([]);
    const [simulating, setSimulating] = useState(false);
    const router = useRouter();

    const API_BASE = 'http://localhost:4000';

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            apiFetch(`${API_BASE}/api/v1/projects`)
                .then(data => setProjects(Array.isArray(data) ? data : []))
                .catch(e => console.error(e));
        }
    }, [user, apiFetch]);

    const handleSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'portfolio') {
            router.push('/projects');
        } else {
            router.push(`/project/${val}/overview`);
        }
    };

    const triggerSimulation = async () => {
        setSimulating(true);
        try {
            await apiFetch(`${API_BASE}/api/v1/simulate`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: projectId })
            });
            alert(`Simulation triggered for ${projectId}!`);
        } catch (e) {
            console.error(e);
        } finally {
            setTimeout(() => setSimulating(false), 2000);
        }
    };

    return (
        <header style={{
            height: '72px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px',
            flexShrink: 0, zIndex: 90,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Project</span>
                    <select 
                        value={projectId}
                        onChange={handleSwitch}
                        style={{
                            background: 'var(--border-light)', border: '1px solid var(--border)', borderRadius: '8px',
                            padding: '6px 12px', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', outline: 'none'
                        }}
                    >
                        <optgroup label="Active Project">
                            <option value={projectId}>{projectId}</option>
                        </optgroup>
                        {user?.role === 'SUPER_ADMIN' && (
                            <optgroup label="Switch To">
                                <option value="portfolio">Browse Portfolio...</option>
                                {projects.filter(p => p.id !== projectId).map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </optgroup>
                        )}
                        {user?.role === 'CUSTOMER' && user.assignedProjects.length > 1 && (
                            <optgroup label="Switch To">
                                {projects.filter(p => p.id !== projectId && user.assignedProjects.includes(p.id)).map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>
                
                <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                     {['1h', '24h', '7d'].map((range) => (
                        <button key={range} style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700',
                            background: range === '1h' ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                            color: range === '1h' ? 'var(--accent-blue)' : 'var(--text-muted)',
                            border: 'none', cursor: 'pointer'
                        }}>{range}</button>
                     ))}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                {user?.role !== 'CUSTOMER' && (
                    <button 
                        onClick={triggerSimulation}
                        disabled={simulating}
                        style={{
                            padding: '8px 16px', borderRadius: '10px',
                            background: simulating ? 'var(--border-light)' : 'var(--accent-blue)',
                            color: '#fff', border: 'none', fontSize: '13px', fontWeight: '800', cursor: 'pointer'
                    }}>
                        {simulating ? '⏳ Ingesting...' : '▶ Simulate Events'}
                    </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="status-dot" style={{ background: 'var(--accent-green)' }} />
                    <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>LIVE</span>
                </div>
            </div>
        </header>
    );
};
