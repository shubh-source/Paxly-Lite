/**
 * SecureVideoCallScreen.js
 * -------------------------
 * Example: video call screen jisme secure hook use ho raha hai.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSecureScreen } from './useSecureScreen';
import { useNavigation } from '@react-navigation/native';

export default function SecureVideoCallScreen({ route, socket }) {
  const { callId, otherUserId } = route.params;
  const navigation = useNavigation();

  const { isContentSafe } = useSecureScreen({
    sessionId: callId,
    otherUserId,
    socket,
    onBreach: (type) => {
      // 1. Call turant end karo (apna existing WebRTC hangup function call karo)
      // endWebRTCCall(callId);

      // 2. Doosre user ko local alert bhi dikha sakte ho turant (socket wale ke ilava)
      // Toast.show(`Call ended: ${type} detected`);

      // 3. Dashboard pe redirect, back navigation possible na ho
      navigation.reset({
        index: 0,
        routes: [{ name: 'Dashboard' }],
      });
    },
  });

  return (
    <View style={styles.container}>
      {isContentSafe ? (
        <View style={styles.videoContainer}>
          {/* Actual WebRTC RTCView / video stream yaha aayega */}
          <Text style={styles.placeholder}>[ Live Video Stream ]</Text>
        </View>
      ) : (
        // Breach detect hote hi ye turant dikhega (recording ke duration bhar ke liye,
        // ya screenshot/redirect hone tak)
        <View style={styles.blurOverlay}>
          <Text style={styles.blurText}>Content Protected</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  videoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { color: '#fff' },
  blurOverlay: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  blurText: { color: '#888', fontSize: 16 },
});
