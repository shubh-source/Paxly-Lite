import { useState, useEffect } from 'react';
import { createPremiumOrder, verifyPremiumPayment } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../ui/Icons';

export default function PremiumUpgrade({ onUpgradeSuccess, onCancel }) {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  
  // Load razorpay script
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
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_...', // Keep env var, fallback shouldn't hit
        amount: order.amount,
        currency: order.currency,
        name: 'Paxly Premium',
        description: 'Deep Lab & Unlimited AI Chats',
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="glass-card" style={{ background: 'var(--s1)', borderRadius: 24, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', border: '1px solid rgba(201,169,110,0.3)', position: 'relative' }}>
        {onCancel && (
          <button onClick={onCancel} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
            <Icons.Close size={24} />
          </button>
        )}
        
        <Icons.Aura size={64} color="var(--accent)" style={{ marginBottom: 16 }} />
        <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '1.8rem' }}>Paxly Premium</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem', marginTop: 8, marginBottom: 24 }}>
          Unlock unlimited AI chats, Deep Relationship Lab, and priority support.
        </p>

        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: '24px 16px', marginBottom: 32 }}>
           <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent)' }}>₹149</span>
           <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}> / month</span>
        </div>

        <button 
          onClick={handlePayment} 
          disabled={loading}
          style={{ width: '100%', padding: '16px', borderRadius: 99, background: 'linear-gradient(135deg, var(--accent), var(--purple))', color: '#000', fontWeight: 700, fontSize: '1.1rem', border: 'none', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, boxShadow: '0 8px 30px rgba(201,169,110,0.4)', transition: 'all 0.2s' }}
        >
          {loading ? 'Processing...' : 'Upgrade Now'}
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 16 }}>Secure payments powered by Razorpay</p>
      </div>
    </div>
  );
}
