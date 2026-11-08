import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icons } from '../components/ui/Icons';
import api, { getTodayMoods, getSpace, getNotifications } from '../services/api';
import NotificationService from '../services/NotificationService';
import { wsService } from '../services/websocket';
import { getScopedCachedPartner } from '../services/chatCache';
import JiggleGiftBoxModal from '../components/ui/JiggleGiftBoxModal';

const CORE_QUICK = [
  { to: '/chat',    icon: <Icons.Chat size={24} color="var(--accent)" />, label: 'Secret Chat',  sub: 'Encrypted & Private', full: true },
  { to: '/voice',   icon: <Icons.Mic size={20} color="var(--purple)" />, label: 'Voice Notes', sub: 'Audio memories', full: false },
  { to: '/memories',icon: <Icons.Vault size={20} color="var(--purple)" />, label: 'Our Vault',   sub: 'Saved moments', full: false },
  { to: '/notes',   icon: <Icons.LoveNote size={20} color="var(--accent)" />, label: 'Love Notes',  sub: 'Secret letters', full: false },
  { to: '/dates',   icon: <Icons.Milestone size={20} color="var(--purple)" />, label: 'Important Dates',  sub: 'Never forget', full: false },
  { to: '/ai',      icon: <Icons.Aura size={24} color="var(--accent)" />, label: 'Aura AI',     sub: 'Your best friend', full: true },
];

const MOOD_EMOJI_MAP = {
  happy: '😊',
  calm: '😌',
  neutral: '😐',
  low: '😔',
  support: '🤗',
  loving: '😍',
  love: '❤️',
  romantic: '💖',
  angry: '😤',
  laughing: '🤣',
  bored: '😴',
  sad: '😢',
  excited: '🤩',
  tired: '🥱',
  playful: '😜',
  stressed: '😣',
  sick: '🤒',
};

export function resolveMoodEmoji(moodType) {
  if (!moodType) return null;
  const str = String(moodType).trim();
  if (/\p{Extended_Pictographic}/u.test(str)) {
    return str;
  }
  const key = str.toLowerCase();
  return MOOD_EMOJI_MAP[key] || '😊';
}

