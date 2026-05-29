'use client';

import React from 'react';
import { Lock, ArrowLeft } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { PROJECT_PAGE_LABELS } from '@kpi-platform/shared-types';

interface PageRestrictedProps {
  pageKey?: string;
  reason?: string;
}

export function PageRestricted({ pageKey = 'overview', reason }: PageRestrictedProps) {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string;

  const pageName = pageKey ? PROJECT_PAGE_LABELS[pageKey as keyof typeof PROJECT_PAGE_LABELS] || 'Page' : 'Page';
  const customReason = reason || `You don't have permission to access the ${pageName} page.`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        backgroundColor: 'var(--bg-page)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          maxWidth: '600px',
          borderRadius: '12px',
          border: '1px solid var(--border-card)',
          backgroundColor: 'var(--bg-card)',
          padding: '48px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '12px',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Lock style={{ width: '32px', height: '32px', color: '#a855f7' }} />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
            marginBottom: '8px',
          }}
        >
          Page Restricted
        </h1>

        {/* Message */}
        <p
          style={{
            fontSize: '15px',
            color: 'var(--text-muted)',
            lineHeight: '1.6',
            margin: 0,
            maxWidth: '100%',
          }}
        >
          {customReason}
        </p>

        {pageKey && (
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: '1.6',
              margin: 0,
              fontStyle: 'italic',
            }}
          >
            Requested page: <strong>{pageName}</strong>
          </p>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: '12px',
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-input)',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = 'var(--border-input)';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = 'var(--bg-input)';
            }}
          >
            <ArrowLeft style={{ width: '16px', height: '16px' }} />
            Go Back
          </button>

        </div>
      </div>
    </div>
  );
}
