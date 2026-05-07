import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Icons } from '../ui/Icons';

export default function AppGuard({ children }) {
  const { user, loading } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(3);
  const timerRef = useRef(null);

  // Auto-lock when putting the app in the background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && user?.has_pin) {
        setIsLocked(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user?.has_pin]);

  useEffect(() => {
    if (!loading && user?.has_pin) {
      // Initially locked if PIN is set
      setIsLocked(true);
    }
  }, [loading, user?.has_pin]);

  const captureIntruder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      
      stream.getTracks().forEach(track => track.stop());

      canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('file', blob, 'intruder.jpg');
        try {
          await api.post('/security/intruder/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        } catch (e) {
          console.error('Failed to upload intruder selfie', e);
        }
      }, 'image/jpeg', 0.8);
    } catch (e) {
      console.error('Failed to access camera for intruder selfie', e);
    }
  };

  const verifyPin = async () => {
    if (pin.length < 4) return setError('PIN too short');
    try {
      const res = await api.post('/security/pin/verify', { pin });
      if (res.data.status === 'ok') {
        setIsLocked(false);
        setPin('');
        setError('');
        setAttempts(3);
      } else {
        const left = res.data.attempts_left || 0;
        setError(`Incorrect PIN. ${left} attempts remaining.`);
        setPin('');
        setAttempts(left);
        if (res.data.trigger_selfie) {
           setError('Vault secured. Too many failed attempts.');
           captureIntruder();
        }
      }
    } catch {
      setError('Communication error with Security Vault.');
    }
  };

  const handleKey = (num) => {
    if (pin.length < 4) setPin(prev => prev + num);
  };

  // Keyboard support for Laptop/Desktop
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isLocked) return;
      
      if (e.key >= '0' && e.key <= '9') {
        handleKey(e.key);
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        verifyPin();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, pin]); // Re-bind when PIN changes to ensure verifyPin has latest state

  if (!loading && user?.has_pin && isLocked) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0D0D0F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛡️</div>
          <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.5px' }}>Welcome back, {user?.name?.split(' ')[0]}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 8 }}>Fortress is Locked. Enter PIN.</p>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: pin.length > i ? 'var(--accent)' : '#222', border: '1px solid #333', transition: 'all 0.2s', boxShadow: pin.length > i ? '0 0 10px var(--accent)' : 'none' }} />
          ))}
        </div>

        {error && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: 20 }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 280 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button key={n} onClick={() => handleKey(n.toString())} className="pin-btn">{n}</button>
          ))}
          <button onClick={() => setPin(prev => prev.slice(0, -1))} className="pin-btn" style={{ fontSize: '1.2rem' }}>⌫</button>
          <button onClick={() => handleKey('0')} className="pin-btn">0</button>
          <button onClick={verifyPin} className="pin-btn" style={{ background: 'var(--accent)', color: '#000', fontSize: '1.1rem' }}>OK</button>
        </div>

        <style>{`
          .pin-btn {
            width: 68px; height: 68px; border-radius: 50%;
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
            color: #fff; fontSize: 1.5rem; fontWeight: 600; font-family: var(--font-b);
            cursor: pointer; transition: all 0.2s;
            display: flex; align-items: center; justify-content: center;
          }
          .pin-btn:active { transform: scale(0.9); background: rgba(255,255,255,0.1); }
        `}</style>
      </div>
    );
  }

  return children;
}
