import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { generateInvite } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

import { Icons } from '../../components/ui/Icons';

export default function Connect() {
  const { refreshUser } = useAuth();
  const nav = useNavigate();
  const { code: urlCode } = useParams();
  const [tab, setTab] = useState('generate');
  const [generated, setGenerated] = useState('');
  const [enterCode, setEnterCode] = useState(urlCode || '');
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('idle'); // idle | waiting | connected
  const [targetName, setTargetName] = useState('');
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  // Poll for link status and fetch initial state
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data } = await api.get('/couple/link-status');
        if (data.status === 'connected') {
          setStatus('connected');
          setTimeout(async () => {
            await refreshUser();
            nav('/setup-lock', { replace: true });
          }, 1500);
        } else if (data.status === 'waiting') {
          setStatus('waiting');
          setTargetName(data.target_name);
          // Also fetch my code if it exists
          const inv = await api.post('/couple/invite/generate').catch(() => null);
          if (inv) setGenerated(inv.code);
        } else {
          // Idle, but check if I already have a code generated
          const inv = await api.post('/couple/invite/generate').catch(() => null);
          if (inv) setGenerated(inv.code);
        }
      } catch {}
    };

    checkStatus();
    
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get('/couple/link-status');
        if (data.status === 'connected') {
          clearInterval(pollRef.current);
          setStatus('connected');
          setTimeout(async () => {
            await refreshUser();
            nav('/setup-lock', { replace: true });
          }, 1500);
        }
      } catch {}
    }, 3000);

    return () => clearInterval(pollRef.current);
  }, []);

  const doGenerate = async () => {
    setLoading(true); setErr('');
    try {
      const d = await generateInvite();
      setGenerated(d.code);
      // Start polling — maybe partner will enter my code first
      setStatus('waiting_for_partner_on_generate');
    } catch (ex) { setErr(ex.response?.data?.detail || 'Error.'); }
    finally { setLoading(false); }
  };

  const doSend = async () => {
    if (!enterCode.trim()) return setErr('Enter a code.');
    setLoading(true); setErr('');
    try {
      const { data } = await api.post('/couple/invite/send', { code: enterCode.trim().toUpperCase() });
      if (data.status === 'connected') {
        setStatus('connected');
        setTimeout(async () => { await refreshUser(); nav('/setup-lock', { replace: true }); }, 1500);
      } else {
        // waiting
        setTargetName(data.target_name);
        setStatus('waiting');
      }
    } catch (ex) { setErr(ex.response?.data?.message || ex.response?.data?.detail || 'Error linking.'); }
    finally { setLoading(false); }
  };

  const cancelWaiting = async () => {
    await api.delete('/couple/pending-link').catch(() => {});
    setStatus('idle');
    clearInterval(pollRef.current);
  };

  const link = generated ? `${window.location.origin}/invite/${generated}` : '';

  // ── CONNECTED screen ─────────────────────────────────────
  if (status === 'connected') {
    return (
      <div className="page center" style={{ padding: '40px 24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><Icons.Heart size={64} color="var(--accent)" /></div>
          <h2 style={{ marginBottom: 8, color: 'var(--success)' }}>Connected!</h2>
          <p>Taking you to your space...</p>
          <div className="spinner" style={{ margin: '24px auto 0' }} />
        </div>
      </div>
    );
  }

  // ── WAITING screen ───────────────────────────────────────
  if (status === 'waiting') {
    return (
      <div className="page center" style={{ padding: '40px 24px' }}>
        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>⏳</div>
          <h2 style={{ marginBottom: 8 }}>Waiting for {targetName}</h2>
          <p style={{ marginBottom: 28, lineHeight: 1.8 }}>
            You've entered {targetName}'s code.<br />
            Now ask <strong style={{ color: 'var(--text)' }}>{targetName}</strong> to enter <strong style={{ color: 'var(--accent)' }}>your code</strong> in their app.<br />
            You'll be connected automatically!
          </p>

          {/* Show my code so they can share it */}
          {generated && (
            <div className="card" style={{ marginBottom: 20 }}>
              <p style={{ fontSize: '0.78rem', marginBottom: 8 }}>Your code to share</p>
              <div style={{ fontSize: '2.4rem', letterSpacing: '0.3em', color: 'var(--accent)', fontWeight: '300', marginBottom: 12 }}>{generated}</div>
              <button className="btn btn-s btn-full" onClick={() => { navigator.clipboard.writeText(generated); }}>📋 Copy My Code</button>
            </div>
          )}

          {!generated && (
            <div className="card" style={{ marginBottom: 20, padding: 16 }}>
              <p style={{ fontSize: '0.85rem' }}>Share your invite code with {targetName} so they can enter it.</p>
              <button className="btn btn-p btn-full" style={{ marginTop: 12 }} onClick={async () => {
                const d = await generateInvite();
                setGenerated(d.code);
              }}>Generate My Code</button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: 'var(--muted)', fontSize: '0.82rem', marginBottom: 20 }}>
            <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            Waiting for {targetName} to link...
          </div>

          <button className="btn btn-g" onClick={cancelWaiting} style={{ fontSize: '0.82rem' }}>Cancel</button>
        </div>
      </div>
    );
  }

  // ── MAIN screen ──────────────────────────────────────────
  return (
    <div className="page center" style={{ padding: '40px 24px' }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔗</div>
          <h2>Connect with Your Partner</h2>
          <p style={{ marginTop: 8, lineHeight: 1.8 }}>
            Both of you need to enter each other's code.<br />
            <span style={{ fontSize: '0.8rem' }}>This ensures only you two can connect.</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: 'var(--s1)', padding: 4, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
          {['generate', 'enter'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '9px', borderRadius: 6, border: 'none', cursor: 'pointer', background: tab === t ? 'var(--s2)' : 'transparent', color: tab === t ? 'var(--text)' : 'var(--muted)', fontFamily: 'var(--font-b)', fontSize: '0.88rem', fontWeight: 500 }}>
              {t === 'generate' ? '1. My Code' : '2. Enter Partner\'s Code'}
            </button>
          ))}
        </div>

        {err && <div className="alert alert-e">{err}</div>}

        {tab === 'generate' && (
          <div className="card">
            <p style={{ fontSize: '0.88rem', marginBottom: 4, color: 'var(--text)', fontWeight: 500 }}>Step 1 — Share your code</p>
            <p style={{ marginBottom: 16, fontSize: '0.83rem' }}>Generate a code and send it to your partner.</p>
            {!generated ? (
              <button className="btn btn-p btn-full" onClick={doGenerate} disabled={loading}>{loading ? 'Generating...' : 'Generate My Code'}</button>
            ) : (
              <>
                <div style={{ fontSize: '2.8rem', letterSpacing: '0.3em', color: 'var(--accent)', textAlign: 'center', fontWeight: '300', marginBottom: 16 }}>{generated}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-s" style={{ flex: 1 }} onClick={() => { navigator.clipboard.writeText(generated); }}>📋 Copy Code</button>
                  <button className="btn btn-p" style={{ flex: 1 }} onClick={() => navigator.share?.({ title: 'Connect on Vlynxly', text: `My code: ${generated}` }) || navigator.clipboard.writeText(generated)}>Share</button>
                </div>
                <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(201,169,110,0.08)', borderRadius: 8, border: '1px solid rgba(201,169,110,0.15)' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>👆 Now go to "Enter Partner's Code" tab and enter their code too!</p>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'enter' && (
          <div className="card">
            <p style={{ fontSize: '0.88rem', marginBottom: 4, color: 'var(--text)', fontWeight: 500 }}>Step 2 — Enter partner's code</p>
            <p style={{ marginBottom: 16, fontSize: '0.83rem' }}>Ask your partner to share their code with you.</p>
            <div className="inp-wrap">
              <label>Partner's Invite Code</label>
              <input className="inp" placeholder="A1B2C3" value={enterCode} onChange={e => setEnterCode(e.target.value.toUpperCase())} style={{ letterSpacing: '0.2em', fontSize: '1.2rem', textAlign: 'center' }} />
            </div>
            <button className="btn btn-p btn-full" onClick={doSend} disabled={loading || !enterCode.trim()}>{loading ? 'Linking...' : 'Link with Partner'}</button>
          </div>
        )}

        <div style={{ marginTop: 20, padding: 14, background: 'var(--s1)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.7 }}>
            🔒 <strong style={{ color: 'var(--text)' }}>How it works:</strong> Both partners must enter each other's code. Until both link, neither can access the app. This ensures complete privacy.
          </p>
        </div>
      </div>
    </div>
  );
}