import { motion } from 'framer-motion';
import WeavingHeart from '../ui/WeavingHeart';

export default function SplashScreen({ user }) {
  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.2 } }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
  };

  const titleText = "Vlynxly".split('');

  return (
    <div className="page center" style={{ minHeight: '100vh', background: '#050505', overflow: 'hidden' }}>
      <div style={{ position:'fixed', top:'-20%', left:'50%', transform:'translateX(-50%)', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(201,169,110,0.05) 0%, transparent 70%)', pointerEvents:'none' }} />
      
      <motion.div variants={container} initial="hidden" animate="show" style={{ textAlign: 'center', maxWidth: 400, width: '100%' }}>
        <motion.div variants={item} style={{ margin: '0 auto 12px' }}>
          <WeavingHeart />
        </motion.div>
        
        <h1 style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: '#fff', fontSize: '3.5rem', fontWeight: 200, fontFamily: 'serif', letterSpacing: '-0.03em' }}>
          {titleText.map((char, index) => (
            <motion.span 
              key={index} 
              variants={{
                hidden: { opacity: 0, y: 10 },
                show: { opacity: 1, y: 0, transition: { type: 'spring', damping: 12, stiffness: 200, delay: index * 0.05 } }
              }}
            >
              {char}
            </motion.span>
          ))}
        </h1>

        <motion.p variants={item} style={{ fontSize: '1rem', color: 'var(--muted)', fontWeight: 300, letterSpacing: '1px' }}>
          {user ? `Welcome back, ${user.name}` : 'Welcome to Vlynxly'}
        </motion.p>
      </motion.div>
    </div>
  );
}
