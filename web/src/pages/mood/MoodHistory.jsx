import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMoodHistory } from '../../services/api';
import { useAuth } from '../../context/AuthContext';


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
      <header className="header" style={{ background:'rgba(22,22,24,0.4)', borderBottom:'1px solid rgba(255,255,255,0.05)', margin:'20px 20px 12px', borderRadius:'24px', padding:'16px 20px', boxShadow:'0 10px 30px rgba(0,0,0,0.3)' }}>
        <Link to="/mood" style={{ color:'var(--muted)', fontSize:'1.2rem', padding:'0 8px', textDecoration:'none' }}>←</Link>
        <span className="header-title" style={{ color:'var(--text)' }}>Mood History</span>
        <div style={{ width:32 }} />
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
    </div>
  );
}
