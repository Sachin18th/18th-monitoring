'use client';
import React, { useEffect } from 'react';
import { X, Play } from 'lucide-react';
import { Button, Typography } from '@kpi-platform/ui';

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DemoModal: React.FC<DemoModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="modal-content">
          <div className="video-placeholder">
            <div className="play-icon">
              <Play size={48} fill="currentColor" />
            </div>
            <img 
              src="https://images.unsplash.com/photo-1551288049-bbbda536339a?auto=format&fit=crop&q=80&w=1200" 
              alt="Dashboard Preview"
              className="preview-img"
            />
          </div>

          <div className="modal-text">
            <Typography variant="h3" noMargin>Enterprise Platform Walkthrough</Typography>
            <Typography variant="body" color="muted">
              Experience how our autonomous monitoring engine simplifies complex infrastructure observability in real-time.
            </Typography>
            <div className="modal-actions">
              <Button onClick={onClose}>Schedule 1:1 Demo</Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(2, 6, 23, 0.9);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: var(--space-6);
          animation: fade-in 0.3s ease-out;
        }

        .modal-container {
          width: 100%;
          max-width: 900px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xl);
          position: relative;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .close-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--bg-muted);
          border: 1px solid var(--border-subtle);
          border-radius: 50%;
          color: var(--text-secondary);
          cursor: pointer;
          z-index: 10;
          transition: all 0.22s ease;
        }

        .close-btn:hover {
          background-color: var(--border-strong);
          color: var(--text-primary);
        }

        .video-placeholder {
          aspect-ratio: 16/9;
          background: #000;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
        }

        .preview-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.6;
          transition: transform 0.8s ease;
        }

        .video-placeholder:hover .preview-img {
          transform: scale(1.05);
        }

        .play-icon {
          position: absolute;
          z-index: 2;
          width: 80px;
          height: 80px;
          background: var(--primary);
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding-left: 4px;
          box-shadow: 0 0 40px rgba(37, 99, 235, 0.4);
          transition: transform 0.22s ease;
        }

        .video-placeholder:hover .play-icon {
          transform: scale(1.1);
        }

        .modal-text {
          padding: var(--space-8);
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .modal-actions {
          display: flex;
          gap: var(--space-4);
          margin-top: var(--space-2);
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @media (max-width: 640px) {
          .modal-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};
