import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { startAISession, sendAIInterviewMessage, finishAIInterview } from '../../services/api';
import BottomNav from '../../components/layout/BottomNav';

const PHASES = [
  { id: 'start', label: 'Setup', icon: '⚙️' },
  { id: 'analyzing_history', label: 'Analyzing History', icon: '📖' },
  { id: 'interviewing', label: 'Private Interview', icon: '💬' },
  { id: 'finalizing', label: 'Synthesis', icon: '🧠' },
  { id: 'completed', label: 'Final Report', icon: '✨' }
];

export default function AILab() {
  const [phase, setPhase] = useState('start'); // start | analyzing | interview | waiting | report
  const [days, setDays] = useState(7);
  const [sessionId, setSessionId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const bottomRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  const start = async () => {
    setLoading(true);
    setPhase('analyzing');
    try {
      const res = await startAISession(days);
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
      const { reply } = await sendAIInterviewMessage(sessionId, input);
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

  if (phase === 'start') return (
    <div className="page center">
      <header className="header">
        <Link to="/ai" style={{ color: 'var(--muted)' }}>←</Link>
        <span className="header-title">Counseling Lab</span>
        <div style={{ width: 24 }} />
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
        <p style={{ marginTop: 16, fontSize: '0.7rem', color: 'var(--muted)' }}>
          🔒 AI access is temporary and strictly for this session.
        </p>
      </div>
    </div>
  );

  if (phase === 'analyzing') return (
    <div className="page center">
      <div style={{ textAlign: 'center' }}>
        <div className="loader" style={{ marginBottom: 20 }} />
        <h3>Synthesizing Relationship Context</h3>
        <p style={{ color: 'var(--muted)' }}>AI is reading and understanding your history...</p>
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
      <header className="header">
        <Link to="/ai" style={{ color: 'var(--muted)' }}>←</Link>
        <span className="header-title">Final Analysis Report</span>
        <div style={{ width: 24 }} />
      </header>
      <div className="content" style={{ maxWidth: 600, paddingBottom: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✨</div>
          <h2>Relational Synthesis</h2>
          <p style={{ color: 'var(--muted)' }}>Generated by Paxly AI Mediator</p>
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

        <button className="btn btn-p btn-full" onClick={() => nav('/dashboard')} style={{ marginTop: 32 }}>Close Lab</button>
      </div>
    </div>
  );

  return null;
}
