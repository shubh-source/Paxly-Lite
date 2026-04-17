import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import VibeViewer from './VibeViewer';

export default function VibeEditor() {
  const [prompt, setPrompt] = useState('');
  const [music, setMusic] = useState('');
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    try {
      const res = await axios.post('/api/website/generate', { prompt, music_url: music });
      setPage(res.data);
    } catch {
      alert('AI Vibe Engine encountered an error. Please try a different description.');
    }
    setLoading(false);
  };

  const publish = async () => {
    if (!page) return;
    setLoading(true);
    try {
      await axios.post(`/api/website/${page.id}/publish`);
      nav(`/website/${page.id}`);
    } catch {}
    setLoading(false);
  };

  return (
    <div className="page" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0D0D0F' }}>
      <header className="header" style={{ background: '#16161A', borderBottom: '1px solid #222' }}>
        <button className="btn-icon" onClick={() => nav(-1)}>←</button>
        <span className="header-title" style={{ color: '#fff' }}>Vibe Coding Engine</span>
        <button className="btn btn-p" onClick={publish} disabled={!page || loading}>Publish ✨</button>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Editor Sidebar */}
        <div style={{ width: 320, background: '#16161A', borderRight: '1px solid #222', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'block' }}>Describe the Vibe</label>
            <textarea 
              className="inp" 
              placeholder="e.g. A starry midnight sky with gold accents and our Goa trip photos..."
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              style={{ width: '100%', minHeight: 120, background: '#222', border: '1px solid #333', color: '#fff', borderRadius: 12, resize: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'block' }}>Background Music (Link)</label>
            <input 
              type="text" 
              className="inp" 
              placeholder="YouTube or Spotify link"
              value={music}
              onChange={e => setMusic(e.target.value)}
              style={{ width: '100%', background: '#222', border: '1px solid #333', color: '#fff' }}
            />
          </div>

          <button className="btn btn-p btn-full" onClick={generate} disabled={loading || !prompt.trim()}>
            {loading ? 'AI is Coding...' : 'Generate Website ✨'}
          </button>

          <div style={{ marginTop: 'auto', padding: 12, borderRadius: 12, border: '1px solid #222', background: '#0D0D0F', fontSize: '0.75rem', color: '#666' }}>
            💡 AI will use your shared Memories and Birthdays to personalize the content automatically.
          </div>
        </div>

        {/* Live Preview Area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'auto', background: '#000' }}>
          {page ? (
            <VibeViewer previewPage={page} />
          ) : (
            <div className="center" style={{ height: '100%', color: '#444' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '3rem', opacity: 0.3 }}>🎨</span>
                <p style={{ marginTop: 12 }}>Your generated website will appear here.</p>
              </div>
            </div>
          )}
          {loading && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div className="loader" style={{ marginBottom: 12 }} />
                <p style={{ color: '#fff' }}>Vibe Coding in progress...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
