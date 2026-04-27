import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

export default function AppGuard({ children }) {
  const { user, loading } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(3);
  const timerRef = useRef(null);

  const PIN_TIMEOUT = 20000; // 20 Seconds

  useEffect(() => {
    if (!loading && user?.app_pin) {
      // Initially locked if PIN is set
      setIsLocked(true);
    }
  }, [loading, user?.app_pin]);

  // Activity Tracking
  useEffect(() => {
    if (!user?.app_pin) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIsLocked(true);
      }, PIN_TIMEOUT);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    window.addEventListener('touchstart', resetTimer);

    resetTimer();

    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keypress', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user?.app_pin, isLocked]);

  const verifyPin = async () => {
    try {
      const res = await axios.post('/api/security/pin/verify', { pin });
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
           // Logic for intruder selfie would go here if camera is available
           alert("Intruder Alert! Failed attempts logged.");
        }
      }
    } catch {
      setError('Communication error with Security Vault.');
    }
  };

  const handleKey = (num) => {
    if (pin.length < 6) setPin(prev => prev + num);
  };

  if (!loading && user?.app_pin && isLocked) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0D0D0F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔒</div>
          <h2 style={{ color: '#fff', fontSize: '1.5rem' }}>Vlynxly Locked</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Enter your App PIN to continue</p>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
          {[...Array(user.app_pin_length || 6)].map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: pin.length > i ? 'var(--accent)' : '#222', border: '1px solid #333' }} />
          ))}
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 20 }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 280 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button key={n} onClick={() => handleKey(n.toString())} className="pin-btn">{n}</button>
          ))}
          <button onClick={() => setPin('')} className="pin-btn" style={{ fontSize: '0.9rem' }}>CLR</button>
          <button onClick={() => handleKey('0')} className="pin-btn">0</button>
          <button onClick={verifyPin} className="pin-btn" style={{ background: 'var(--accent)', color: '#000' }}>OK</button>
        </div>

        <style>{`
          .pin-btn {
            width: 64px; height: 64px; border-radius: 50%;
            background: #16161A; border: 1px solid #222;
            color: #fff; fontSize: 1.4rem; fontWeight: 600;
            cursor: pointer; transition: all 0.2s;
            display: flex; alignItems: center; justifyContent: center;
          }
          .pin-btn:active { transform: scale(0.9); background: #222; }
        `}</style>
      </div>
    );
  }

  return children;
}
