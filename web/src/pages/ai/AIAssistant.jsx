import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { askAI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/ui/Icons';

export default function AIAssistant() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async (msg) => {
    const content = (msg || text).trim();
    if (!content || loading) return;
    
    const userMsg = { role: 'user', content };
    const updated = [...msgs, userMsg];
    setMsgs(updated);
    setText('');
    setLoading(true);

    try {
      // Logic for contextual "Lab Mode" trigger
      const triggerWords = ['fight', 'tension', 'problem', 'sad', 'angry', 'upset', 'ladayi', 'jhagda', 'breakup'];
      const needsCounseling = triggerWords.some(w => content.toLowerCase().includes(w));

      const { reply } = await askAI(updated.map(m => ({ role: m.role, content: m.content })));
      
      let finalReply = reply;
      if (needsCounseling && !msgs.some(m => m.isLabPrompt)) {
        finalReply += "\n\nI can help you analyze the situation, but I'll need your **One-Time Permission** to read your recent chat history. Want me to request access for the last (7, 30, or 90) days?";
      }

      setMsgs(prev => [...prev, { 
        role: 'assistant', 
        content: finalReply,
        isLabPrompt: needsCounseling 
      }]);
    } catch (err) {
      console.error("AI Error:", err);
      const errDetail = err.response?.data?.detail || err.message || "Unknown error";
      const errorMsg = err.response?.status === 503 
        ? "Yaar, Aura abhi configured nahi hai. Groq API Key check karo .env mein! 🔑"
        : `Yaar kuch gadbad ho gayi: ${errDetail}`;
      setMsgs(prev => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Header */}
      <header className="header" style={{ background: 'rgba(22,22,24,0.6)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '16px 16px 0', borderRadius: '24px', padding: '14px 20px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icons.Aura size={20} color="var(--accent)" /> Aura
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }}></span>
            Always here
          </span>
        </div>
        <Link to="/ai/lab" style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', background: 'rgba(201,169,110,0.1)', padding: '6px 12px', borderRadius: 12, border: '1px solid rgba(201,169,110,0.2)' }}>Deep Lab</Link>
      </header>

      <div style={{ textAlign: 'center', padding: '8px 0', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icons.Shield size={12} color="var(--muted)" />
        <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 500, letterSpacing: 0.5 }}>E2EE: AI HAS NO PERMANENT ACCESS TO YOUR CHATS</span>
      </div>

      {/* Chat Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 60, opacity: 0.85 }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 16 }}><Icons.Aura size={56} color="var(--accent)" /></div>
            <h2 style={{ color: 'var(--text)', marginBottom: 8, fontSize: '1.4rem', fontWeight: 600 }}>
              Hey {user?.name?.split(' ')[0]}
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', maxWidth: 260, margin: '0 auto 32px', lineHeight: 1.7 }}>
              Kuch bhi baat karo — jaise ek dost se karte ho. Main yahan hun aapka din aur rishta behtar banane ke liye.
            </p>
            {/* Quick starter chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 320, margin: '0 auto' }}>
              {[
                'Kya chal raha hai? 😊',
                'Aaj kuch suggest karo',
                'Mujhe ek achha date idea chahiye',
                'Yaar baat karni hai',
              ].map(q => (
                <button key={q} onClick={() => send(q)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '8px 16px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem', transition: 'all 0.2s' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadeInUp 0.3s ease-out' }}>
            {m.role === 'assistant' && (
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0, alignSelf: 'flex-end' }}>
                <Icons.Aura size={16} color="#000" />
              </div>
            )}
            <div style={{
              maxWidth: '78%',
              padding: '12px 18px',
              borderRadius: 22,
              borderBottomRightRadius: m.role === 'user' ? 6 : 22,
              borderBottomLeftRadius: m.role === 'user' ? 22 : 6,
              background: m.role === 'user' ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              color: m.role === 'user' ? '#000' : '#fff',
              border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(16px)',
              fontSize: '0.95rem',
              lineHeight: 1.6,
              boxShadow: m.role === 'user' ? '0 6px 20px rgba(201,169,110,0.2)' : '0 4px 15px rgba(0,0,0,0.2)',
              whiteSpace: 'pre-wrap',
            }}>
              {m.content}
              {m.isLabPrompt && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  {[7, 30, 90].map(days => (
                    <Link key={days} to={`/ai/lab?days=${days}`} style={{ background: 'rgba(201,169,110,0.2)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '6px 12px', borderRadius: 10, fontSize: '0.75rem', textDecoration: 'none', fontWeight: 600 }}>
                      {days} Days
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icons.Aura size={16} color="#000" />
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '22px 22px 22px 6px', padding: '12px 18px', display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--purple)', animation: `pulse 0.9s infinite ${d}s` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input Bar */}
      <div style={{ padding: '8px 16px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(22,22,26,0.65)', backdropFilter: 'blur(25px) saturate(200%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: '10px 10px 10px 20px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Kuch bhi bolo..."
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '1rem', outline: 'none', padding: '6px 0' }}
          />
          <button
            onClick={() => send()}
            disabled={loading || !text.trim()}
            style={{ width: 44, height: 44, borderRadius: '50%', background: text.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.05)', border: 'none', cursor: text.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s', boxShadow: text.trim() ? '0 6px 18px rgba(201,169,110,0.35)' : 'none' }}
          >
            <Icons.Send size={20} color={text.trim() ? '#000' : 'var(--muted)'} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:0.3; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.1); } }
      `}</style>
    </div>
  );
}
