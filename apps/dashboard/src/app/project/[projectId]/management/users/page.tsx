
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Input, Typography } from '@kpi-platform/ui';
import { Plus, RefreshCw, ShieldCheck, UserPlus, UserX, Users, X } from 'lucide-react';
import { PROJECT_PAGE_ACCESS_OPTIONS, PROJECT_PAGE_KEYS, normalizeRole } from '@kpi-platform/shared-types';
import { useAuth } from '../../../../../context/AuthContext';
import { RoleGuard } from '../../../../../components/auth/RoleGuard';
import { MonitoringFilterBar } from '../../../../../components/ui/MonitoringFilterBar';
import { SectionHeader } from '../../../../../components/ui/SectionHeader';
import { SortableTable } from '../../../../../components/ui/SortableTable';

const ROLE_OPTIONS_BY_ACCESS = {
  super_admin: [
    { value: 'super_admin', label: 'Super Admin', description: 'Full platform governance across tenants and projects.' },
    { value: 'admin', label: 'Admin', description: 'Can manage project users, access, and governance settings.' },
    { value: 'ops_lead', label: 'Ops Lead', description: 'Can work the project without changing governance settings.' },
    { value: 'analyst', label: 'Analyst', description: 'Read-only access to the assigned project.' },
  ],
  admin: [
    { value: 'ops_lead', label: 'Ops Lead', description: 'Can work the project without changing governance settings.' },
    { value: 'analyst', label: 'Analyst', description: 'Read-only access to the assigned project.' },
  ],
} as const;

type EditableRole = 'super_admin' | 'admin' | 'ops_lead' | 'analyst';

const toStoredRole = (role: string) => {
  switch (normalizeRole(role)) {
    case 'super_admin':
      return 'SUPER_ADMIN';
    case 'admin':
      return 'PROJECT_ADMIN';
    case 'ops_lead':
      return 'OPERATOR';
    case 'analyst':
    default:
      return 'VIEWER';
  }
};

const normalizeEditableRole = (role: string | undefined, fallback: EditableRole = 'analyst'): EditableRole => {
  const normalized = normalizeRole(role);

  if (normalized === 'super_admin' || normalized === 'admin' || normalized === 'ops_lead' || normalized === 'analyst') {
    return normalized;
  }

  return fallback;
};

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

const normalizeStatus = (status: string | undefined) => String(status || '').trim().toUpperCase();

const emptyFormState = {
  name: '',
  email: '',
  password: 'password123',
  role: 'analyst' as EditableRole,
  status: 'ACTIVE',
};

const PROJECT_PERMISSION_STORAGE_PREFIX = 'project-page-permissions';

