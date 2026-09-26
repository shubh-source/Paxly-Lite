/**
 * useCameraThreatDetection.js  (BARE React Native version — no Expo)
 * ----------------------------------------------------------------
 * Install:
 *   npm install react-native-vision-camera
 *   npm install @tensorflow/tfjs @tensorflow/tfjs-react-native
 *   npm install @tensorflow-models/coco-ssd
 *   npm install @react-native-async-storage/async-storage
 *
 * Android: android/app/src/main/AndroidManifest.xml me add karo:
 *   <uses-permission android:name="android.permission.CAMERA" />
 *
 * iOS: ios/YourApp/Info.plist me add karo:
 *   <key>NSCameraUsageDescription</key>
 *   <string>Security check ke liye camera access chahiye</string>
 *
 * ⚠️ NOTE: expo-gl na hone ki wajah se tfjs GPU-accelerated nahi chalega,
 * CPU backend use hoga — thoda slower hoga Expo wale version se. Agar
 * lag zyada mehsoos ho, DETECTION_INTERVAL_MS badha dena (e.g. 1200ms).
 *
 * ⚠️ Ye best-effort feature hai — reliability limitations pehle discuss
 * ho chuki hain (angle miss, false positive/negative, battery cost).
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const DETECTION_INTERVAL_MS = 1000;
const CONFIDENCE_THRESHOLD = 0.6;

export function useCameraThreatDetection({ enabled, onPhoneDetected }) {
  const device = useCameraDevice('front');
  const [hasPermission, setHasPermission] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const cameraRef = useRef(null);
  const modelRef = useRef(null);
  const intervalRef = useRef(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await tf.ready();
      const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      if (mounted) {
        modelRef.current = model;
        setModelReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !modelReady || !hasPermission || !device) return;
    triggeredRef.current = false;

    intervalRef.current = setInterval(async () => {
      if (!cameraRef.current || triggeredRef.current) return;

      try {
        const photo = await cameraRef.current.takePhoto({
          flash: 'off',
          enableShutterSound: false,
        });

        const imgTensor = await uriToTensor('file://' + photo.path);
        const predictions = await modelRef.current.detect(imgTensor);
        imgTensor.dispose();

        const phone = predictions.find(
          (p) => p.class === 'cell phone' && p.score >= CONFIDENCE_THRESHOLD
        );

        if (phone && !triggeredRef.current) {
          triggeredRef.current = true;
          onPhoneDetected();
        }
      } catch (e) {
        // silent fail — agla interval retry karega
      }
    }, DETECTION_INTERVAL_MS);

    return () => clearInterval(intervalRef.current);
  }, [enabled, modelReady, hasPermission, device]);

  return { cameraRef, device, hasPermission, modelReady };
}

async function uriToTensor(uri) {
  const response = await fetch(uri);
  const imageDataArrayBuffer = await response.arrayBuffer();
  const imageData = new Uint8Array(imageDataArrayBuffer);
  return require('@tensorflow/tfjs-react-native').decodeJpeg(imageData);
}
