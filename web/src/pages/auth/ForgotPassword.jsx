import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordReset } from '../../services/api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
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
              key="request"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div variants={itemVariants} style={{ textAlign: 'center', marginBottom: '40px' }}>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 200, fontFamily: 'serif', marginBottom: '8px', letterSpacing: '-0.02em' }}>Recover Access</h1>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', fontWeight: 300 }}>Enter your email to receive a recovery link.</p>
              </motion.div>

              <form 
                onSubmit={handleRequest}
                style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
              >
                <motion.div variants={itemVariants}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px', fontWeight: 600 }}>Email Address</label>
                  <input 
                    type="email" 
                    required 
                    placeholder="you@love.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: '100%', padding: '16px 20px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none', transition: 'border 0.3s' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
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
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </motion.button>
              </form>

              <motion.div variants={itemVariants} style={{ marginTop: '32px', textAlign: 'center' }}>
                <Link to="/login" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => e.target.style.color = 'var(--accent)'} onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.4)'}>← Back to login</Link>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: 'center', padding: '20px 0' }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '24px' }}>✉️</div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 200, fontFamily: 'serif', marginBottom: '16px' }}>Check Your Email</h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem', lineHeight: 1.8, marginBottom: '32px' }}>
                We've sent a recovery link to your inbox. <br/> Please follow the instructions to reset your password.
              </p>
              <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>Return to Login</Link>
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
        Secure Recovery • Vlynxly Support
      </motion.div>
    </div>
  );
}
