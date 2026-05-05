<<<<<<< HEAD
'use client';
import React from 'react';
import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { Button, Typography } from '@kpi-platform/ui';

export default function UnauthorizedPage() {
  return (
    <div className="unauthorized-shell">
      <div className="unauthorized-card">
        <div className="dashboard-stack" style={{ alignItems: 'center', gap: '1rem' }}>
          <span className="dashboard-overlay-icon">
            <LockKeyhole size={28} />
          </span>
          <Typography variant="h1" noMargin>
            Access restricted
          </Typography>
          <Typography variant="body" color="secondary">
            This area is outside your current project permissions. Return to your portfolio or ask an administrator for access.
          </Typography>
          <Link href="/login" style={{ textDecoration: 'none' }}>
            <Button size="lg">Return to login</Button>
          </Link>
        </div>
      </div>
    </div>
  );
=======
import React from 'react';
import Link from 'next/link';

export default function UnauthorizedPage() {
    return (
        <div style={{
            height: '100vh', display: 'flex', flexDirection: 'column', 
            alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)',
            color: 'var(--text-primary)', textAlign: 'center', padding: '24px'
        }}>
            <div style={{ fontSize: '64px', marginBottom: '24px' }}>🔒</div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '12px' }}>Access Restricted</h1>
            <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '480px', marginBottom: '32px' }}>
                You do not have the required permissions to access this administrative section. Please return to the dashboard or contact your project lead.
            </p>
            <Link href="/" style={{
                padding: '12px 24px', background: 'var(--accent-blue)', color: '#fff',
                borderRadius: '12px', fontWeight: '800', textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
            }}>
                Return to Safety
            </Link>
        </div>
    );
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
}
