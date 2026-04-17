import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('ros_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const EMOJIS = ['💍', '🎂', '❤️', '🌹', '✈️', '🏠', '🐾', '🎉', '📅', '⭐'];

function daysUntil(dateStr) {
  const today = new Date();
  const d = new Date(dateStr);
  const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.ceil((next - today) / (1000 * 60 * 60 * 24));
}

export default function AnniversaryTracker() {
  const nav = useNavigate();
  const [dates, setDates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', emoji: '💍', note: '', recurring: true });

  useEffect(() => { fetchDates(); }, []);

  const fetchDates = async () => {
    const { data } = await api.get('/dates/');
    setDates(data);
  };

  const save = async () => {
    if (!form.title || !form.date) return;
    await api.post('/dates/', form);
    setForm({ title: '', date: '', emoji: '💍', note: '', recurring: true });
    setShowForm(false);
    fetchDates();
  };

  const sorted = [...dates].sort((a, b) => daysUntil(a.date) - daysUntil(b.date));

  return (
    <div className="page" style={{ padding: '0 0 80px' }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>←</button>
          <div>
            <h2 style={{ margin: 0 }}>Important Dates</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Never miss a special day</p>
          </div>
        </div>
        <button className="btn btn-p" onClick={() => setShowForm(true)} style={{ padding: '8px 16px' }}>+ Date</button>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--s1)', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 600, margin: '0 auto' }}>
            <h3 style={{ marginBottom: 16 }}>Add Important Date</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))} style={{ fontSize: '1.3rem', background: form.emoji === e ? 'var(--s2)' : 'transparent', border: form.emoji === e ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>{e}</button>
              ))}
            </div>
            <div className="inp-wrap"><label>Title</label><input className="inp" placeholder="Our Anniversary" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="inp-wrap"><label>Date</label><input className="inp" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="inp-wrap"><label>Note (optional)</label><input className="inp" placeholder="A special note..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn btn-g" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-p" style={{ flex: 2 }} onClick={save}>Save Date</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 20px' }}>
        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📅</div>
            <p>No important dates yet.</p>
          </div>
        ) : sorted.map(d => {
          const days = daysUntil(d.date);
          const isToday = days === 0;
          const isSoon = days <= 7;
          return (
            <div key={d.id} className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${isToday ? 'var(--success)' : isSoon ? 'var(--accent)' : 'var(--border)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '2rem' }}>{d.emoji}</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{d.title}</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontWeight: 600, color: isToday ? 'var(--success)' : isSoon ? 'var(--accent)' : 'var(--text)', fontSize: '1.1rem' }}>{isToday ? '🎉 Today!' : `${days}d`}</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>{isToday ? '' : 'left'}</p>
                </div>
              </div>
              {d.note && <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>{d.note}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
