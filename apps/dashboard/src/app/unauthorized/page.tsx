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
            403 / Access restricted
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
}
