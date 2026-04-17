// MoodSync.jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submitMood, getTodayMoods } from '../../services/api';
import { wsService } from '../../services/websocket';
import { useAuth } from '../../context/AuthContext';
import BottomNav from '../../components/layout/BottomNav';

const MOODS = [
  { key:'happy',   emoji:'😊', label:'Happy',        color:'#F59E0B' },
  { key:'calm',    emoji:'😌', label:'Calm',         color:'#6EE7B7' },
  { key:'neutral', emoji:'😐', label:'Neutral',      color:'#94A3B8' },
  { key:'low',     emoji:'😔', label:'Low',          color:'#818CF8' },
  { key:'support', emoji:'🤗', label:'Need Support', color:'#F87171' },
];

export default function MoodSync() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [todayMoods, setTodayMoods] = useState([]);
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { getTodayMoods().then(setTodayMoods); }, []);

  const myMood = todayMoods.find(m => m.user_id === user?.id);
  const partnerMood = todayMoods.find(m => m.user_id !== user?.id);
  const getMeta = k => MOODS.find(m => m.key === k);

  const submit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const m = await submitMood(selected, note);
      wsService.send({ type:'mood_update', mood_type: selected, note });
      setTodayMoods(prev => [...prev.filter(x => x.user_id !== user?.id), m]);
    } finally { setLoading(false); }
  };

  return (
    <div className="page" style={{ paddingBottom:80 }}>
      <header className="header">
        <Link to="/dashboard" style={{ color:'var(--muted)' }}>←</Link>
        <span className="header-title">Mood Sync</span>
        <Link to="/mood/history" style={{ color:'var(--accent)', fontSize:'0.82rem' }}>History</Link>
      </header>
      <div className="content">
        {partnerMood && (
          <div className="card" style={{ textAlign:'center', marginBottom:22, borderColor:'rgba(201,169,110,0.2)' }}>
            <p style={{ fontSize:'0.78rem', marginBottom:8 }}>{partnerMood.user_name} is feeling</p>
            <div style={{ fontSize:'2.4rem', marginBottom:6 }}>{getMeta(partnerMood.mood_type)?.emoji}</div>
            <span style={{ color:getMeta(partnerMood.mood_type)?.color, fontWeight:500 }}>{getMeta(partnerMood.mood_type)?.label}</span>
            {partnerMood.note && <p style={{ marginTop:8, fontStyle:'italic', fontSize:'0.82rem' }}>"{partnerMood.note}"</p>}
          </div>
        )}
        {myMood ? (
          <div className="card" style={{ textAlign:'center' }}>
            <p style={{ fontSize:'0.78rem', marginBottom:8 }}>You shared today</p>
            <div style={{ fontSize:'2.4rem', marginBottom:6 }}>{getMeta(myMood.mood_type)?.emoji}</div>
            <span style={{ color:getMeta(myMood.mood_type)?.color, fontWeight:500 }}>{getMeta(myMood.mood_type)?.label}</span>
            {myMood.note && <p style={{ marginTop:8, fontStyle:'italic', fontSize:'0.82rem' }}>"{myMood.note}"</p>}
          </div>
        ) : (
          <div>
            <h3 style={{ marginBottom:6 }}>How are you feeling?</h3>
            <p style={{ marginBottom:18 }}>Your partner will see this.</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:18 }}>
              {MOODS.map(m => (
                <button key={m.key} onClick={() => setSelected(m.key)} style={{ background: selected===m.key ? `${m.color}20` : 'var(--s1)', border:`2px solid ${selected===m.key ? m.color : 'var(--border)'}`, borderRadius:12, padding:'12px 6px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:5, transition:'var(--t)' }}>
                  <span style={{ fontSize:'1.5rem' }}>{m.emoji}</span>
                  <span style={{ fontSize:'0.62rem', color: selected===m.key ? m.color : 'var(--muted)', fontWeight:500 }}>{m.label}</span>
                </button>
              ))}
            </div>
            <div className="inp-wrap"><label>Note (optional)</label><input className="inp" placeholder="e.g. Busy day..." value={note} onChange={e => setNote(e.target.value)} /></div>
            <button className="btn btn-p btn-full" onClick={submit} disabled={!selected || loading}>{loading ? 'Sharing...' : 'Share Mood'}</button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