export default function UserManagementPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { apiFetch, user } = useAuth();

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'access'>('create');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formUser, setFormUser] = useState({ ...emptyFormState });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedPageKeys, setSelectedPageKeys] = useState<string[]>(PROJECT_PAGE_KEYS.slice());
  const currentRole = normalizeRole(user?.role);
  const isSuperAdmin = currentRole === 'super_admin';
  const roleOptions = isSuperAdmin ? ROLE_OPTIONS_BY_ACCESS.super_admin : ROLE_OPTIONS_BY_ACCESS.admin;
  const defaultRole = roleOptions[0]?.value ?? 'analyst';

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

  const visibleUsers = useMemo(() => {
    if (isSuperAdmin) {
      return users;
    }

    return users.filter((entry) => {
      const normalizedUserRole = normalizeRole(entry.role);
      return normalizedUserRole === 'ops_lead' || normalizedUserRole === 'analyst';
    });
  }, [isSuperAdmin, users]);

  const stats = useMemo(() => {
    const activeUsers = visibleUsers.filter((user) => normalizeStatus(user.status) === 'ACTIVE');
    const inactiveUsers = visibleUsers.filter((user) => normalizeStatus(user.status) !== 'ACTIVE');
    const adminUsers = visibleUsers.filter((user) => String(user.role || '').toUpperCase().includes('ADMIN'));

    return {
      total: visibleUsers.length,
      active: activeUsers.length,
      inactive: inactiveUsers.length,
      admins: adminUsers.length,
    };
  }, [visibleUsers]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingUserId(null);
    setFormUser({ ...emptyFormState, role: defaultRole });
    setSelectedPageKeys(PROJECT_PAGE_KEYS.slice());
    setFormError(null);
    setShowModal(true);
  };

  const getPermissionSelection = (user: any) => {
    const permissions = Array.isArray(user?.pagePermissions) ? user.pagePermissions : [];
    const allowed = permissions.filter((permission) => permission?.isAllowed !== false).map((permission) => String(permission.pageKey));
    return permissions.length === 0 ? PROJECT_PAGE_KEYS.slice() : allowed;
  };

  const handleEditAccess = (user: any) => {
    setModalMode('access');
    setEditingUserId(user.id);
    setFormError(null);
    setFormUser({
      name: user.name || '',
      email: user.email || '',
      password: 'password123',
      role: normalizeEditableRole(user.role, defaultRole),
      status: normalizeStatus(user.status) || 'ACTIVE',
    });
    setSelectedPageKeys(getPermissionSelection(user));
    setShowModal(true);
  };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setFormError(null);

    try {
      if (modalMode === 'create') {
        await apiFetch(`/api/v1/admin/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            name: formUser.name,
            email: formUser.email,
            password: formUser.password,
            role: toStoredRole(formUser.role),
            pageKeys: selectedPageKeys,
          }),
        });
      }

      setShowModal(false);
      setEditingUserId(null);
      setFormUser({ ...emptyFormState, role: defaultRole });
      await loadUsers();
    } catch (saveError: any) {
      const message = saveError?.message || 'Failed to save user';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (uid: string, currentStatus: string) => {
    const normalizedCurrentStatus = normalizeStatus(currentStatus);
    const newStatus = normalizedCurrentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await apiFetch(`/api/v1/admin/users/${uid}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, projectId }),
      });
      await loadUsers();
    } catch (statusError: any) {
      alert(statusError.message || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (user: any) => {
    const role = String(user.role || '').trim().toUpperCase();

    if (role === 'SUPER_ADMIN') {
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete ${user.name || user.email || 'this user'}? This removes their project access and deletes their account. This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);

    try {
      await apiFetch(`/api/v1/admin/projects/${projectId}/users/${user.id}`, {
        method: 'DELETE',
      });
      await loadUsers();
    } catch (deleteError: any) {
      alert(deleteError?.message || 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
    }
  };

  const saveAccessPermissions = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!editingUserId) {
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      await apiFetch(`/api/v1/admin/projects/${projectId}/users/${editingUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formUser.name,
          email: formUser.email,
          role: toStoredRole(formUser.role),
          status: formUser.status,
        }),
      });

      await apiFetch(`/api/v1/admin/users/${editingUserId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          pageKeys: selectedPageKeys,
        }),
      });

      if (typeof window !== 'undefined' && editingUserId === user?.id) {
        const cacheKey = `${PROJECT_PERMISSION_STORAGE_PREFIX}:${user.id}:${projectId}`;
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({
            allowedPageKeys: selectedPageKeys,
            updatedAt: Date.now(),
          }),
        );
        window.dispatchEvent(
          new CustomEvent('kpi:project-permissions-updated', {
            detail: {
              cacheKey,
              userId: user.id,
              projectId,
              allowedPageKeys: selectedPageKeys,
            },
          }),
        );
      }

      setShowModal(false);
      setEditingUserId(null);
      await loadUsers();
    } catch (saveError: any) {
      const message = saveError?.message || 'Failed to save user access';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePageKey = (pageKey: string) => {
    setSelectedPageKeys((current) => {
      if (current.includes(pageKey)) {
        return current.filter((key) => key !== pageKey);
      }

      return [...current, pageKey];
    });
  };

  const toggleAllPageKeys = () => {
    setSelectedPageKeys((current) => current.length === PROJECT_PAGE_KEYS.length ? [] : PROJECT_PAGE_KEYS.slice());
  };

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
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
                onClick={openCreateModal}
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
                data={visibleUsers}
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
                      <span className={`dashboard-inline-status ${normalizeStatus(value) === 'ACTIVE' ? 'is-success' : 'is-danger'}`}>
                        {normalizeStatus(value)}
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
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                        <Button variant="outline" size="sm" onClick={() => handleEditAccess(row)}>
                          Edit user access
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleStatus(row.id, row.status)}>
                          {normalizeStatus(row.status) === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteUser(row)}
                          disabled={deletingUserId === row.id || String(row.role || '').trim().toUpperCase() === 'SUPER_ADMIN'}
                        >
                          {deletingUserId === row.id ? 'Deleting…' : 'Delete user'}
                        </Button>
                      </div>
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
                        {modalMode === 'create' ? 'Invite project user' : 'Edit project user'}
                      </Typography>
                      <Typography variant="body" color="secondary">
                        {modalMode === 'create'
                          ? `Add a new workspace user for ${projectId}. They will be prompted to update their password after first login.`
                          : 'Update the user profile, access role, and account status.'}
                      </Typography>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setShowModal(false)} aria-label="Close dialog">
                      <X size={18} />
                    </Button>
                  </div>

                  <form onSubmit={modalMode === 'access' ? saveAccessPermissions : saveUser} className="dashboard-stack" style={{ gap: '1rem' }}>
                    {formError ? (
                      <div style={errorBannerStyle}>
                        <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
                          <span style={errorTextStyle}>{formError}</span>
                        </div>
                      </div>
                    ) : null}

                    <Input
                      label="Full name"
                      value={formUser.name}
                      onChange={(event) => setFormUser({ ...formUser, name: event.target.value })}
                      required
                    />
                    <Input
                      label="Email address"
                      type="email"
                      value={formUser.email}
                      onChange={(event) => setFormUser({ ...formUser, email: event.target.value })}
                      required
                    />
                    {/* {modalMode === 'create' || modalMode === 'access' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-card)', background: 'var(--bg-page)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Page access for this project</p>
                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>All pages are selected by default. Untick the ones this user should not see.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={toggleAllPageKeys}>
                            {selectedPageKeys.length === PROJECT_PAGE_KEYS.length ? 'Clear all' : 'Select all'}
                          </Button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                          {PROJECT_PAGE_ACCESS_OPTIONS.map((page) => {
                            const checked = selectedPageKeys.includes(page.key);

                            return (
                              <label
                                key={page.key}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '10px',
                                  padding: '10px 12px',
                                  borderRadius: '10px',
                                  border: '1px solid var(--border-card)',
                                  background: checked ? 'rgba(37,99,235,0.08)' : 'var(--bg-card)',
                                  cursor: 'pointer'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePageKey(page.key)}
                                  style={{ marginTop: '3px' }}
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{page.label}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    {page.key}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : null} */}


                    {modalMode === 'create' ? (
                      <Input
                        label="Temporary password"
                        value={formUser.password}
                        onChange={(event) => setFormUser({ ...formUser, password: event.target.value })}
                        helperText="Users will be prompted to change this password after sign-in."
                        required
                      />
                    ) : null}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label htmlFor="invite-role" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        User role
                      </label>
                      <select
                        id="invite-role"
                        value={formUser.role}
                        onChange={(event) => setFormUser({ ...formUser, role: normalizeEditableRole(event.target.value, defaultRole) })}
                        style={{
                          width: '100%',
                          borderRadius: '8px',
                          border: '1px solid var(--border-input)',
                          background: 'var(--bg-input)',
                          padding: '10px 12px',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                        }}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {roleOptions.find((option) => option.value === formUser.role)?.description}
                      </p>
                    </div>

                    {modalMode === 'edit' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label htmlFor="user-status" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          Account status
                        </label>
                        <select
                          id="user-status"
                          value={normalizeStatus(formUser.status)}
                          onChange={(event) => setFormUser({ ...formUser, status: event.target.value })}
                          style={{
                            width: '100%',
                            borderRadius: '8px',
                            border: '1px solid var(--border-input)',
                            background: 'var(--bg-input)',
                            padding: '10px 12px',
                            color: 'var(--text-primary)',
                            fontSize: '14px',
                          }}
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="INACTIVE">Inactive</option>
                        </select>
                      </div>
                    ) : null}

                    <div className="dashboard-action-row" style={{ justifyContent: 'flex-end' }}>
                      <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" isLoading={isSaving}>
                        {modalMode === 'create' ? 'Create account' : modalMode === 'access' ? 'Save access' : 'Save changes'}
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
