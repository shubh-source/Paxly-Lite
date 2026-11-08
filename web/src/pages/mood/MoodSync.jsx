// MoodSync.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submitMood, getTodayMoods } from '../../services/api';
import { wsService } from '../../services/websocket';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/ui/Icons';
import { resolveMoodEmoji } from '../Dashboard';

const MOODS = [
  { key:'happy',   emoji: '😊', label:'Happy',        color:'#F59E0B' },
  { key:'calm',    emoji: '😌', label:'Calm',         color:'#6EE7B7' },
  { key:'neutral', emoji: '😐', label:'Neutral',      color:'#94A3B8' },
  { key:'low',     emoji: '😔', label:'Low',          color:'#818CF8' },
  { key:'support', emoji: '🤗', label:'Need Support', color:'#F87171' },
];

export default function MoodSync() {
  const { user, partner } = useAuth();
  const nav = useNavigate();
  const [todayMoods, setTodayMoods] = useState([]);
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { 
    const fetchMoods = () => {
      getTodayMoods().then(data => {
        if (Array.isArray(data)) setTodayMoods(data);
      }).catch(() => {});
    };
    fetchMoods();

    const off = wsService.on('mood_update', (data) => {
      if (!data) return;
      setTodayMoods(prev => {
        const others = prev.filter(m => String(m.user_id) !== String(data.user_id));
        return [{
          user_id: String(data.user_id),
          mood_type: data.mood_type,
          note: data.note,
          user_name: data.user_name || partner?.name || 'Partner'
        }, ...others];
      });
    });

    const onFocus = () => fetchMoods();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const interval = setInterval(fetchMoods, 5000);

    return () => {
      off();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(interval);
    };
  }, [partner?.name]);

  const myId = String(user?.id || '').toLowerCase();
  const myMood = todayMoods.find(m => myId && String(m.user_id).toLowerCase() === myId);
  const partnerMood = todayMoods.find(m => myId && String(m.user_id).toLowerCase() !== myId);
  
  const partnerName = (partnerMood?.user_name && partnerMood.user_name !== 'Partner' && partnerMood.user_name !== 'Unknown')
    ? partnerMood.user_name
    : (partner?.name || 'Partner');
    
  const getMeta = k => MOODS.find(m => m.key === k) || { label: k, color: '#C9A96E', emoji: resolveMoodEmoji(k) };

  const submit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const m = await submitMood(selected, note);
      try {
        wsService.send({ type: 'mood_update', mood_type: selected, note, user_name: user?.name });
      } catch (_) {}
      setTodayMoods(prev => [m, ...prev.filter(x => String(x.user_id) !== String(user?.id))]);
      // Navigate back to Dashboard so user instantly sees their updated vibe on dashboard
      setTimeout(() => nav('/dashboard'), 350);
    } catch (err) {
      alert('Could not update vibe: ' + (err?.response?.data?.detail || err.message));
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <header className="header" style={{ 
        background: 'rgba(22, 22, 24, 0.4)', 
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '20px 20px 12px',
        borderRadius: '24px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
      }}>
        <Link to="/dashboard" style={{ color:'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
        <span className="header-title" style={{ color: 'var(--text)' }}>Mood Sync</span>
        <Link to="/mood/history" style={{ color:'var(--accent)', fontSize:'0.82rem', fontWeight: 600, textDecoration: 'none' }}>History</Link>
      </header>
      
      <div className="content">
        {partnerMood && (
          <div className="card" style={{ textAlign: 'center', marginBottom: 20, borderColor: 'rgba(201,169,110,0.2)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>{partnerName} is feeling</p>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <span style={{ fontSize: '3rem' }}>{resolveMoodEmoji(partnerMood.mood_type)}</span>
            </div>
            <span style={{ color: getMeta(partnerMood.mood_type)?.color, fontWeight: 700, fontSize: '1rem', textTransform: 'capitalize' }}>
              {getMeta(partnerMood.mood_type)?.label || partnerMood.mood_type}
            </span>
            {partnerMood.note && <p style={{ marginTop: 8, fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text)' }}>"{partnerMood.note}"</p>}
          </div>
        )}

        {myMood && (
          <div className="card" style={{ textAlign: 'center', marginBottom: 20, background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 6 }}>Your current vibe</p>
            <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
              <span style={{ fontSize: '3rem' }}>{resolveMoodEmoji(myMood.mood_type)}</span>
            </div>
            <span style={{ color: getMeta(myMood.mood_type)?.color, fontWeight: 700, fontSize: '1rem', textTransform: 'capitalize' }}>
              {getMeta(myMood.mood_type)?.label || myMood.mood_type}
            </span>
            {myMood.note && <p style={{ marginTop: 6, fontStyle: 'italic', fontSize: '0.85rem' }}>"{myMood.note}"</p>}
          </div>
        )}

        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ marginBottom: 6, textAlign: 'center' }}>{myMood ? 'Update Your Vibe' : 'How are you feeling?'}</h3>
          <p style={{ marginBottom: 18, textAlign: 'center', fontSize: '0.85rem', color: 'var(--muted)' }}>
            {partner?.name && partner.name !== 'Partner' ? `${partner.name} will see this in real-time.` : 'Your partner will see this in real-time.'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 18 }}>
            {MOODS.map(m => (
              <button 
                key={m.key} 
                onClick={() => setSelected(m.key)} 
                style={{ 
                  background: selected === m.key ? `${m.color}25` : 'var(--s1)', 
                  border: `2px solid ${selected === m.key ? m.color : 'rgba(255,255,255,0.06)'}`, 
                  borderRadius: 14, padding: '12px 4px', cursor: 'pointer', 
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, 
                  transition: 'all 0.2s',
                  transform: selected === m.key ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: selected === m.key ? `0 4px 14px ${m.color}40` : 'none'
                }}
              >
                <span style={{ fontSize: '1.8rem' }}>{m.emoji}</span>
                <span style={{ fontSize: '0.62rem', color: selected === m.key ? '#fff' : 'var(--muted)', fontWeight: 600 }}>{m.label}</span>
              </button>
            ))}
          </div>

          <div className="inp-wrap" style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Note (optional)</label>
            <input 
              className="inp" 
              placeholder="e.g. Busy day, missing you..." 
              value={note} 
              onChange={e => setNote(e.target.value)} 
            />
          </div>

          <button 
            className="btn btn-p btn-full" 
            onClick={submit} 
            disabled={!selected || loading}
            style={{ fontWeight: 700, padding: 14 }}
          >
            {loading ? 'Updating...' : (myMood ? 'Update Vibe' : 'Share Vibe')}
          </button>
        </div>
      </div>
    </div>
  );
}
