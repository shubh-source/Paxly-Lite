import { useState, useEffect } from 'react';

const MOOD_DATA = {
  angry:   { aura: 'rgba(255, 0, 0, 0.4)',  anim: 'shake 0.5s infinite', emoji: '😤' },
  loving:  { aura: 'rgba(255, 105, 180, 0.4)', anim: 'bounce 1s infinite', emoji: '😍' },
  happy:   { aura: 'rgba(255, 215, 0, 0.3)',   anim: 'float 2s infinite',  emoji: '😊' },
  laughing: { aura: 'rgba(50, 205, 50, 0.3)',  anim: 'shake 0.3s infinite', emoji: '🤣' },
  bored:   { aura: 'rgba(128, 128, 128, 0.3)', anim: 'none',                emoji: '😴' }
};

export default function DynamicPresence({ partner, state, mood }) {
  if (!state || state === 'idle') return null;

  const activeMood = MOOD_DATA[mood] || null;

  const getEmoji = () => {
    if (state === 'typing') return '💭';
    if (state === 'watching') return '👀';
    if (activeMood && state !== 'typing') return activeMood.emoji; // Mood emoji if not typing
    return null;
  };

  return (
    <div style={{ 
      position: 'absolute', 
      bottom: 60, 
      left: 10, 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      zIndex: 10,
      animation: 'slideUp 0.4s ease-out'
    }}>
      {/* Thought Bubble / Status */}
      {getEmoji() && (
        <div style={{ 
          background: '#fff', 
          color: '#000', 
          padding: '4px 8px', 
          borderRadius: 12, 
          fontSize: '0.8rem', 
          marginBottom: -4, 
          marginLeft: 20,
          boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
          zIndex: 11,
          animation: 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          {state === 'typing' ? (
             <div style={{ display: 'flex', gap: 2 }}>
               <span className="dot" />
               <span className="dot" style={{ animationDelay: '0.2s' }} />
               <span className="dot" style={{ animationDelay: '0.4s' }} />
             </div>
          ) : getEmoji()}
        </div>
      )}

      {/* Waist-up Style Character */}
      <div style={{ 
        width: 48, 
        height: 48, 
        borderRadius: '50% 50% 12px 12px', 
        overflow: 'hidden', 
        border: `3px solid ${activeMood?.aura || 'var(--accent)'}`,
        background: 'var(--s1)',
        boxShadow: activeMood ? `0 0 20px ${activeMood.aura}` : '0 4px 15px rgba(0,0,0,0.3)',
        position: 'relative',
        transform: state === 'peeking' ? 'translateY(10px)' : 'none',
        animation: activeMood?.anim || 'none',
        transition: 'all 0.3s'
      }}>
        {partner?.avatar_url ? (
          <img 
             src={partner.avatar_url} 
             style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
             alt="Partner presence" 
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--accent)' }}>
            {partner?.name?.[0]?.toUpperCase()}
          </div>
        )}
        
        {/* 'Watching' Overlay Effect */}
        {state === 'watching' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--accent-rgb), 0.2)', animation: 'pulse 1.5s infinite' }} />}
      </div>

      <style>{`
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes pop { from { transform: scale(0); } to { transform: scale(1); } }
        @keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.5; } }
        .dot { 
          width: 4px; height: 4px; border-radius: 50%; background: #000; 
          animation: bounce 0.6s infinite alternate; 
        }
        @keyframes bounce { to { transform: translateY(-3px); } }
        @keyframes shake { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      `}</style>
    </div>
  );
}
