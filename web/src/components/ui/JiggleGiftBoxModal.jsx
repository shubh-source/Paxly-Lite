import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from './Icons';
import api from '../../services/api';

const CONFETTI_COLORS = ['#C9A96E', '#FF4D6D', '#FFB703', '#A484C2', '#FFFFFF', '#06D6A0'];

export default function JiggleGiftBoxModal({ note, onClose, onOpened }) {
  const nav = useNavigate();
  const [phase, setPhase] = useState('idle'); // 'idle' | 'opening' | 'revealed'
  const [confetti, setConfetti] = useState([]);

  useEffect(() => {
    // Generate burst particles ahead of time
    const pieces = Array.from({ length: 42 }).map((_, i) => {
      const angle = (i / 42) * 360 + (Math.random() * 20 - 10);
      const rad = (angle * Math.PI) / 180;
      const dist = 90 + Math.random() * 160;
      const x = Math.cos(rad) * dist;
      const y = Math.sin(rad) * dist - 30; // slightly upward bias
      const rot = Math.random() * 720 - 360;
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      const size = 6 + Math.random() * 6;
      const isHeart = i % 4 === 0;
      return { id: i, x, y, rot, color, size, isHeart };
    });
    setConfetti(pieces);
  }, []);

  const handleOpenGift = async () => {
    if (phase !== 'idle') return;
    setPhase('opening');

    try {
      if (navigator.vibrate) {
        navigator.vibrate([60, 40, 90, 40, 140]);
      }
    } catch {}

    // Mark as opened in backend
    if (note?.id) {
      try {
        await api.post(`/notes/${note.id}/open`);
      } catch (err) {
        console.error('Failed to mark note opened:', err);
      }
    }

    setTimeout(() => {
      setPhase('revealed');
      if (onOpened && note?.id) {
        onOpened(note.id);
      }
    }, 900);
  };

  const handleKeep = () => {
    if (onClose) onClose();
  };

  const handleReply = () => {
    if (onClose) onClose();
    nav('/notes');
  };

  if (!note) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      background: 'rgba(8, 8, 12, 0.88)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      overflow: 'hidden'
    }}>
      {/* Ambient background glows */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 380,
        height: 380,
        background: 'radial-gradient(circle, rgba(201, 169, 110, 0.22) 0%, rgba(164, 132, 194, 0.12) 50%, transparent 75%)',
        filter: 'blur(60px)',
        pointerEvents: 'none'
      }} />

      {/* Close button in top-right corner */}
      <button
        onClick={onClose}
        title="Close"
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          width: 42,
          height: 42,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: 'var(--muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          transition: 'all 0.2s'
        }}
      >
        <Icons.Close size={20} color="#fff" />
      </button>

      {/* Main Container */}
      <div style={{
        width: '100%',
        maxWidth: 440,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
      }}>
        {phase !== 'revealed' ? (
          <>
            {/* Header info banner */}
            <div style={{ marginBottom: 28, animation: 'fadeInDown 0.6s ease' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(201,169,110,0.2) 0%, rgba(164,132,194,0.2) 100%)',
                border: '1px solid rgba(201,169,110,0.4)',
                color: 'var(--accent)',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                marginBottom: 12
              }}>
                <Icons.Sparkles size={14} color="var(--accent)" /> SOMETHING SPECIAL FOR YOU
              </div>

              <h2 style={{
                margin: '0 0 8px',
                fontSize: '1.9rem',
                fontWeight: 800,
                color: '#fff',
                letterSpacing: '-0.5px',
                lineHeight: 1.2
              }}>
                A Love Surprise Unlocked!
              </h2>

              <p style={{
                margin: 0,
                fontSize: '0.92rem',
                color: 'rgba(255, 255, 255, 0.7)',
                lineHeight: 1.4
              }}>
                <strong style={{ color: 'var(--accent)' }}>{note.sender_name || 'Your partner'}</strong> left a secret love note for you.
              </p>
            </div>

            {/* Interactive Jiggling 3D Gift Box */}
            <div
              onClick={handleOpenGift}
              className={`gift-stage ${phase === 'opening' ? 'stage-opening' : 'stage-idle'}`}
              style={{
                position: 'relative',
                width: 200,
                height: 200,
                margin: '10px auto 26px',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              {/* Pulsing ground glow shadow */}
              <div style={{
                position: 'absolute',
                bottom: 4,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 140,
                height: 24,
                background: 'radial-gradient(ellipse, rgba(201, 169, 110, 0.45) 0%, transparent 70%)',
                borderRadius: '50%',
                filter: 'blur(6px)',
                animation: 'pulseShadow 1.6s ease-in-out infinite'
              }} />

              {/* The Jiggling Gift Box */}
              <div className={`gift-wrapper ${phase === 'opening' ? 'shaking' : 'jiggling'}`}>
                {/* Gift Lid with Ribbon & Bow */}
                <div className="gift-lid">
                  {/* Satin Bow on Top */}
                  <div className="gift-bow">
                    <div className="bow-loop left" />
                    <div className="bow-knot" />
                    <div className="bow-loop right" />
                  </div>
                  {/* Lid Ribbon Cross */}
                  <div className="ribbon-vertical-lid" />
                </div>

                {/* Gift Box Body */}
                <div className="gift-body">
                  <div className="ribbon-vertical-body" />
                  <div className="ribbon-horizontal-body" />
                  <div className="box-shine" />
                </div>
              </div>

              {/* Confetti Explosion on opening */}
              {phase === 'opening' && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', pointerEvents: 'none' }}>
                  {confetti.map(p => (
                    <div
                      key={p.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: p.size,
                        height: p.isHeart ? p.size : p.size * 1.5,
                        background: p.isHeart ? 'transparent' : p.color,
                        borderRadius: p.isHeart ? '0' : '2px',
                        transform: `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`,
                        transition: 'all 0.8s cubic-bezier(0.12, 0.8, 0.32, 1)',
                        opacity: 0,
                        animation: 'confettiFade 0.9s ease-out forwards'
                      }}
                    >
                      {p.isHeart && <Icons.Heart size={p.size + 6} color={p.color} fill={p.color} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Instruction button */}
            <button
              onClick={handleOpenGift}
              className="btn btn-p"
              style={{
                padding: '14px 28px',
                borderRadius: 20,
                fontSize: '0.95rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 8px 25px rgba(201, 169, 110, 0.35)',
                cursor: 'pointer'
              }}
            >
              <Icons.Gift size={20} color="#000" /> Tap Box to Unwrap
            </button>
          </>
        ) : (
          /* Unboxed Revealed Love Note Card */
          <div style={{
            width: '100%',
            background: 'linear-gradient(145deg, rgba(30, 26, 38, 0.95) 0%, rgba(18, 16, 24, 0.98) 100%)',
            border: '1px solid rgba(201, 169, 110, 0.4)',
            borderRadius: 32,
            padding: '32px 26px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
            animation: 'cardSlideUp 0.65s cubic-bezier(0.18, 0.9, 0.28, 1)',
            position: 'relative'
          }}>
            {/* Top decorative mood icon */}
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '24px',
              background: 'linear-gradient(135deg, rgba(201, 169, 110, 0.25) 0%, rgba(164, 132, 194, 0.2) 100%)',
              border: '1px solid rgba(201, 169, 110, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '-56px auto 20px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.4)'
            }}>
              <Icons.LoveNote size={36} color="var(--accent)" />
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--accent)',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              marginBottom: 10
            }}>
              <Icons.LoveNote size={14} color="var(--accent)" /> LOVE NOTE UNLOCKED
            </div>

            <h3 style={{
              margin: '0 0 16px',
              fontSize: '1.45rem',
              fontWeight: 800,
              color: '#fff',
              lineHeight: 1.3
            }}>
              {note.title || 'Special Note for You'}
            </h3>

            {/* Note Parchment Body */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.035)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 20,
              padding: '22px 20px',
              marginBottom: 24,
              textAlign: 'left',
              maxHeight: 220,
              overflowY: 'auto'
            }}>
              <p style={{
                margin: 0,
                color: 'rgba(255, 255, 255, 0.92)',
                fontSize: '1.02rem',
                lineHeight: 1.6,
                fontFamily: 'var(--font-b, serif)',
                whiteSpace: 'pre-wrap'
              }}>
                {note.content}
              </p>
            </div>

            {/* Sender Sign-off */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 20,
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: 20
            }}>
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Written with love by</span>
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent)', fontSize: '0.95rem' }}>{note.sender_name || 'Your partner'}</p>
              </div>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'rgba(201,169,110,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icons.Heart size={18} color="var(--accent)" fill="var(--accent)" />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleKeep}
                className="btn btn-p"
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: 16,
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <Icons.Sparkles size={16} color="#000" /> Keep in Notes
              </button>
              <button
                onClick={handleReply}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: 16,
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <Icons.LoveNote size={16} color="#fff" /> Reply Back
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Styles for Jiggling & Unboxing Animation */}
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes cardSlideUp {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes pulseShadow {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.5; }
          50% { transform: translateX(-50%) scale(1.18); opacity: 0.8; }
        }

        /* 🎀 JIGGLE ANIMATION 🎀 */
        @keyframes jiggleBox {
          0%, 100% {
            transform: rotate(0deg) scale(1);
          }
          15% {
            transform: rotate(-6deg) scale(1.06) translateY(-4px);
          }
          30% {
            transform: rotate(6deg) scale(1.06) translateY(-4px);
          }
          45% {
            transform: rotate(-4deg) scale(1.03) translateY(-2px);
          }
          60% {
            transform: rotate(4deg) scale(1.03) translateY(-2px);
          }
          75% {
            transform: rotate(-2deg) scale(1.01);
          }
          90% {
            transform: rotate(2deg) scale(1.01);
          }
        }

        @keyframes excitedShake {
          0%, 100% { transform: rotate(0deg) scale(1.05); }
          20% { transform: rotate(-10deg) scale(1.12); }
          40% { transform: rotate(10deg) scale(1.12); }
          60% { transform: rotate(-12deg) scale(1.15); }
          80% { transform: rotate(12deg) scale(1.15); }
        }

        @keyframes lidFly {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-160px) rotate(-24deg) scale(0.85); opacity: 0; }
        }

        @keyframes confettiFade {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }

        .gift-wrapper.jiggling {
          animation: jiggleBox 1.6s ease-in-out infinite;
          transform-origin: bottom center;
        }

        .gift-wrapper.shaking {
          animation: excitedShake 0.4s ease-in-out infinite;
          transform-origin: bottom center;
        }

        .gift-stage:hover .gift-wrapper.jiggling {
          animation-duration: 1.1s;
        }

        /* Gift Box Geometry */
        .gift-wrapper {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          padding-bottom: 12px;
        }

        .gift-lid {
          position: relative;
          width: 140px;
          height: 36px;
          background: linear-gradient(135deg, #a4133c 0%, #800f2f 60%, #590d22 100%);
          border-radius: 8px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.3);
          border: 1px solid rgba(255, 255, 255, 0.15);
          z-index: 3;
          margin-bottom: -4px;
        }

        .stage-opening .gift-lid {
          animation: lidFly 0.8s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
        }

        .ribbon-vertical-lid {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 24px;
          height: 100%;
          background: linear-gradient(90deg, #b08d4b 0%, #ffd166 50%, #c9a96e 100%);
          box-shadow: 0 0 6px rgba(201, 169, 110, 0.4);
        }

        /* Bow on top */
        .gift-bow {
          position: absolute;
          top: -24px;
          left: 50%;
          transform: translateX(-50%);
          width: 54px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .bow-knot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffe399;
          border: 2px solid #b08d4b;
          z-index: 2;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }

        .bow-loop {
          position: absolute;
          top: 2px;
          width: 24px;
          height: 16px;
          border-radius: 50%;
          border: 3px solid #c9a96e;
          background: linear-gradient(135deg, #ffd166 0%, #b08d4b 100%);
        }

        .bow-loop.left {
          left: 2px;
          transform: rotate(-25deg);
        }

        .bow-loop.right {
          right: 2px;
          transform: rotate(25deg);
        }

        .gift-body {
          position: relative;
          width: 126px;
          height: 110px;
          background: linear-gradient(145deg, #800f2f 0%, #590d22 100%);
          border-radius: 6px 6px 12px 12px;
          box-shadow: 0 16px 36px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15);
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          z-index: 2;
        }

        .ribbon-vertical-body {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 24px;
          height: 100%;
          background: linear-gradient(90deg, #b08d4b 0%, #ffd166 50%, #c9a96e 100%);
          box-shadow: 0 0 8px rgba(201, 169, 110, 0.3);
        }

        .ribbon-horizontal-body {
          position: absolute;
          top: 38%;
          left: 0;
          width: 100%;
          height: 22px;
          background: linear-gradient(180deg, #ffd166 0%, #b08d4b 100%);
          box-shadow: 0 0 6px rgba(201, 169, 110, 0.3);
        }

        .box-shine {
          position: absolute;
          top: 0;
          left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18), transparent);
          transform: skewX(-25deg);
          animation: glintSweep 3.2s infinite;
        }

        @keyframes glintSweep {
          0% { left: -100%; }
          30% { left: 160%; }
          100% { left: 160%; }
        }
      `}</style>
    </div>
  );
}
