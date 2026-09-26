import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../services/api';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token'); 

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      await resetPassword(token, password);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Reset failed. Your link might be expired.');
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { staggerChildren: 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }
    }
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5 } }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#050505', 
      color: '#fff', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '24px', 
      position: 'relative', 
      overflow: 'hidden' 
    }}>
      {/* Background Glows */}
      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -40, 0], opacity: [0.03, 0.06, 0.03] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        style={{ position: 'fixed', top: '15%', left: '10%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(100px)', zIndex: 1 }} 
      />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{ 
          maxWidth: '400px', width: '100%', zIndex: 10,
          backgroundColor: 'rgba(255,255,255,0.02)',
          padding: '48px 40px', borderRadius: '32px',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(30px)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6)'
        }}
      >
        <AnimatePresence mode="wait">
          {!submitted ? (
            <motion.div
              key="form"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <motion.div variants={itemVariants} style={{ textAlign: 'center', marginBottom: '40px' }}>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 200, fontFamily: 'serif', marginBottom: '8px', letterSpacing: '-0.02em' }}>New Password</h1>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', fontWeight: 300 }}>Set a new secure password for your sanctuary.</p>
              </motion.div>

              <form 
                onSubmit={handleReset}
                style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
              >
                {/* New Password */}
                <motion.div variants={itemVariants}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px', fontWeight: 600 }}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPass ? "text" : "password"} 
                      required 
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ width: '100%', padding: '16px 55px 16px 20px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none' }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: '18px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', opacity: 0.8 }}>
                      {showPass ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                  </div>
                </motion.div>

                {/* Confirm Password */}
                <motion.div variants={itemVariants}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px', fontWeight: 600 }}>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showConfirm ? "text" : "password"} 
                      required 
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={{ width: '100%', padding: '16px 55px 16px 20px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none' }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: '18px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', opacity: 0.8 }}>
                      {showConfirm ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                  </div>
                </motion.div>

                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: '#ff6b6b', fontSize: '0.8rem', textAlign: 'center' }}>
                    {error}
                  </motion.div>
                )}

                <motion.button
                  variants={itemVariants}
                  disabled={loading}
                  whileHover={!loading ? { scale: 1.02, filter: 'brightness(1.1)', boxShadow: '0 0 30px rgba(201,169,110,0.3)' } : {}}
                  whileTap={!loading ? { scale: 0.98 } : {}}
                  style={{ 
                    marginTop: '8px', width: '100%', padding: '18px', borderRadius: '16px', 
                    backgroundColor: loading ? '#555' : '#b3945a', color: '#2a241e', border: 'none', 
                    fontWeight: 800, fontSize: '1.05rem', cursor: loading ? 'not-allowed' : 'pointer', 
                    textTransform: 'uppercase', letterSpacing: '2px',
                    boxShadow: '0 8px 25px rgba(0,0,0,0.4)', transition: 'all 0.3s ease'
                  }}
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </motion.button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: 'center', padding: '20px 0' }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 12 }}
                style={{ fontSize: '4rem', marginBottom: '24px', color: 'var(--accent)' }}
              >
                ✓
              </motion.div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 200, fontFamily: 'serif', marginBottom: '16px' }}>Password Updated</h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem', lineHeight: 1.8, marginBottom: '32px' }}>
                Your password has been changed successfully. <br/> You can now log in to your space.
              </p>
              <button 
                onClick={() => navigate('/login')}
                style={{ 
                  width: '100%', padding: '16px', borderRadius: '12px', 
                  backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
                  color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' 
                }}
              >
                Log In Now
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 1, duration: 2 }}
        style={{ position: 'fixed', bottom: '32px', fontSize: '10px', letterSpacing: '2px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}
      >
        E2E Encryption • Always Secure
      </motion.div>
    </div>
  );
}
