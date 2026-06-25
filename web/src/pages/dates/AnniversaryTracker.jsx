import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import NotificationService from '../../services/NotificationService';
import { Icons } from '../../components/ui/Icons';

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
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => { 
    // Load from cache first for instant UX
    const cached = localStorage.getItem('cached_dates');
    if (cached) {
      try {
        setDates(JSON.parse(cached));
        setInitialLoad(false);
      } catch {}
    }
    fetchDates(); 
  }, []);

  const fetchDates = async () => {
    try {
      const { data } = await api.get('/dates/');
      localStorage.setItem('cached_dates', JSON.stringify(data));
      setDates(data);
      if (Array.isArray(data)) {
        NotificationService.scheduleAnniversaryNotifications(data);
      }
    } catch (err) {
      console.error("Failed to fetch dates", err);
    } finally {
      setInitialLoad(false);
    }
  };

  const save = async () => {
    if (!form.title || !form.date) return;
    setLoading(true);
    try {
      await api.post('/dates/', form);
      setForm({ title: '', date: '', emoji: '💍', note: '', recurring: true });
      setShowForm(false);
      fetchDates();
    } catch (err) {
      console.error("Failed to save date", err);
    } finally {
      setLoading(false);
    }
  };

  const sorted = [...dates].sort((a, b) => daysUntil(a.date) - daysUntil(b.date));

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      {/* Premium Header */}
      <header className="header" style={{ 
        background: 'rgba(22, 22, 24, 0.4)', 
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '20px 20px 12px',
        borderRadius: '24px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
          <span className="header-title" style={{ color: 'var(--text)' }}>Important Dates</span>
        </div>
        <button className="btn btn-p" onClick={() => setShowForm(true)} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Plus size={18} color="#000" /> Add Date
        </button>
      </header>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ 
            background: 'rgba(22, 22, 26, 0.95)', 
            borderRadius: '32px 32px 0 0', 
            padding: 28, 
            width: '100%', 
            maxWidth: 600, 
            margin: '0 auto',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem' }}>Track a Special Date</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Plus size={24} style={{ transform: 'rotate(45deg)' }} /></button>
            </div>
            
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {EMOJIS.map(e => (
                <button 
                  key={e} 
                  onClick={() => setForm(f => ({ ...f, emoji: e }))} 
                  style={{ 
                    fontSize: '1.4rem', 
                    background: form.emoji === e ? 'rgba(201,169,110,0.15)' : 'rgba(255,255,255,0.03)', 
                    border: form.emoji === e ? '2px solid var(--accent)' : '2px solid transparent', 
                    borderRadius: 14, 
                    width: 50,
                    height: 50,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >{e}</button>
              ))}
            </div>

            <div className="inp-wrap" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>What is the occasion?</label>
              <input className="inp" placeholder="e.g. Our Anniversary" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16 }} />
            </div>

            <div className="inp-wrap" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>When is it?</label>
              <input className="inp" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, colorScheme: 'dark' }} />
            </div>

            <div className="inp-wrap" style={{ marginBottom: 24 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>A special note (optional)</label>
              <input className="inp" placeholder="e.g. Remind me to book dinner!" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16 }} />
            </div>

            <button className="btn btn-p btn-full" onClick={save} disabled={loading || !form.title || !form.date} style={{ padding: '16px', borderRadius: 18, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {loading ? 'Saving...' : (
                <>
                  Keep it Remembered <Icons.Aura size={18} color="#000" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '10px 20px' }}>
        {initialLoad ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 0', opacity: 0.7 }}>
            <div className="spin" style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(201,169,110,0.2)', borderTopColor: 'var(--accent)' }}></div>
            <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: '0.9rem' }}>Loading timeline...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '100px 0', opacity: 0.8 }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}><Icons.Milestone size={64} color="var(--accent)" stroke={1} /></div>
            <h3 style={{ marginBottom: 8 }}>Your timeline is empty</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Add anniversaries or birthdays to track them together.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {sorted.map(d => {
              const days = daysUntil(d.date);
              const isToday = days === 0;
              const isSoon = days <= 7;
              
              return (
                <div key={d.id} className="card card-hover" style={{ 
                  padding: 20, 
                  background: isToday ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255,255,255,0.03)',
                  borderLeft: `4px solid ${isToday ? 'var(--success)' : isSoon ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
                  animation: 'fadeInUp 0.4s ease-out'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontSize: '2.5rem' }}>{d.emoji}</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '1.1rem', color: 'var(--text)' }}>{d.title}</p>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
                          {new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 16, minWidth: 60 }}>
                      <p style={{ 
                        margin: 0, 
                        fontWeight: 700, 
                        color: isToday ? 'var(--success)' : isSoon ? 'var(--accent)' : 'var(--text)', 
                        fontSize: '1.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {isToday ? <Icons.Aura size={24} color="var(--success)" /> : days}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        {isToday ? 'TODAY' : 'DAYS LEFT'}
                      </p>
                    </div>
                  </div>
                  {d.note && (
                    <div style={{ 
                      marginTop: 12, 
                      padding: '10px 14px', 
                      background: 'rgba(255,255,255,0.02)', 
                      borderRadius: 12, 
                      fontSize: '0.88rem', 
                      color: 'var(--muted)',
                      fontStyle: 'italic'
                    }}>
                      "{d.note}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
