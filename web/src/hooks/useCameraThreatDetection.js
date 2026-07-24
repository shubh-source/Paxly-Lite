import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const DETECTION_INTERVAL_MS = 1500; // 1.5 seconds to save CPU on web
const CONFIDENCE_THRESHOLD = 0.5;

/**
 * useCameraThreatDetection.js (Web/Capacitor Adaption)
 * Best-effort detection of someone recording the screen with another phone/laptop.
 */
export function useCameraThreatDetection({ enabled = true, onPhoneDetected }) {
  const [hasPermission, setHasPermission] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const videoRef = useRef(null);
  const modelRef = useRef(null);
  const intervalRef = useRef(null);
  const triggeredRef = useRef(false);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' } 
        });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setHasPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        // Load TFJS model
        await tf.ready();
        const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        if (mounted) {
          modelRef.current = model;
          setModelReady(true);
        }
      } catch (err) {
        console.warn('Camera access denied or failed:', err);
        setHasPermission(false);
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !hasPermission || !modelReady || !videoRef.current) return;

    const detect = async () => {
      if (triggeredRef.current || !modelRef.current || !videoRef.current) return;

      try {
        const predictions = await modelRef.current.detect(videoRef.current);
        const threat = predictions.find(
          p => (p.class === 'cell phone' || p.class === 'laptop') && p.score >= CONFIDENCE_THRESHOLD
        );

        if (threat) {
          triggeredRef.current = true;
          if (onPhoneDetected) onPhoneDetected();
        }
      } catch (e) {
        console.warn('TFJS Detection error:', e);
      }
    };

    intervalRef.current = setInterval(detect, DETECTION_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, hasPermission, modelReady, onPhoneDetected]);

  return { hasPermission, modelReady, videoRef };
}
