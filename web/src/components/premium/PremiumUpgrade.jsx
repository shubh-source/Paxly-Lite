import { useState, useEffect } from 'react';
import { createPremiumOrder, verifyPremiumPayment } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../ui/Icons';
import { motion } from 'framer-motion';

export default function PremiumUpgrade({ onUpgradeSuccess, onCancel }) {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  const handlePayment = async () => {
    setLoading(true);
    try {
      const order = await createPremiumOrder();
      
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_SZlNsaYYbenJQA',
        amount: order.amount,
        currency: order.currency,
        name: 'Vlynxly VIP',
        description: 'Unlimited AI & Premium Features',
        order_id: order.id,
        handler: async (response) => {
          try {
            await verifyPremiumPayment(response);
            if (onUpgradeSuccess) onUpgradeSuccess();
          } catch (e) {
            alert('Verification failed. Contact support.');
            setLoading(false);
          }
        },
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        theme: {
          color: '#C9A96E'
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        alert("Payment failed: " + response.error.description);
        setLoading(false);
      });
      rzp.open();
    } catch (e) {
      alert("Error initiating payment. Please check backend configuration.");
      setLoading(false);
    }
  };

  const features = [
    { icon: <Icons.Aura size={24} />, title: "AI Avatars & Aesthetics", desc: "Transform photos into magical avatars and unlock premium custom chat themes." },
    { icon: <Icons.Heart size={24} />, title: "Deep Relationship Lab", desc: "Unlimited AI counseling, emotional tracking, and bond analysis." },
    { icon: <Icons.Gallery size={24} />, title: "Cinematic Love Pages", desc: "Host infinite beautiful interactive websites for your partner." },
    { icon: <Icons.Camera size={24} />, title: "Ultra HD Media Sharing", desc: "Share high-quality 10MB videos and photos without heavy compression." },
    { icon: <Icons.Shield size={24} />, title: "Stealth & Privacy Pro", desc: "Advanced blur-sensitive filters, invisible mode, and intruder alerts." },
    { icon: <Icons.Diamond size={24} />, title: "VIP Identity", desc: "Exclusive golden profile badge and priority fast-lane support." },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0E0C11', overflowY: 'auto' }}>
      
      {/* Background Ambient Orbs */}
      <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(201,169,110,0.15) 0%, transparent 60%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '70vw', height: '70vw', background: 'radial-gradient(circle, rgba(164,132,194,0.1) 0%, transparent 60%)', borderRadius: '50%', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px' }}>
          {onCancel && (
            <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)' }}>
              <Icons.Close size={24} />
            </button>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '0 24px 140px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(201,169,110,0.2), rgba(164,132,194,0.2))', border: '1px solid rgba(201,169,110,0.4)', marginBottom: 20, boxShadow: '0 0 40px rgba(201,169,110,0.3)' }}>
              <Icons.Diamond size={40} color="#C9A96E" />
            </div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 10px', background: 'linear-gradient(135deg, #FFF, #C9A96E)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Vlynxly VIP
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '1.1rem', maxWidth: 400, margin: '0 auto' }}>
              The ultimate uncompromised experience. Unlock everything.
            </p>
          </motion.div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {features.map((f, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                whileHover={{ y: -5, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', borderColor: 'rgba(201,169,110,0.4)' }}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 24,
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  transition: 'border-color 0.3s ease'
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

        {/* Sticky Bottom Bar */}
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', damping: 20, delay: 0.6 }}
          style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '24px', background: 'rgba(14,12,17,0.85)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.08)', zIndex: 10 }}
        >
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                ₹149 <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--muted)' }}>/ month</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>Cancel anytime. No commitments.</div>
            </div>
            
            <button 
              onClick={handlePayment} 
              disabled={loading}
              style={{
                flex: 1,
                minWidth: 200,
                padding: '18px 32px',
                borderRadius: 99,
                background: 'linear-gradient(135deg, #C9A96E, #a484c2)',
                color: '#000',
                fontWeight: 800,
                fontSize: '1.1rem',
                border: 'none',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 8px 30px rgba(201,169,110,0.4)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10
              }}
            >
              {loading ? <Icons.Loader size={20} className="spin" /> : <><Icons.Diamond size={20} /> Upgrade to VIP</>}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
