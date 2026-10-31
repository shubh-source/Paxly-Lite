import React, { useEffect, useState } from 'react';
import { Icons } from '../ui/Icons';
import EncryptedMedia from './EncryptedMedia';
import { fixUrl } from '../../pages/chat/Chat';
import { safeGetItem } from '../../services/chatCache';
import { decryptMessage } from '../../services/crypto';

export default function MediaLightboxModal({ msg, isOwn, encryptionKey: propKey, onClose, onDownload, onRequestSave }) {
  const [encryptionKey, setEncryptionKey] = useState(propKey || null);

  useEffect(() => {
    if (propKey) {
      setEncryptionKey(propKey);
      return;
    }
    if (!msg) return;
    if (msg.encryptionKey) {
      setEncryptionKey(msg.encryptionKey);
      return;
    }
    if (msg.text && msg.text.startsWith('E2EE_KEY:')) {
      setEncryptionKey(msg.text.substring(9));
      return;
    }
    if (msg.text) {
      const sk = safeGetItem('paxly_sk');
      const partnerPk = safeGetItem('paxly_partner_pk');
      if (sk && partnerPk) {
        try {
          const dec = decryptMessage(msg.text, sk, partnerPk);
          if (dec && dec.startsWith('E2EE_KEY:')) {
            setEncryptionKey(dec.substring(9));
          }
        } catch {}
      }
    }
  }, [msg, propKey]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!msg) return null;

  const isVideo = msg.message_type === 'video';

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'lightboxFadeIn 0.22s ease-out'
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes lightboxFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Top Navigation Bar */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0))',
          zIndex: 10
        }}
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: 'none',
            borderRadius: '50%',
            width: 42,
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            transition: 'background 0.2s',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)'
          }}
          title="Close (Esc)"
        >
          <Icons.Close size={20} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem', letterSpacing: 0.3 }}>
            {isOwn ? 'You' : (msg.sender_name || 'Partner')}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: 2 }}>
            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {(onDownload || onRequestSave) && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (isOwn) {
                  if (onDownload) onDownload(msg);
                } else {
                  if (onRequestSave) onRequestSave(msg);
                  else if (onDownload) onDownload(msg);
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                borderRadius: '50%',
                width: 42,
                height: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: 'pointer',
                transition: 'background 0.2s',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
              }}
              title="Save to Device"
            >
              <Icons.Download size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Main Media Viewport */}
      <div 
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px',
          overflow: 'hidden',
          userSelect: 'none'
        }}
        onClick={onClose}
      >
        <div 
          onClick={e => e.stopPropagation()} 
          style={{ 
            maxWidth: '96vw', 
            maxHeight: '86vh', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}
        >
          <EncryptedMedia 
            src={fixUrl(msg.media_url)} 
            encryptionKey={encryptionKey} 
            isVideo={isVideo} 
            controls={isVideo}
            autoPlay={isVideo}
            style={{
              maxWidth: '96vw',
              maxHeight: '86vh',
              objectFit: 'contain',
              borderRadius: 10,
              boxShadow: '0 12px 48px rgba(0,0,0,0.85)',
              display: 'block'
            }} 
          />
        </div>
      </div>
    </div>
  );
}
