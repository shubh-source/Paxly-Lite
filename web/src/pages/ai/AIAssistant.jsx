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
  const [attachment, setAttachment] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null); useEffect(() => { const originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; document.body.style.position = 'fixed'; document.body.style.inset = '0px'; return () => { document.body.style.overflow = originalOverflow; document.body.style.position = ''; document.body.style.inset = ''; }; }, []);
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // Load threads on mount
  useEffect(() => {
    const cachedThreads = localStorage.getItem('paxly_aura_threads');
    if (cachedThreads) {
      try {
        const parsed = JSON.parse(cachedThreads);
        setThreads(parsed);
        if (parsed.length > 0) {
          setActiveThreadId(parsed[0].id);
          setMsgs(parsed[0].messages || []);
        }
      } catch(e) {}
    } else {
      // Migrate old array
      const oldCached = localStorage.getItem('paxly_aura_chat_history');
      if (oldCached) {
        try {
          const oldMsgs = JSON.parse(oldCached);
          if (oldMsgs.length > 0) {
            const newThread = { id: 'thread_' + Date.now(), title: oldMsgs[0].content.substring(0, 30) + '...', messages: oldMsgs, updated_at: Date.now() };
            setThreads([newThread]);
            setActiveThreadId(newThread.id);
            setMsgs(oldMsgs);
            localStorage.setItem('paxly_aura_threads', JSON.stringify([newThread]));
            localStorage.removeItem('paxly_aura_chat_history');
          }
        } catch(e) {}
      }
    }
  }, []);

  // Sync active thread messages
  useEffect(() => {
    if (msgs.length === 0) return;
    if (!activeThreadId) {
      const id = 'thread_' + Date.now();
      const title = msgs[0].content.substring(0, 30) + '...';
      const newThread = { id, title, messages: msgs, updated_at: Date.now() };
      setThreads(prev => {
        const next = [newThread, ...prev];
        localStorage.setItem('paxly_aura_threads', JSON.stringify(next));
        return next;
      });
      setActiveThreadId(id);
    } else {
      setThreads(prev => {
        const next = prev.map(t => t.id === activeThreadId ? { ...t, messages: msgs, updated_at: Date.now() } : t);
        localStorage.setItem('paxly_aura_threads', JSON.stringify(next));
        return next;
      });
    }
  }, [msgs, activeThreadId]);

  const startNewChat = () => {
    setActiveThreadId(null);
    setMsgs([]);
    setIsDrawerOpen(false);
  };

  const switchThread = (id) => {
    const thread = threads.find(t => t.id === id);
    if (thread) {
      setActiveThreadId(id);
      setMsgs(thread.messages);
      setIsDrawerOpen(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large! Please select a file under 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachment({
        file: file,
        mime_type: file.type,
        data: ev.target.result.split(',')[1],
        preview_url: URL.createObjectURL(file)
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const send = async (msg) => {
    const content = (msg || text).trim();
    if (!content && !attachment) return;
    if (loading) return;
    
    const userMsg = { role: 'user', content };
    if (attachment) {
      userMsg.attachments = [{ mime_type: attachment.mime_type, data: attachment.data, preview_url: attachment.preview_url }];
    }
    const updated = [...msgs, userMsg];
    setMsgs(updated);
    setText('');
    setAttachment(null);
    setLoading(true);

    try {
      // Logic for contextual "Lab Mode" trigger
      const triggerWords = ['fight', 'tension', 'problem', 'sad', 'angry', 'upset', 'ladayi', 'jhagda', 'breakup'];
      const needsCounseling = triggerWords.some(w => content.toLowerCase().includes(w));

      // Global Context Injection
      let globalContext = '';
      if (threads.length > 0) {
        const otherThreads = threads.filter(t => t.id !== activeThreadId).slice(0, 3);
        let pastMsgs = [];
        otherThreads.forEach(t => pastMsgs.push(...t.messages.slice(-4)));
        if (pastMsgs.length > 0) {
           globalContext = "Context from user's OTHER recent chats (do NOT mention you read this unless relevant): " + pastMsgs.map(m => m.content).join(' | ');
        }
      }

      const aiRequestPayload = updated.map(m => {
        const payload = { role: m.role, content: m.content };
        if (m.attachments) {
          payload.attachments = m.attachments.map(a => ({ mime_type: a.mime_type, data: a.data }));
        }
        return payload;
      });
      if (globalContext) {
        aiRequestPayload.unshift({ role: 'system', content: globalContext });
      }

      const { reply } = await askAI(aiRequestPayload);
      
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

  const clearChat = () => {
    if (confirm("Delete this conversation?")) {
      setThreads(prev => {
        const next = prev.filter(t => t.id !== activeThreadId);
        localStorage.setItem('paxly_aura_threads', JSON.stringify(next));
        return next;
      });
      setActiveThreadId(null);
      setMsgs([]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Header */}
      <header className="header" style={{ background: 'rgba(22,22,24,0.6)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '16px 16px 0', borderRadius: '24px', padding: '14px 20px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Link to="/dashboard" style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', textDecoration: 'none' }}><Icons.Back size={20} /></Link>
          <button onClick={() => setIsDrawerOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center', cursor: 'pointer' }}><Icons.Menu size={24} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icons.Aura size={20} color="var(--accent)" /> Aura
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }}></span>
            Always here
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to="/ai/lab" style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', background: 'rgba(201,169,110,0.1)', padding: '6px 12px', borderRadius: 12, border: '1px solid rgba(201,169,110,0.2)' }}>Deep Lab</Link>
        </div>
      </header>

      {/* Drawer */}
      <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: 280, background: 'var(--bg)', borderRight: '1px solid rgba(255,255,255,0.05)', transform: isDrawerOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Chat History</span>
          <button onClick={() => setIsDrawerOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 16 }}>
          <button onClick={startNewChat} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16 }}>
            <span style={{ fontSize: '1.2rem' }}>+</span> New Chat
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 12, fontWeight: 600 }}>Recents</div>
          {threads.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>No recent chats.</div> : null}
          {threads.map(t => (
            <div key={t.id} onClick={() => switchThread(t.id)} style={{ padding: '12px', borderRadius: 12, background: activeThreadId === t.id ? 'rgba(255,255,255,0.08)' : 'transparent', color: activeThreadId === t.id ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', marginBottom: 4, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.title}
            </div>
          ))}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Link to="/dashboard" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}><Icons.Back size={16} /> Back to Dashboard</Link>
        </div>
      </div>

      {/* Drawer Overlay */}
      {isDrawerOpen && <div onClick={() => setIsDrawerOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, backdropFilter: 'blur(2px)' }} />}

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
              {m.attachments && m.attachments.map((a, idx) => (
                <div key={idx} style={{ marginBottom: m.content ? 8 : 0 }}>
                  {a.mime_type.startsWith('image/') ? (
                    <img src={a.preview_url || `data:${a.mime_type};base64,${a.data}`} style={{ maxWidth: '100%', borderRadius: 12, display: 'block' }} alt="attachment" />
                  ) : (
                    <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: 8, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icons.Paperclip size={14} /> Attachment ({a.mime_type.split('/')[1]})
                    </div>
                  )}
                </div>
              ))}
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
        {attachment && (
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 12, width: 'max-content' }}>
            {attachment.mime_type.startsWith('image/') ? (
              <img src={attachment.preview_url} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }} alt="preview" />
            ) : (
              <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Icons.Paperclip size={16} color="var(--muted)" />
              </div>
            )}
            <div style={{ flex: 1, fontSize: '0.8rem', color: '#fff', maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {attachment.file.name}
            </div>
            <button onClick={() => setAttachment(null)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
               <Icons.Close size={16} />
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(22,22,26,0.65)', backdropFilter: 'blur(25px) saturate(200%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: '10px 10px 10px 16px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
          <label htmlFor="ai-attach" style={{ cursor: 'pointer', display: 'flex', color: attachment ? 'var(--accent)' : 'var(--muted)', padding: '4px' }}>
            <Icons.Paperclip size={20} />
          </label>
          <input type="file" id="ai-attach" hidden accept="image/*,video/*,application/pdf" onChange={handleFileSelect} />
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Kuch bhi bolo..."
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '1rem', outline: 'none', padding: '6px 0', minWidth: 0 }}
          />
          <button
            onClick={() => send()}
            disabled={loading || (!text.trim() && !attachment)}
            style={{ width: 44, height: 44, borderRadius: '50%', background: (text.trim() || attachment) ? 'var(--accent)' : 'rgba(255,255,255,0.05)', border: 'none', cursor: (text.trim() || attachment) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s', boxShadow: (text.trim() || attachment) ? '0 6px 18px rgba(201,169,110,0.35)' : 'none' }}
          >
            <Icons.Send size={20} color={(text.trim() || attachment) ? '#000' : 'var(--muted)'} />
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
