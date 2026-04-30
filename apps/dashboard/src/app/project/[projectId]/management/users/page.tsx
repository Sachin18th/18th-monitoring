
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Input, Typography } from '@kpi-platform/ui';
import { Plus, RefreshCw, ShieldCheck, UserPlus, UserX, Users, X } from 'lucide-react';
import { useAuth } from '../../../../../context/AuthContext';
import { RoleGuard } from '../../../../../components/auth/RoleGuard';
import { MonitoringFilterBar } from '../../../../../components/ui/MonitoringFilterBar';
import { SectionHeader } from '../../../../../components/ui/SectionHeader';
import { SortableTable } from '../../../../../components/ui/SortableTable';

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'block',
  overflow: 'visible',
};

const sectionSpacingStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
};

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '24px',
  overflow: 'visible',
};

const metricCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  minHeight: '140px',
  overflow: 'visible',
};

const metricTopRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '12px',
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
  fontWeight: 500,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metricValueStyle: React.CSSProperties = {
  fontSize: '38px',
  fontWeight: 500,
  color: 'var(--text-primary)',
  lineHeight: 1,
  padding: '8px 0',
  overflow: 'visible',
};

const metricBottomRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: '12px',
};

const panelGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '24px',
  overflow: 'visible',
};

const contentPanelStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible',
};

const headerActionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  borderRadius: '8px',
  border: '1px solid var(--border-input)',
  background: 'var(--bg-input)',
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--text-primary)',
  flexShrink: 0,
  cursor: 'pointer',
};

const heroTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '4px',
  fontSize: '20px',
  lineHeight: 1.25,
  fontWeight: 500,
  color: 'var(--text-primary)',
};

const errorBannerStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(244,63,94,0.2)',
  background: 'rgba(244,63,94,0.1)',
  padding: '12px 16px',
  color: '#fb7185',
  overflow: 'visible',
};

const errorTextStyle: React.CSSProperties = {
  fontSize: '14px',
  textAlign: 'center',
  overflowWrap: 'anywhere',
};

