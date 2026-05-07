import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../../services/api';

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const handleSignup = async (e) => {
    if (e) e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill in all details to create your sanctuary.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await register(name, email, password);
      // Automatically login or navigate to login
      navigate('/login', { state: { message: 'Sanctuary created! Please log in.' } });
    } catch (err) {
      setError(err.response?.data?.detail || 'Signup failed. Please try again.');
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
      {/* Background Ambient Glows */}
      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -40, 0], opacity: [0.03, 0.06, 0.03] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        style={{ position: 'fixed', top: '10%', left: '5%', width: '45vw', height: '45vw', background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(100px)', zIndex: 1 }} 
      />

      {/* Back Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        whileHover={{ opacity: 1, x: -5 }}
        onClick={() => navigate(-1)}
        style={{ position: 'absolute', top: '40px', left: '40px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 400, zIndex: 10, letterSpacing: '2px' }}
      >
        <span>←</span> BACK
      </motion.button>

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
        <motion.div variants={itemVariants} style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 200, fontFamily: 'serif', marginBottom: '8px', letterSpacing: '-0.02em' }}>Get Started</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', fontWeight: 300 }}>Create your private world.</p>
        </motion.div>

        <form 
          onSubmit={handleSignup}
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          <motion.div variants={itemVariants}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px', fontWeight: 600 }}>Your Name</label>
            <input 
              ref={nameRef}
              type="text" required placeholder="Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  emailRef.current?.focus();
                }
              }}
              style={{ width: '100%', padding: '16px 20px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none', transition: 'border 0.3s' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px', fontWeight: 600 }}>Email</label>
            <input 
              ref={emailRef}
              type="email" required placeholder="you@love.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  passwordRef.current?.focus();
                }
              }}
              style={{ width: '100%', padding: '16px 20px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none', transition: 'border 0.3s' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px', fontWeight: 600 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input 
                ref={passwordRef}
                type={showPassword ? "text" : "password"} 
                required placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (name && email && password) handleSignup();
                    else setError('Please fill in all details.');
                  }
                }}
                style={{ width: '100%', padding: '16px 55px 16px 20px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none', transition: 'border 0.3s' }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '18px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', opacity: 0.9 }}
              >
                {showPassword ? (
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
              marginTop: '16px', width: '100%', padding: '18px', borderRadius: '16px', 
              backgroundColor: loading ? '#555' : '#b3945a', 
              color: '#2a241e', 
              border: 'none', 
              fontWeight: 800, fontSize: '1.05rem', cursor: loading ? 'not-allowed' : 'pointer', 
              textTransform: 'uppercase', letterSpacing: '2px',
              boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
              transition: 'all 0.3s ease'
            }}
          >
            {loading ? 'Creating...' : 'Create Our Space'}
          </motion.button>
        </form>

        <motion.div 
          variants={itemVariants}
          style={{ marginTop: '32px', textAlign: 'center', fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' }}
        >
          Already have a space? <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Log in</Link>
        </motion.div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 1, duration: 2 }}
        style={{ position: 'fixed', bottom: '32px', fontSize: '10px', letterSpacing: '2px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}
      >
        Privacy by Design • Your Sanctuary
      </motion.div>
    </div>
  );
}
