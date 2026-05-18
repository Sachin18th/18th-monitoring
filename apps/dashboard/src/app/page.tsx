'use client';
import React from 'react';
import MonitoringLandingPage from '../components/landing/LandingSections';

export default function LandingPage() {
  return (
    <>
      <MonitoringLandingPage />
      <style jsx global>{`
        .landing-page {
          background-color: var(--bg-base);
          min-height: 100vh;
        }

        /* Prevent layout shift when header becomes sticky */
        body {
          padding-top: 0;
        }
      `}</style>
    </>
  );
}
