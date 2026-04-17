import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMoodHistory } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import BottomNav from '../../components/layout/BottomNav';

const MOODS = { happy:{emoji:'😊',color:'#F59E0B',label:'Happy'}, calm:{emoji:'😌',color:'#6EE7B7',label:'Calm'}, neutral:{emoji:'😐',color:'#94A3B8',label:'Neutral'}, low:{emoji:'😔',color:'#818CF8',label:'Low'}, support:{emoji:'🤗',color:'#F87171',label:'Need Support'} };

export default function MoodHistory() {
  const { user } = useAuth();
  const [moods, setMoods] = useState([]);
  const [filter, setFilter] = useState('both');

  useEffect(() => { getMoodHistory(60).then(setMoods); }, []);

  const filtered = moods.filter(m => {
    if (filter === 'me') return m.user_id === user?.id;
    if (filter === 'partner') return m.user_id !== user?.id;
    return true;
  });

  return (
    <div className="page" style={{ paddingBottom:80 }}>
      <header className="header">
        <Link to="/mood" style={{ color:'var(--muted)' }}>←</Link>
        <span className="header-title">Mood History</span>
        <div style={{ width:24 }} />
      </header>
      <div className="content">
        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          {[['both','Both'],['me','Me'],['partner','Partner']].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)} className="btn" style={{ padding:'6px 14px', fontSize:'0.82rem', background: filter===k?'var(--accent)':'var(--s2)', color: filter===k?'#0D0D0F':'var(--muted)', border:'1px solid var(--border)' }}>{l}</button>
          ))}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(m => {
            const meta = MOODS[m.mood_type];
            const isMe = m.user_id === user?.id;
            return (
              <div key={m.id} className="card" style={{ display:'flex', gap:12, padding:14 }}>
                <span style={{ fontSize:'1.7rem' }}>{meta?.emoji}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:'0.82rem', fontWeight:500, color: isMe?'var(--accent)':'var(--purple)' }}>{isMe ? 'You' : m.user_name}</span>
                    <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{m.date}</span>
                  </div>
                  <span style={{ color:meta?.color, fontWeight:500, fontSize:'0.88rem' }}>{meta?.label}</span>
                  {m.note && <p style={{ fontSize:'0.78rem', fontStyle:'italic', marginTop:3 }}>"{m.note}"</p>}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p style={{ textAlign:'center', marginTop:40 }}>No mood history yet.</p>}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
