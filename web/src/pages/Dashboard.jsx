import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icons } from '../components/ui/Icons';
import api, { getTodayMoods, getSpace, getNotifications } from '../services/api';

const CORE_QUICK = [
  { to: '/chat',    icon: <Icons.Chat size={32} color="var(--accent)" />, label: 'Secret Chat',  sub: 'Encrypted & Private', full: true },
  { to: '/voice',   icon: <Icons.Mic size={32} color="var(--purple)" />, label: 'Voice Notes', sub: 'Audio memories', full: false },
  { to: '/memories',icon: <Icons.Vault size={32} color="var(--purple)" />, label: 'Our Vault',   sub: 'Saved moments', full: false },
  { to: '/notes',   icon: <Icons.LoveNote size={32} color="var(--accent)" />, label: 'Love Notes',  sub: 'Secret letters', full: false },
  { to: '/dates',   icon: <Icons.Milestone size={32} color="var(--purple)" />, label: 'Important Dates',  sub: 'Never forget', full: false },
  { to: '/ai',      icon: <Icons.Aura size={32} color="var(--accent)" />, label: 'Aura AI',     sub: 'Your best friend', full: true },
];

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [moods, setMoods] = useState(null);
  const [partner, setPartner] = useState(null);
  const [sharedNotes, setSharedNotes] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    getNotifications().then(data => {
      if (data.some(n => !n.read)) setHasUnread(true);
    }).catch(() => {});

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
        return diff >= 0 && diff <= 7;
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
    <div className="page" style={{ paddingBottom: 100 }}>
      {/* Dynamic Background Effects */}
      {user?.role === 'admin' ? (
        <>
          <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(201,169,110,0.15) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
          <div style={{ position: 'fixed', bottom: '10%', right: '-10%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(164,132,194,0.1) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
        </>
      ) : (
        <>
          <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(201,169,110,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
          <div style={{ position: 'fixed', bottom: '10%', right: '-10%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(124,111,205,0.06) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
        </>
      )}

      {/* Hero Header */}
      <div style={{ padding: '40px 24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 500, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            {greeting.toUpperCase()}
            {user?.role === 'admin' && (
              <span style={{ fontSize: '0.65rem', background: 'linear-gradient(135deg, #C9A96E, #a484c2)', color: '#000', padding: '2px 6px', borderRadius: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, boxShadow: '0 2px 10px rgba(201,169,110,0.3)' }}>VIP</span>
            )}
          </p>
          <h1 style={{ margin: 0, fontSize: '2.4rem', letterSpacing: '-1px', fontWeight: 700, lineHeight: 1 }}>
            Hey, <span style={{ 
              background: user?.role === 'admin' ? 'linear-gradient(135deg, #FFF, #C9A96E)' : 'linear-gradient(to right, var(--accent), #fff)', 
              WebkitBackgroundClip: 'text', 
              WebkitTextFillColor: 'transparent' 
            }}>{user?.name?.split(' ')[0]}</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => nav('/notifications')} style={{
            width: 48, height: 48, borderRadius: '16px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative'
          }}>
            <Icons.Bell size={20} color="var(--text)" />
            {hasUnread && <div style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%' }} />}
          </button>

          <button onClick={() => nav('/profile')} style={{ 
            width: 48, height: 48, borderRadius: '16px', 
            background: 'rgba(255,255,255,0.05)', 
            border: '1px solid rgba(255,255,255,0.1)', 
            cursor: 'pointer', 
            padding: 3, 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            transition: 'all 0.3s ease'
          }}>
            <div style={{ 
              width: '100%', height: '100%', borderRadius: '14px', 
              background: 'linear-gradient(135deg, var(--accent), var(--purple))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem', fontWeight: 700, color: '#000'
            }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
          </button>
        </div>
      </div>

      {/* Mood Sync Status (Premium Glass) */}
      <div style={{ padding: '0 24px 32px', position: 'relative', zIndex: 1 }}>
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.03)', 
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 32,
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                {moods?.my_mood?.emoji ? <span style={{fontSize: '2rem'}}>{moods.my_mood.emoji}</span> : <Icons.Smile size={32} color="var(--accent)" />}
              </div>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: 1 }}>YOU</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
               <div style={{ width: 40, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent)' }} />
               <Icons.Aura size={18} color="var(--accent)" />
               <div style={{ width: 40, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent)' }} />
            </div>

            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                {moods?.partner_mood?.emoji ? <span style={{fontSize: '2rem'}}>{moods.partner_mood.emoji}</span> : <Icons.User size={32} color="var(--muted)" />}
              </div>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: 1 }}>{partner?.name?.split(' ')[0]?.toUpperCase() || 'PARTNER'}</p>
            </div>
          </div>
          <Link to="/mood" style={{ 
            display: 'block', textAlign: 'center', textDecoration: 'none',
            background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.2)',
            padding: '14px', borderRadius: 20, color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem'
          }}>Update Your Vibe</Link>
        </div>
      </div>

      {/* Proactive AI Suggestion */}
      {suggestion && (
        <div style={{ padding: '0 24px 24px', position: 'relative', zIndex: 1 }}>
          <div className="card" style={{ 
            background: 'rgba(124,111,205,0.05)', 
            border: '1px solid rgba(124,111,205,0.1)',
            borderLeft: '4px solid var(--purple)', 
            display: 'flex', gap: 16, alignItems: 'center', 
            padding: 20, borderRadius: 24,
            animation: 'slideIn 0.5s ease' 
          }}>
            <Icons.Aura size={40} color="var(--accent)" />
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{suggestion.title}</p>
              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>{suggestion.body}</p>
              <Link to={suggestion.action} style={{ 
                display: 'inline-block', background: 'var(--purple)', color: '#fff', 
                padding: '8px 18px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' 
              }}>Try Now <Icons.Back size={14} color="#fff" style={{ transform: 'rotate(180deg)', display: 'inline-block', verticalAlign: 'middle' }} /></Link>
            </div>
            <button onClick={() => setSuggestion(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', alignSelf: 'flex-start' }}><Icons.Back size={20} /></button>
          </div>
        </div>
      )}

      {/* Shared Note Alerts */}
      {sharedNotes.length > 0 && (
        <div style={{ padding: '0 24px 24px', position: 'relative', zIndex: 1 }}>
          {sharedNotes.map(note => (
            <div key={note.id} className="card" style={{ 
              background: 'rgba(201,169,110,0.05)', 
              border: '1px solid rgba(201,169,110,0.2)', 
              display: 'flex', gap: 16, alignItems: 'center', 
              marginBottom: 12, borderRadius: 24, padding: 20
            }}>
            <Icons.LoveNote size={36} color="var(--accent)" />
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 2px', fontSize: '0.8rem', color: 'var(--muted)' }}>{partner?.name || 'Partner'} shared a note</p>
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent)' }}>"{note.title}"</p>
              </div>
              <Link to="/notes" onClick={() => dismissNote(note.id)} style={{ 
                background: 'var(--accent)', color: '#000', padding: '10px 20px', 
                borderRadius: 14, fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' 
              }}>Open</Link>
            </div>
          ))}
        </div>
      )}

      {/* Feature Grid */}
      <div style={{ padding: '0 24px', position: 'relative', zIndex: 1 }}>
        <p style={{ margin: '0 0 16px 4px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5 }}>QUICK ACCESS</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {CORE_QUICK.map((item, i) => (
            <Link 
              key={i} 
              to={item.to} 
              className="card card-hover" 
              style={{ 
                gridColumn: item.full ? '1 / -1' : 'auto', 
                padding: '20px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 16, 
                textDecoration: 'none', 
                color: 'var(--text)',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 24,
                border: user?.role === 'admin' ? '1px solid rgba(201,169,110,0.15)' : '1px solid rgba(255,255,255,0.05)',
                boxShadow: user?.role === 'admin' ? '0 4px 20px rgba(201,169,110,0.05)' : 'none'
              }}
            >
                <div style={{ 
                  background: 'rgba(255,255,255,0.04)', 
                  width: item.full ? 56 : 48, 
                  height: item.full ? 56 : 48, 
                  borderRadius: 16, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: item.full ? '1.8rem' : '1.5rem',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
                }}>
                  {item.icon}
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: item.full ? '1.1rem' : '0.95rem', color: '#fff' }}>{item.label}</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 500 }}>{item.sub}</p>
                </div>
                {item.full && <span style={{ marginLeft: 'auto', color: 'var(--muted)', display: 'flex', opacity: 0.5 }}><Icons.Back size={18} style={{ transform: 'rotate(180deg)' }} /></span>}
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
