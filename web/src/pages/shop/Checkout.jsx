import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Checkout() {
  const nav = useNavigate();
  const { state } = useLocation();
  const cart = state?.cart || [];
  const total = state?.total || 0;
  const [address, setAddress] = useState('');
  const [giftMsg, setGiftMsg] = useState('');
  const [isSurprise, setIsSurprise] = useState(false);
  const [loading, setLoading] = useState(false);

  const placeOrder = async () => {
    if (!address.trim()) return alert('Please enter delivery address.');
    setLoading(true);
    // Stripe integration goes here
    // For now showing success
    setTimeout(() => {
      nav('/shop/success');
    }, 1500);
  };

  return (
    <div className="page" style={{ padding: '0 0 80px' }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>←</button>
        <h2 style={{ margin: 0 }}>Checkout</h2>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Order summary */}
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Order Summary</p>
          {cart.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span>{item.emoji} {item.name} × {item.qty}</span>
              <span style={{ color: 'var(--accent)' }}>₹{item.price * item.qty}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem' }}>
            <span>Total</span>
            <span style={{ color: 'var(--accent)' }}>₹{total}</span>
          </div>
        </div>

        {/* Delivery */}
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Delivery Details</p>
          <div className="inp-wrap">
            <label>Delivery Address</label>
            <textarea className="inp" placeholder="Full address with pincode..." value={address} onChange={e => setAddress(e.target.value)} style={{ minHeight: 80, resize: 'none' }} />
          </div>
        </div>

        {/* Gift options */}
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Gift Options</p>
          <div className="inp-wrap">
            <label>Gift Message (optional)</label>
            <input className="inp" placeholder="Write a sweet message..." value={giftMsg} onChange={e => setGiftMsg(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, cursor: 'pointer' }} onClick={() => setIsSurprise(!isSurprise)}>
            <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSurprise ? 'var(--accent)' : 'var(--border)'}`, background: isSurprise ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isSurprise && <span style={{ color: '#0D0D0F', fontSize: '0.8rem' }}>✓</span>}
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 500 }}>🎁 Make it a surprise!</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Partner won't see order details until delivery</p>
            </div>
          </div>
        </div>

        <button className="btn btn-p btn-full" onClick={placeOrder} disabled={loading} style={{ fontSize: '1rem', padding: '16px' }}>
          {loading ? 'Processing...' : `Pay ₹${total} with Stripe`}
        </button>
        <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--muted)', marginTop: 10 }}>🔒 Secured by Stripe</p>
      </div>
    </div>
  );
}
