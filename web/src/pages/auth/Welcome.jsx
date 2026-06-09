import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import WeavingHeart from '../../components/ui/WeavingHeart';

export default function Welcome() {
  const [showActions, setShowActions] = useState(false);

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#050505', 
      color: '#fff', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '40px 24px', 
      position: 'relative', 
      overflowY: 'auto',
      overflowX: 'hidden',
      textAlign: 'center'
    }}>
      {/* BACKGROUND ELEMENTS - They will blur when actions show */}
      <motion.div 
        animate={{ filter: showActions ? 'blur(15px) grayscale(0.5)' : 'blur(0px) grayscale(0)' }}
        transition={{ duration: 1, ease: "easeInOut" }}
        style={{ width: '100%', minHeight: '100vh', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}
      >
        {/* Moving Ambient Glows */}
        <motion.div
          animate={{ x: [0, 100, 0], y: [0, -50, 0], opacity: [0.05, 0.1, 0.05] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          style={{ position: 'absolute', top: '20%', left: '10%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(80px)' }} 
        />
        <motion.div
          animate={{ x: [0, -100, 0], y: [0, 50, 0], opacity: [0.05, 0.1, 0.05] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{ position: 'absolute', bottom: '10%', right: '10%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(80px)' }} 
        />

        <div style={{ maxWidth: '400px', width: '100%', zIndex: 5, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: '40px' }}>
            <WeavingHeart />
          </div>
          
          <AnimatePresence>
            {!showActions && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.8, delay: 1.5, ease: "easeOut" }}
              >
                <h1 style={{ fontSize: '3.5rem', fontWeight: 200, marginBottom: '4px', fontFamily: 'serif', letterSpacing: '-0.03em' }}>Vlynxly</h1>
                <p style={{ color: 'var(--accent)', fontSize: '0.85rem', letterSpacing: '6px', fontWeight: 500, textTransform: 'uppercase', marginBottom: '48px' }}>Together We Better</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem', lineHeight: 2, marginBottom: '40px', fontWeight: 300 }}>Your private space for two.<br/>Encrypted intimacy for modern couples.</p>

                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 0 40px rgba(201,169,110,0.5)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowActions(true)}
                  style={{ 
                    position: 'relative', overflow: 'hidden',
                    width: '100%', padding: '20px', borderRadius: '18px', backgroundColor: 'var(--accent)', color: '#000', border: 'none', fontWeight: 800, fontSize: '1.15rem', cursor: 'pointer' 
                  }}
                >
                  Get Started
                  {/* Shimmer Effect */}
                  <motion.div
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
                    style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', skewX: '-20deg' }}
                  />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* TRUST BADGE FOOTER */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: showActions ? 0 : 0.6 }}
          transition={{ duration: 0.8, delay: 2 }}
          style={{ 
            marginTop: 'auto', paddingTop: '40px', fontSize: '10px', letterSpacing: '2px', 
            color: 'rgba(201,169,110,0.9)', textTransform: 'uppercase', fontWeight: 600, zIndex: 25, width: '100%'
          }}
        >
          E2E Encrypted • Zero Data Sell • Your Private Oasis
        </motion.div>
      </motion.div>

      {/* ACTION OVERLAY - Appears on top with background blur */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, scale: 1, backdropFilter: 'blur(25px)' }}
            exit={{ opacity: 0, scale: 0.9, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{ 
              position: 'fixed', zIndex: 20, width: '100%', height: '100%', top: 0, left: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)'
            }}
          >
            <div style={{ 
              width: '340px', padding: '40px 32px', borderRadius: '32px', 
              backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 200, marginBottom: '32px', color: 'rgba(255,255,255,0.8)' }}>Select your journey</h2>
              
              <Link to="/signup" style={{ textDecoration: 'none', width: '100%', padding: '18px', borderRadius: '14px', backgroundColor: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: '1rem', display: 'block', marginBottom: '16px' }}>
                Create Our Space
              </Link>
              
              <Link to="/login" style={{ textDecoration: 'none', width: '100%', padding: '18px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontWeight: 500, fontSize: '1rem', display: 'block' }}>
                Log In to Existing Space
              </Link>

              <button 
                onClick={() => setShowActions(false)}
                style={{ marginTop: '32px', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '3px', fontWeight: 400 }}
              >
                ← Back to Intro
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
