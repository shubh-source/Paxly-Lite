import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import EncryptedMedia from './EncryptedMedia';
import { useSecureScreen } from '../../hooks/useSecureScreen';
import { useCameraThreatDetection } from '../../hooks/useCameraThreatDetection';
import api from '../../services/api';

/**
 * SecureMediaOverlay.jsx
 * Fullscreen portal for Once View media. Enforces anti-screenshot and camera threat detection.
 */
export default function SecureMediaOverlay({ msg, wsService, onClose }) {
  const [encryptionKey, setEncryptionKey] = useState(null);
  const breachHandled = useRef(false);

  useEffect(() => {
    if (msg.text && msg.text.startsWith('E2EE_KEY:')) {
      setEncryptionKey(msg.text.substring(9));
    }
  }, [msg.text]);

  const closeAndReportBreach = async (reason) => {
    if (breachHandled.current) return;
    breachHandled.current = true;

    try {
      // Mark as consumed/breached in backend
      await api.post(`/chat/messages/${msg.id}/status`, { action: 'view' });
    } catch (err) {
      console.warn('Failed to mark media consumed:', err);
    }

    if (wsService && wsService.ws && wsService.ws.readyState === WebSocket.OPEN && reason !== 'viewed') {
      wsService.send(JSON.stringify({
        type: 'capture_detected',
        sessionId: msg.id,
        targetUserId: msg.sender_id,
        capture_type: reason, // 'screenshot', 'tab_switched', 'external_device_detected'
        timestamp: Date.now()
      }));
    }

    onClose();
  };

  // Layer 1: OS-level screenshot/recording detection & Blur/Visibility tracking
  useSecureScreen({
    sessionId: msg.id,
    otherUserId: msg.sender_id,
    socket: wsService,
    onBreach: closeAndReportBreach,
    enabled: true
  });

  // Layer 2: Camera-based external device detection
  const { hasPermission, modelReady, videoRef } = useCameraThreatDetection({
    enabled: true,
    onPhoneDetected: () => closeAndReportBreach('external_device_detected'),
  });

  useEffect(() => {
    // When unmounting normally, mark as viewed (if not breached)
    return () => {
      if (!breachHandled.current) {
        closeAndReportBreach('viewed');
      }
    };
  }, []);

  const isVideo = msg.message_type === 'video';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.05 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed',
          top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: '#000',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          pointerEvents: 'auto'
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        
        {/* Hidden video element for TFJS camera feed */}
        <video 
          ref={videoRef} 
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          playsInline
          muted
        />

        <div style={{
          position: 'absolute',
          top: 40,
          background: 'rgba(20,20,20,0.8)',
          padding: '8px 16px',
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 10
        }}>
          <span style={{ fontSize: '1.2rem' }}>🔒</span>
          <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
            {modelReady ? 'Security Active - Disappears after closing' : 'Loading Security Engine...'}
          </span>
        </div>

        <button 
          onClick={() => closeAndReportBreach('viewed')}
          style={{
            position: 'absolute',
            top: 40,
            right: 20,
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: '#fff',
            width: 40, height: 40,
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '1.2rem',
            zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          ✕
        </button>

        <div style={{ width: '100%', height: '100%', maxWidth: '800px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <EncryptedMedia 
            src={msg.media_url} 
            encryptionKey={encryptionKey} 
            isVideo={isVideo}
            controls={isVideo}
            autoPlay={isVideo}
            style={{ 
              maxWidth: '100%', 
              maxHeight: '100%', 
              objectFit: 'contain',
              borderRadius: 16,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              pointerEvents: 'auto'
            }} 
          />
        </div>

      </motion.div>
    </AnimatePresence>
  );
}
