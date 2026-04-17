import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createSurprise, uploadSurpriseMedia } from '../../services/api';

const VIBES = [
  { id: 'romantic', label: 'Classic Romance', icon: '❤️' },
  { id: 'vintage', label: 'Vintage Letters', icon: '📜' },
  { id: 'futuristic', label: 'Neon Future', icon: '🚀' },
  { id: 'minimalist', label: 'Clean & Simple', icon: '⚪' }
];

export default function SurpriseBuilder() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    recipient_name: '', sender_name: '', occasion: '', message: '', vibe: 'romantic',
    photos: [], videos: [], voice_notes: []
  });
  const [result, setResult] = useState(null);

  const fileRef = useRef(null);

  const handleUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const { url } = await uploadSurpriseMedia(file, type);
      setFormData(prev => ({ ...prev, [type + 's']: [...prev[type + 's'], url] }));
    } catch (err) { alert('Upload failed'); } finally { setLoading(false); }
  };

  const currentMediaCount = formData.photos.length + formData.videos.length + formData.voice_notes.length;

  const build = async () => {
    setLoading(true);
    try {
      const res = await createSurprise(formData);
      setResult(res.data);
      setStep(4);
    } catch (err) { alert('Creation failed'); } finally { setLoading(false); }
  };

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <header className="header">
        <Link to="/surprise" style={{ color: 'var(--muted)' }}>←</Link>
        <span className="header-title">AI Website Builder</span>
        <div style={{ width: 24 }} />
      </header>

      <div className="content">
        {step === 1 && (
          <div className="fade-in">
            <h2 style={{ marginBottom: 20 }}>The Basics</h2>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input className="inp" placeholder="Partner's Name" value={formData.recipient_name} onChange={e => setFormData({ ...formData, recipient_name: e.target.value })} />
              <input className="inp" placeholder="Your Name" value={formData.sender_name} onChange={e => setFormData({ ...formData, sender_name: e.target.value })} />
              <input className="inp" placeholder="Occasion (e.g. Birthday, Anniversary)" value={formData.occasion} onChange={e => setFormData({ ...formData, occasion: e.target.value })} />
              <textarea className="inp" placeholder="A heartfelt message..." style={{ height: 100 }} value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} />
              <button className="btn btn-p" onClick={() => setStep(2)} disabled={!formData.recipient_name || !formData.message}>Next: Choose Vibe →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in">
            <h2 style={{ marginBottom: 20 }}>Choose the Vibe</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {VIBES.map(v => (
                <div key={v.id} onClick={() => setFormData({ ...formData, vibe: v.id })} className="card" style={{ textAlign: 'center', cursor: 'pointer', border: formData.vibe === v.id ? '2px solid var(--primary)' : '1px solid var(--border)', background: formData.vibe === v.id ? 'var(--primary-bg)' : 'transparent' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>{v.icon}</div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.86rem' }}>{v.label}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-p w-full" onClick={() => setStep(3)}>Next: Add Media →</button>
          </div>
        )}

        {step === 3 && (
          <div className="fade-in">
            <h2 style={{ marginBottom: 8 }}>Add Media</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 24 }}>AI will weave these into your partner's website.</p>
            
            <input type="file" ref={fileRef} style={{ display: 'none' }} />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 30 }}>
              <MediaBtn icon="📸" label="Add Photos" count={formData.photos.length} onClick={() => { fileRef.current.accept="image/*"; fileRef.current.onchange=(e) => handleUpload(e,'photo'); fileRef.current.click(); }} />
              <MediaBtn icon="🎥" label="Add Videos" count={formData.videos.length} onClick={() => { fileRef.current.accept="video/*"; fileRef.current.onchange=(e) => handleUpload(e,'video'); fileRef.current.click(); }} />
              <MediaBtn icon="🎙️" label="Add Voice Notes" count={formData.voice_notes.length} onClick={() => { fileRef.current.accept="audio/*"; fileRef.current.onchange=(e) => handleUpload(e,'voice'); fileRef.current.click(); }} />
            </div>

            <button className="btn btn-p w-full" onClick={build} disabled={loading || currentMediaCount === 0}>
              {loading ? 'AI is developing site...' : '🚀 Build Surprise Site'}
            </button>
          </div>
        )}

        {step === 4 && result && (
          <div className="fade-in text-center" style={{ paddingTop: 40 }}>
            <div style={{ fontSize: '4rem', marginBottom: 20 }}>🎊</div>
            <h2 style={{ marginBottom: 12 }}>It's Live!</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 30 }}>Your partner's private workspace website has been developed and hosted.</p>
            
            <div className="card" style={{ marginBottom: 30 }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Private URL</p>
              <p style={{ fontWeight: 'bold', color: 'var(--primary)', wordBreak: 'break-all' }}>{window.location.origin + result.url}</p>
            </div>

            <button onClick={() => window.open(result.url)} className="btn btn-p w-full">Preview Site</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaBtn({ icon, label, count, onClick }) {
  return (
    <div onClick={onClick} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <div style={{ fontSize: '1.4rem' }}>{icon}</div>
      <div style={{ flex: 1, fontWeight: 'bold' }}>{label}</div>
      {count > 0 && <span style={{ background: 'var(--primary)', color: '#000', padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem' }}>{count}</span>}
    </div>
  );
}