export default function UserManagementPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { apiFetch } = useAuth();

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: 'password123', role: 'CUSTOMER' });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/v1/admin/projects/${projectId}/users`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load project users.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const stats = useMemo(() => {
    const activeUsers = users.filter((user) => user.status === 'active');
    const inactiveUsers = users.filter((user) => user.status !== 'active');
    const adminUsers = users.filter((user) => String(user.role || '').toUpperCase().includes('ADMIN'));

    return {
      total: users.length,
      active: activeUsers.length,
      inactive: inactiveUsers.length,
      admins: adminUsers.length,
    };
  }, [users]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      await apiFetch(`/api/v1/admin/projects/${projectId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      setShowModal(false);
      setNewUser({ name: '', email: '', password: 'password123', role: 'CUSTOMER' });
      await loadUsers();
    } catch (createError: any) {
      alert(createError.message || 'Failed to create user');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (uid: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await apiFetch(`/api/v1/admin/users/${uid}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      await loadUsers();
    } catch (statusError: any) {
      alert(statusError.message || 'Failed to update user status');
    }
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
        <div style={{ ...pageStyle, ...sectionSpacingStyle }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ maxWidth: '42rem', minWidth: 0 }}>
              <h1 style={heroTitleStyle}>
                <ShieldCheck style={{ width: '20px', height: '20px', color: '#818cf8', flexShrink: 0 }} />
                <span>User Management</span>
              </h1>
              <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                Manage project access, permissions, and account status for {projectId}.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
              <button onClick={loadUsers} style={headerActionButtonStyle}>
                <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0 }} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button
                onClick={() => setShowModal(true)}
                style={{ ...headerActionButtonStyle, border: 'none', background: '#2563EB', color: '#fff' }}
              >
                <Plus style={{ width: '16px', height: '16px', flexShrink: 0 }} /> Invite user
              </button>
            </div>
          </div>

          {error ? (
            <div style={errorBannerStyle}>
              <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
                <span style={errorTextStyle}>{error}</span>
              </div>
              <button
                onClick={loadUsers}
                style={{ marginLeft: '8px', flexShrink: 0, fontSize: '14px', fontWeight: 500, textDecoration: 'underline', color: '#fb7185', cursor: 'pointer', background: 'transparent', border: 'none' }}
              >
                Retry
              </button>
            </div>
          ) : null}

          <div style={metricGridStyle}>
            {[
              { label: 'Total Users', value: String(stats.total), icon: Users },
              { label: 'Active Access', value: String(stats.active), icon: ShieldCheck },
              { label: 'Inactive', value: String(stats.inactive), icon: UserX },
              { label: 'Admins', value: String(stats.admins), icon: UserPlus },
            ].map((stat) => (
              <div key={stat.label} style={metricCardStyle}>
                <div style={metricTopRowStyle}>
                  <span style={metricLabelStyle}>{stat.label}</span>
                  <stat.icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                </div>
                <div style={metricValueStyle}>{stat.value}</div>
                <div style={metricBottomRowStyle}>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      background: 'var(--success-bg)',
                      color: 'var(--success-text)',
                    }}
                  >
                    {stat.label === 'Inactive' ? 'OFFLINE' : stat.label === 'Admins' ? 'PRIVILEGED' : 'ACTIVE'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-label)', marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {stat.label}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={panelGridStyle}>
            <div style={contentPanelStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
                <SectionHeader
                  title="Access roster"
                  subtitle="Administrators, managers, and customer users are managed from one consistent access table."
                  icon={<ShieldCheck size={16} />}
                />
              </div>

              <MonitoringFilterBar />

              <SortableTable
                loading={loading}
                data={users}
                emptyMessage="No users have been added to this project yet."
                columns={[
                  {
                    key: 'name',
                    label: 'User',
                    sortable: true,
                    render: (_value, row) => (
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.email}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'role',
                    label: 'Role',
                    sortable: true,
                    render: (value) => <span className="dashboard-inline-status">{String(value).replace('_', ' ')}</span>,
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    sortable: true,
                    render: (value) => (
                      <span className={`dashboard-inline-status ${value === 'active' ? 'is-success' : 'is-danger'}`}>
                        {value}
                      </span>
                    ),
                  },
                  {
                    key: 'createdAt',
                    label: 'Joined',
                    sortable: true,
                    render: (_value, row) => (row.audit?.createdAt ? new Date(row.audit.createdAt).toLocaleDateString() : '--'),
                  },
                  {
                    key: 'actions',
                    label: 'Actions',
                    align: 'right',
                    render: (_value, row) => (
                      <Button variant="outline" size="sm" onClick={() => toggleStatus(row.email, row.status)}>
                        {row.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    ),
                  },
                ]}
              />
            </div>
          </div>

          {showModal ? (
            <div className="dashboard-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invite-user-title">
              <div className="dashboard-modal-card">
                <div className="dashboard-stack" style={{ gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                    <div>
                      <Typography variant="h2" noMargin id="invite-user-title">
                        Invite project user
                      </Typography>
                      <Typography variant="body" color="secondary">
                        Add a new workspace user for {projectId}. They will be prompted to update their password after first login.
                      </Typography>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setShowModal(false)} aria-label="Close dialog">
                      <X size={18} />
                    </Button>
                  </div>

                  <form onSubmit={handleCreate} className="dashboard-stack" style={{ gap: '1rem' }}>
                    <Input
                      label="Full name"
                      value={newUser.name}
                      onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
                      required
                    />
                    <Input
                      label="Email address"
                      type="email"
                      value={newUser.email}
                      onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
                      required
                    />
                    <Input
                      label="Temporary password"
                      value={newUser.password}
                      onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
                      helperText="Users will be prompted to change this password after sign-in."
                      required
                    />

                    <div className="dashboard-action-row" style={{ justifyContent: 'flex-end' }}>
                      <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" isLoading={isSaving}>
                        Create account
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </RoleGuard>
  );
}
