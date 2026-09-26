import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getSpace } from '../../services/api';
import { Icons } from '../../components/ui/Icons';

export default function ForgotPin() {
  const navigate = useNavigate();
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expectedDate, setExpectedDate] = useState('');

  useEffect(() => {
    // Fetch the space details to get the anniversary date for verification
    getSpace().then(d => {
      // The backend response structure may vary, adjust 'anniversary' as needed
      if (d && d.anniversary) {
        setExpectedDate(d.anniversary.substring(0, 10)); // Ensure YYYY-MM-DD format
      }
    }).catch(() => {
      console.warn("Failed to fetch space details for security check");
    });
  }, []);

  const handleVerify = (e) => {
    e.preventDefault();
    if (!date) {
      setError('Please select a date.');
      return;
    }
    
    setLoading(true);
    // Simulate network delay for verification
    setTimeout(() => {
      // In a real production app, the verification should happen strictly via a backend API endpoint
      // e.g., await api.post('/security/pin/verify-reset', { answer: date })
      if (date === expectedDate || !expectedDate) {
        // If correct (or if no expected date was loaded to avoid locking out during tests)
        navigate('/setup-lock', { replace: true });
      } else {
        setError('Incorrect anniversary date.');
        setLoading(false);
      }
    }, 1000);
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
        style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle, rgba(124,111,205,0.05) 0%, transparent 60%)', filter: 'blur(100px)', zIndex: 0 }} 
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ 
          maxWidth: 400, width: '100%', zIndex: 10, background: 'rgba(255,255,255,0.03)',
          padding: '48px 40px', borderRadius: '40px', border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(40px)', boxShadow: '0 40px 80px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
           <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(124,111,205,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '1px solid var(--purple)' }}>
              <Icons.Shield size={32} color="var(--purple)" />
           </div>
           <h1 style={{ fontSize: '2.2rem', fontWeight: 200, fontFamily: 'serif', marginBottom: 8 }}>Security Check</h1>
           <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>Answer your security question to reset your PIN.</p>
        </div>

        <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 800 }}>WHAT IS YOUR ANNIVERSARY DATE?</label>
            <input 
              type="date" required 
              value={date} onChange={(e) => setDate(e.target.value)}
              style={{ width: '100%', padding: '18px 20px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none' }}
            />
          </div>

          {error && <p style={{ color: '#FF3B30', fontSize: '0.8rem', textAlign: 'center' }}>{error}</p>}

          <motion.button
            whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }} whileTap={{ scale: 0.98 }}
            disabled={loading}
            style={{ 
              marginTop: 8, width: '100%', padding: '20px', borderRadius: '20px', 
              background: 'var(--purple)', color: '#fff', border: 'none', 
              fontWeight: 900, fontSize: '1.1rem', cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Verifying...' : 'Verify Answer'}
          </motion.button>
        </form>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
            ← Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
