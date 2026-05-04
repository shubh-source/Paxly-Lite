// Welcome.jsx
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import PageTransition from '../../components/layout/PageTransition';

export default function Welcome() {
  const { user } = useAuth();
  if (user?.couple_space_id) return <Navigate to="/dashboard" />;
  if (user) return <Navigate to="/connect" />;

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.1 } }
  };

  const itemTop = { hidden: { opacity: 0, y: -50 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80 } } };
  const itemBottom = { hidden: { opacity: 0, y: 50 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80 } } };
  const itemLeft = { hidden: { opacity: 0, x: -50 }, show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 80 } } };
  const itemRight = { hidden: { opacity: 0, x: 50 }, show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 80 } } };
  
  // Title letters combining effect
  const titleText = "Vlynxly".split('');

  return (
    <PageTransition layoutId="welcome">
      <div className="page center" style={{ padding: '40px 24px', minHeight: '100vh', overflow: 'hidden' }}>
        <div style={{ position:'fixed', top:'-20%', left:'50%', transform:'translateX(-50%)', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(201,169,110,0.05) 0%, transparent 70%)', pointerEvents:'none' }} />
        
        <motion.div variants={container} initial="hidden" animate="show" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          
          <motion.div variants={itemTop} style={{ margin:'0 auto 28px' }}>
            <img src="/logo.png" style={{ width:120, height:120, objectFit:'contain', filter:'drop-shadow(0 0 10px rgba(201,169,110,0.2))' }} alt="Vlynxly Logo" />
          </motion.div>
          
          <h1 style={{ marginBottom:6, display: 'flex', justifyContent: 'center' }}>
            {titleText.map((char, index) => (
              <motion.span 
                key={index} 
                variants={{
                  hidden: { opacity: 0, x: Math.random() * 100 - 50, y: Math.random() * 100 - 50, rotate: Math.random() * 90 - 45 },
                  show: { opacity: 1, x: 0, y: 0, rotate: 0, transition: { type: 'spring', damping: 12, stiffness: 100 } }
                }}
              >
                {char}
              </motion.span>
            ))}
          </h1>
          
          <motion.p variants={itemRight} style={{ fontSize:'0.75rem', letterSpacing:2, color:'var(--accent)', marginBottom:32, textTransform:'uppercase', fontWeight:600 }}>
            Private • Just You Two
          </motion.p>
          
          <motion.p variants={itemLeft} style={{ fontSize:'1.05rem', marginBottom:44, lineHeight:1.8 }}>
            Your private space for two.<br/>No distractions. No feeds.<br/>Just you and your person.
          </motion.p>
          
          <motion.div variants={itemBottom} style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <Link to="/signup" className="btn btn-p btn-full" style={{ padding:'13px', fontSize:'1rem' }}>Get Started</Link>
            <Link to="/login"  className="btn btn-s btn-full" style={{ padding:'13px', fontSize:'1rem' }}>Log In</Link>
          </motion.div>
          
          <motion.p variants={itemBottom} style={{ marginTop:36, fontSize:'0.78rem', opacity:0.5 }}>
            Private by design · Encrypted · No ads inside
          </motion.p>
          
        </motion.div>
      </div>
    </PageTransition>
  );
}
