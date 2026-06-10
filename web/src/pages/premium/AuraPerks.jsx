import { useNavigate } from 'react-router-dom';
import { Icons } from '../../components/ui/Icons';
import { motion } from 'framer-motion';

export default function AuraPerks() {
  const nav = useNavigate();

  const features = [
    { icon: <Icons.Aura size={24} />, title: "AI Avatars & Aesthetics", desc: "Transform photos into magical avatars and unlock premium custom chat themes." },
    { icon: <Icons.Heart size={24} />, title: "Deep Relationship Lab", desc: "Unlimited AI counseling, emotional tracking, and bond analysis." },
    { icon: <Icons.Gallery size={24} />, title: "Cinematic Love Pages", desc: "Host infinite beautiful interactive websites for your partner." },
    { icon: <Icons.Camera size={24} />, title: "Ultra HD Media Sharing", desc: "Share high-quality 10MB videos and photos without heavy compression." },
    { icon: <Icons.Shield size={24} />, title: "Stealth & Privacy Pro", desc: "Advanced blur-sensitive filters, invisible mode, and intruder alerts." },
    { icon: <Icons.Diamond size={24} />, title: "VIP Identity", desc: "Exclusive golden profile badge and priority fast-lane support." },
  ];

  return (
    <div className="page" style={{ position: 'relative', height: '100dvh', overflowY: 'auto', paddingBottom: 120 }}>
      {/* Ambient background */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50vh', background: 'radial-gradient(circle at top, rgba(201,169,110,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      
      <div className="content" style={{ maxWidth: 800, margin: '0 auto', paddingTop: 60, paddingLeft: 24, paddingRight: 24 }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(201,169,110,0.2), rgba(164,132,194,0.2))', border: '1px solid rgba(201,169,110,0.4)', marginBottom: 20, boxShadow: '0 0 40px rgba(201,169,110,0.3)' }}>
            <Icons.Diamond size={40} color="#C9A96E" />
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 10px', background: 'linear-gradient(135deg, #FFF, #C9A96E)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Your Aura Perks
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '1.1rem', maxWidth: 400, margin: '0 auto' }}>
            Everything you have unlocked with Vlynxly Premium.
          </p>
        </motion.div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 60 }}>
          {features.map((f, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 24,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(201,169,110,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A96E' }}>
                {f.icon}
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Floating Action Button */}
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 20, delay: 0.6 }}
        style={{ position: 'fixed', bottom: 30, left: 0, right: 0, padding: '0 24px', zIndex: 10 }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <button 
            onClick={() => nav('/dashboard')}
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '18px 32px',
              borderRadius: 99,
              background: 'linear-gradient(135deg, #C9A96E, #a484c2)',
              color: '#000',
              fontWeight: 800,
              fontSize: '1.1rem',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 8px 30px rgba(201,169,110,0.4)',
              transition: 'transform 0.2s',
            }}
          >
            Enjoy your space
          </button>
        </div>
      </motion.div>
    </div>
  );
}
