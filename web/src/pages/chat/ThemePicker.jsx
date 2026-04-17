import { useState } from 'react';
import { CHAT_THEMES } from '../../data/chatThemes';
import axios from 'axios';

export default function ThemePicker({ currentTheme, onSelect, onWallpaperUpdate, isPremium, onClose }) {
  const [loading, setLoading] = useState(false);

  const handleWallpaper = async (e) => {
    if (!isPremium) {
      alert("💎 This is a premium feature. Please upgrade to use custom wallpapers!");
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end' }}>
      <div 
        onClick={onClose} 
        style={{ position: 'absolute', inset: 0 }} 
      />
      <div style={{ position: 'relative', width: '100%', maxWidth: 500, margin: '0 auto', background: '#16161A', borderRadius: '24px 24px 0 0', padding: '24px 20px', animation: 'slideUp 0.3s ease-out' }}>
        <div style={{ width: 40, height: 4, background: '#333', borderRadius: 2, margin: '0 auto 20px' }} />
        <h3 style={{ marginBottom: 20 }}>Chat Themes</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          {Object.entries(CHAT_THEMES).map(([id, theme]) => (
            <div 
              key={id} 
              onClick={() => onSelect(id)}
              style={{ 
                cursor: 'pointer', textAlign: 'center', padding: 12, borderRadius: 12, 
                background: theme.bg, border: currentTheme === id ? `2px solid #fff` : '1px solid #333',
                minHeight: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center', transition: 'all 0.2s'
              }}
            >
               <div style={{ fontSize: '1.4rem' }}>✨</div>
               <span style={{ fontSize: '0.7rem', fontWeight: 600, color: theme.textMe || '#fff', marginTop: 4 }}>{theme.name}</span>
            </div>
          ))}

          {/* Custom Wallpaper Gated tile */}
          <div 
            style={{ 
              cursor: 'pointer', textAlign: 'center', padding: 12, borderRadius: 12, 
              background: '#222', border: '1px dashed #444', 
              minHeight: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative'
            }}
          >
             <label style={{ cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
               <input type="file" style={{ display: 'none' }} onChange={handleWallpaper} disabled={loading} />
               <span style={{ fontSize: '1.4rem' }}>🖼️</span>
               <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#888', marginTop: 4 }}>
                 {loading ? 'Uploading...' : 'Custom photo'}
               </span>
               {!isPremium && <span style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.8rem' }}>💎</span>}
             </label>
          </div>
        </div>

        <button className="btn btn-g btn-full" onClick={onClose}>Close</button>

        <style>{`
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `}</style>
      </div>
    </div>
  );
}
