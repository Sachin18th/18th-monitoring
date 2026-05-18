'use client';
import React from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  action,
  icon,
  className = '',
}) => {
  return (
    <div className={`section-header ${className}`.trim()}>
      <div className="section-header__copy">
        <div className="section-header__title-row">
          {icon ? <span className="section-header__icon">{icon}</span> : null}
          <h2 className="section-header__title">{title}</h2>
        </div>
        {subtitle ? <p className="section-header__subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="section-header__action">{action}</div> : null}

      <style jsx>{`
        .section-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .section-header__copy {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 0;
        }

        .section-header__title-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .section-header__icon {
          width: 2rem;
          height: 2rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: color-mix(in srgb, var(--primary) 10%, var(--bg-surface));
          color: var(--primary);
        }

        .section-header__title {
          margin: 0;
          font-size: 1.05rem;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text-primary);
        }

        .section-header__subtitle {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.55;
          color: var(--text-secondary);
        }

        .section-header__action {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        @media (max-width: 720px) {
          .section-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .section-header__action {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};
