'use client';

import React, { useState, useEffect } from 'react';
import { useTheme, Button, Card, Badge } from '@kpi-platform/ui';
import {
  Activity, ArrowRight, BellRing, Database, LayoutDashboard, ShieldCheck,
  ShoppingCart, Layers3, Lock, Zap, RefreshCw, BarChart3, CloudRain,
  Target, Command, LineChart, Server, Globe, ChevronDown, CheckCircle2, ChevronRight, Menu, X, TrendingUp
} from 'lucide-react';

const FEATURES = [
  {
    icon: <Globe size={22} />,
    title: 'Unified Data Integration',
    description: 'Connect Magento, Shopify, APIs, and custom systems through a flexible integration layer that centralizes data streams.',
  },
  {
    icon: <Activity size={22} />,
    title: 'Real-Time Monitoring',
    description: 'Track system performance, API health, response times, uptime, and operational anomalies through live dashboards.',
  },
  {
    icon: <BarChart3 size={22} />,
    title: 'KPI Intelligence Engine',
    description: 'Normalize raw data into business-ready metrics such as revenue, orders, customer activity, and project-level KPIs.',
  },
  {
    icon: <Server size={22} />,
    title: 'Scalable Data Architecture',
    description: 'Built for multi-project and multi-tenant environments with structured pipelines, fault tolerance, and long-term scalability.',
  },
  {
    icon: <BellRing size={22} />,
    title: 'Smart Alerts & Health',
    description: 'Receive proactive notifications, threshold-based alerts, and health indicators to identify issues before they escalate.',
  },
  {
    icon: <LayoutDashboard size={22} />,
    title: 'Custom Dashboards',
    description: 'Create flexible dashboards for super admins, internal teams, and client-facing users with permission-based access.',
  },
];

const FAQS = [
  {
    q: 'How quickly can I get started?',
    a: 'Projects can typically be onboarded quickly using guided setup and structured integration flows.'
  },
  {
    q: 'Do I need engineering support for setup?',
    a: 'Minimal technical dependency is required for standard integrations, with flexibility for custom systems.'
  },
  {
    q: 'Which platforms are supported?',
    a: 'Magento, Shopify, APIs, and extensible integrations for custom platforms and third-party systems.'
  },
  {
    q: 'Is the data real-time?',
    a: 'The platform supports near real-time visibility depending on the integration and sync architecture.'
  },
  {
    q: 'Can dashboards be customized?',
    a: 'Yes, dashboards are modular, role-based, and adaptable to project-specific needs.'
  },
  {
    q: 'Is the platform secure?',
    a: 'Yes, the platform is designed with secure authentication, access control, and enterprise-grade operational practices.'
  }
];

const SHOWCASE_ITEMS = [
  { id: 'global', label: 'Global Dashboard', desc: 'Unified cross-project oversight and top-level business aggregations.' },
  { id: 'project', label: 'Project Dashboard', desc: 'Deep-dive operational monitoring per tenant with targeted alerting.' },
  { id: 'api', label: 'API Monitoring View', desc: 'Real-time trace logs and endpoint latency tracks across the network.' },
  { id: 'integrations', label: 'Integration Setup', desc: 'Seamlessly link standard providers like Shopify and SAP in clicks.' },
  { id: 'access', label: 'User Management', desc: 'Enterprise RBAC, governing permissions natively out of the box.' }
];

