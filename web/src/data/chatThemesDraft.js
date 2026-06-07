export const CHAT_THEMES = {
  velvet_rose: {
    name: '3D Velvet Rose',
    bg: '#1a0b0e',
    bubbleMe: 'linear-gradient(145deg, #4a0d17, #2d080e)',
    textMe: '#ffd1d9',
    bubbleOther: 'linear-gradient(145deg, #2b1115, #1f0b0d)',
    textOther: '#ffebef',
    accent: '#ff4b72',
    borderMe: '1px solid rgba(255, 75, 114, 0.2)',
    borderOther: '1px solid rgba(255, 255, 255, 0.05)',
    boxShadowMe: '0 10px 20px rgba(0,0,0,0.6), inset 0 2px 5px rgba(255,75,114,0.3), inset 0 -3px 8px rgba(0,0,0,0.8)',
    boxShadowOther: '0 10px 20px rgba(0,0,0,0.6), inset 0 2px 3px rgba(255,255,255,0.05), inset 0 -3px 8px rgba(0,0,0,0.8)',
    elements: '3d_petals',
    premium: true
  },

  crystal_love: {
    name: '3D Crystal Love',
    bg: 'radial-gradient(circle at top right, #2a1124, #110515, #000000)',
    bubbleMe: 'linear-gradient(135deg, rgba(255,182,193,0.15) 0%, rgba(255,105,180,0.02) 100%)',
    textMe: '#fff',
    bubbleOther: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 100%)',
    textOther: '#eee',
    accent: '#ff69b4',
    borderMe: '1px solid rgba(255,182,193,0.3)',
    borderOther: '1px solid rgba(255,255,255,0.15)',
    backdropBlur: 'blur(24px)',
    boxShadowMe: '0 12px 35px rgba(255, 105, 180, 0.15), inset 0 3px 5px rgba(255,255,255,0.4), inset 0 -3px 8px rgba(0,0,0,0.5)',
    boxShadowOther: '0 12px 35px rgba(0, 0, 0, 0.4), inset 0 2px 4px rgba(255,255,255,0.2), inset 0 -3px 8px rgba(0,0,0,0.5)',
    elements: '3d_crystal_hearts',
    premium: true
  },

  golden_anniversary: {
    name: '3D Diamond Gold',
    bg: '#0a0a0a',
    bubbleMe: 'linear-gradient(to bottom, #f9d976 0%, #e9b646 20%, #c19227 50%, #f9d976 80%, #fff 100%)',
    textMe: '#332000',
    bubbleOther: 'linear-gradient(145deg, #222, #111)',
    textOther: '#eee',
    accent: '#f9d976',
    borderMe: 'none',
    borderOther: '1px solid rgba(212, 175, 55, 0.3)',
    boxShadowMe: '0 15px 25px rgba(0,0,0,0.8), inset 0 4px 6px rgba(255,255,255,0.9), inset 0 -4px 6px rgba(0,0,0,0.6)',
    boxShadowOther: '0 10px 20px rgba(0,0,0,0.6), inset 0 2px 3px rgba(255,255,255,0.1), inset 0 -3px 5px rgba(0,0,0,0.8)',
    elements: '3d_rings',
    premium: true
  },
  
  classic: {
    name: 'Classic Dark',
    bg: '#0D0D0F',
    bubbleMe: '#C9A96E',
    textMe: '#0D0D0F',
    bubbleOther: 'rgba(255,255,255,0.06)',
    textOther: '#e8e8e8',
    accent: '#C9A96E',
    elements: 'bokeh'
  }
};
