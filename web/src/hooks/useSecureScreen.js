import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';

/**
 * useSecureScreen.js
 * Enables privacy screen (FLAG_SECURE on Android) and listens to browser visibility/blur events.
 */
export function useSecureScreen({ sessionId, otherUserId, socket, onBreach, enabled = true }) {
  const isCapacitor = Capacitor.isNativePlatform();
  const breached = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleBreach = (reason) => {
      if (breached.current) return;
      breached.current = true;
      if (onBreach) onBreach(reason);
    };

    // 1. Enable Native Privacy Screen (Android FLAG_SECURE)
    if (isCapacitor) {
      PrivacyScreen.enable().catch(err => console.warn('PrivacyScreen enable failed:', err));
    }

    // 2. Web Fallbacks (Visibility & Blur)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleBreach('tab_switched');
      }
    };

    const handleBlur = () => {
      handleBreach('window_blurred');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      if (isCapacitor) {
        PrivacyScreen.disable().catch(err => console.warn('PrivacyScreen disable failed:', err));
      }
    };
  }, [enabled, sessionId, otherUserId, socket, onBreach]);
}