export default function Dashboard() {
  const { user, partner: authPartner } = useAuth();
  const nav = useNavigate();
  const [moods, setMoods] = useState(null);
  const [partner, setPartner] = useState(() => authPartner || (user?.id ? getScopedCachedPartner(user.id, user.couple_space_id) : null));
  const [sharedNotes, setSharedNotes] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [pendingGiftNote, setPendingGiftNote] = useState(null);

  useEffect(() => {
    if (authPartner) setPartner(authPartner);
  }, [authPartner]);

  useEffect(() => {
    // 1. Immediate fallback from cache if not yet loaded
    if (user?.id) {
      const cached = getScopedCachedPartner(user.id, user.couple_space_id);
      if (cached) setPartner(cached);
    }

    // 2. Fetch fresh space data directly to guarantee latest partner profile
    getSpace().then(d => {
      if (d?.partner) {
        setPartner(d.partner);
        if (user?.id) {
          setScopedCachedPartner(user.id, d.space?.id || user.couple_space_id, d.partner);
        }
      }
    }).catch(() => {});

    getNotifications().then(data => {
      if (data.some(n => !n.read)) setHasUnread(true);
    }).catch(() => {});

    // Check for unopened unlocked Love Note gifts immediately upon opening app
    api.get('/notes/pending-gift')
      .then(res => {
        if (res.data?.has_gift && res.data?.note) {
          setPendingGiftNote(res.data.note);
        }
      })
      .catch(() => {});

    // On-demand milestone check for important dates
    api.post('/dates/check-milestones').catch(() => {});

    // Real-time listener for partner love note gifts
    const offGift = wsService.on('love_note_gift', () => {
      api.get('/notes/pending-gift')
        .then(res => {
          if (res.data?.has_gift && res.data?.note) {
            setPendingGiftNote(res.data.note);
          }
        })
        .catch(() => {});
    });

    // Real-time listener for partner presence (which sends partner user_name)
    const offPresence = wsService.on('presence', (d) => {
      if (d && d.user_name && d.user_id !== user?.id) {
        setPartner(prev => {
          if (prev && prev.name && prev.name !== 'Partner') return prev;
          return { ...(prev || {}), id: d.user_id, name: d.user_name };
        });
      }
    });

    const fetchMoods = () => {
      getTodayMoods().then(data => {
        if (Array.isArray(data)) {
          const myId = String(user?.id || '').toLowerCase();
          const myMoodObj = data.find(m => myId && String(m.user_id).toLowerCase() === myId);
          const partnerMoodObj = data.find(m => myId && String(m.user_id).toLowerCase() !== myId);
          setMoods({
            my_mood: myMoodObj ? { 
              mood_type: myMoodObj.mood_type,
              emoji: resolveMoodEmoji(myMoodObj.mood_type), 
              user_name: myMoodObj.user_name,
              note: myMoodObj.note 
            } : null,
            partner_mood: partnerMoodObj ? { 
              mood_type: partnerMoodObj.mood_type,
              emoji: resolveMoodEmoji(partnerMoodObj.mood_type), 
              user_name: partnerMoodObj.user_name,
              note: partnerMoodObj.note 
            } : null
          });
          if (partnerMoodObj?.user_name && partnerMoodObj.user_name !== 'Unknown' && partnerMoodObj.user_name !== 'Partner') {
            setPartner(prev => {
              if (prev?.name && prev.name !== 'Partner') return prev;
              return { ...(prev || {}), name: partnerMoodObj.user_name };
            });
          }
        }
      }).catch(() => {});
    };

    fetchMoods();

    // Instant real-time listener for mood_update WebSocket broadcast (<50ms)
    const offMood = wsService.on('mood_update', (d) => {
      if (!d) return;
      const myId = String(user?.id || '').toLowerCase();
      const senderId = String(d.user_id || '').toLowerCase();
      const isPartner = senderId ? senderId !== myId : true;
      const emoji = resolveMoodEmoji(d.mood_type);
      setMoods(prev => {
        if (isPartner) {
          return {
            ...(prev || {}),
            partner_mood: { mood_type: d.mood_type, emoji, user_name: d.user_name || partner?.name || 'Partner', note: d.note }
          };
        } else {
          return {
            ...(prev || {}),
            my_mood: { mood_type: d.mood_type, emoji, user_name: user?.name || 'You', note: d.note }
          };
        }
      });
      if (isPartner && d.user_name && d.user_name !== 'Unknown' && d.user_name !== 'Partner') {
        setPartner(prev => ({ ...(prev || {}), id: d.user_id || prev?.id, name: d.user_name }));
      }
    });

    // Auto-refresh when app comes to foreground or tab gains focus
    const onForeground = () => fetchMoods();
    window.addEventListener('focus', onForeground);
    document.addEventListener('visibilitychange', onForeground);

    // Fast safety net polling every 6 seconds in case mobile connection drops
    const moodPollTimer = setInterval(fetchMoods, 6000);
    
    // Fetch shared note alerts
    api.get('/notes/dashboard-alerts')
      .then(res => {
        if (Array.isArray(res.data)) setSharedNotes(res.data);
      })
      .catch(() => {});

    // Fetch AI Suggestions (dates, apologies, etc)
    const checkDates = (data) => {
      if (!Array.isArray(data)) return;
      if (user?.is_premium) {
        NotificationService.requestPermissions().then(() => {
          NotificationService.scheduleAnniversaryNotifications(data);
        });
      }
      const today = new Date();
      const upcoming = data.find(d => {
        const annDate = new Date(d.date);
        annDate.setFullYear(today.getFullYear());
        const diff = (annDate - today) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      });
      if (upcoming) {
        const pName = partner?.name && partner.name !== 'Partner' ? partner.name : null;
        setSuggestion({
          type: 'milestone',
          title: `Upcoming: ${upcoming.title}`,
          body: `It's almost time for your ${upcoming.title.toLowerCase()}! Want me to design a surprise Vibe Site for ${pName || 'your partner'}?`,
          action: '/website/vibe'
        });
      }
    };

    const cachedDates = localStorage.getItem('cached_dates');
    if (cachedDates) {
      try { checkDates(JSON.parse(cachedDates)); } catch {}
    } else {
      api.get('/dates/').then(res => checkDates(res.data)).catch(() => {});
    }

    return () => {
      offGift();
      offPresence();
      offMood();
      window.removeEventListener('focus', onForeground);
      document.removeEventListener('visibilitychange', onForeground);
      clearInterval(moodPollTimer);
    };
  }, [user?.id, user?.couple_space_id, partner?.name]);

  const dismissNote = async (id) => {
    try {
      await api.post(`/notes/${id}/dismiss-alert`);
      setSharedNotes(prev => prev.filter(n => n.id !== id));
    } catch {}
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const partnerRawName = (partner?.name && partner.name.toLowerCase() !== 'partner')
    ? partner.name
    : (moods?.partner_mood?.user_name && moods.partner_mood.user_name !== 'Unknown' && moods.partner_mood.user_name.toLowerCase() !== 'partner'
      ? moods.partner_mood.user_name
      : null);

  const partnerDisplayName = partnerRawName
    ? partnerRawName.trim().split(' ')[0].toUpperCase()
    : 'PARTNER';

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      {/* Dynamic Background Effects */}
      {user?.role === 'admin' ? (
        <>
          <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(201,169,110,0.15) 0%, transparent 70%)', filter: 'blur(100px)', WebkitFilter: 'blur(100px)', pointerEvents: 'none', zIndex: 0 }} />
          <div style={{ position: 'fixed', bottom: '10%', right: '-10%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(164,132,194,0.1) 0%, transparent 70%)', filter: 'blur(120px)', WebkitFilter: 'blur(120px)', pointerEvents: 'none', zIndex: 0 }} />
        </>
      ) : (
        <>
          <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(201,169,110,0.08) 0%, transparent 70%)', filter: 'blur(100px)', WebkitFilter: 'blur(100px)', pointerEvents: 'none', zIndex: 0 }} />
          <div style={{ position: 'fixed', bottom: '10%', right: '-10%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(124,111,205,0.06) 0%, transparent 70%)', filter: 'blur(120px)', WebkitFilter: 'blur(120px)', pointerEvents: 'none', zIndex: 0 }} />
        </>
      )}

      {/* Hero Header */}
      <div style={{ padding: '36px 18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1, width: '100%', boxSizing: 'border-box' }}>
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {user?.role === 'admin' && (
            <button
              onClick={() => nav('/admin')}
              title="Admin & Crash Logs Center"
              style={{
                height: 48, padding: '0 14px', borderRadius: '16px',
                background: 'rgba(201,169,110,0.15)',
                border: '1px solid rgba(201,169,110,0.4)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                color: '#C9A96E', fontWeight: 700, fontSize: '0.8rem'
              }}
            >
              <span>🚨 Logs</span>
            </button>
          )}

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
      <div style={{ padding: '0 18px 28px', position: 'relative', zIndex: 1, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ 
          background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)', 
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 32,
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div 
                onClick={() => nav('/mood')}
                title="Tap to update your vibe"
                style={{ 
                  width: 64, height: 64, borderRadius: 20, 
                  background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid rgba(255,255,255,0.08)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  margin: '0 auto 8px', cursor: 'pointer',
                  transition: 'transform 0.2s'
                }}
              >
                {moods?.my_mood?.emoji ? (
                  <span style={{ fontSize: '2.2rem' }}>{moods.my_mood.emoji}</span>
                ) : (
                  <span style={{ fontSize: '2.2rem' }}>😊</span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: 1 }}>YOU</p>
              {moods?.my_mood?.mood_type && (
                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#fff', opacity: 0.9, textTransform: 'capitalize', fontWeight: 600 }}>
                  {moods.my_mood.mood_type}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
               <div style={{ width: 40, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent)' }} />
               <Icons.Aura size={18} color="var(--accent)" />
               <div style={{ width: 40, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent)' }} />
            </div>

            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ 
                width: 64, height: 64, borderRadius: 20, 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                margin: '0 auto 8px', overflow: 'hidden' 
              }}>
                {moods?.partner_mood?.emoji ? (
                  <span style={{ fontSize: '2.2rem' }}>{moods.partner_mood.emoji}</span>
                ) : partner?.avatar_url ? (
                  <img src={partner.avatar_url} alt={partnerDisplayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : partnerDisplayName !== 'PARTNER' ? (
                  <div style={{ 
                    width: '100%', height: '100%', 
                    background: 'linear-gradient(135deg, rgba(201,169,110,0.25), rgba(124,111,205,0.25))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent)'
                  }}>
                    {partnerDisplayName[0]}
                  </div>
                ) : (
                  <Icons.User size={32} color="var(--muted)" />
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: 1 }}>{partnerDisplayName}</p>
              {moods?.partner_mood?.mood_type && (
                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600, textTransform: 'capitalize' }}>
                  {moods.partner_mood.mood_type}
                </p>
              )}
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
        <div style={{ padding: '0 18px 20px', position: 'relative', zIndex: 1, width: '100%', boxSizing: 'border-box' }}>
          <div className="card" style={{ 
            background: 'linear-gradient(145deg, rgba(124,111,205,0.08) 0%, rgba(124,111,205,0.02) 100%)', 
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(124,111,205,0.15)',
            borderLeft: '4px solid var(--purple)', 
            display: 'flex', gap: 16, alignItems: 'center', 
            padding: 20, borderRadius: 24,
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            animation: 'slideIn 0.5s ease' 
          }}>
            <Icons.Aura size={40} color="var(--accent)" />
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{suggestion.title}</p>
              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>{suggestion.body}</p>
              <Link to={suggestion.action} style={{ 
                display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--purple)', color: '#fff', 
                padding: '8px 18px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' 
              }}>Try Now <Icons.ChevronRight size={14} color="#fff" /></Link>
            </div>
            <button onClick={() => setSuggestion(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', alignSelf: 'flex-start' }}><Icons.Back size={20} /></button>
          </div>
        </div>
      )}

      {/* Shared Note Alerts */}
      {sharedNotes.length > 0 && (
        <div style={{ padding: '0 18px 20px', position: 'relative', zIndex: 1, width: '100%', boxSizing: 'border-box' }}>
          {sharedNotes.map(note => (
            <div key={note.id} className="card" style={{ 
              background: 'linear-gradient(145deg, rgba(201,169,110,0.08) 0%, rgba(201,169,110,0.02) 100%)', 
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(201,169,110,0.2)', 
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              display: 'flex', gap: 16, alignItems: 'center', 
              marginBottom: 12, borderRadius: 24, padding: 20
            }}>
            <Icons.LoveNote size={36} color="var(--accent)" />
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 2px', fontSize: '0.8rem', color: 'var(--muted)' }}>{(partnerRawName || 'Partner')} shared a note</p>
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
      <div style={{ padding: '0 18px', position: 'relative', zIndex: 1, width: '100%', boxSizing: 'border-box' }}>
        <p style={{ margin: '0 0 16px 4px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5 }}>QUICK ACCESS</p>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', 
          gap: 12,
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {CORE_QUICK.map((item, i) => (
            <Link 
              key={i} 
              to={item.to} 
              className="card card-hover" 
              style={{ 
                gridColumn: item.full ? '1 / -1' : 'span 1', 
                padding: item.full ? '18px 20px' : '15px 12px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: item.full ? 14 : 10, 
                textDecoration: 'none', 
                color: 'var(--text)',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                borderRadius: 22,
                border: user?.role === 'admin' ? '1px solid rgba(201,169,110,0.2)' : '1px solid rgba(255,255,255,0.06)',
                boxShadow: user?.role === 'admin' ? '0 10px 30px rgba(201,169,110,0.08)' : '0 8px 32px rgba(0,0,0,0.2)',
                minWidth: 0,
                overflow: 'hidden',
                boxSizing: 'border-box'
              }}
            >
                <div style={{ 
                  background: 'rgba(255,255,255,0.04)', 
                  width: item.full ? 48 : 38, 
                  height: item.full ? 48 : 38, 
                  minWidth: item.full ? 48 : 38, 
                  minHeight: item.full ? 48 : 38, 
                  flexShrink: 0,
                  borderRadius: 14, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
                }}>
                  {item.icon}
                </div>
                <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <p style={{ 
                    margin: '0 0 2px', 
                    fontWeight: 700, 
                    fontSize: item.full ? '1.05rem' : '0.86rem', 
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2
                  }}>
                    {item.label}
                  </p>
                  <p style={{ 
                    margin: 0, 
                    fontSize: item.full ? '0.75rem' : '0.7rem', 
                    color: 'var(--muted)', 
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2
                  }}>
                    {item.sub}
                  </p>
                </div>
                {item.full && (
                  <span style={{ marginLeft: 'auto', color: 'var(--muted)', display: 'flex', opacity: 0.6, flexShrink: 0, paddingLeft: 4 }}>
                    <Icons.ChevronRight size={18} />
                  </span>
                )}
            </Link>
          ))}
        </div>
      </div>

      {/* Jiggling Gift Box Surprise Modal when partner's love note has unlocked */}
      {pendingGiftNote && (
        <JiggleGiftBoxModal
          note={pendingGiftNote}
          onClose={() => setPendingGiftNote(null)}
          onOpened={(id) => {
            setSharedNotes(prev => prev.filter(n => n.id !== id));
          }}
        />
      )}

      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
