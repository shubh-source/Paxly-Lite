import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { startAISession, sendAIInterviewMessage, finishAIInterview, getActiveAISession, getAIHistory } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/ui/Icons';
import PremiumUpgrade from '../../components/premium/PremiumUpgrade';

const PHASES = [
  { id: 'start', label: 'Setup', icon: '⚙️' },
  { id: 'analyzing_history', label: 'Analyzing History', icon: '📖' },
  { id: 'interviewing', label: 'Private Interview', icon: '💬' },
  { id: 'finalizing', label: 'Synthesis', icon: '🧠' },
  { id: 'completed', label: 'Final Report', icon: '✨' }
];

export default function AILab() {
  const [phase, setPhase] = useState('init'); // init | start | analyzing | join_session | interview | waiting | report | history
  const [historyList, setHistoryList] = useState([]);
  const [days, setDays] = useState(7);
  const [sessionId, setSessionId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const bottomRef = useRef(null);
  const nav = useNavigate();
  const { user } = useAuth();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  useEffect(() => {
    getActiveAISession().then(active => {
      if (!active) {
        setPhase('start');
        return;
      }
      setSessionId(active.session_id);
      
      if (active.status === 'completed') {
        setReport(active.final_report);
        setPhase('report');
      } else if (active.my_pov_done) {
        setPhase('waiting');
      } else {
        // Resume interview if cached
        const cached = localStorage.getItem(`paxly_ai_lab_${active.session_id}`);
        if (cached) {
          setMsgs(JSON.parse(cached));
          setPhase('interview');
        } else {
          setPhase('join_session');
        }
      }
    }).catch(() => setPhase('start'));
  }, []);

  // Save to localStorage whenever msgs update during an active session
  useEffect(() => {
    if (sessionId && msgs.length > 0 && phase === 'interview') {
      localStorage.setItem(`paxly_ai_lab_${sessionId}`, JSON.stringify(msgs));
    }
  }, [msgs, sessionId, phase]);

  const start = async () => {
    setLoading(true);
    setPhase('analyzing');
    try {
      const cached = localStorage.getItem('cached_messages');
      const cachedMsgs = cached ? JSON.parse(cached) : [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      const filtered = cachedMsgs.filter(m => 
        m.message_type === 'text' && 
        m.text && 
        new Date(m.timestamp) >= cutoff
      );
      
      const chat_history = filtered.map(m => `${m.sender_id === user.id ? 'Partner 1' : 'Partner 2'}: ${m.text}`).join('\n');
      
      const res = await startAISession(days, chat_history);
      setSessionId(res.session_id);
      setMsgs([{ role: 'assistant', content: "Hello. I have analyzed your recent chat history. To help me understand your perspective better, could you tell me how you've been feeling about the relationship recently? What do you feel is the main thing we should address?" }]);
      setPhase('interview');
    } catch {
      alert('Error starting session.');
      setPhase('start');
    }
    setLoading(false);
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const updated = [...msgs, { role: 'user', content: input }];
    setMsgs(updated);
    setInput('');
    setLoading(true);
    try {
      // Send full conversation history as context for the AI
      const fullContext = updated.map(m => `${m.role === 'user' ? 'User' : 'Counselor'}: ${m.content}`).join('\n');
      const { reply } = await sendAIInterviewMessage(sessionId, fullContext + '\n\nPlease respond to the User directly.');
      setMsgs([...updated, { role: 'assistant', content: reply }]);
    } catch {
      alert('Error communicating with AI.');
    }
    setLoading(false);
  };

  const finish = async () => {
    setLoading(true);
    try {
      const pov = msgs.filter(m => m.role === 'user').map(m => m.content).join(' ');
      const res = await finishAIInterview(sessionId, pov);
      localStorage.removeItem(`paxly_ai_lab_${sessionId}`);
      if (res.status === 'completed') {
        setReport(res);
        setPhase('report');
      } else {
        setPhase('waiting');
      }
    } catch {
      alert('Error finalizing.');
    }
    setLoading(false);
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const data = await getAIHistory();
      setHistoryList(data);
      setPhase('history');
    } catch {
      alert('Error fetching history');
    }
    setLoading(false);
  };

  if (!user?.is_premium) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden' }}>
        <header className="header" style={{ padding: '20px', display: 'flex', alignItems: 'center' }}>
          <Link to="/ai" style={{ color: 'var(--text)', textDecoration: 'none' }}><Icons.Back size={24} /></Link>
          <span style={{ fontWeight: 600, fontSize: '1.2rem', marginLeft: 16 }}>Deep Lab</span>
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <Icons.Aura size={64} color="var(--accent)" />
          <h2 style={{ marginTop: 24, marginBottom: 12, color: 'var(--accent)' }}>Premium Feature</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem', maxWidth: 300, lineHeight: 1.6 }}>
            Deep Lab analyzes your chat history to resolve complex relationship issues. Upgrade to Paxly Premium to unlock this feature.
          </p>
          <button onClick={() => setShowPremiumModal(true)} style={{ marginTop: 32, padding: '14px 32px', borderRadius: 24, background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 8px 24px rgba(201,169,110,0.3)' }}>
            Upgrade Now
          </button>
        </div>
        {showPremiumModal && (
          <PremiumUpgrade 
            onCancel={() => setShowPremiumModal(false)}
            onUpgradeSuccess={() => {
              setShowPremiumModal(false);
              window.location.reload();
            }}
          />
        )}
      </div>
    );
  }

  if (phase === 'start') return (
    <div className="page center">
      <header className="header" style={{ background:'rgba(22,22,24,0.4)', borderBottom:'1px solid rgba(255,255,255,0.05)', margin:'20px 20px 12px', borderRadius:'24px', padding:'16px 20px', boxShadow:'0 10px 30px rgba(0,0,0,0.3)' }}>
        <Link to="/ai" style={{ color:'var(--muted)', fontSize:'1.2rem', padding:'0 8px', textDecoration:'none' }}>←</Link>
        <span className="header-title" style={{ color:'var(--text)' }}>Counseling Lab</span>
        <div style={{ width:32 }} />
      </header>
      <div className="content" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>✨</div>
        <h2 style={{ marginBottom: 10 }}>Relationship Workshop</h2>
        <p style={{ marginBottom: 32, lineHeight: 1.6, color: 'var(--muted)', fontSize: '0.9rem' }}>
          Start a deep analysis session. The AI will read your shared history, interview you privately, and create a shared report to help resolve conflicts.
        </p>

        <div className="card" style={{ textAlign: 'left', marginBottom: 32 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 12, display: 'block' }}>HOW MANY DAYS OF CHAT SHOULD I ANALYZE?</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)} className={days === d ? 'btn btn-p' : 'btn btn-s'}>
                {d === 7 ? '7 Days' : d === 30 ? '1 Month' : 'All Time'}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-p btn-full" onClick={start} disabled={loading}>
          {loading ? 'Analyzing History...' : 'Start Discovery Session'}
        </button>
        <button className="btn btn-s btn-full" onClick={fetchHistory} disabled={loading} style={{ marginTop: 12 }}>
          View Past Lab Reports
        </button>
        <p style={{ marginTop: 16, fontSize: '0.7rem', color: 'var(--muted)' }}>
          🔒 AI access is temporary and strictly for this session.
        </p>
      </div>
    </div>
  );

  if (phase === 'join_session') return (
    <div className="page center" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: 20 }}>💬</div>
      <h2>Your Partner Needs You</h2>
      <p style={{ lineHeight: 1.8, marginBottom: 32, color: 'var(--muted)' }}>
        Your partner has requested a Deep Lab session to resolve something important. The AI has analyzed your chat history and is waiting to interview you privately to get your point of view.
      </p>
      <button className="btn btn-p btn-full" onClick={() => {
        setMsgs([{ role: 'assistant', content: "Hello! Your partner requested this session. I've read your recent chats, but I really want to understand your side of the story. How are you feeling about things right now? Be totally honest, this is strictly between us." }]);
        setPhase('interview');
      }}>Join Private Interview</button>
    </div>
  );

  if (phase === 'init' || phase === 'analyzing') return (
    <div className="page center">
      <div style={{ textAlign: 'center' }}>
        <div className="loader" style={{ marginBottom: 20 }} />
        <h3>{phase === 'analyzing' ? 'Synthesizing Relationship Context' : 'Loading Lab...'}</h3>
        <p style={{ color: 'var(--muted)' }}>{phase === 'analyzing' ? 'AI is reading and understanding your history...' : 'Checking session status'}</p>
      </div>
    </div>
  );

  if (phase === 'interview') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      <header className="header">
        <div style={{ textAlign: 'center', flex: 1 }}>
          <span className="header-title">Private Interview</span>
          <div style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600 }}>PRIVATE: PARTNER CANNOT SEE THIS</div>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        <div className="alert alert-i" style={{ marginBottom: 20, fontSize: '0.8rem' }}>
          Share your true feelings with the AI. This info will be used to create the final report for both of you.
        </div>
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '85%', padding: '12px 16px', borderRadius: 16, background: m.role === 'user' ? 'var(--accent)' : 'var(--s1)', color: m.role === 'user' ? '#0D0D0F' : 'var(--text)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="loader-s" />}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea className="inp" placeholder="Type your feelings..." value={input} onChange={e => setInput(e.target.value)} rows={1} style={{ flex: 1, borderRadius: 20 }} />
          <button className="btn btn-p" onClick={send} disabled={loading || !input.trim()}>Send</button>
        </div>
        <button className="btn btn-s btn-full" onClick={finish}>I'm Done - Analyze My Perspective</button>
      </div>
    </div>
  );

  if (phase === 'waiting') return (
    <div className="page center" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: 20 }}>⌛</div>
      <h2>Waiting for Partner</h2>
      <p style={{ lineHeight: 1.8 }}>I have captured your perspective. I am now waiting for your partner to complete their private interview. You will receive a notification once the Final Synthesis Report is ready.</p>
      <button className="btn btn-p btn-full" onClick={() => nav('/dashboard')} style={{ marginTop: 24 }}>Back to Dashboard</button>
    </div>
  );

  if (phase === 'report') return (
    <div className="page">
      <header className="header" style={{ background:'rgba(22,22,24,0.4)', borderBottom:'1px solid rgba(255,255,255,0.05)', margin:'20px 20px 12px', borderRadius:'24px', padding:'16px 20px', boxShadow:'0 10px 30px rgba(0,0,0,0.3)' }}>
        <Link to="/ai" style={{ color:'var(--muted)', fontSize:'1.2rem', padding:'0 8px', textDecoration:'none' }}>←</Link>
        <span className="header-title" style={{ color:'var(--text)' }}>Final Analysis Report</span>
        <div style={{ width:32 }} />
      </header>
      <div className="content" style={{ maxWidth: 600, paddingBottom: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✨</div>
          <h2>Relational Synthesis</h2>
          <p style={{ color: 'var(--muted)' }}>Generated by Vlynxly AI Mediator</p>
        </div>

        <section style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--success)', marginBottom: 12 }}>🌈 The Pros (What's Working)</h3>
          <div className="card">
            {report.pros.map((p, i) => <div key={i} style={{ marginBottom: 8, fontSize: '0.9rem' }}>✓ {p}</div>)}
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 12 }}>⚠️ Friction Points</h3>
          <div className="card">
            {report.cons.map((c, i) => <div key={i} style={{ marginBottom: 8, fontSize: '0.9rem' }}>✗ {c}</div>)}
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12 }}>💡 The Core Issue</h3>
          <div className="card" style={{ lineHeight: 1.8, fontSize: '0.95rem' }}>
            {report.core_issue}
          </div>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text)', marginBottom: 12 }}>🕊️ Suggested Resolution</h3>
          <div className="card" style={{ background: 'var(--s1)', border: '1px solid var(--accent)', lineHeight: 1.8, fontSize: '0.95rem' }}>
            {report.resolution}
          </div>
        </section>

        <div className="card" style={{ fontStyle: 'italic', textAlign: 'center', border: 'none', background: 'rgba(201,169,110,0.05)' }}>
          "{report.summary}"
        </div>

        <button className="btn btn-p btn-full" onClick={() => setPhase('start')} style={{ marginTop: 32 }}>Back</button>
      </div>
    </div>
  );

  if (phase === 'history') return (
    <div className="page" style={{ paddingBottom: 100 }}>
      <header className="header" style={{ background:'rgba(22,22,24,0.4)', borderBottom:'1px solid rgba(255,255,255,0.05)', margin:'20px 20px 12px', borderRadius:'24px', padding:'16px 20px', boxShadow:'0 10px 30px rgba(0,0,0,0.3)' }}>
        <button onClick={() => setPhase('start')} style={{ background: 'none', border: 'none', color:'var(--muted)', fontSize:'1.2rem', padding:'0 8px', cursor: 'pointer' }}>←</button>
        <span className="header-title" style={{ color:'var(--text)' }}>Past Lab Reports</span>
        <div style={{ width:32 }} />
      </header>
      <div className="content" style={{ maxWidth: 600 }}>
        {historyList.length === 0 ? (
          <div className="center" style={{ padding: 40, color: 'var(--muted)' }}>No past reports found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {historyList.map(h => (
              <div key={h.id} className="card card-hover" onClick={() => {
                setReport(h.report);
                setPhase('report');
              }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: '2rem' }}>✨</div>
                <div>
                  <div style={{ fontWeight: 600 }}>Synthesis Report</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{new Date(h.completed_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return null;
}
