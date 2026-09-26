/**
 * OnceViewMediaScreen.js
 * -----------------------
 * Once-view / disappearing photo ya video ke liye.
 * Media local device pe kabhi save/download NAHI hota — server se
 * seedha render hota hai aur view hote hi server ko "consumed" mark
 * karke delete-flag laga do (backend responsibility).
 *
 * Do detection layers ek sath chalte hain:
 * 1. useSecureScreen — screenshot/recording OS-level detect (FLAG_SECURE / iOS listener)
 * 2. useCameraThreatDetection — best-effort: front camera se doosra phone detect
 *    (agar koi apne phone se iss screen ko record/photo karne ki koshish kare)
 */

import React, { useEffect, useRef } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { useSecureScreen } from './useSecureScreen';
import { useCameraThreatDetection } from './useCameraThreatDetection';
import { useNavigation } from '@react-navigation/native';

export default function OnceViewMediaScreen({ route, socket, api }) {
  const { mediaId, senderId, mediaUrl, mediaType, chatId } = route.params; // mediaType: 'photo' | 'video'
  const navigation = useNavigation();
  const breachHandled = useRef(false); // shared guard — dono layers isko check karte hain

  const closeAndReportBreach = (type) => {
    if (breachHandled.current) return; // dusri layer already handle kar chuki
    breachHandled.current = true;

    api.markMediaConsumed(mediaId, { reason: type });

    socket?.emit('capture_detected', {
      sessionId: mediaId,
      targetUserId: senderId,
      type, // 'screenshot' | 'recording' | 'external_device_detected'
      timestamp: Date.now(),
    });

    navigation.reset({
      index: 0,
      routes: [{ name: 'Chat', params: { chatId } }],
    });
  };

  // Layer 1: OS-level screenshot/recording detection
  useSecureScreen({
    sessionId: mediaId,
    otherUserId: senderId,
    socket,
    onBreach: closeAndReportBreach,
  });

  // Layer 2: Best-effort camera-based external device detection
  const { cameraRef, device, hasPermission, modelReady } =
    useCameraThreatDetection({
      enabled: true,
      onPhoneDetected: () => closeAndReportBreach('external_device_detected'),
    });

  useEffect(() => {
    // Screen chhodte hi (normal exit pe bhi) media ko consumed mark karo
    return () => {
      api.markMediaConsumed(mediaId, { reason: 'viewed' });
    };
  }, []);

  return (
    <View style={styles.container}>
      {mediaType === 'photo' ? (
        <Image source={{ uri: mediaUrl }} style={styles.media} resizeMode="contain" />
      ) : (
        <Text style={styles.placeholder}>[ Video Player - streamed, not downloaded ]</Text>
      )}

      {/* Front camera — invisible (1x1), sirf detection ke liye, koi preview nahi dikhana */}
      {hasPermission && device && (
        <Camera
          ref={cameraRef}
          style={styles.hiddenCamera}
          device={device}
          isActive={true}
          photo={true}
        />
      )}

      {/* User ko clearly batao camera use ho rahi hai — privacy transparency zaroori */}
      {hasPermission && device && (
        <View style={styles.cameraIndicator}>
          <Text style={styles.cameraIndicatorText}>
            {modelReady ? '🔒 Security check active' : 'Loading security check...'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  media: { width: '100%', height: '100%' },
  placeholder: { color: '#fff' },
  hiddenCamera: { width: 1, height: 1, opacity: 0, position: 'absolute' },
  cameraIndicator: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cameraIndicatorText: { color: '#aaa', fontSize: 11 },
});
