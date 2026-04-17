import { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export default function SecureViewer({ mediaUrl, messageId, onClosed, onCompromised }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [securityOk, setSecurityOk] = useState(false);
  const [violation, setViolation] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionRef = useRef(null);

  useEffect(() => {
    // Load AI Model
    const loadModel = async () => {
      try {
        await tf.ready();
        const m = await cocoSsd.load();
        setModel(m);
        startCamera();
      } catch (err) {
        console.error("AI Load Fail", err);
        setLoading(false);
      }
    };
    loadModel();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setLoading(false);
          setSecurityOk(true);
          startDetection();
        };
      }
    } catch (err) {
      alert("Camera access is REQUIRED for secure viewing.");
      onClosed();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (detectionRef.current) cancelAnimationFrame(detectionRef.current);
  };

  const startDetection = async () => {
    if (!model || !videoRef.current) return;

    const detect = async () => {
      if (!videoRef.current) return;
      
      const predictions = await model.detect(videoRef.current);
      
      // Look for "cell phone"
      const phoneDetected = predictions.some(p => p.class === 'cell phone' && p.score > 0.6);
      
      if (phoneDetected) {
        setViolation(true);
        stopCamera();
        onCompromised();
        return;
      }

      detectionRef.current = requestAnimationFrame(detect);
    };
    detect();
  };

  if (violation) {
    return (
      <div className="secure-overlay" style={{ background: '#FF3B30', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
        <div style={{ fontSize: '5rem' }}>⚠️</div>
        <h2 style={{ fontSize: '2rem', fontWeight: 800 }}>SECURITY VIOLATION</h2>
        <p style={{ fontSize: '1.2rem', opacity: 0.9 }}>Another device was detected in front of the screen. Media has been self-destructed and your partner has been notified.</p>
        <button className="btn" onClick={onClosed} style={{ marginTop: 30, background: 'white', color: 'black' }}>Close</button>
      </div>
    );
  }

  return (
    <div className="secure-overlay" style={{ background: 'black', position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
      {/* Hidden Scanner Camera */}
      <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', opacity: 0.1, width: 1, height: 1 }} />
      
      {/* Header */}
      <div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: securityOk ? '#4CD964' : '#FFCC00', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white', opacity: 0.8 }}>
            RESTRICTED MODE: AI SCANNING ACTIVE
          </span>
        </div>
        <button onClick={onClosed} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'white' }}>
            <div className="spinner" style={{ marginBottom: 15 }} />
            <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>Starting Security Scan...</p>
          </div>
        ) : (
          <img 
            src={mediaUrl} 
            alt="secure" 
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            onContextMenu={e => e.preventDefault()}
          />
        )}
      </div>

      {/* Security Footer */}
      <div style={{ padding: '20px 40px', textAlign: 'center', color: 'white', opacity: 0.5, fontSize: '0.7rem' }}>
        DO NOT take screenshots or record with another device. Paxly AI is monitoring the environment to protect your privacy.
      </div>

      <style>{`
        .secure-overlay { color: white; transition: all 0.3s; }
        .spinner { width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.1); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}
