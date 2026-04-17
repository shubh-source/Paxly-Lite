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
  { id: 'all', label: 'All', emoji: '✨' },
  { id: 'adventure', label: 'Adventure', emoji: '🏔️' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'food', label: 'Food', emoji: '🍽️' },
  { id: 'romance', label: 'Romance', emoji: '❤️' },
  { id: 'milestone', label: 'Milestone', emoji: '🏆' },
];

const EMOJIS = ['🎯', '❤️', '✈️', '🏔️', '🍽️', '🎵', '🎨', '📚', '🏠', '🐾', '🌊', '⭐'];

export default function BucketList() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [cat, setCat] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', emoji: '🎯', category: 'adventure' });

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    const { data } = await api.get('/bucket/');
    setItems(data);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    await api.post('/bucket/', form);
    setForm({ title: '', description: '', emoji: '🎯', category: 'adventure' });
    setShowForm(false);
    fetchItems();
  };

  const toggle = async (item) => {
    await api.put(`/bucket/${item.id}`, { completed: !item.completed });
    fetchItems();
  };

  const filtered = cat === 'all' ? items : items.filter(i => i.category === cat);
  const done = filtered.filter(i => i.completed).length;

  return (
    <div className="page" style={{ padding: '0 0 80px' }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>←</button>
          <div>
            <h2 style={{ margin: 0 }}>Bucket List</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{done}/{filtered.length} completed</p>
          </div>
        </div>
        <button className="btn btn-p" onClick={() => setShowForm(true)} style={{ padding: '8px 16px' }}>+ Add</button>
      </div>

      {/* Progress bar */}
      {filtered.length > 0 && (
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ background: 'var(--s1)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(done / filtered.length) * 100}%`, background: 'var(--accent)', borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* Category filter */}
      <div style={{ padding: '12px 20px', display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)} style={{ whiteSpace: 'nowrap', padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', background: cat === c.id ? 'var(--accent)' : 'var(--s1)', color: cat === c.id ? '#0D0D0F' : 'var(--muted)', fontFamily: 'var(--font-b)', fontSize: '0.82rem', fontWeight: 500 }}>{c.emoji} {c.label}</button>
        ))}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--s1)', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 600, margin: '0 auto' }}>
            <h3 style={{ marginBottom: 16 }}>Add to Bucket List</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))} style={{ fontSize: '1.3rem', background: form.emoji === e ? 'var(--s2)' : 'transparent', border: form.emoji === e ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>{e}</button>
              ))}
            </div>
            <div className="inp-wrap"><label>Dream / Goal</label><input className="inp" placeholder="Visit Paris together" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="inp-wrap"><label>Description</label><input className="inp" placeholder="Details..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="inp-wrap">
              <label>Category</label>
              <select className="inp" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn btn-g" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-p" style={{ flex: 2 }} onClick={save}>Add Dream ✨</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '0 20px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎯</div>
            <p>No dreams here yet.</p>
            <p style={{ fontSize: '0.85rem' }}>Add something you want to do together!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(item => (
              <div key={item.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: item.completed ? 0.6 : 1, cursor: 'pointer' }} onClick={() => toggle(item)}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${item.completed ? 'var(--success)' : 'var(--border)'}`, background: item.completed ? 'var(--success)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.completed && <span style={{ color: '#0D0D0F', fontSize: '0.85rem' }}>✓</span>}
                </div>
                <span style={{ fontSize: '1.6rem' }}>{item.emoji}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 500, textDecoration: item.completed ? 'line-through' : 'none' }}>{item.title}</p>
                  {item.description && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{item.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
