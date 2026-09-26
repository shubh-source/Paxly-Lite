/**
 * useMediaSaveRequest.js  (Bare React Native)
 * ---------------------------------------------
 * Consent-based "save to gallery" flow:
 *  - Media by default sirf app ke andar render hota hai, kabhi bhi
 *    automatically device gallery me save NAHI hota.
 *  - User "Save" tap kare -> partner ko real-time request jati hai.
 *  - Partner "Allow" kare tabhi requester ke device pe CameraRoll me
 *    actual save hota hai. "Deny" kare to kabhi nahi hota.
 *
 * Install:
 *   npm install @react-native-camera-roll/camera-roll
 *
 * Android permissions (AndroidManifest.xml) — sirf tab chahiye jab
 * approval milne ke baad actually save karna ho:
 *   <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
 *       android:maxSdkVersion="28" />
 *   (Android 10+ scoped storage me CameraRoll library khud handle kar leti hai)
 */

import { useEffect, useRef, useState } from 'react';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

const REQUEST_TIMEOUT_MS = 60000; // 1 min me partner respond na kare to auto-expire

/**
 * REQUESTER SIDE — jo user save button tap karta hai
 */
export function useMediaSaveRequester({ socket, mediaId, mediaUrl, mediaType, partnerId }) {
  const [status, setStatus] = useState('idle'); // idle | pending | approved | denied | expired | saving | saved | error
  const timeoutRef = useRef(null);

  const requestSave = () => {
    if (status === 'pending') return; // double-tap guard
    setStatus('pending');

    socket.emit('save_request', {
      mediaId,
      requesterId: socket.userId,
      targetUserId: partnerId,
      timestamp: Date.now(),
    });

    timeoutRef.current = setTimeout(() => {
      setStatus((s) => (s === 'pending' ? 'expired' : s));
    }, REQUEST_TIMEOUT_MS);
  };

  useEffect(() => {
    const onResponse = async ({ mediaId: respMediaId, approved }) => {
      if (respMediaId !== mediaId) return;
      clearTimeout(timeoutRef.current);

      if (!approved) {
        setStatus('denied');
        return;
      }

      setStatus('saving');
      try {
        await CameraRoll.save(mediaUrl, {
          type: mediaType === 'video' ? 'video' : 'photo',
        });
        setStatus('saved');
      } catch (e) {
        setStatus('error');
      }
    };

    socket.on('save_response', onResponse);
    return () => {
      socket.off('save_response', onResponse);
      clearTimeout(timeoutRef.current);
    };
  }, [mediaId, mediaUrl, mediaType]);

  return { status, requestSave };
}

/**
 * RESPONDER SIDE — partner ke phone pe jo request receive + approve/deny karta hai
 * App ke kisi top-level component (App.js ya provider) me ek baar mount karo.
 */
export function useMediaSaveResponder({ socket, onIncomingRequest }) {
  useEffect(() => {
    const onRequest = (payload) => {
      // payload: { mediaId, requesterId, timestamp }
      onIncomingRequest(payload);
    };
    socket.on('save_request_incoming', onRequest);
    return () => socket.off('save_request_incoming', onRequest);
  }, []);

  const respond = (mediaId, requesterId, approved) => {
    socket.emit('save_response', {
      mediaId,
      requesterId,
      approved,
      timestamp: Date.now(),
    });
  };

  return { respond };
}
