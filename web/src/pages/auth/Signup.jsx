import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { register, sendSignupOTP, googleAuth } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { deriveKeyFromPassword, generateKeyPair } from '../../services/crypto';

// Helper to safely parse JWT from Google ID Token
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export default function Signup() {
  const navigate = useNavigate();
  const { loginUser } = useAuth();

  // Step: 'form' | 'otp'
  const [step, setStep] = useState('form');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // OTP Countdown
  const [countdown, setCountdown] = useState(0);

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const otpRef = useRef(null);
  const googleBtnRef = useRef(null);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Focus OTP input when switching to otp step
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpRef.current?.focus(), 200);
    }
  }, [step]);

  // Initialize Google Sign-In button if SDK and client_id are available
  useEffect(() => {
    if (typeof window !== 'undefined' && window.google?.accounts?.id && googleClientId) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
        });

        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_black',
            size: 'large',
            width: 320,
            text: 'continue_with',
            shape: 'pill',
          });
        }
      } catch (e) {
        console.warn('Google Sign-In initialization error:', e);
      }
    }
  }, [googleClientId, step]);

  // Validate Gmail rule
  const isGmailValid = (val) => {
    const clean = (val || '').trim().toLowerCase();
    return clean.endsWith('@gmail.com') && clean.length > '@gmail.com'.length;
  };

  // ── Step 1: Send OTP to Gmail ─────────────────────────────────────
  const handleRequestOTP = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccessMsg('');

    const cleanEmail = email.trim().toLowerCase();

    if (!name.trim()) {
      setError('Please enter your name.');
      nameRef.current?.focus();
      return;
    }

    if (!cleanEmail) {
      setError('Please enter your Gmail address.');
      emailRef.current?.focus();
      return;
    }

    // STRICT GMAIL RULE
    if (!cleanEmail.endsWith('@gmail.com')) {
      setError('Invalid email: Only @gmail.com email addresses are allowed.');
      emailRef.current?.focus();
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      await sendSignupOTP(name.trim(), cleanEmail);
      setStep('otp');
      setCountdown(45);
      setSuccessMsg(`A 6-digit verification code has been sent to ${cleanEmail}.`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP & Create User ──────────────────────────────
  const handleVerifyOTP = async (e) => {
    if (e) e.preventDefault();
    setError('');

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      otpRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();

      // 1. E2EE Key Generation
      const derivedKey = await deriveKeyFromPassword(password, cleanEmail);
      const { publicKey, secretKey } = generateKeyPair(derivedKey);

      // 2. Register user with OTP
      const data = await register(name.trim(), cleanEmail, password, publicKey, cleanOtp);

      // 3. Save secret key locally
      localStorage.setItem('paxly_sk', secretKey);

      loginUser(data.access_token, data.user);
      navigate('/connect', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Verification failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  // ── Option 2: Google Sign-In ──────────────────────────────────────
  const handleGoogleCredentialResponse = async (response) => {
    if (!response || !response.credential) return;

    setLoading(true);
    setError('');

    try {
      // Decode JWT to get user sub & email for deterministic E2EE key derivation
      const payload = parseJwt(response.credential);
      const sub = payload?.sub || 'paxly_google_user';
      const googleEmail = (payload?.email || '').toLowerCase().trim();

      if (!googleEmail.endsWith('@gmail.com')) {
        setError('Invalid email: Only @gmail.com Google accounts are allowed.');
        setLoading(false);
        return;
      }

      // Deterministic E2EE key derivation for Google users
      const derivedKey = await deriveKeyFromPassword(`paxly_google_${sub}`, googleEmail);
      const { publicKey, secretKey } = generateKeyPair(derivedKey);

      // Authenticate with backend
      const data = await googleAuth(response.credential, publicKey);

      localStorage.setItem('paxly_sk', secretKey);
      loginUser(data.access_token, data.user);
      navigate('/connect', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomGoogleClick = () => {
    if (!googleClientId) {
      setError('Google Sign-In: Please add VITE_GOOGLE_CLIENT_ID to your .env file to enable Google Login.');
      return;
    }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google Sign-In is loading, please try again in a moment.');
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { staggerChildren: 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
    }
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.4 } }
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
      {/* Ambient Glows */}
      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -40, 0], opacity: [0.03, 0.06, 0.03] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        style={{ position: 'fixed', top: '10%', left: '5%', width: '45vw', height: '45vw', background: 'radial-gradient(circle, var(--accent, #c9a96e) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(100px)', zIndex: 1 }} 
      />

      {/* Back Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        whileHover={{ opacity: 1, x: -5 }}
        onClick={() => step === 'otp' ? setStep('form') : navigate(-1)}
        style={{ position: 'absolute', top: '40px', left: '40px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 400, zIndex: 10, letterSpacing: '2px' }}
      >
        <span>←</span> {step === 'otp' ? 'BACK TO FORM' : 'BACK'}
      </motion.button>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{ 
          maxWidth: '430px', width: '100%', zIndex: 10,
          backgroundColor: 'rgba(255,255,255,0.02)',
          padding: '44px 36px', borderRadius: '32px',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(30px)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6)'
        }}
      >
        {/* Header */}
        <motion.div variants={itemVariants} style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 200, fontFamily: 'serif', marginBottom: '8px', letterSpacing: '-0.02em' }}>
            {step === 'otp' ? 'Verify Your Gmail' : 'Create Space'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem', fontWeight: 300 }}>
            {step === 'otp' ? `Enter the 6-digit code sent to ${email}` : 'Join with your verified Gmail account.'}
          </p>
        </motion.div>

        {/* Global Error Banner */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -6 }} 
            animate={{ opacity: 1, y: 0 }} 
            style={{ 
              marginBottom: '20px', 
              padding: '12px 16px', 
              borderRadius: '12px', 
              backgroundColor: 'rgba(255, 77, 77, 0.1)', 
              border: '1px solid rgba(255, 77, 77, 0.3)', 
              color: '#ff7b7b', 
              fontSize: '0.82rem', 
              textAlign: 'center',
              lineHeight: 1.4
            }}
          >
            {error}
          </motion.div>
        )}

        {/* Success Banner */}
        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -6 }} 
            animate={{ opacity: 1, y: 0 }} 
            style={{ 
              marginBottom: '20px', 
              padding: '12px 16px', 
              borderRadius: '12px', 
              backgroundColor: 'rgba(201, 169, 110, 0.1)', 
              border: '1px solid rgba(201, 169, 110, 0.3)', 
              color: 'var(--accent, #c9a96e)', 
              fontSize: '0.82rem', 
              textAlign: 'center',
              lineHeight: 1.4
            }}
          >
            {successMsg}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {step === 'form' ? (
            <motion.div
              key="step-form"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.3 }}
            >
              {/* Option 2: Google Sign-In */}
              <motion.div variants={itemVariants} style={{ marginBottom: '22px' }}>
                <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <button
                    type="button"
                    onClick={handleCustomGoogleClick}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '14px 20px',
                      borderRadius: '14px',
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      fontSize: '0.92rem',
                      fontWeight: 500,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '12px',
                      transition: 'all 0.25s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    Continue with Google
                  </button>
                </div>
              </motion.div>

              {/* Elegant Divider */}
              <motion.div variants={itemVariants} style={{ display: 'flex', alignItems: 'center', margin: '22px 0', gap: '14px' }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  OR WITH GMAIL OTP
                </span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
              </motion.div>

              {/* Option 1: Gmail + 6-digit OTP Form */}
              <form onSubmit={handleRequestOTP} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <motion.div variants={itemVariants}>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--accent, #c9a96e)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px', fontWeight: 600 }}>
                    Your Name
                  </label>
                  <input 
                    ref={nameRef}
                    type="text" 
                    required 
                    placeholder="Alex"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        emailRef.current?.focus();
                      }
                    }}
                    style={{ width: '100%', padding: '14px 18px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'border 0.3s' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--accent, #c9a96e)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </motion.div>

                <motion.div variants={itemVariants}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--accent, #c9a96e)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600 }}>
                      Gmail Address
                    </label>
                    <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px' }}>
                      @gmail.com only
                    </span>
                  </div>
                  <input 
                    ref={emailRef}
                    type="email" 
                    required 
                    placeholder="you@gmail.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                      if (email && !email.trim().toLowerCase().endsWith('@gmail.com')) {
                        setError('Invalid email: Only @gmail.com email addresses are allowed.');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        passwordRef.current?.focus();
                      }
                    }}
                    style={{ 
                      width: '100%', padding: '14px 18px', borderRadius: '14px', 
                      backgroundColor: 'rgba(255,255,255,0.03)', 
                      border: `1px solid ${email && !email.trim().toLowerCase().endsWith('@gmail.com') ? '#ff6b6b' : 'rgba(255,255,255,0.1)'}`, 
                      color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'border 0.3s' 
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--accent, #c9a96e)'}
                  />
                  {email && !email.trim().toLowerCase().endsWith('@gmail.com') && (
                    <p style={{ margin: '6px 0 0 4px', fontSize: '0.72rem', color: '#ff6b6b' }}>
                      Must end with @gmail.com
                    </p>
                  )}
                </motion.div>

                <motion.div variants={itemVariants}>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--accent, #c9a96e)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px', fontWeight: 600 }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      ref={passwordRef}
                      type={showPassword ? "text" : "password"} 
                      required 
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRequestOTP();
                        }
                      }}
                      style={{ width: '100%', padding: '14px 50px 14px 18px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'border 0.3s' }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--accent, #c9a96e)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #c9a96e)', opacity: 0.85 }}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                  </div>
                </motion.div>

                <motion.button
                  variants={itemVariants}
                  type="submit"
                  disabled={loading}
                  whileHover={!loading ? { scale: 1.01, filter: 'brightness(1.1)', boxShadow: '0 0 25px rgba(201,169,110,0.25)' } : {}}
                  whileTap={!loading ? { scale: 0.99 } : {}}
                  style={{ 
                    marginTop: '8px', width: '100%', padding: '16px', borderRadius: '14px', 
                    backgroundColor: loading ? '#555' : 'var(--accent, #b3945a)', 
                    color: '#1a1610', 
                    border: 'none', 
                    fontWeight: 700, fontSize: '0.92rem', cursor: loading ? 'not-allowed' : 'pointer', 
                    textTransform: 'uppercase', letterSpacing: '2px',
                    boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {loading ? 'Sending Code...' : 'Get Verification Code'}
                </motion.button>
              </form>
            </motion.div>
          ) : (
            /* Step 2: 6-Digit OTP Verification */
            <motion.div
              key="step-otp"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.3 }}
            >
              <form onSubmit={handleVerifyOTP} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--accent, #c9a96e)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600 }}>
                      6-Digit Code
                    </label>
                    <button
                      type="button"
                      onClick={() => setStep('form')}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Change Email
                    </button>
                  </div>

                  <input 
                    ref={otpRef}
                    type="text" 
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required 
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setOtp(val);
                      if (val.length === 6) {
                        setError('');
                      }
                    }}
                    style={{ 
                      width: '100%', 
                      padding: '16px', 
                      borderRadius: '14px', 
                      backgroundColor: 'rgba(255,255,255,0.04)', 
                      border: '1px solid rgba(201,169,110,0.4)', 
                      color: 'var(--accent, #c9a96e)', 
                      fontSize: '1.6rem', 
                      fontFamily: 'monospace',
                      letterSpacing: '10px',
                      textAlign: 'center',
                      outline: 'none', 
                      transition: 'border 0.3s' 
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--accent, #c9a96e)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(201,169,110,0.4)'}
                  />
                </div>

                {/* Resend Link & Timer */}
                <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>
                  {countdown > 0 ? (
                    <span>Resend code in <strong style={{ color: 'var(--accent, #c9a96e)' }}>{countdown}s</strong></span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestOTP}
                      disabled={loading}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent, #c9a96e)',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        textDecoration: 'underline',
                        fontWeight: 600
                      }}
                    >
                      Resend Code
                    </button>
                  )}
                </div>

                <motion.button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  whileHover={!loading && otp.length === 6 ? { scale: 1.01, filter: 'brightness(1.1)', boxShadow: '0 0 25px rgba(201,169,110,0.25)' } : {}}
                  whileTap={!loading && otp.length === 6 ? { scale: 0.99 } : {}}
                  style={{ 
                    marginTop: '8px', width: '100%', padding: '16px', borderRadius: '14px', 
                    backgroundColor: (loading || otp.length !== 6) ? '#444' : 'var(--accent, #b3945a)', 
                    color: (loading || otp.length !== 6) ? '#888' : '#1a1610', 
                    border: 'none', 
                    fontWeight: 700, fontSize: '0.92rem', 
                    cursor: (loading || otp.length !== 6) ? 'not-allowed' : 'pointer', 
                    textTransform: 'uppercase', letterSpacing: '2px',
                    boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {loading ? 'Verifying...' : 'Verify & Create Sanctuary'}
                </motion.button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          variants={itemVariants}
          style={{ marginTop: '22px', textAlign: 'center', fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}
        >
          By creating a space, you agree to our{' '}
          <Link to="/terms" style={{ color: 'var(--accent, #c9a96e)', textDecoration: 'underline' }}>Terms</Link>{' '}
          and{' '}
          <Link to="/privacy" style={{ color: 'var(--accent, #c9a96e)', textDecoration: 'underline' }}>Privacy Policy</Link>.
        </motion.div>

        <motion.div
          variants={itemVariants}
          style={{ marginTop: '18px', textAlign: 'center', fontSize: '0.88rem', color: 'rgba(255,255,255,0.4)' }}
        >
          Already have a space? <Link to="/login" style={{ color: 'var(--accent, #c9a96e)', textDecoration: 'none', fontWeight: 600 }}>Log in</Link>
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
