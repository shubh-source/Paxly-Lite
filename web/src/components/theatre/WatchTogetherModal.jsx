import { useEffect } from 'react';
import WatchTogether from './WatchTogether';

export default function WatchTogetherModal({ isOpen, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="watch-modal-overlay" onClick={onClose}>
      <div 
        className="watch-modal-content" 
        onClick={(e) => e.stopPropagation()}
      >
        <WatchTogether onClose={onClose} isEmbedded={true} />
      </div>

      <style>{`
        .watch-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: fadeIn 0.25s ease-out;
        }

        .watch-modal-content {
          width: 100%;
          max-width: 820px;
          max-height: 92vh;
          overflow-y: auto;
          border-radius: 24px;
          border: 1px solid rgba(201, 169, 110, 0.25);
          box-shadow: 0 24px 64px rgba(0,0,0,0.8), 0 0 32px rgba(201, 169, 110, 0.1);
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(40px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 640px) {
          .watch-modal-overlay {
            padding: 0;
            align-items: flex-end;
          }
          .watch-modal-content {
            max-height: 90vh;
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
          }
        }
      `}</style>
    </div>
  );
}
