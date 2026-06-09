import { useState } from 'react';
import { CHAT_THEMES } from '../../data/chatThemes';
import { Icons } from '../../components/ui/Icons';
import axios from 'axios';

const THEME_ICONS = {
  classic:    { emoji: '✨', desc: 'Timeless gold' },
  lavender:   { emoji: '💜', desc: 'Soft purple haze' },
  rose:       { emoji: '🌹', desc: 'Warm rose glow' },
  ocean:      { emoji: '🌊', desc: 'Deep blue calm' },
  cyber:      { emoji: '⚡', desc: 'Electric vibes' },
  midnight:   { emoji: '🌸', desc: 'Dark romance' },
  arctic:     { emoji: '❄️', desc: 'Icy blue cool' },
  sunset:     { emoji: '🌅', desc: 'Warm amber dusk' },
  velvet:     { emoji: '☕', desc: 'Cocoa warmth' },
  galaxy:     { emoji: '🌌', desc: 'Deep space vibes' },
  // Love themes
  cherry:     { emoji: '🌸', desc: 'Cherry blossom love' },
  heartbeat:  { emoji: '❤️', desc: 'Heartbeat rush' },
  pastel:     { emoji: '💝', desc: 'Soft pastel love' },
  moonlit:    { emoji: '🌙', desc: 'Moonlit romance' },
  loveblush:  { emoji: '💕', desc: 'Sweet blush' },
  // 3D Premium Themes
  velvet_rose:        { emoji: '🌹', desc: 'Velvet Rose 3D' },
  crystal_love:       { emoji: '💖', desc: 'Crystal Love 3D' },
  golden_anniversary: { emoji: '💍', desc: 'Diamond Gold 3D' },
  midnight_starlight: { emoji: '🌌', desc: 'Midnight Stars 3D' },
  ocean_breeze:       { emoji: '🌊', desc: 'Ocean Breeze 3D' },
  cozy_fireplace:     { emoji: '🔥', desc: 'Cozy Fireplace 3D' },
};

export default function ThemePicker({ currentTheme, onSelect, onWallpaperUpdate, isPremium, onClose, onPremiumRequired }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('normal');

  const handleWallpaper = async (e) => {
    if (!isPremium) {
      if (onPremiumRequired) onPremiumRequired();
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post('/api/chat/space/wallpaper', formData);
      onWallpaperUpdate(res.data.chat_wallpaper);
    } catch (err) {
      alert(err.response?.data?.detail || "Error uploading wallpaper.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 560, margin: '0 auto',
        background: 'rgba(18,14,12,0.95)',
        backdropFilter: 'blur(30px)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '28px 28px 0 0',
        padding: '24px 20px 32px',
        animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)'
      }}>
        {/* Handle bar */}
        <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 20px' }} />

        <h3 style={{ marginBottom: 4, fontSize: '1.1rem', fontWeight: 700, color: '#fff', textAlign: 'center' }}>Chat Themes</h3>
        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginBottom: 16 }}>Tap to apply instantly</p>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => setActiveTab('normal')}
            style={{
              flex: 1, padding: '10px', borderRadius: 12,
              background: activeTab === 'normal' ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: activeTab === 'normal' ? '#000' : '#fff',
              fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >Normal Themes</button>
          <button
            onClick={() => setActiveTab('premium')}
            style={{
              flex: 1, padding: '10px', borderRadius: 12,
              background: activeTab === 'premium' ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: activeTab === 'premium' ? '#000' : '#fff',
              fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}
        >Premium <span style={{ display: 'inline-flex', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><Icons.Diamond size={14} color="#00E5FF" /></span></button>
        </div>

        <div style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: 5 }}>
          
          {activeTab === 'normal' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
              {Object.entries(CHAT_THEMES)
                .filter(([id, theme]) => !theme.premium)
                .map(([id, theme]) => {
                const isActive = currentTheme === id;
                const icon = THEME_ICONS[id] || { emoji: '🎨', desc: '' };
                return (
                  <div
                    key={id}
                    onClick={() => onSelect(id)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 16,
                      background: theme.bg,
                      border: isActive ? '2px solid rgba(201,169,110,0.9)' : '1px solid rgba(255,255,255,0.07)',
                      minHeight: 88,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      transition: 'all 0.2s',
                      boxShadow: isActive ? '0 0 20px rgba(201,169,110,0.3)' : '0 2px 8px rgba(0,0,0,0.3)',
                      transform: isActive ? 'scale(1.04)' : 'scale(1)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ width: '60%', height: 10, borderRadius: 6, background: theme.bubbleMe, marginBottom: 2, alignSelf: 'flex-end', marginRight: 10 }} />
                    <div style={{ width: '45%', height: 10, borderRadius: 6, background: theme.bubbleOther || 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', marginLeft: 10 }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', marginTop: 6, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                      {icon.emoji} {theme.name}
                    </span>
                    {isActive && <div style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: '50%', background: '#C9A96E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: '#000', fontWeight: 900 }}>✓</div>}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'premium' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              {Object.entries(CHAT_THEMES)
                .filter(([id, theme]) => theme.premium)
                .map(([id, theme]) => {
                const isActive = currentTheme === id;
                const icon = THEME_ICONS[id] || { emoji: '🎨', desc: '' };
                return (
                  <div
                    key={id}
                    onClick={() => {
                      if (!isPremium) {
                        if (onPremiumRequired) onPremiumRequired();
                      } else {
                        onSelect(id);
                      }
                    }}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 16,
                      background: theme.bg,
                      border: isActive ? '2px solid rgba(201,169,110,0.9)' : '1px solid rgba(255,255,255,0.07)',
                      minHeight: 88,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      transition: 'all 0.2s',
                      boxShadow: isActive ? '0 0 20px rgba(201,169,110,0.3)' : '0 2px 8px rgba(0,0,0,0.3)',
                      transform: isActive ? 'scale(1.04)' : 'scale(1)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ width: '60%', height: 10, borderRadius: 6, background: theme.bubbleMe, marginBottom: 2, alignSelf: 'flex-end', marginRight: 10 }} />
                    <div style={{ width: '45%', height: 10, borderRadius: 6, background: theme.bubbleOther || 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', marginLeft: 10 }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', marginTop: 6, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                      {icon.emoji} {theme.name}
                    </span>
                    {isActive && <div style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: '50%', background: '#C9A96E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: '#000', fontWeight: 900 }}>✓</div>}
                    {!isPremium && <span style={{ position: 'absolute', top: 6, left: 6, display: 'inline-flex', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><Icons.Diamond size={12} color="#00E5FF" /></span>}
                  </div>
                );
              })}

              {/* Custom Wallpaper tile now in Premium tab */}
              <div style={{
                cursor: 'pointer', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)',
                minHeight: 88, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative'
              }}>
                <label style={{ cursor: 'pointer', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <input type="file" style={{ display: 'none' }} onChange={handleWallpaper} disabled={loading} />
                  <span style={{ fontSize: '1.4rem' }}>🖼️</span>
                  <span style={{ fontSize: '0.62rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                    {loading ? 'Uploading...' : 'Custom Photo'}
                  </span>
                  {!isPremium && <span style={{ position: 'absolute', top: 6, left: 6, display: 'inline-flex', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><Icons.Diamond size={12} color="#00E5FF" /></span>}
                </label>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '13px', borderRadius: 14,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.6)',
            fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
          }}
        >
          Close
        </button>

        <style>{`
          @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        `}</style>
      </div>
    </div>
  );
}
