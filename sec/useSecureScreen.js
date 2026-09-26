/**
 * useSecureScreen.js  (BARE React Native version — no Expo)
 * -----------------------------------------------------------
 * Install (bare RN CLI, Android Studio build):
 *   npm install react-native-screenshot-prevent
 *   npx pod-install ios   (agar Mac pe iOS build bhi karte ho)
 *
 * Android: autolink ho jayega, extra manifest change ki zaroorat nahi.
 * Isse:
 *   - Android: FLAG_SECURE laga deta hai -> screenshot/recording dono
 *     OS-level par black/empty capture hote hain (real block).
 *   - iOS: screenshot hone ke turant baad listener/callback milta hai
 *     (block nahi, sirf turant detect — Apple ki limitation, koi bhi
 *     app isse cross nahi kar sakta).
 */

import { useEffect, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import ScreenshotPrevent from 'react-native-screenshot-prevent';
// ^ package export shape version ke hisaab se thoda alag ho sakta hai —
//   node_modules/react-native-screenshot-prevent/README.md check kar lena
//   exact method names confirm karne ke liye apni installed version me.

export function useSecureScreen({ sessionId, otherUserId, socket, onBreach }) {
  const [isContentSafe, setIsContentSafe] = useState(true);
  const breachHandled = useRef(false);

  const reportBreach = (type) => {
    if (breachHandled.current) return;
    breachHandled.current = true;

    setIsContentSafe(false);

    socket?.emit('capture_detected', {
      sessionId,
      targetUserId: otherUserId,
      type, // 'screenshot' | 'recording'
      timestamp: Date.now(),
    });

    onBreach?.(type);
  };

  useEffect(() => {
    breachHandled.current = false;
    setIsContentSafe(true);

    // ---------- ANDROID: real block ----------
    if (Platform.OS === 'android') {
      ScreenshotPrevent.enabled(true); // FLAG_SECURE ON
    }

    // ---------- iOS: detection only ----------
    let removeListener;
    if (Platform.OS === 'ios') {
      // Screenshot detect hote hi callback fire hota hai
      ScreenshotPrevent.enabled(true); // library ka iOS-side protection bhi on karo
      removeListener = ScreenshotPrevent.addListener?.(() => {
        reportBreach('screenshot');
      });

      // ⚠️ KNOWN GAP: continuous screen-RECORDING detection (isCaptured) ke
      // liye is package me built-in support nahi hai. Iske liye custom
      // native module (Swift, UIScreen.capturedDidChangeNotification)
      // likhna padega — abhi ye piece TODO hai, screenshot detection hi
      // kaam kar raha hai is package se.
    }

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setIsContentSafe(false);
      } else if (!breachHandled.current) {
        setIsContentSafe(true);
      }
    });

    return () => {
      if (Platform.OS === 'android') {
        ScreenshotPrevent.enabled(false);
      }
      if (Platform.OS === 'ios') {
        removeListener?.();
      }
      appStateSub.remove();
    };
  }, [sessionId]);

  return { isContentSafe };
}