export default function MonitoringLandingPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [activeShowcase, setActiveShowcase] = useState(SHOWCASE_ITEMS[0]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="p-landing-root">
      {/* 1. Navbar */}
      <header className={`p-navbar ${scrolled ? 'p-navbar--scrolled' : ''}`}>
        <div className="p-shell p-navbar__inner">
          <div className="p-navbar__logo">
            <Command className="p-navbar__logo-icon" size={24} />
            <span className="p-navbar__logo-text">18th Digitech</span>
          </div>
          
          <nav className="p-navbar__nav desktop-only">
            <a href="#product">Product</a>
            <a href="#features">Features</a>
            <a href="#integrations">Integrations</a>
            <a href="#docs">Docs</a>
            <a href="#faqs">FAQs</a>
          </nav>

          <div className="p-navbar__actions desktop-only">
            <a href="/login" className="p-text-link">Login</a>
            <Button size="md" onClick={() => window.location.href = '/login'}>Get Started</Button>
          </div>

          <button className="p-navbar__menu-btn mobile-only" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="p-mobile-nav mobile-only">
            <a href="#product" onClick={() => setMobileMenuOpen(false)}>Product</a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#integrations" onClick={() => setMobileMenuOpen(false)}>Integrations</a>
            <a href="#faqs" onClick={() => setMobileMenuOpen(false)}>FAQs</a>
            <a href="/login" onClick={() => setMobileMenuOpen(false)}>Login</a>
            <Button className="u-mt-4" onClick={() => window.location.href = '/login'}>Get Started</Button>
        </div>
      )}

      {/* 2. Hero Section */}
      <section className="p-hero" id="product">
        <div className="p-shell p-hero__grid">
          <div className="p-hero__copy">
            <Badge className="p-badge-pulse">Unified Monitoring Platform</Badge>
            <h1 className="p-hero__headline">
              Unified Monitoring & KPI Intelligence for Modern Digital Businesses
            </h1>
            <p className="p-hero__sub">
              Track performance, connect platforms like Magento, Shopify, and custom APIs, and gain real-time operational and business insights from one unified dashboard.
            </p>
            <div className="p-hero__trust">
              <span className="p-hero__trust-item"><CheckCircle2 size={16}/> Built for Scale</span>
              <span className="p-hero__trust-item"><CheckCircle2 size={16}/> Real-Time Insights</span>
              <span className="p-hero__trust-item"><CheckCircle2 size={16}/> Unified KPI Visibility</span>
              <span className="p-hero__trust-item"><CheckCircle2 size={16}/> Minimal Setup</span>
            </div>
            <div className="p-hero__actions">
              <Button size="lg" onClick={() => window.location.href = '/login'}>Get Started</Button>
              <Button size="lg" variant="outline" onClick={() => window.location.href = '/projects'}>View Demo</Button>
            </div>
          </div>
          <div className="p-hero__visual">
             <div className="p-hero__visual-layering">
                <div className="p-hero__glow"></div>
                <Card className="p-hero__window" padding="none">
                    <div className="p-hero__window-bar">
                        <i/><i/><i/>
                    </div>
                    <img src="/hero-preview-new.png" alt="Dashboard Platform" className="p-hero__image" />
                </Card>
                <Card className="p-hero__floating-card p-hc-1" padding="sm">
                   <div className="p-fc-icon"><TrendingUp size={16} /></div>
                   <div className="p-fc-meta">
                       <span className="p-fc-title">Global Revenue</span>
                       <span className="p-fc-val">$4.2M <small>+8%</small></span>
                   </div>
                </Card>
                <Card className="p-hero__floating-card p-hc-2" padding="sm">
                   <div className="p-fc-icon"><Activity size={16} /></div>
                   <div className="p-fc-meta">
                       <span className="p-fc-title">System Health</span>
                       <span className="p-fc-val-success">All Systems Operational</span>
                   </div>
                </Card>
             </div>
          </div>
        </div>
      </section>

      {/* 3. Summary Strip */}
      <section className="p-summary-strip">
         <div className="p-shell p-summary-strip__inner">
            <h3 className="p-summary-strip__text">
              A centralized platform that transforms fragmented data into actionable, real-time intelligence.
            </h3>
         </div>
      </section>

      {/* 4. Problem Statement */}
      <section className="p-problem p-section" id="problem">
        <div className="p-shell">
            <div className="p-section-header p-txt-center">
                <h2>Why Traditional Monitoring Falls Short</h2>
                <p>
                  Modern businesses operate across multiple systems, from commerce platforms like Magento to custom applications and third-party tools. This creates fragmented reporting, delayed visibility, and operational blind spots.
                </p>
                <p className="u-mt-3">
                  <strong>Our platform solves this by unifying business and technical monitoring into one powerful, actionable system.</strong>
                </p>
            </div>
            <div className="p-problem__grid">
                <Card className="p-problem__card">
                    <Layers3 className="p-pc-icon" size={28}/>
                    <h4>Fragmented Data</h4>
                    <p>Metrics isolated in different tools force teams to manually piece together insights.</p>
                </Card>
                <Card className="p-problem__card">
                    <Activity className="p-pc-icon" size={28}/>
                    <h4>Delayed Decisions</h4>
                    <p>Without real-time alignment, issue detection is slow and response time suffers.</p>
                </Card>
                <Card className="p-problem__card">
                    <Globe className="p-pc-icon" size={28}/>
                    <h4>Limited Visibility</h4>
                    <p>No overarching view mapping infrastructure health to business intelligence directly.</p>
                </Card>
            </div>
        </div>
      </section>

      {/* 5. Core Features Grid */}
      <section className="p-features p-section p-bg-alternate" id="features">
        <div className="p-shell">
            <div className="p-section-header">
                <h2>Core Features Built for Modern Monitoring</h2>
                <p>A comprehensive operations and intelligence suite crafted for digital commerce scale.</p>
            </div>
            
            <div className="p-features__grid">
               {FEATURES.map((feat) => (
                   <Card key={feat.title} className="p-feature-card" isHoverable>
                      <div className="p-feature-card__icon">{feat.icon}</div>
                      <h3>{feat.title}</h3>
                      <p>{feat.description}</p>
                   </Card>
               ))}
            </div>
        </div>
      </section>

      {/* 6. USP / Why Choose Us */}
      <section className="p-usp p-section">
          <div className="p-shell p-usp__grid">
              <div className="p-usp__copy">
                  <h2>From Data Chaos to Clarity — Instantly</h2>
                  <p>
                    Bring technical monitoring and business intelligence together in one platform built for modern digital operations. Unlike legacy tools that only handle infrastructure or only handle analytics, we bridge the gap.
                  </p>
                  <ul className="p-usp__list">
                      <li><CheckCircle2 className="p-usp-li-icon"/> Technical + business intelligence in one place</li>
                      <li><CheckCircle2 className="p-usp-li-icon"/> Cross-platform visibility</li>
                      <li><CheckCircle2 className="p-usp-li-icon"/> Minimal engineering dependency</li>
                      <li><CheckCircle2 className="p-usp-li-icon"/> Actionable real-time dashboards</li>
                      <li><CheckCircle2 className="p-usp-li-icon"/> Scalable architecture for growth</li>
                  </ul>
              </div>
              <div className="p-usp__visual">
                  <div className="p-usp__card-stack">
                      <Card className="p-usp__stack-card p-usp-c1" padding="lg">
                          <div className="u-flex-between"><h4>Anomaly detected</h4> <Badge>Critical</Badge></div>
                          <p className="u-text-muted mt-2">API Latency spike observed during high checkout traffic.</p>
                      </Card>
                      <Card className="p-usp__stack-card p-usp-c2" padding="lg">
                          <div className="u-flex-between"><h4>Resolution Engaged</h4> <Badge className="p-badge-success">Recovered</Badge></div>
                          <p className="u-text-muted mt-2">Automatic cache bypass applied. SLA maintained.</p>
                      </Card>
                  </div>
              </div>
          </div>
      </section>

      {/* 7. Highlights Strip */}
      <section className="p-highlights p-bg-primary">
          <div className="p-shell p-highlights__inner">
              <span><Activity size={18}/> Real-Time Monitoring</span>
              <span><Zap size={18}/> Plug & Play Integrations</span>
              <span><Target size={18}/> Unified KPI Visibility</span>
              <span><Lock size={18}/> Secure Architecture</span>
              <span><Server size={18}/> Scalable Infrastructure</span>
          </div>
      </section>

      {/* 8. Screenshots / Product Showcase */}
      <section className="p-showcase p-section">
          <div className="p-shell">
              <div className="p-section-header p-txt-center">
                  <h2>See the Platform in Action</h2>
                  <p>Monitor projects, integrations, KPIs, and operational health through a single, unified interface.</p>
              </div>

              <div className="p-showcase__container">
                  <div className="p-showcase__visual">
                      <Card className="p-showcase__window" padding="none">
                         <img src="/hero-preview-new.png" className="p-showcase__img" />
                      </Card>
                  </div>
                  <div className="p-showcase__nav">
                      {SHOWCASE_ITEMS.map((item) => (
                          <button 
                            key={item.id} 
                            onClick={() => setActiveShowcase(item)}
                            className={`p-showcase__tab ${activeShowcase.id === item.id ? 'active' : ''}`}
                          >
                              <h4>{item.label}</h4>
                              <p>{item.desc}</p>
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      </section>

      {/* 9. How It Works */}
      <section className="p-hiw p-section p-bg-alternate">
          <div className="p-shell">
              <div className="p-section-header p-txt-center">
                  <h2>How It Works</h2>
              </div>
              
              <div className="p-hiw__stepper">
                  <div className="p-hiw__step">
                      <div className="p-hiw__num">1</div>
                      <h4>Connect Your Systems</h4>
                      <p>Integrate Magento, Shopify, APIs, and custom data sources.</p>
                  </div>
                  <div className="p-hiw__line"></div>
                  <div className="p-hiw__step">
                      <div className="p-hiw__num">2</div>
                      <h4>Configure Data Pipelines</h4>
                      <p>Map inputs, set sync rules, and prepare the ingestion layer.</p>
                  </div>
                  <div className="p-hiw__line"></div>
                  <div className="p-hiw__step">
                      <div className="p-hiw__num">3</div>
                      <h4>Normalize and Process Data</h4>
                      <p>Transform fragmented data into a structured KPI-ready model.</p>
                  </div>
                  <div className="p-hiw__line"></div>
                  <div className="p-hiw__step">
                      <div className="p-hiw__num">4</div>
                      <h4>Monitor Through Unified Dashboards</h4>
                      <p>Track business and operational metrics in real time.</p>
                  </div>
                  <div className="p-hiw__line"></div>
                  <div className="p-hiw__step">
                      <div className="p-hiw__num">5</div>
                      <h4>Act on Alerts and Insights</h4>
                      <p>Respond faster with health indicators, trends, and proactive alerts.</p>
                  </div>
              </div>
          </div>
      </section>

      {/* 10. FAQs */}
      <section className="p-faqs p-section" id="faqs">
          <div className="p-shell p-faqs__inner">
              <div className="p-section-header">
                  <h2>Frequently Asked Questions</h2>
              </div>
              <div className="p-faqs__list">
                  {FAQS.map((faq, i) => (
                      <div key={i} className={`p-faq-item ${activeFaq === i ? 'active' : ''}`}>
                          <button className="p-faq-q" onClick={() => setActiveFaq(activeFaq === i ? null : i)}>
                              <span>{faq.q}</span>
                              <ChevronDown className="p-faq-icon" />
                          </button>
                          <div className="p-faq-a">
                              <p>{faq.a}</p>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </section>

      {/* 11. Final CTA */}
      <section className="p-cta-final">
          <div className="p-shell">
              <div className="p-cta-final__box">
                  <div className="p-cta__glow"></div>
                  <h2>Ready to Take Control of Your Data?</h2>
                  <p>Start monitoring your systems, centralize your KPIs, and gain real-time visibility across your business from one unified platform.</p>
                  <div className="p-cta-final__actions">
                      <Button size="lg" onClick={() => window.location.href = '/login'}>Get Started Now</Button>
                      <Button size="lg" variant="outline" className="p-btn-inverse" onClick={() => window.location.href = '/login'}>Schedule Demo</Button>
                  </div>
              </div>
          </div>
      </section>

      {/* 12. Footer */}
      <footer className="p-footer">
          <div className="p-shell">
              <div className="p-footer__grid">
                  <div className="p-footer__col-large">
                      <div className="p-navbar__logo mb-4">
                         <Command className="p-navbar__logo-icon" size={24} />
                         <span className="p-navbar__logo-text">18th Digitech</span>
                      </div>
                      <p className="p-footer__desc">Enterprise-grade operational and business monitoring crafted for precision tracking and automated alerting across disjointed architectures.</p>
                  </div>
                  <div className="p-footer__col">
                      <h5>Product</h5>
                      <a href="#">Features</a>
                      <a href="#">Integrations</a>
                      <a href="#">Pricing</a>
                  </div>
                  <div className="p-footer__col">
                      <h5>Resources</h5>
                      <a href="#">Docs</a>
                      <a href="#">API Docs</a>
                      <a href="#">FAQs</a>
                      <a href="#">Support</a>
                  </div>
                  <div className="p-footer__col">
                      <h5>Legal</h5>
                      <a href="#">Privacy Policy</a>
                      <a href="#">Terms of Service</a>
                      <a href="#">Contact</a>
                  </div>
              </div>
              <div className="p-footer__bottom">
                  <p>&copy; {new Date().getFullYear()} 18th Digitech. All rights reserved.</p>
                  <p className="p-footer__credits">Designed and developed by 18th Digitech</p>
              </div>
          </div>
      </footer>

      {/* STYLES */}
      <style jsx global>{`
        /* Global & Reset over Baseline */
        .p-landing-root {
          color: var(--text-primary);
          font-family: var(--font-sans), 'Inter', sans-serif;
          --lp-primary: #2563EB;
          --lp-primary-hover: #1D4ED8;
          --lp-primary-muted: rgba(37, 99, 235, 0.1);
          --lp-accent: #7C3AED;
          --lp-bg-elevate: ${isDark ? '#111827' : '#FFFFFF'};
          --lp-bg-alt: ${isDark ? '#0B0F19' : '#F8FAFC'};
          --lp-border: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
          background-color: var(--bg-base);
          overflow-x: hidden;
        }

        .u-text-muted { color: var(--text-secondary); }
        .u-mt-2 { margin-top: 0.5rem; }
        .u-mt-3 { margin-top: 1rem; }
        .u-mt-4 { margin-top: 1.5rem; }
        .u-flex-between { display: flex; justify-content: space-between; align-items: center; }

        .p-shell {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 clamp(1.25rem, 4vw, 2.5rem);
        }

        .p-section {
          padding: clamp(4rem, 8vw, 7rem) 0;
        }

        .p-bg-alternate {
          background-color: var(--lp-bg-alt);
        }

        .p-section-header {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: clamp(2.5rem, 5vw, 4rem);
          max-width: 720px;
        }

        .p-section-header.p-txt-center {
          margin-left: auto;
          margin-right: auto;
          text-align: center;
          align-items: center;
        }

        .p-section-header h2 {
          margin: 0;
          font-size: clamp(2.2rem, 4.5vw, 3.2rem);
          line-height: 1.1;
          letter-spacing: -0.04em;
        }

        .p-section-header p {
          margin: 0;
          font-size: 1.125rem;
          line-height: 1.6;
          color: var(--text-secondary);
        }

        /* 1. Navbar */
        .p-navbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: transparent;
          transition: background 0.3s ease, border 0.3s ease, backdrop-filter 0.3s ease;
          border-bottom: 1px solid transparent;
        }

        .p-navbar--scrolled {
          background: ${isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)'};
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--lp-border);
        }

        .p-navbar__inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 80px;
        }

        .p-navbar__logo {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          color: var(--text-primary);
        }

        .p-navbar__logo-icon {
          color: var(--lp-primary);
        }

        .p-navbar__logo-text {
          font-weight: 700;
          font-size: 1.25rem;
          letter-spacing: -0.02em;
        }

        .p-navbar__nav {
          display: flex;
          gap: 2rem;
          align-items: center;
        }

        .p-navbar__nav a {
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.95rem;
          transition: color 0.2s ease;
          text-decoration: none;
        }

        .p-navbar__nav a:hover {
          color: var(--text-primary);
        }

        .p-navbar__actions {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .p-text-link {
          color: var(--text-secondary);
          font-weight: 600;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .p-text-link:hover { color: var(--text-primary); }
        
        .desktop-only { display: flex; }
        .mobile-only { display: none; }
        
        .p-navbar__menu-btn {
          background: none;
          border: none;
          color: var(--text-primary);
          cursor: pointer;
        }

        .p-mobile-nav {
          position: fixed;
          top: 80px;
          left: 0;
          right: 0;
          background: var(--lp-bg-elevate);
          border-bottom: 1px solid var(--lp-border);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          z-index: 99;
          box-shadow: var(--shadow-lg);
        }

        .p-mobile-nav a {
          color: var(--text-primary);
          font-weight: 600;
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--lp-border);
          text-decoration: none;
        }

        /* 2. Hero */
        .p-hero {
          padding: clamp(8rem, 15vw, 12rem) 0 clamp(4rem, 8vw, 6rem);
          position: relative;
        }

        .p-hero::before {
          content: "";
          position: absolute;
          top: -10%; left: 0; right: 0; bottom: 0;
          background: radial-gradient(circle at 50% 10%, var(--lp-primary-muted) 0%, transparent 50%);
          z-index: -1;
          pointer-events: none;
        }

        .p-hero__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(2rem, 5vw, 4rem);
          align-items: center;
        }

        .p-hero__copy {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          z-index: 2;
        }

        .p-badge-pulse {
          width: inline-block;
          border: 1px solid var(--lp-primary-muted);
          background: color-mix(in srgb, var(--lp-primary) 10%, transparent);
          color: var(--lp-primary);
          padding: 0.5rem 1rem;
          border-radius: 999px;
          font-weight: 600;
          font-size: 0.85rem;
          letter-spacing: 0.02em;
          box-shadow: 0 0 20px var(--lp-primary-muted);
        }

        .p-hero__headline {
          margin: 0;
          font-size: clamp(2.8rem, 5vw, 4.2rem);
          line-height: 1.05;
          letter-spacing: -0.04em;
          font-weight: 800;
        }

        .p-hero__sub {
          margin: 0;
          font-size: clamp(1.1rem, 2vw, 1.25rem);
          line-height: 1.6;
          color: var(--text-secondary);
          max-width: 540px;
        }

        .p-hero__trust {
          display: flex;
          flex-wrap: wrap;
          gap: 1.25rem;
          margin-top: 0.5rem;
        }

        .p-hero__trust-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-muted);
        }
        
        .p-hero__trust-item svg { color: var(--lp-primary); }

        .p-hero__actions {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .p-hero__visual {
          position: relative;
          perspective: 1200px;
          z-index: 1;
        }

        .p-hero__visual-layering {
          position: relative;
          transform: rotateY(-12deg) rotateX(4deg) scale(1.05);
          transform-style: preserve-3d;
          transition: transform 0.5s ease;
        }

        .p-hero__visual-layering:hover {
          transform: rotateY(-5deg) rotateX(2deg) scale(1.08);
        }

        .p-hero__glow {
          position: absolute;
          inset: -10%;
          background: radial-gradient(circle at 50% 50%, var(--lp-primary), var(--lp-accent));
          filter: blur(80px);
          opacity: 0.15;
          z-index: -1;
        }

        .p-hero__window {
          border-radius: 24px !important;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
          border: 1px solid var(--lp-border);
          background: var(--bg-surface);
        }

        .p-hero__window-bar {
          background: color-mix(in srgb, var(--lp-border) 40%, transparent);
          height: 32px;
          display: flex;
          align-items: center;
          padding: 0 1rem;
          gap: 0.4rem;
          border-bottom: 1px solid var(--lp-border);
        }

        .p-hero__window-bar i {
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--border-subtle);
        }
        .p-hero__window-bar i:nth-child(1) { background: #EF4444; }
        .p-hero__window-bar i:nth-child(2) { background: #F59E0B; }
        .p-hero__window-bar i:nth-child(3) { background: #10B981; }

        .p-hero__image {
          display: block;
          width: 100%;
          height: auto;
          object-fit: cover;
        }

        .p-hero__floating-card {
           position: absolute;
           display: flex;
           align-items: center;
           gap: 1rem;
           border-radius: 16px !important;
           background: rgba(20, 25, 40, 0.7) !important;
           backdrop-filter: blur(16px);
           -webkit-backdrop-filter: blur(16px);
           border: 1px solid var(--lp-border);
           box-shadow: 0 10px 30px rgba(0,0,0,0.2);
           transform: translateZ(50px);
        }
        
        .p-fc-icon {
           display: flex; align-items: center; justify-content: center;
           width: 36px; height: 36px; border-radius: 10px;
           background: var(--lp-primary-muted); color: var(--lp-primary);
        }

        .p-fc-meta { display: flex; flex-direction: column; gap: 0.1rem; }
        .p-fc-title { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
        .p-fc-val { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); }
        .p-fc-val small { font-size: 0.8rem; color: #10B981; margin-left: 0.2rem; }
        .p-fc-val-success { font-size: 0.9rem; font-weight: 700; color: #10B981; }

        .p-hc-1 { top: 15%; right: -15%; animation: float 6s ease-in-out infinite; }
        .p-hc-2 { bottom: 10%; left: -10%; animation: float 8s ease-in-out infinite reverse; }

        @keyframes float {
           0%, 100% { transform: translateZ(50px) translateY(0); }
           50% { transform: translateZ(50px) translateY(-15px); }
        }

        /* 3. Summary Strip */
        .p-summary-strip {
          padding: 3rem 0;
          background: linear-gradient(90deg, transparent, var(--lp-primary-muted), transparent);
          border-top: 1px solid var(--lp-border);
          border-bottom: 1px solid var(--lp-border);
        }

        .p-summary-strip__text {
          margin: 0;
          text-align: center;
          font-size: clamp(1.2rem, 3vw, 1.6rem);
          font-weight: 500;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        /* 4. Problem Statement */
        .p-problem__grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }
        
        .p-problem__card {
           background: var(--lp-bg-elevate) !important;
           border-radius: 20px !important;
           text-align: center;
           padding: 2.5rem 1.5rem !important;
           border: 1px solid var(--lp-border);
           transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .p-problem__card:hover {
           transform: translateY(-5px);
           box-shadow: var(--shadow-md);
        }

        .p-pc-icon {
          margin: 0 auto 1.25rem;
          color: #EF4444; /* Subtle red hue for problem framing */
          opacity: 0.9;
        }

        .p-problem__card h4 { margin: 0 0 0.75rem; font-size: 1.25rem; font-weight: 700; }
        .p-problem__card p { margin: 0; color: var(--text-secondary); line-height: 1.6; }

        /* 5. Features Grid */
        .p-features__grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }
        
        .p-feature-card {
           padding: 2.5rem !important;
           border-radius: 24px !important;
           background: var(--bg-surface) !important;
           box-shadow: var(--shadow-sm);
        }

        .p-feature-card__icon {
           width: 48px; height: 48px; border-radius: 14px;
           background: var(--lp-primary-muted); color: var(--lp-primary);
           display: flex; align-items: center; justify-content: center;
           margin-bottom: 1.5rem;
        }
        
        .p-feature-card h3 { font-size: 1.35rem; font-weight: 700; margin: 0 0 0.85rem; letter-spacing: -0.02em; }
        .p-feature-card p { font-size: 1.05rem; line-height: 1.65; color: var(--text-secondary); margin: 0; }

        /* 6. USP Section */
        .p-usp {
           position: relative;
           overflow: hidden;
        }

        .p-usp::after {
           content: ""; position: absolute; right: 0; top: 0; bottom: 0; width: 40%;
           background: radial-gradient(circle at 100% 50%, var(--lp-primary-muted), transparent);
           z-index: -1; pointer-events: none;
        }

        .p-usp__grid {
           display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center;
        }

        .p-usp__copy h2 { font-size: clamp(2.5rem, 4vw, 3.5rem); margin: 0 0 1.5rem; letter-spacing: -0.04em; line-height: 1.05;}
        .p-usp__copy p { font-size: 1.15rem; color: var(--text-secondary); line-height: 1.7; margin: 0 0 2rem; }
        
        .p-usp__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1rem; }
        .p-usp__list li { display: flex; align-items: center; gap: 0.75rem; font-size: 1.1rem; font-weight: 500; }
        .p-usp-li-icon { color: #10B981; }

        .p-usp__visual { position: relative; padding: 2rem; }
        .p-usp__card-stack { position: relative; height: 350px; }
        
        .p-usp__stack-card { 
            position: absolute; width: 100%; border-radius: 20px !important; 
            background: var(--lp-bg-elevate) !important;
            border: 1px solid var(--lp-border);
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        
        .p-usp-c1 { top: 0; left: 0; z-index: 2; transform: rotate(-2deg); }
        .p-usp-c2 { top: 120px; right: -20px; z-index: 3; transform: rotate(2deg); }

        /* 7. Highlights */
        .p-bg-primary { background: var(--lp-primary); color: #fff; }
        .p-highlights { padding: 3.5rem 0; }
        .p-highlights__inner {
           display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1.5rem; align-items: center;
        }
        .p-highlights__inner span {
           display: flex; align-items: center; gap: 0.6rem; font-size: 1.1rem; font-weight: 600;
           white-space: nowrap;
        }

        /* 8. Showcase */
        .p-showcase__container {
           display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 3rem; align-items: stretch;
        }
        
        .p-showcase__window {
           border-radius: 24px !important; overflow: hidden; border: 1px solid var(--lp-border);
           box-shadow: var(--shadow-xl); height: 100%; display: flex; flex-direction: column;
           background: var(--lp-bg-elevate);
        }
        .p-showcase__img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 20px;}

        .p-showcase__nav { display: flex; flex-direction: column; gap: 1rem; }
        
        .p-showcase__tab {
           text-align: left; background: transparent; border: 1px solid transparent; 
           padding: 1.5rem; border-radius: 20px; cursor: pointer; transition: all 0.3s ease;
        }
        .p-showcase__tab h4 { margin: 0 0 0.5rem; font-size: 1.15rem; font-weight: 700; color: var(--text-primary); transition: color 0.3s; }
        .p-showcase__tab p { margin: 0; color: var(--text-muted); font-size: 0.95rem; line-height: 1.5; }
        
        .p-showcase__tab:hover { background: var(--lp-bg-alt); }
        .p-showcase__tab.active { 
            background: var(--lp-bg-elevate); border-color: var(--lp-border); box-shadow: var(--shadow-sm); 
        }
        .p-showcase__tab.active h4 { color: var(--lp-primary); }

        /* 9. How It Works */
        .p-hiw__stepper {
           display: flex; justify-content: space-between; align-items: flex-start; margin-top: 2rem;
        }
        
        .p-hiw__step { flex: 1; text-align: center; position: relative; padding: 0 1rem; }
        .p-hiw__num {
           width: 48px; height: 48px; margin: 0 auto 1.5rem; border-radius: 50%;
           background: var(--lp-primary); color: #fff; display: flex; align-items: center; justify-content: center;
           font-size: 1.25rem; font-weight: 800; border: 4px solid var(--lp-bg-alt);
        }
        .p-hiw__step h4 { margin: 0 0 0.75rem; font-size: 1.1rem; font-weight: 700; }
        .p-hiw__step p { margin: 0; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; }
        
        .p-hiw__line { flex-grow: 1; height: 2px; background: var(--lp-border); margin-top: 24px; min-width: 30px; }

        /* 10. FAQs */
        .p-faqs__inner { max-width: 800px; }
        .p-faqs__list { display: flex; flex-direction: column; gap: 1rem; }
        
        .p-faq-item { border: 1px solid var(--lp-border); border-radius: 16px; background: var(--bg-surface); overflow: hidden;}
        .p-faq-q { 
           width: 100%; display: flex; justify-content: space-between; align-items: center;
           padding: 1.5rem; background: transparent; border: none; font-size: 1.15rem; font-weight: 600;
           color: var(--text-primary); cursor: pointer; text-align: left;
        }
        .p-faq-icon { transition: transform 0.3s ease; color: var(--text-muted); }
        .p-faq-item.active .p-faq-icon { transform: rotate(180deg); color: var(--lp-primary); }
        
        .p-faq-a { max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s ease; padding: 0 1.5rem; }
        .p-faq-item.active .p-faq-a { max-height: 200px; padding: 0 1.5rem 1.5rem; }
        .p-faq-a p { margin: 0; color: var(--text-secondary); line-height: 1.6; }

        /* 11. Final CTA */
        .p-cta-final { padding: clamp(5rem, 10vw, 8rem) 0; }
        .p-cta-final__box {
           background: ${isDark ? '#0f172a' : '#1e3a8a'};
           border-radius: 32px; padding: clamp(4rem, 8vw, 6rem) 2rem;
           text-align: center; position: relative; overflow: hidden; color: #fff;
        }
        .p-cta-final__box::before {
           content: ""; position: absolute; inset: 0; background: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNykiLz48L3N2Zz4=');
           opacity: 0.5; z-index: 1;
        }
        .p-cta__glow {
           position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
           width: 80%; height: 80%; background: radial-gradient(circle, var(--lp-primary), transparent); filter: blur(120px); opacity: 0.4; z-index: 0;
        }
        .p-cta-final__box h2 { position: relative; z-index: 2; margin: 0 0 1.5rem; font-size: clamp(2.5rem, 5vw, 4rem); letter-spacing: -0.04em; }
        .p-cta-final__box p { position: relative; z-index: 2; margin: 0 auto 3rem; font-size: 1.25rem; max-width: 680px; opacity: 0.9; line-height: 1.6; }
        .p-cta-final__actions { position: relative; z-index: 2; display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;}
        .p-btn-inverse { border-color: rgba(255,255,255,0.3) !important; color: #fff !important; }
        .p-btn-inverse:hover { background: rgba(255,255,255,0.1) !important; border-color: #fff !important; }

        /* 12. Footer */
        .p-footer { background: var(--bg-surface); padding: 5rem 0 2rem; border-top: 1px solid var(--lp-border); }
        .p-footer__grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 3rem; margin-bottom: 4rem; }
        .p-footer__desc { color: var(--text-secondary); line-height: 1.6; max-width: 320px; font-size: 0.95rem;}
        .p-footer__col h5 { font-size: 1.05rem; font-weight: 700; margin: 0 0 1.5rem; color: var(--text-primary); }
        .p-footer__col a { display: block; color: var(--text-secondary); text-decoration: none; margin-bottom: 0.8rem; transition: color 0.2s; font-size: 0.95rem; }
        .p-footer__col a:hover { color: var(--lp-primary); }
        
        .p-footer__bottom { border-top: 1px solid var(--lp-border); padding-top: 2rem; display: flex; justify-content: space-between; color: var(--text-muted); font-size: 0.9rem; flex-wrap: wrap; gap: 1rem;}
        .p-footer__credits { font-weight: 500; }

        /* RESPONSIVE */
        @media (max-width: 1024px) {
           .p-hero__grid, .p-usp__grid, .p-showcase__container { grid-template-columns: 1fr; gap: 3rem; }
           .p-showcase__visual { order: -1; }
           .p-hiw__stepper { flex-direction: column; align-items: stretch; gap: 1.5rem; }
           .p-hiw__step { display: flex; text-align: left; align-items: flex-start; gap: 1.5rem; padding: 0; }
           .p-hiw__num { margin: 0; flex-shrink: 0; }
           .p-hiw__line { width: 2px; height: 24px; margin: -1rem 0 -1rem 23px; min-width: 0; }
           .desktop-only { display: none !important; }
           .mobile-only { display: block; }
           .p-footer__grid { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 768px) {
           .p-problem__grid, .p-features__grid { grid-template-columns: 1fr; }
           .p-highlights__inner { justify-content: center; }
           .p-footer__grid { grid-template-columns: 1fr; }
           .p-hero__visual-layering { transform: none !important; }
           .p-hero__floating-card { position: static; transform: none !important; animation: none !important; margin-top: 1rem; width: 100%; }
        }
      `}</style>
    </div>
  );
}
