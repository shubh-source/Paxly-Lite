import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { askAI } from '../../services/api';
import BottomNav from '../../components/layout/BottomNav';

const QUICK = ['How can we communicate better?','We had a small argument. Any advice?','How can I show appreciation today?','Fun date ideas at home?','How do we keep the spark alive?'];

export default function AIAssistant() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  const send = async (text) => {
    if (!text.trim() || loading) return;
    const updated = [...msgs, { role:'user', content:text }];
    setMsgs(updated);
    setInput('');
    setLoading(true);
    try {
      const { reply } = await askAI(updated.map(m => ({ role:m.role, content:m.content })));
      setMsgs([...updated, { role:'assistant', content:reply }]);
    } catch {
      setMsgs([...updated, { role:'assistant', content:'Sorry, I could not respond. Try again.' }]);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg)' }}>
      <header className="header">
        <Link to="/dashboard" style={{ color:'var(--muted)' }}>←</Link>
        <div style={{ textAlign:'center' }}>
          <span className="header-title">AI Assistant</span>
          <div style={{ fontSize:'0.68rem', color:'var(--muted)' }}>Private & confidential</div>
        </div>
        <div style={{ width:24 }} />
      </header>

      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        {msgs.length === 0 && (
          <div style={{ textAlign:'center', marginTop:100, opacity: 0.8 }}>
            <h2 style={{ color: 'var(--accent)', marginBottom: 10 }}>Hello, {user?.name}</h2>
            <p style={{ maxWidth: 280, margin: '0 auto', fontSize: '0.9rem' }}>I'm your relationship companion. Ask me anything about your space, memories, or shared journey.</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ 
            marginBottom:16, 
            display:'flex', 
            justifyContent: m.role==='user'?'flex-end':'flex-start',
            animation: 'fadeInUp 0.4s ease-out'
          }}>
            <div style={{ 
              maxWidth:'80%', 
              padding:'14px 20px', 
              borderRadius:20, 
              background: m.role==='user' ? 'rgba(255,255,255,0.05)' : 'rgba(124, 111, 205, 0.12)', 
              color: '#fff',
              border: m.role==='user' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(124,111,205,0.2)',
              backdropFilter: 'blur(10px)',
              boxShadow: m.role==='user' ? 'none' : '0 4px 20px rgba(0,0,0,0.2)',
              fontSize: '0.95rem',
              lineHeight: 1.6
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', gap:6, padding: 10 }}>
            <div className="dot" style={{ width:8, height:8, borderRadius:'50%', background:'var(--purple)', animation:'pulse 1s infinite' }} />
            <div className="dot" style={{ width:8, height:8, borderRadius:'50%', background:'var(--purple)', animation:'pulse 1s infinite 0.2s' }} />
            <div className="dot" style={{ width:8, height:8, borderRadius:'50%', background:'var(--purple)', animation:'pulse 1s infinite 0.4s' }} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ 
        position:'absolute', 
        bottom:24, 
        left:20, 
        right:20, 
        background:'rgba(255,255,255,0.04)', 
        backdropFilter: 'blur(30px) saturate(180%)', 
        border:'1px solid rgba(255,255,255,0.1)', 
        borderRadius: 24,
        padding:'12px 16px', 
        display:'flex', 
        gap:12,
        boxShadow: '0 10px 50px rgba(0,0,0,0.4)',
        alignItems: 'center'
      }}>
        <input 
          className="inp" 
          value={text} 
          onChange={e => setText(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask Aura..." 
          style={{ flex:1, background:'transparent', border:'none', padding: '10px 4px', fontSize: '1rem', color: '#fff' }}
        />
        <button 
          className="btn btn-p" 
          onClick={send} 
          disabled={loading || !text.trim()} 
          style={{ 
            width: 44, height: 44, padding: 0, borderRadius: '50%',
            background: 'var(--purple)',
            boxShadow: '0 4px 15px rgba(124,111,205,0.3)',
            border: 'none',
            color: '#fff'
          }}
        >
          {loading ? '...' : '→'}
        </button>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
