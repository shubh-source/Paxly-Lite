import { useState } from 'react';

const REACTIONS = [
  { id: 'happy', emoji: '😊' },
  { id: 'loving', emoji: '😍' },
  { id: 'angry', emoji: '😤' },
  { id: 'laughing', emoji: '🤣' },
  { id: 'bored', emoji: '😴' }
];

export default function ReactionPicker({ currentMood, onSelect }) {
  return (
    <div style={{ 
      display: 'flex', 
      gap: 10, 
      padding: '8px 12px', 
      background: 'rgba(0,0,0,0.3)', 
      backdropFilter: 'blur(10px)',
      borderRadius: 100,
      border: '1px solid rgba(255,255,255,0.05)',
      width: 'fit-content',
      margin: '0 auto 8px',
      animation: 'fadeIn 0.5s ease-out'
    }}>
      {REACTIONS.map(r => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.2rem',
            cursor: 'pointer',
            padding: 4,
            transition: 'all 0.2s',
            transform: currentMood === r.id ? 'scale(1.3)' : 'scale(1)',
            filter: currentMood === r.id ? 'none' : 'grayscale(0.6) opacity(0.6)',
            position: 'relative'
          }}
        >
          {r.emoji}
          {currentMood === r.id && (
            <div style={{ position: 'absolute', inset: -2, border: '1px solid var(--accent)', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
          )}
        </button>
      ))}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 0.5; transform: scale(1); } 100% { opacity: 0; transform: scale(1.6); } }
      `}</style>
    </div>
  );
}
