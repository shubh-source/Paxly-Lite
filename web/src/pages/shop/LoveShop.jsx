import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('ros_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const CATEGORIES = [
  { id: 'all', label: 'All', emoji: '🛍️' },
  { id: 'flowers', label: 'Flowers', emoji: '🌹' },
  { id: 'chocolates', label: 'Chocolates', emoji: '🍫' },
  { id: 'clothes', label: 'Clothes', emoji: '👗' },
  { id: 'accessories', label: 'Accessories', emoji: '💍' },
  { id: 'gifts', label: 'Gifts', emoji: '🎁' },
];

// Sample products (will come from admin panel in real use)
const SAMPLE_PRODUCTS = [
  { id: '1', name: 'Red Rose Bouquet', description: '12 fresh red roses beautifully arranged', price: 599, category: 'flowers', emoji: '🌹', images: [] },
  { id: '2', name: 'Ferrero Rocher Box', description: 'Premium 24-piece chocolate box', price: 899, category: 'chocolates', emoji: '🍫', images: [] },
  { id: '3', name: 'Silk Scarf', description: 'Elegant silk scarf in pastel shades', price: 1499, category: 'accessories', emoji: '🧣', images: [] },
  { id: '4', name: 'Teddy Bear', description: 'Giant soft teddy bear with a heart', price: 799, category: 'gifts', emoji: '🧸', images: [] },
  { id: '5', name: 'Perfume Set', description: 'Luxury couple perfume gift set', price: 2499, category: 'accessories', emoji: '✨', images: [] },
  { id: '6', name: 'Mixed Flowers', description: 'Seasonal flowers in a beautiful vase', price: 449, category: 'flowers', emoji: '💐', images: [] },
  { id: '7', name: 'Dark Chocolate Box', description: 'Handcrafted dark chocolate assortment', price: 649, category: 'chocolates', emoji: '🍫', images: [] },
  { id: '8', name: 'Couple Bracelet Set', description: 'Matching bracelets for you both', price: 1199, category: 'accessories', emoji: '💫', images: [] },
];

export default function LoveShop() {
  const nav = useNavigate();
  const [cat, setCat] = useState('all');
  const [wishlist, setWishlist] = useState([]);
  const [selected, setSelected] = useState(null);
  const [cart, setCart] = useState([]);

  const filtered = cat === 'all' ? SAMPLE_PRODUCTS : SAMPLE_PRODUCTS.filter(p => p.category === cat);

  const toggleWishlist = (id) => {
    setWishlist(w => w.includes(id) ? w.filter(x => x !== id) : [...w, id]);
  };

  const addToCart = (product) => {
    setCart(c => {
      const exists = c.find(x => x.id === product.id);
      if (exists) return c.map(x => x.id === product.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { ...product, qty: 1 }];
    });
    setSelected(null);
  };

  const cartCount = cart.reduce((a, b) => a + b.qty, 0);
  const cartTotal = cart.reduce((a, b) => a + b.price * b.qty, 0);

  return (
    <div className="page" style={{ padding: '0 0 80px' }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>←</button>
          <div>
            <h2 style={{ margin: 0 }}>Love Shop</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Gift your person something special</p>
          </div>
        </div>
        {cartCount > 0 && (
          <button className="btn btn-p" onClick={() => nav('/shop/cart')} style={{ padding: '8px 16px', position: 'relative' }}>
            🛒 {cartCount}
          </button>
        )}
      </div>

      {/* Category filter */}
      <div style={{ padding: '12px 20px', display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)} style={{ whiteSpace: 'nowrap', padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', background: cat === c.id ? 'var(--accent)' : 'var(--s1)', color: cat === c.id ? '#0D0D0F' : 'var(--muted)', fontFamily: 'var(--font-b)', fontSize: '0.82rem', fontWeight: 500 }}>{c.emoji} {c.label}</button>
        ))}
      </div>

      {/* Products grid */}
      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {filtered.map(product => (
          <div key={product.id} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setSelected(product)}>
            <div style={{ background: 'var(--s1)', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', position: 'relative' }}>
              {product.emoji}
              <button onClick={e => { e.stopPropagation(); toggleWishlist(product.id); }} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: '0.9rem' }}>
                {wishlist.includes(product.id) ? '❤️' : '🤍'}
              </button>
            </div>
            <div style={{ padding: 12 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: '0.88rem', lineHeight: 1.3 }}>{product.name}</p>
              <p style={{ margin: 0, color: 'var(--accent)', fontWeight: 600 }}>₹{product.price}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Product detail modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--s1)', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 600, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: '4rem', marginBottom: 8 }}>{selected.emoji}</div>
              <h3 style={{ margin: '0 0 4px' }}>{selected.name}</h3>
              <p style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: '0.9rem' }}>{selected.description}</p>
              <p style={{ margin: 0, fontSize: '1.4rem', color: 'var(--accent)', fontWeight: 600 }}>₹{selected.price}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-g" style={{ flex: 1 }} onClick={() => setSelected(null)}>Close</button>
              <button className="btn btn-p" style={{ flex: 2 }} onClick={() => addToCart(selected)}>Add to Cart 🛒</button>
            </div>
          </div>
        </div>
      )}

      {/* Cart summary bar */}
      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', borderRadius: 99, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 20px rgba(201,169,110,0.3)', cursor: 'pointer', zIndex: 50 }} onClick={() => nav('/shop/checkout', { state: { cart, total: cartTotal } })}>
          <span style={{ color: '#0D0D0F', fontWeight: 600 }}>🛒 {cartCount} items</span>
          <span style={{ color: '#0D0D0F', fontWeight: 700 }}>₹{cartTotal}</span>
          <span style={{ color: '#0D0D0F', fontWeight: 600 }}>Checkout →</span>
        </div>
      )}
    </div>
  );
}
