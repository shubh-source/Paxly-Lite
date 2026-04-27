import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getMySite, openSite } from '../../services/api';
import GiftReveal from '../../components/ui/GiftReveal';
export default function VibeViewer({ previewPage }) {
  const { id } = useParams();
  const [page, setPage] = useState(previewPage || null);
  const [loading, setLoading] = useState(!previewPage);
  useEffect(() => {
    if (!previewPage && id) {
      getMySite().then(data => setPage(data)).finally(() => setLoading(false));
    }
  }, [id, previewPage]);
  if (loading) return <div className="page center"><div className="loader" /></div>;
  if (!page) return <div className="page center">Website not found.</div>;
  const onOpen = async () => {
    try {
      await openSite(page.id);
      setPage({ ...page, is_opened: true });
    } catch { }
  };
  const { blueprint, music_url, is_opened } = page;
  const { theme_name, colors, font_pair, animations, blocks } = blueprint;
  // Render components based on block type
  const renderBlock = (block, idx) => {
    switch (block.type) {
      case 'hero':
        return (
          <section key={idx} style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 40, position: 'relative' }}>
            <h1 style={{ fontSize: '4rem', fontFamily: font_pair.heading, color: colors.accent, marginBottom: 20, textShadow: `0 0 20px ${colors.accent}44` }}>
              {block.content.title}
            </h1>
            <p style={{ fontSize: '1.2rem', color: colors.text, opacity: 0.8, maxWidth: 600 }}>{block.content.subtitle}</p>
            <div className={`particle-${animations}`} />
          </section>
        );
      case 'count_up':
        return (
          <section key={idx} style={{ padding: '80px 20px', textAlign: 'center', background: `${colors.bg}44` }}>
            <p style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 2, color: colors.accent, marginBottom: 12 }}>{block.content.label}</p>
            <div style={{ fontSize: '5rem', fontWeight: 800, fontFamily: font_pair.heading, color: colors.text }}>1,432</div>
          </section>
        );
      case 'letter':
        return (
          <section key={idx} style={{ padding: '100px 40px', display: 'flex', justifyContent: 'center' }}>
            <div className="glass-card" style={{ maxWidth: 700, padding: 40, border: `1px solid ${colors.accent}22`, background: `${colors.secondary}11`, backdropFilter: 'blur(10px)', borderRadius: 24 }}>
              <p style={{ fontSize: '1.1rem', lineHeight: 2, color: colors.text, whiteSpace: 'pre-wrap', fontFamily: font_pair.body }}>
                {block.content.body}
              </p>
            </div>
          </section>
        );
      case 'memory_grid':
        return (
          <section key={idx} style={{ padding: '80px 20px' }}>
            <h2 style={{ textAlign: 'center', marginBottom: 40, color: colors.accent, fontFamily: font_pair.heading }}>Our Moments</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="glass-card" style={{ height: 300, background: `${colors.secondary}22`, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
                  📸
                </div>
              ))}
            </div>
          </section>
        );
      default:
        return null;
    }
  };
  return (
    <>
      {!is_opened && <GiftReveal onOpen={onOpen} variant="fullscreen" title={`A special surprise from your partner!`} />}
      <div className={`vibe-theme-${animations}`} style={{
        background: colors.bg,
        color: colors.text,
        minHeight: '100vh',
        fontFamily: font_pair.body,
        scrollBehavior: 'smooth',
        visibility: !is_opened ? 'hidden' : 'visible'
      }}>
        {/* Background Ambience */}
        <div style={{ position: 'fixed', inset: 0, background: `radial-gradient(circle at top right, ${colors.primary}22, transparent), radial-gradient(circle at bottom left, ${colors.secondary}22, transparent)`, pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          {blocks.map((block, i) => renderBlock(block, i))}
        </div>
        <footer style={{ padding: '60px 20px', textAlign: 'center', opacity: 0.5, fontSize: '0.8rem' }}>
          Built with ❤️ on Vlynxly · {theme_name} Theme
        </footer>
        {music_url && (
          <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 100 }}>
            <button className="glass-card" style={{ padding: '10px 20px', borderRadius: 99, border: `1px solid ${colors.accent}44`, color: colors.text }}>
              🎵 Playing your Vibe
            </button>
          </div>
        )}
        <style>{`
        .glass-card { transition: all 0.3s ease; }
        .glass-card:hover { transform: translateY(-5px); border-color: ${colors.accent}; }
        
        .vibe-theme-cinematic { animation: fadeIn 2s ease; }
        .vibe-theme-romantic { animation: pulseBg 10s infinite alternate; }
        
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulseBg { 
          from { background: ${colors.bg}; } 
          to { background: ${colors.primary}44; } 
        }
        .loader { border: 3px solid #222; border-top: 3px solid ${colors.accent}; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
        {/* Font Injection */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=${font_pair.heading.replace(/ /g, '+')}&family=${font_pair.body.replace(/ /g, '+')}&display=swap');
      `}</style>
      </div>
    </>
  );
}
