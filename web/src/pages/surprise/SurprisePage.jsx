import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import BottomNav from '../../components/layout/BottomNav';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('ros_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const OCCASIONS = [
  { key: 'birthday',     emoji: '🎂', label: 'Birthday',     desc: 'Celebrate their special day' },
  { key: 'anniversary',  emoji: '💍', label: 'Anniversary',  desc: 'Celebrate your love story' },
  { key: 'sorry',        emoji: '🥺', label: 'Sorry',        desc: 'A heartfelt apology' },
  { key: 'love',         emoji: '❤️', label: 'Love Note',    desc: 'Express your feelings' },
  { key: 'celebration',  emoji: '🎉', label: 'Celebration',  desc: 'Celebrate a win together' },
  { key: 'custom',       emoji: '✨', label: 'Custom',       desc: 'Your own occasion' },
];

const THEMES = [
  { key: 'romantic', label: 'Romantic', color: '#e85d8a' },
  { key: 'cute',     label: 'Cute',     color: '#ff9ecd' },
  { key: 'elegant',  label: 'Elegant',  color: '#C9A96E' },
  { key: 'fun',      label: 'Fun',      color: '#6ee89a' },
  { key: 'minimal',  label: 'Minimal',  color: '#ffffff' },
];

export default function SurprisePage() {
  const nav = useNavigate();
  const [step, setStep] = useState('list'); // list | create | generating | done
  const [mySurprises, setMySurprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    occasion: '',
    recipient_name: '',
    sender_name: '',
    message: '',
    song_url: '',
    color_theme: 'romantic',
    photos: [],
  });

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    fetchMySurprises();
  }, []);

  const fetchMySurprises = async () => {
    try {
      const r = await api.get('/surprise/my');
      setMySurprises(r.data);
    } catch {}
    setLoading(false);
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/surprise/upload-photo', fd);
      setForm(f => ({ ...f, photos: [...f.photos, r.data.url] }));
    } catch { alert('Photo upload failed.'); }
    setUploadingPhoto(false);
    e.target.value = '';
  };

  const removePhoto = (url) => {
    setForm(f => ({ ...f, photos: f.photos.filter(p => p !== url) }));
  };

  const createSurprise = async () => {
    if (!form.occasion || !form.recipient_name || !form.sender_name || !form.message.trim()) {
      alert('Please fill all required fields.');
      return;
    }
    setGenerating(true);
    setStep('generating');
    try {
      const r = await api.post('/surprise/create', form);
      setResult(r.data);
      setStep('done');
      fetchMySurprises();
    } catch (e) {
      alert(e.response?.data?.detail || 'Something went wrong.');
      setStep('create');
    }
    setGenerating(false);
  };

  const copyLink = (url) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteSurprise = async (id) => {
    if (!confirm('Delete this surprise page?')) return;
    await api.delete(`/surprise/${id}`);
    setMySurprises(s => s.filter(x => x.id !== id));
  };

  // ── GENERATING ─────────────────────────────────────────────
  if (step === 'generating') return (
    <div className="page center" style={{ minHeight: '100vh', padding: 40 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: 24, animation: 'spin 2s linear infinite', display: 'inline-block' }}>✨</div>
        <h2 style={{ marginBottom: 12 }}>Creating your surprise...</h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.8 }}>
          AI is designing a beautiful page<br />
          just for {form.recipient_name} 💕
        </p>
        <div className="spinner" style={{ margin: '32px auto 0' }} />
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── DONE ───────────────────────────────────────────────────
  if (step === 'done' && result) return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <header className="header">
        <button className="btn btn-g" onClick={() => { setStep('list'); setResult(null); }} style={{ padding: '6px 10px' }}>← Back</button>
        <span className="header-title">Surprise Created!</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '4rem', marginBottom: 12 }}>🎉</div>
          <h2 style={{ marginBottom: 8 }}>Your surprise is ready!</h2>
          <p style={{ color: 'var(--muted)' }}>Share this link with {form.recipient_name}</p>
        </div>

        {/* Link card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>SHAREABLE LINK</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, background: 'var(--s2)', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {window.location.origin}{result.url}
            </code>
            <button className="btn btn-p" style={{ flexShrink: 0 }} onClick={() => copyLink(result.url)}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <a href={result.url} target="_blank" rel="noreferrer" className="btn btn-s" style={{ flex: 1, textAlign: 'center' }}>
            👁️ Preview
          </a>
          <button className="btn btn-s" style={{ flex: 1 }} onClick={() => {
            const url = `${window.location.origin}${result.url}`;
            if (navigator.share) {
              navigator.share({ title: `A surprise for you 💕`, url });
            } else { copyLink(result.url); }
          }}>
            📤 Share
          </button>
        </div>

        {/* WhatsApp share */}
        <a href={`https://wa.me/?text=${encodeURIComponent(`I made something special for you 💕 ${window.location.origin}${result.url}`)}`}
          target="_blank" rel="noreferrer" className="btn btn-p btn-full" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          💬 Send on WhatsApp
        </a>

        <button className="btn btn-g btn-full" onClick={() => { setStep('create'); setResult(null); setForm({ occasion: '', recipient_name: '', sender_name: '', message: '', song_url: '', color_theme: 'romantic', photos: [] }); }}>
          Create Another
        </button>
      </div>
      <BottomNav />
    </div>
  );

  // ── CREATE FORM ────────────────────────────────────────────
  if (step === 'create') return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <header className="header">
        <button className="btn btn-g" onClick={() => setStep('list')} style={{ padding: '6px 10px' }}>← Back</button>
        <span className="header-title">Create Surprise</span>
        <div style={{ width: 60 }} />
      </header>
      <div className="content" style={{ maxWidth: 560 }}>

        {/* Occasion */}
        <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>🎯 What's the occasion? *</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {OCCASIONS.map(o => (
            <div key={o.key} onClick={() => setForm(f => ({ ...f, occasion: o.key }))}
              style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${form.occasion === o.key ? 'var(--accent)' : 'var(--border)'}`, background: form.occasion === o.key ? 'rgba(201,169,110,0.08)' : 'var(--s1)', cursor: 'pointer' }}>
              <div style={{ fontSize: '1.6rem', marginBottom: 4 }}>{o.emoji}</div>
              <div style={{ fontWeight: 500, fontSize: '0.88rem', color: 'var(--text)', marginBottom: 2 }}>{o.label}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{o.desc}</div>
            </div>
          ))}
        </div>

        {/* Names */}
        <div className="inp-wrap">
          <label>For (recipient name) *</label>
          <input className="inp" placeholder="e.g. Neha" value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} />
        </div>
        <div className="inp-wrap">
          <label>From (your name) *</label>
          <input className="inp" placeholder="e.g. Shubh" value={form.sender_name} onChange={e => setForm(f => ({ ...f, sender_name: e.target.value }))} />
        </div>

        {/* Message */}
        <div className="inp-wrap">
          <label>Your message *</label>
          <textarea className="inp" placeholder="Write from your heart... the AI will beautifully present this message." value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} style={{ minHeight: 140, resize: 'vertical' }} />
        </div>

        {/* Song */}
        <div className="inp-wrap">
          <label>🎵 Song (YouTube URL, optional)</label>
          <input className="inp" placeholder="https://youtube.com/watch?v=..." value={form.song_url} onChange={e => setForm(f => ({ ...f, song_url: e.target.value }))} />
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>Song will play automatically when they open the page</p>
        </div>

        {/* Photos */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem' }}>📸 Photos (optional, max 6)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {form.photos.map((url, i) => (
              <div key={i} style={{ position: 'relative', aspectRatio: '1' }}>
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                <button onClick={() => removePhoto(url)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 22, height: 22, color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
              </div>
            ))}
            {form.photos.length < 6 && (
              <div onClick={() => fileRef.current?.click()} style={{ aspectRatio: '1', borderRadius: 10, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--s1)', flexDirection: 'column', gap: 4 }}>
                {uploadingPhoto ? <div className="spinner" style={{ width: 20, height: 20 }} /> : <>
                  <span style={{ fontSize: '1.4rem' }}>+</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Add photo</span>
                </>}
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={uploadPhoto} style={{ display: 'none' }} />
        </div>

        {/* Theme */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.9rem' }}>🎨 Color Theme</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {THEMES.map(t => (
              <button key={t.key} onClick={() => setForm(f => ({ ...f, color_theme: t.key }))}
                style={{ padding: '8px 16px', borderRadius: 99, border: `2px solid ${form.color_theme === t.key ? t.color : 'var(--border)'}`, background: form.color_theme === t.key ? `${t.color}22` : 'var(--s1)', color: form.color_theme === t.key ? t.color : 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font-b)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-p btn-full" onClick={createSurprise}
          disabled={!form.occasion || !form.recipient_name || !form.sender_name || !form.message.trim()}
          style={{ fontSize: '1rem', padding: '16px' }}>
          ✨ Generate Surprise Page
        </button>
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: 8 }}>
          AI will create a beautiful webpage — takes ~15 seconds
        </p>
      </div>
      <BottomNav />
    </div>
  );

  // ── LIST VIEW ──────────────────────────────────────────────
  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <header className="header">
        <Link to="/dashboard" style={{ color: 'var(--muted)' }}>←</Link>
        <span className="header-title">Surprise Pages</span>
        <button className="btn btn-p" onClick={() => setStep('create')} style={{ padding: '6px 14px', fontSize: '0.85rem' }}>+ Create</button>
      </header>
      <div className="content">

        {/* Hero */}
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px', marginBottom: 24, background: 'linear-gradient(135deg, var(--s1), var(--s2))', border: '1px solid rgba(201,169,110,0.2)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✨</div>
          <h2 style={{ marginBottom: 8, fontSize: '1.4rem' }}>AI Surprise Pages</h2>
          <p style={{ marginBottom: 20, lineHeight: 1.7 }}>Create beautiful personalized webpages for your partner. Add photos, a song, your message — AI does the rest.</p>
          <button className="btn btn-p" onClick={() => setStep('create')} style={{ padding: '12px 28px' }}>
            Create a Surprise ✨
          </button>
        </div>

        {/* My surprises */}
        {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : (
          <>
            {mySurprises.length > 0 && (
              <>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>Your Surprises</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {mySurprises.map(s => (
                    <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                      <span style={{ fontSize: '1.8rem' }}>
                        {OCCASIONS.find(o => o.key === s.occasion)?.emoji || '✨'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--text)', marginBottom: 2 }}>
                          For {s.recipient_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          {OCCASIONS.find(o => o.key === s.occasion)?.label} · {s.views || 0} views
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a href={`/surprise/view/${s.id}`} target="_blank" rel="noreferrer" className="btn btn-s" style={{ padding: '6px 10px', fontSize: '0.78rem' }}>👁️</a>
                        <button className="btn btn-s" style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/surprise/view/${s.id}`); alert('Link copied!'); }}>
                          📋
                        </button>
                        <button className="btn btn-s" style={{ padding: '6px 10px', fontSize: '0.78rem', color: 'var(--danger)' }}
                          onClick={() => deleteSurprise(s.id)}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {mySurprises.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                <p>No surprise pages yet. Create your first one!</p>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
