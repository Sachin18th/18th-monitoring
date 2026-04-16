'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

const getNavItems = (projectId: string, role?: string) => {
  const prefix = `/project/${projectId}`;
  
  const observability = [
    { href: `${prefix}/overview`,     icon: '📊', label: 'Overview'      },
    { href: `${prefix}/performance`,  icon: '⚡', label: 'Performance'   },
    { href: `${prefix}/users`,        icon: '👥', label: 'Users'         },
    { href: `${prefix}/orders`,       icon: '📦', label: 'Orders'        },
    { href: `${prefix}/integrations`, icon: '🔗', label: 'Integrations'  },
  ];

  const management = [
    { href: `${prefix}/settings`,     icon: '⚙️', label: 'Project Settings' },
    { href: `${prefix}/alerts`,       icon: '🔔', label: 'Alert Center'    },
  ];

  if (role !== 'CUSTOMER') {
    management.push({ href: `${prefix}/customers`, icon: '👤', label: 'Customers' });
  }

  return { observability, management };
};

export const Sidebar = ({ projectId }: { projectId: string }) => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const navItems = getNavItems(projectId, user?.role);

  return (
    <aside style={{
      width: '260px',
      height: '100%',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '28px 16px',
      zIndex: 100,
    }}>
      <div style={{ padding: '0 12px', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'var(--accent-blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '18px', fontWeight: '800',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
          }}>K</div>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>KPI Monitor</h1>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>v2.0 · {projectId}</p>
          </div>
        </div>
      </div>

      {!(user?.role === 'CUSTOMER' && user?.assignedProjects.length === 1) && (
        <Link href="/projects" style={{ textDecoration: 'none', marginBottom: '32px' }}>
          <div style={{
            fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)',
            padding: '8px 12px', borderRadius: '10px', background: 'var(--border-light)',
            textAlign: 'center', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px'
          }}>
            🏠 Back to Portfolio
          </div>
        </Link>
      )}

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <div style={navHeaderStyle}>Observability</div>
          {navItems.observability.map((item) => <NavItem key={item.href} item={item} pathname={pathname} />)}
        </div>

        <div>
          <div style={navHeaderStyle}>Management</div>
          {navItems.management.map((item) => <NavItem key={item.href} item={item} pathname={pathname} />)}
        </div>
      </nav>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ padding: '16px', background: 'var(--border-light)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div className="status-dot" style={{ background: 'var(--accent-green)' }} />
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '0.4px', textTransform: 'uppercase' }}>Ingestion Active</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Role: <strong>{user?.role}</strong></div>
        </div>
        <button onClick={logout} style={{ padding: '10px', borderRadius: '10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Logout</button>
      </div>
    </aside>
  );
};
const NavItem = ({ item, pathname }: { item: any, pathname: string }) => {
  const isActive = pathname === item.href;
  return (
    <Link href={item.href} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px',
        background: isActive ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
        color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
        transition: 'all 0.2s ease', cursor: 'pointer', fontWeight: isActive ? '700' : '500', fontSize: '13px',
        marginBottom: '2px'
      }}>
        <span style={{ fontSize: '16px', filter: isActive ? 'none' : 'grayscale(100%) opacity(0.7)' }}>{item.icon}</span>
        {item.label}
      </div>
    </Link>
  );
};

const navHeaderStyle: React.CSSProperties = {
  fontSize: '10px', 
  fontWeight: '800', 
  color: 'var(--text-muted)', 
  textTransform: 'uppercase', 
  letterSpacing: '1.2px', 
  marginBottom: '12px', 
  paddingLeft: '14px'
};
