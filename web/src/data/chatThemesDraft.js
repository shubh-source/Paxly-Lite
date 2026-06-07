export const CHAT_THEMES = {
  aurora_premium: {
    name: 'Aurora Ultra',
    bg: 'linear-gradient(200deg, #0b132b, #1c2541, #3a506b, #0b132b)',
    bgAnimation: 'auroraAnim 15s ease infinite',
    bubbleMe: 'rgba(92, 192, 186, 0.4)',
    textMe: '#e0fbfc',
    bubbleOther: 'rgba(255, 255, 255, 0.05)',
    textOther: '#e0fbfc',
    accent: '#5cc0ba',
    borderMe: '1px solid rgba(92, 192, 186, 0.6)',
    borderOther: '1px solid rgba(255, 255, 255, 0.1)',
    backdropBlur: 'blur(16px)',
    elements: 'stars',
    premium: true
  },

  abyss_glass: {
    name: 'Abyss Glass',
    bg: '#050505',
    bgImage: 'radial-gradient(circle at 50% 120%, rgba(120,0,255,0.15), rgba(0,0,0,1))',
    bubbleMe: 'rgba(255,255,255,0.08)',
    textMe: '#fff',
    bubbleOther: 'rgba(255,255,255,0.03)',
    textOther: '#ccc',
    accent: '#7800ff',
    borderMe: '1px solid rgba(255,255,255,0.2)',
    borderOther: '1px solid rgba(255,255,255,0.05)',
    backdropBlur: 'blur(20px)',
    elements: 'bokeh',
    boxShadowMe: '0 8px 32px rgba(120, 0, 255, 0.2)',
    premium: true
  },

  cyber_neo: {
    name: 'Cyber Neo',
    bg: '#090014',
    bgImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.03) 2px, rgba(0,255,255,0.03) 4px)',
    bubbleMe: 'rgba(255, 0, 85, 0.15)',
    textMe: '#ff0055',
    bubbleOther: 'rgba(0, 255, 255, 0.05)',
    textOther: '#00ffff',
    accent: '#ff0055',
    borderMe: '1px solid #ff0055',
    borderOther: '1px solid rgba(0, 255, 255, 0.3)',
    boxShadowMe: '0 0 15px rgba(255,0,85,0.4)',
    boxShadowOther: '0 0 10px rgba(0,255,255,0.1)',
    elements: 'neon-grid',
    premium: true
  },

  golden_elegance: {
    name: 'Golden Elegance',
    bg: 'radial-gradient(circle at top right, #1a1610, #0a0805, #000000)',
    bubbleMe: 'linear-gradient(135deg, rgba(212,175,55,0.8), rgba(184,134,11,0.9))',
    textMe: '#000',
    bubbleOther: 'rgba(255,255,255,0.04)',
    textOther: '#e8e8e8',
    accent: '#D4AF37',
    borderMe: '1px solid #ffd700',
    borderOther: '1px solid rgba(212,175,55,0.2)',
    boxShadowMe: '0 10px 25px rgba(212,175,55,0.3)',
    elements: 'fireflies',
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
