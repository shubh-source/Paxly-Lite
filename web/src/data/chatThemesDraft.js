export const CHAT_THEMES = {
  neumorphic_3d: {
    name: '3D Neumorphic Dark',
    bg: '#1a1b1e',
    bubbleMe: 'linear-gradient(145deg, #1c1d20, #17181a)',
    textMe: '#fff',
    bubbleOther: 'linear-gradient(145deg, #1c1d20, #17181a)',
    textOther: '#fff',
    accent: '#00f0ff',
    borderMe: 'none',
    borderOther: 'none',
    boxShadowMe: '5px 5px 10px #111112, -5px -5px 10px #23252a, inset 1px 1px 2px rgba(255,255,255,0.05)',
    boxShadowOther: '5px 5px 10px #111112, -5px -5px 10px #23252a, inset 1px 1px 2px rgba(255,255,255,0.05)',
    elements: '3d_cubes',
    premium: true
  },

  glass_3d: {
    name: '3D Frost Glass',
    bg: 'linear-gradient(to right bottom, #111, #222)',
    bubbleMe: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%)',
    textMe: '#fff',
    bubbleOther: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%)',
    textOther: '#fff',
    accent: '#ff007f',
    borderMe: '1px solid rgba(255,255,255,0.18)',
    borderOther: '1px solid rgba(255,255,255,0.18)',
    backdropBlur: 'blur(20px)',
    boxShadowMe: '0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 2px 2px rgba(255,255,255,0.2), inset 0 -2px 5px rgba(0,0,0,0.5)',
    boxShadowOther: '0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 2px 2px rgba(255,255,255,0.2), inset 0 -2px 5px rgba(0,0,0,0.5)',
    elements: '3d_spheres',
    premium: true
  },

  metal_3d: {
    name: '3D Solid Gold',
    bg: '#0a0a0a',
    bubbleMe: 'linear-gradient(to bottom, #f9d976 0%, #e9b646 20%, #c19227 50%, #f9d976 80%, #fff 100%)',
    textMe: '#332000',
    bubbleOther: 'linear-gradient(to bottom, #444 0%, #222 50%, #111 100%)',
    textOther: '#eee',
    accent: '#f9d976',
    borderMe: 'none',
    borderOther: '1px solid rgba(255,255,255,0.1)',
    boxShadowMe: '0 10px 20px rgba(0,0,0,0.6), inset 0 3px 5px rgba(255,255,255,0.9), inset 0 -3px 5px rgba(0,0,0,0.5)',
    boxShadowOther: '0 10px 20px rgba(0,0,0,0.6), inset 0 2px 3px rgba(255,255,255,0.2), inset 0 -3px 5px rgba(0,0,0,0.8)',
    elements: '3d_particles',
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
