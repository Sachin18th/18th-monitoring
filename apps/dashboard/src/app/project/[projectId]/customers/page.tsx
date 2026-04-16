'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { RoleGuard } from '../../../../components/auth/RoleGuard';

export default function CustomersPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const { apiFetch, user } = useAuth();
    
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', email: '', password: 'password123' });
    const [isSaving, setIsSaving] = useState(false);

    const loadCustomers = async () => {
        setLoading(true);
        try {
            const data = await apiFetch(`/api/v1/admin/projects/${projectId}/customers`);
            setCustomers(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCustomers();
    }, [projectId]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await apiFetch(`/api/v1/admin/projects/${projectId}/customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newCustomer)
            });
            setShowModal(false);
            setNewCustomer({ name: '', email: '', password: 'password123' });
            loadCustomers();
        } catch (e: any) {
            alert(e.message || 'Failed to create customer');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleStatus = async (custId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        try {
            await apiFetch(`/api/v1/admin/customers/${custId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            loadCustomers();
        } catch (e: any) {
            alert(e.message || 'Failed to update status');
        }
    };

    if (loading && customers.length === 0) return <div style={{ padding: '40px', color: 'var(--text-muted)' }}>Loading customers...</div>;

    return (
        <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <div className="animate-fade-in" style={{ position: 'relative' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>Customer Management</h2>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Manage access for viewing <strong>{projectId}</strong></p>
                    </div>
                    <button 
                        onClick={() => setShowModal(true)}
                        style={{
                            padding: '12px 24px', borderRadius: '12px', background: 'var(--accent-blue)',
                            color: '#fff', border: 'none', fontWeight: '800', cursor: 'pointer',
                            boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.25)'
                        }}
                    >
                        + Invite Customer
                    </button>
                </header>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '24px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: 'var(--border-light)' }}>
                            <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                <th style={{ padding: '16px 24px' }}>Customer</th>
                                <th style={{ padding: '16px 24px' }}>Status</th>
                                <th style={{ padding: '16px 24px' }}>Joined</th>
                                <th style={{ padding: '16px 24px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.map((c: any) => (
                                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '20px 24px' }}>
                                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{c.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.email}</div>
                                    </td>
                                    <td style={{ padding: '20px 24px' }}>
                                        <span style={{
                                            padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '800',
                                            background: c.status === 'active' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                            color: c.status === 'active' ? '#22c55e' : '#ef4444',
                                            textTransform: 'uppercase'
                                        }}>
                                            {c.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '20px 24px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        {new Date(c.audit.createdAt).toLocaleDateString()}
                                    </td>
                                    <td style={{ padding: '20px 24px', textAlign: 'right' }}>
                                        <button 
                                            onClick={() => toggleStatus(c.email, c.status)}
                                            style={{
                                                padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                                                background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px',
                                                fontWeight: '700', cursor: 'pointer'
                                            }}
                                        >
                                            {c.status === 'active' ? 'Deactivate' : 'Reactivate'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {customers.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No customers found for this project.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Create Customer Modal */}
                {showModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                    }}>
                        <div style={{
                            background: 'var(--bg-surface)', width: '480px', borderRadius: '24px',
                            padding: '40px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)'
                        }}>
                            <h3 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px' }}>Invite New Viewer</h3>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>
                                This user will have view-only access to <strong>{projectId}</strong>.
                            </p>

                            <form onSubmit={handleCreate}>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-muted)' }}>Full Name</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={newCustomer.name}
                                        onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', background: 'var(--border-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-muted)' }}>Email Address</label>
                                    <input 
                                        required
                                        type="email" 
                                        value={newCustomer.email}
                                        onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', background: 'var(--border-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '32px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-muted)' }}>Initial Password</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={newCustomer.password}
                                        onChange={e => setNewCustomer({...newCustomer, password: e.target.value})}
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', background: 'var(--border-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
                                    />
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>Customers will be prompted to change this on first login (placeholder).</span>
                                </div>

                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <button 
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={isSaving}
                                        style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--accent-blue)', color: '#fff', fontWeight: '800', cursor: isSaving ? 'not-allowed' : 'pointer' }}
                                    >
                                        {isSaving ? 'Saving...' : 'Create Account'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </RoleGuard>
    );
}
