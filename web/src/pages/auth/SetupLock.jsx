import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import PageTransition from '../../components/layout/PageTransition';
import { motion } from 'framer-motion';

export default function SetupLock() {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState(1); // 1: set, 2: confirm
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { refreshUser } = useAuth();

  const handleKey = (num) => {
    setErr('');
    if (step === 1) {
      if (pin.length < 4) setPin(p => p + num);
    } else {
      if (confirm.length < 4) setConfirm(c => c + num);
    }
  };

  const handleBackspace = () => {
    setErr('');
    if (step === 1) {
      setPin(p => p.slice(0, -1));
    } else {
      setConfirm(c => c.slice(0, -1));
    }
  };

  const handleNext = () => {
    if (pin.length < 4) return setErr('PIN must be 4 digits');
    setStep(2);
  };

  const handleConfirm = async () => {
    if (confirm !== pin) {
      setErr('PINs do not match. Try again.');
      setConfirm('');
      setStep(1);
      setPin('');
      return;
    }

    setLoading(true);
    try {
      // 1. Ask for Camera permission for Intruder Selfie silently
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        // Stream acquired, permission granted. Stop it immediately.
      } catch (e) {
        console.warn('Camera permission denied or unavailable.', e);
        // We proceed anyway, but intruder selfie won't work perfectly.
      }

      // 2. Save PIN
      await api.post('/security/pin/set', { pin });
      await refreshUser();
      
      nav('/dashboard');
    } catch (ex) {
      setErr('Failed to set PIN.');
    } finally {
      setLoading(false);
    }
  };

  const dots = [1, 2, 3, 4];
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'];

  const currentVal = step === 1 ? pin : confirm;

  return (
    <PageTransition layoutId="setup-lock">
      <div className="page center" style={{ background: 'var(--bg)', padding: '24px' }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🛡️</div>
          <h2 style={{ marginBottom: 8 }}>{step === 1 ? 'Set App Lock' : 'Confirm App Lock'}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 32 }}>
            {step === 1 
              ? 'Protect your private space with a 4-digit PIN.' 
              : 'Enter the PIN again to confirm.'}
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 40 }}>
            {dots.map(i => (
              <div 
                key={i} 
                style={{ 
                  width: 20, height: 20, borderRadius: '50%', 
                  background: i <= currentVal.length ? 'var(--accent)' : 'var(--s2)',
                  transition: 'all 0.2s',
                  boxShadow: i <= currentVal.length ? '0 0 10px var(--accent)' : 'none'
                }} 
              />
            ))}
          </div>

          {err && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: 20 }}>{err}</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 280, margin: '0 auto 32px' }}>
            {keys.map((k, i) => (
              <button
                key={i}
                onClick={() => {
                  if (k === '') return;
                  if (k === '⌫') handleBackspace();
                  else handleKey(k.toString());
                }}
                disabled={k === '' || loading}
                style={{
                  background: k === '' ? 'transparent' : 'rgba(255,255,255,0.05)',
                  border: k === '' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '50%',
                  aspectRatio: '1',
                  fontSize: '1.5rem',
                  color: 'var(--text)',
                  cursor: k === '' ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-b)'
                }}
              >
                {k}
              </button>
            ))}
          </div>

          <button 
            className="btn btn-p btn-full" 
            disabled={currentVal.length < 4 || loading}
            onClick={step === 1 ? handleNext : handleConfirm}
          >
            {loading ? 'Securing...' : step === 1 ? 'Next' : 'Confirm & Enter Fortress'}
          </button>
          
          <p style={{ marginTop: 24, fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            By setting this PIN, you enable the <strong style={{color: 'var(--accent)'}}>Intruder Selfie</strong> feature. <br/>
            3 wrong attempts will silently capture the intruder.
          </p>
        </motion.div>
      </div>
    </PageTransition>
  );
}
