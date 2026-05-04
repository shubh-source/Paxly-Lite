import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTodayMoods, getSpace } from '../services/api';
import axios from 'axios';

const CORE_QUICK = [
  { to: '/chat',    icon: '💬', label: 'Chat',       sub: 'Send a message' },
  { to: '/voice',   icon: '🎵', label: 'Voice Notes', sub: 'Audio messages' },
  { to: '/memories',icon: '📸', label: 'Memories',   sub: 'Our timeline' },
  { to: '/explore', icon: '🗺️', label: 'Explore',    sub: 'Find date spots' },
  { to: '/ai',      icon: '✨', label: 'AI',          sub: 'Get advice' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [moods, setMoods] = useState(null);
  const [partner, setPartner] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sharedNotes, setSharedNotes] = useState([]);
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    getTodayMoods().then(setMoods).catch(() => {});
    getSpace().then(d => setPartner(d.partner)).catch(() => {});
    
    // Fetch shared note alerts
    api.get('/notes/dashboard-alerts')
      .then(res => {
        if (Array.isArray(res.data)) setSharedNotes(res.data);
      })
      .catch(() => {});

    // Fetch AI Suggestions (dates, apologies, etc)
    api.get('/dates/').then(res => {
      if (!Array.isArray(res.data)) return;
      const today = new Date();
      const upcoming = res.data.find(d => {
        const annDate = new Date(d.date);
        annDate.setFullYear(today.getFullYear());
        const diff = (annDate - today) / (1000 * 60 * 60 * 24);
        return diff > 0 && diff <= 7;
      });
      if (upcoming) {
        setSuggestion({
          type: 'milestone',
          title: `Upcoming: ${upcoming.title}`,
          body: `It's almost time for your ${upcoming.title.toLowerCase()}! Want me to design a surprise Vibe Site for ${partner?.name || 'your partner'}?`,
          action: '/website/vibe'
        });
      }
    }).catch(() => {});
  }, [partner?.name]);

  const dismissNote = async (id) => {
    try {
      await api.post(`/notes/${id}/dismiss-alert`);
      setSharedNotes(prev => prev.filter(n => n.id !== id));
    } catch {}
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      {/* Background Glows */}
      <div style={{ position: 'fixed', top: '5%', left: '10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(201,169,110,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '15%', right: '5%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(124,111,205,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />


      {/* Header */}
      <div style={{ padding: '32px 20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.8rem', letterSpacing: '-0.5px' }}>{greeting}, <span style={{ color: 'var(--accent)' }}>{user?.name}</span></h1>
          {partner && <p style={{ margin: 0, fontSize: '0.9rem', letterSpacing: '0.3px', fontWeight: 500, opacity: 0.8 }}>Connected with <span style={{ color: 'var(--accent)' }}>{partner.name}</span></p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right', display: 'none' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--success)' }}>ENCRYPTED</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>FORTRESS V2</div>
          </div>
          <button onClick={() => nav('/profile')} style={{ 
            width: 48, height: 48, borderRadius: '50%', 
            background: 'linear-gradient(135deg, var(--accent), var(--purple))', 
            border: '2px solid rgba(255,255,255,0.1)', 
            cursor: 'pointer', 
            padding: 2, 
            overflow: 'hidden',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
          }}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              <span style={{ color: '#fff' }}>{user?.name?.[0]?.toUpperCase()}</span>
            )}
          </button>
        </div>
      </div>

      {/* Mood card */}
      <div style={{ padding: '0 20px 24px' }}>
        <div className="card" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          background: 'rgba(201, 169, 110, 0.1)', 
          border: '1px solid rgba(201, 169, 110, 0.2)',
          padding: '24px 30px'
        }}>
          <div style={{ display: 'flex', gap: 32 }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '1px' }}>YOU</p>
              <p style={{ margin: 0, fontSize: '2rem', filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.3))' }}>{moods?.my_mood?.emoji || '❔'}</p>
            </div>
            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.1)', alignSelf: 'center' }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '1px' }}>{partner?.name?.toUpperCase() || 'PARTNER'}</p>
              <p style={{ margin: 0, fontSize: '2rem', filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.3))' }}>{moods?.partner_mood?.emoji || '❔'}</p>
            </div>
          </div>
          <Link to="/mood" className="btn btn-p" style={{ padding: '10px 20px', borderRadius: 12, fontSize: '0.82rem', fontWeight: 600 }}>Sync Aura</Link>
        </div>
      </div>

      {/* Proactive AI Suggestion */}
      {suggestion && (
        <div style={{ padding: '0 20px 16px' }}>
          <div className="card" style={{ background: 'var(--s1)', borderLeft: '4px solid var(--accent)', display: 'flex', gap: 14, alignItems: 'center', animation: 'fadeIn 0.5s ease' }}>
            <span style={{ fontSize: '1.8rem' }}>✨</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.9rem' }}>{suggestion.title}</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>{suggestion.body}</p>
              <Link to={suggestion.action} className="btn btn-p" style={{ marginTop: 10, display: 'inline-block', padding: '6px 14px', fontSize: '0.75rem', textDecoration: 'none' }}>Start Designing →</Link>
            </div>
            <button onClick={() => setSuggestion(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}

      {/* Shared Note Banners */}
      {sharedNotes.length > 0 && (
        <div style={{ padding: '0 20px 16px' }}>
          {sharedNotes.map(note => (
            <div key={note.id} className="card" style={{ background: 'var(--s1)', border: '2px solid var(--accent)', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, animation: 'fadeIn 0.5s ease' }}>
              <span style={{ fontSize: '1.5rem' }}>💌</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{partner?.name || 'Partner'} shared a note:</p>
                <p style={{ margin: 0, fontWeight: 600 }}>{note.title}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link to="/notes" onClick={() => dismissNote(note.id)} className="btn btn-p" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Open</Link>
                <button onClick={() => dismissNote(note.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Primary Grid */}
      <div style={{ padding: '0 20px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {CORE_QUICK.map((q, idx) => (
            <Link key={q.to} to={q.to} style={{ textDecoration: 'none', gridColumn: idx === 0 ? 'span 2' : 'span 1' }}>
              <div className="card card-hover" style={{ 
                padding: '24px', 
                height: idx === 0 ? 120 : 'auto', 
                display: 'flex', 
                flexDirection: idx === 0 ? 'row' : 'column', 
                gap: idx === 0 ? 20 : 10, 
                alignItems: idx === 0 ? 'center' : 'flex-start',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <span style={{ fontSize: idx === 0 ? '2.8rem' : '2.2rem', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))' }}>{q.icon}</span>
                <div>
                  <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '1.1rem', color: 'var(--text)' }}>{q.label}</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 500 }}>{q.sub}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
