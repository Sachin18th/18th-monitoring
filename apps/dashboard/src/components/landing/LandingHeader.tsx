'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@kpi-platform/ui';
import { clsx } from 'clsx';
import { ChevronRight } from 'lucide-react';

export const LandingHeader = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={clsx(
      'landing-header',
      scrolled && 'scrolled'
    )}>
      <div className="container">
        <Link href="/" className="logo-container">
          <img src="https://www.18thdigitech.com/images/logo.svg" alt="18th Digitech" className="logo-img" />
          <span className="logo-spacer" />
          <span className="logo-text">18th Monitoring</span>
        </Link>
        
        <nav className="main-nav">
          <a href="#features" className="nav-link">Features</a>
          <a href="#showcase" className="nav-link">Showcase</a>
          <a href="#usp" className="nav-link">USP</a>
          <a href="#faq" className="nav-link">FAQ</a>
          <a href="#clients" className="nav-link">Clients</a>
        </nav>

        <div className="auth-actions">
          <Link href="/login" className="login-link">Sign In</Link>
          <Button size="sm" className="get-started-btn" onClick={() => window.location.href = '/projects'}>
            View Demo
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <style jsx>{`
        .landing-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 80px;
          display: flex;
          align-items: center;
          z-index: 1000;
          transition: all 0.3s ease;
          border-bottom: 1px solid transparent;
        }

        .landing-header.scrolled {
          height: 64px;
          background-color: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border-subtle);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }

        .container {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-6);
        }

        .logo-container {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          text-decoration: none;
        }

        .logo-img {
          height: 32px;
          object-fit: contain;
          filter: brightness(0) invert(1);
        }

        .logo-spacer {
          width: 1px;
          height: 24px;
          background: var(--border-subtle);
          margin: 0 var(--space-2);
        }

        .logo-text {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.5px;
        }

        .main-nav {
          display: flex;
          gap: var(--space-8);
        }

        .nav-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color 0.2s ease;
        }

        .nav-link:hover {
          color: var(--text-primary);
        }

        .auth-actions {
          display: flex;
          align-items: center;
          gap: var(--space-6);
        }

        .login-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          transition: color 0.2s ease;
        }

        .login-link:hover {
          color: var(--text-primary);
        }

        :global(.get-started-btn) {
          border-radius: 100px !important;
          padding: 0 var(--space-5) !important;
          gap: var(--space-2) !important;
        }

        @media (max-width: 768px) {
          .main-nav {
            display: none;
          }
        }
      `}</style>
    </header>
  );
};
