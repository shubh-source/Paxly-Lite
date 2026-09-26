import { useState, useEffect } from 'react';

export default function GiftReveal({ onOpen, variant = 'fullscreen', title = "You've received a gift!" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const handleOpen = () => {
    if (isOpen) return;
    setIsOpen(true);
    // After animation finish
    setTimeout(() => {
      setIsRevealed(true);
      if (onOpen) onOpen();
    }, 1500);
  };

  if (isRevealed) return null;

  const containerStyle = variant === 'fullscreen' 
    ? { position: 'fixed', inset: 0, zIndex: 9999, background: '#0D0D0F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }
    : { position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(13,13,15,0.95)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div style={containerStyle} className="gift-container">
      <div style={{ textAlign: 'center', marginBottom: 40, animation: 'fadeIn 0.5s ease' }}>
        <h2 style={{ color: '#fff', fontSize: variant === 'fullscreen' ? '1.8rem' : '1.1rem', marginBottom: 8 }}>{title}</h2>
        <p style={{ color: '#888', fontSize: '0.85rem' }}>Tap the box to open your surprise</p>
      </div>

      <div 
        onClick={handleOpen}
        className={`gift-box ${isOpen ? 'open' : ''}`}
        style={{ cursor: 'pointer', position: 'relative', width: variant === 'fullscreen' ? 200 : 120, height: variant === 'fullscreen' ? 200 : 120 }}
      >
        <div className="gift-lid"></div>
        <div className="gift-container-side"></div>
        <div className="gift-ribbon-v"></div>
        <div className="gift-ribbon-h"></div>
      </div>

      {isOpen && <div className="confetti-explosion" />}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

        .gift-box {
          transform-style: preserve-3d;
          transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .gift-box:hover:not(.open) { transform: scale(1.05) rotate(2deg); }
        .gift-box.open { transform: scale(1.1) translateY(20px); }

        .gift-container-side {
          position: absolute; inset: 0;
          background: #C9A96E;
          border: 2px solid #B08D4B;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        .gift-lid {
          position: absolute; 
          top: -10px; left: -5%; width: 110%; height: 30px;
          background: #D4B982;
          border: 2px solid #B08D4B;
          border-radius: 4px;
          z-index: 2;
          transition: all 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        .open .gift-lid {
          transform: translateY(-150px) rotate(-15deg) scale(0.8);
          opacity: 0;
        }

        .gift-ribbon-v {
          position: absolute; left: 45%; width: 10%; height: 100%;
          background: #8B0000;
          z-index: 1;
        }
        .gift-ribbon-h {
          position: absolute; top: 45%; width: 100%; height: 10%;
          background: #8B0000;
          z-index: 1;
        }

        .confetti-explosion {
          position: absolute;
          width: 0; height: 0;
          box-shadow: 
            20px -50px 0 2px #C9A96E,
            -30px -40px 0 2px #fff,
            40px -20px 0 2px #8B0000,
            -50px -10px 0 2px #C9A96E,
            60px 20px 0 2px #fff,
            -70px 40px 0 2px #8B0000;
          animation: explode 1s ease-out forwards;
        }

        @keyframes explode {
          0% { transform: scale(0); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: scale(5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
