import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { verifyPinReset } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/ui/Icons';

export default function ForgotPin() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [method, setMethod] = useState('password'); // 'password' | 'anniversary'
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');

    if (method === 'password' && !password) {
      setError('Please enter your account password.');
      return;
    }
    if (method === 'anniversary' && !date) {
      setError('Please select your anniversary date.');
      return;
    }

    setLoading(true);
    try {
      const payload = method === 'password' 
        ? { method: 'password', password }
        : { method: 'anniversary', date };

      await verifyPinReset(payload);
      // Verification successful: navigate to setup-lock to enter new 4-digit PIN
      navigate('/setup-lock', { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.message;
      const msg = typeof detail === 'string' 
        ? detail 
        : (Array.isArray(detail) ? detail.map(d => d.msg || d).join(', ') : 'Verification failed. Please try again.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (logout) await logout();
      navigate('/login', { replace: true });
    } catch {
      localStorage.clear();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', background: '#0D0D0F', color: '#fff', display: 'flex', flexDirection: 'column', 
      alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', overflow: 'hidden' 
    }}>
      {/* Background Aura */}
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 15, repeat: Infinity }}
        style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle, rgba(201,169,110,0.06) 0%, transparent 60%)', filter: 'blur(100px)', zIndex: 0 }} 
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ 
          maxWidth: 420, width: '100%', zIndex: 10, background: 'rgba(255,255,255,0.03)',
          padding: '40px 32px', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(40px)', boxShadow: '0 40px 80px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
           <div style={{ width: 60, height: 60, borderRadius: 20, background: 'rgba(201,169,110,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid var(--accent)' }}>
              <Icons.Shield size={30} color="var(--accent)" />
           </div>
           <h1 style={{ fontSize: '1.9rem', fontWeight: 600, fontFamily: 'serif', marginBottom: 6 }}>Reset App PIN</h1>
           <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.88rem' }}>Verify your identity to set a new 4-digit PIN.</p>
        </div>

        {/* Method Switcher */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 4, marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => { setMethod('password'); setError(''); }}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
              background: method === 'password' ? 'var(--accent)' : 'transparent',
              color: method === 'password' ? '#000' : 'rgba(255,255,255,0.7)',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Account Password
          </button>
          <button
            type="button"
            onClick={() => { setMethod('anniversary'); setError(''); }}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
              background: method === 'anniversary' ? 'var(--accent)' : 'transparent',
              color: method === 'anniversary' ? '#000' : 'rgba(255,255,255,0.7)',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Anniversary Date
          </button>
        </div>

        <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {method === 'password' ? (
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, fontWeight: 700 }}>
                YOUR ACCOUNT PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  required 
                  placeholder="Enter login password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '16px 48px 16px 18px', borderRadius: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.98rem', outline: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}
                >
                  {showPassword ? <Icons.EyeOff size={18} /> : <Icons.Eye size={18} />}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, fontWeight: 700 }}>
                YOUR ANNIVERSARY DATE
              </label>
              <input 
                type="date" required 
                value={date} onChange={(e) => setDate(e.target.value)}
                style={{ width: '100%', padding: '16px 18px', borderRadius: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.98rem', outline: 'none' }}
              />
            </div>
          )}

          {error && <p style={{ color: '#FF4D4D', fontSize: '0.85rem', textAlign: 'center', margin: '4px 0' }}>{error}</p>}

          <motion.button
            whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }} whileTap={{ scale: 0.98 }}
            disabled={loading}
            style={{ 
              marginTop: 4, width: '100%', padding: '16px', borderRadius: '14px', 
              background: 'var(--accent)', color: '#000', border: 'none', 
              fontWeight: 800, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: 0.5
            }}
          >
            {loading ? 'Verifying...' : 'Verify & Set New PIN'}
          </motion.button>
        </form>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
          <Link to="/forgot-password" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', textDecoration: 'none' }} onMouseEnter={e => e.target.style.color = 'var(--accent)'} onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.5)'}>
            Forgot account password too?
          </Link>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
            <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              ← Cancel
            </button>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              Log Out of App
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
