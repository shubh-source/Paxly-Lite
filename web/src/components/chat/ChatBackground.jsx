import { useMemo } from 'react';

/* ─── Utility: stable random numbers per seed ─── */
function seededRands(count, seed = 42) {
  const arr = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    arr.push(s / 233280);
  }
  return arr;
}

/* ─── FLOATING HEARTS ─── */
function HeartsBackground({ color = '#ff6b9d' }) {
  const hearts = useMemo(() => seededRands(18, 11), []);
  const delays = useMemo(() => seededRands(18, 22), []);
  const sizes  = useMemo(() => seededRands(18, 33), []);
  return (
    <>
      <style>{`
        @keyframes floatHeart {
          0%   { transform: translateY(110vh) rotate(-15deg) scale(var(--s)); opacity: 0; }
          10%  { opacity: 0.7; }
          90%  { opacity: 0.5; }
          100% { transform: translateY(-10vh) rotate(20deg) scale(var(--s)); opacity: 0; }
        }
      `}</style>
      {hearts.map((r, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${r * 100}%`,
          bottom: '-10%',
          fontSize: `${12 + sizes[i] * 18}px`,
          opacity: 0,
          '--s': 0.6 + sizes[i] * 0.8,
          animation: `floatHeart ${6 + delays[i] * 8}s ${delays[i] * 5}s ease-in-out infinite`,
          pointerEvents: 'none',
          userSelect: 'none',
          filter: 'blur(0.3px)',
        }}>
          {i % 3 === 0 ? '❤️' : i % 3 === 1 ? '💕' : '🩷'}
        </div>
      ))}
    </>
  );
}

/* ─── FALLING PETALS ─── */
function PetalsBackground() {
  const petals = useMemo(() => seededRands(22, 44), []);
  const delays = useMemo(() => seededRands(22, 55), []);
  const sizes  = useMemo(() => seededRands(22, 66), []);
  return (
    <>
      <style>{`
        @keyframes fallPetal {
          0%   { transform: translateY(-8vh) translateX(0px) rotate(0deg); opacity: 0; }
          10%  { opacity: 0.8; }
          50%  { transform: translateY(50vh) translateX(30px) rotate(180deg); }
          90%  { opacity: 0.6; }
          100% { transform: translateY(105vh) translateX(-20px) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {petals.map((r, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${r * 100}%`,
          top: '-5%',
          fontSize: `${10 + sizes[i] * 14}px`,
          opacity: 0,
          animation: `fallPetal ${5 + delays[i] * 7}s ${delays[i] * 6}s linear infinite`,
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {i % 2 === 0 ? '🌸' : '🌺'}
        </div>
      ))}
    </>
  );
}

/* ─── TWINKLING STARS ─── */
function StarsBackground({ color = '#ffd700' }) {
  const stars = useMemo(() => seededRands(50, 77), []);
  const delays = useMemo(() => seededRands(50, 88), []);
  const sizes  = useMemo(() => seededRands(50, 99), []);
  return (
    <>
      <style>{`
        @keyframes twinkle {
          0%,100% { opacity: 0.1; transform: scale(0.8); }
          50%      { opacity: 1;   transform: scale(1.2); }
        }
        @keyframes shootingStar {
          0%   { transform: translateX(0) translateY(0) rotate(-30deg); opacity: 1; width: 2px; }
          100% { transform: translateX(200px) translateY(100px) rotate(-30deg); opacity: 0; width: 80px; }
        }
      `}</style>
      {stars.map((r, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${r * 100}%`,
          top: `${sizes[i] * 100}%`,
          width: `${2 + sizes[i] * 3}px`,
          height: `${2 + sizes[i] * 3}px`,
          borderRadius: '50%',
          background: i % 5 === 0 ? '#fff' : color,
          opacity: 0.1,
          animation: `twinkle ${1.5 + delays[i] * 3}s ${delays[i] * 2}s ease-in-out infinite`,
          pointerEvents: 'none',
          boxShadow: `0 0 ${4 + sizes[i] * 6}px ${color}`,
        }} />
      ))}
      {/* Shooting stars */}
      {[0, 1, 2].map(i => (
        <div key={`shoot-${i}`} style={{
          position: 'absolute',
          left: `${10 + i * 30}%`,
          top: `${5 + i * 12}%`,
          height: '1.5px',
          background: `linear-gradient(90deg, transparent, ${color})`,
          opacity: 0,
          animation: `shootingStar ${2}s ${i * 4 + delays[i * 5] * 8}s ease-in infinite`,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  );
}

/* ─── FIREFLIES ─── */
function FirefliesBackground({ color = '#c8b6ff' }) {
  const flies = useMemo(() => seededRands(20, 111), []);
  const delays = useMemo(() => seededRands(20, 222), []);
  return (
    <>
      <style>{`
        @keyframes fireflyFloat {
          0%   { transform: translate(0px, 0px); opacity: 0; }
          25%  { opacity: 0.9; }
          50%  { transform: translate(30px, -40px); opacity: 0.6; }
          75%  { opacity: 0.8; }
          100% { transform: translate(-20px, 30px); opacity: 0; }
        }
      `}</style>
      {flies.map((r, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${r * 95}%`,
          top: `${delays[i] * 90}%`,
          width: `${4 + delays[i] * 4}px`,
          height: `${4 + delays[i] * 4}px`,
          borderRadius: '50%',
          background: color,
          opacity: 0,
          animation: `fireflyFloat ${3 + delays[i] * 5}s ${r * 8}s ease-in-out infinite`,
          pointerEvents: 'none',
          boxShadow: `0 0 ${6 + delays[i] * 10}px ${color}, 0 0 ${12 + delays[i] * 16}px ${color}55`,
        }} />
      ))}
    </>
  );
}

/* ─── NEON GRID ─── */
function NeonGridBackground({ color = '#f0abfc' }) {
  return (
    <>
      <style>{`
        @keyframes gridPulse {
          0%,100% { opacity: 0.03; }
          50%      { opacity: 0.08; }
        }
        @keyframes scanLine {
          0%   { top: -5%; opacity: 0.6; }
          100% { top: 105%; opacity: 0; }
        }
      `}</style>
      {/* Vertical grid lines */}
      {[...Array(8)].map((_, i) => (
        <div key={`v${i}`} style={{
          position: 'absolute',
          left: `${(i + 1) * 12.5}%`,
          top: 0, bottom: 0,
          width: '1px',
          background: color,
          opacity: 0.04,
          animation: `gridPulse ${2 + i * 0.3}s ease-in-out infinite`,
          pointerEvents: 'none',
        }} />
      ))}
      {/* Horizontal grid lines */}
      {[...Array(12)].map((_, i) => (
        <div key={`h${i}`} style={{
          position: 'absolute',
          top: `${(i + 1) * 8.3}%`,
          left: 0, right: 0,
          height: '1px',
          background: color,
          opacity: 0.04,
          animation: `gridPulse ${2 + i * 0.2}s ${i * 0.1}s ease-in-out infinite`,
          pointerEvents: 'none',
        }} />
      ))}
      {/* Scan line */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        height: '80px',
        background: `linear-gradient(to bottom, transparent, ${color}18, transparent)`,
        animation: 'scanLine 4s linear infinite',
        pointerEvents: 'none',
      }} />
    </>
  );
}

/* ─── BOKEH ORBS ─── */
function BokehBackground({ color1 = '#C9A96E', color2 = '#a78bfa' }) {
  const orbs = useMemo(() => seededRands(10, 333), []);
  const delays = useMemo(() => seededRands(10, 444), []);
  return (
    <>
      <style>{`
        @keyframes bokehFloat {
          0%,100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(15px, -25px) scale(1.05); }
          66%      { transform: translate(-10px, 15px) scale(0.95); }
        }
      `}</style>
      {orbs.map((r, i) => {
        const size = 80 + delays[i] * 160;
        const col  = i % 2 === 0 ? color1 : color2;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: `${r * 85}%`,
            top: `${delays[i] * 85}%`,
            width: size, height: size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${col}18 0%, ${col}05 50%, transparent 70%)`,
            animation: `bokehFloat ${8 + delays[i] * 10}s ${r * 5}s ease-in-out infinite`,
            pointerEvents: 'none',
            filter: 'blur(18px)',
          }} />
        );
      })}
    </>
  );
}

/* ─── RAIN DROPS ─── */
function RainBackground({ color = '#38bdf8' }) {
  const drops = useMemo(() => seededRands(35, 555), []);
  const delays = useMemo(() => seededRands(35, 666), []);
  return (
    <>
      <style>{`
        @keyframes rainDrop {
          0%   { transform: translateY(-5vh) rotate(15deg); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.3; }
          100% { transform: translateY(105vh) rotate(15deg); opacity: 0; }
        }
      `}</style>
      {drops.map((r, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${r * 100}%`,
          top: '-5%',
          width: '1px',
          height: `${8 + delays[i] * 14}px`,
          background: `linear-gradient(to bottom, transparent, ${color}99)`,
          opacity: 0,
          animation: `rainDrop ${0.6 + delays[i] * 0.8}s ${r * 2}s linear infinite`,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  );
}

/* ─── MAIN EXPORT ─── */

function VelvetPetalsBackground() {
  const petals = useMemo(() => seededRands(15, 12), []);
  const delays = useMemo(() => seededRands(15, 24), []);
  const sizes  = useMemo(() => seededRands(15, 36), []);
  
  return (
    <div style={{ perspective: '1000px', width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <style>{`
        @keyframes floatPetal {
          0%   { transform: translateY(110vh) rotateX(0deg) rotateY(0deg) rotateZ(0deg); opacity: 0; }
          10%  { opacity: 0.9; }
          80%  { opacity: 0.7; }
          100% { transform: translateY(-10vh) rotateX(360deg) rotateY(180deg) rotateZ(90deg); opacity: 0; }
        }
        .petal-3d {
          position: absolute;
          background: radial-gradient(circle at 30% 30%, #ff4b72, #99001b);
          border-radius: 0 50% 50% 50%;
          box-shadow: inset 5px 5px 10px rgba(255,255,255,0.2), 5px 10px 15px rgba(0,0,0,0.5);
          transform-style: preserve-3d;
        }
      `}</style>
      {petals.map((r, i) => {
        const size = 20 + sizes[i] * 35;
        return (
          <div key={i} className="petal-3d" style={{
            left: `${r * 100}%`,
            width: size, height: size,
            animation: `floatPetal ${12 + delays[i] * 10}s ease-in-out infinite`,
            animationDelay: `-${delays[i] * 12}s`
          }} />
        );
      })}
    </div>
  );
}

/* ── 3D CRYSTAL HEARTS (FIXED CLIPPING) ── */
function CrystalHeartsBackground() {
  const hearts = useMemo(() => seededRands(12, 44), []);
  const delays = useMemo(() => seededRands(12, 55), []);
  const sizes  = useMemo(() => seededRands(12, 66), []);
  
  return (
    <div style={{ perspective: '800px', width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <style>{`
        @keyframes floatHeartCrystal {
          0%   { transform: translateY(110vh) rotateY(0deg) rotateZ(-15deg) scale(0.8); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 0.8; }
          100% { transform: translateY(-20vh) rotateY(360deg) rotateZ(15deg) scale(1.1); opacity: 0; }
        }
        .crystal-heart-wrapper {
          position: absolute;
          transform-style: preserve-3d;
          filter: drop-shadow(0 15px 25px rgba(255,105,180,0.25));
        }
      `}</style>
      {hearts.map((r, i) => {
        const size = 30 + sizes[i] * 50;
        return (
          <div key={i} className="crystal-heart-wrapper" style={{
            left: `${r * 90}%`,
            width: size, height: size,
            animation: `floatHeartCrystal ${15 + delays[i] * 12}s linear infinite`,
            animationDelay: `-${delays[i] * 20}s`
          }}>
            {/* Added overflow: 'visible' so the SVG filter doesn't cut the heart edges */}
            <svg viewBox="0 0 32 29.6" width="100%" height="100%" style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id={`crystalGrad${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255, 255, 255, 0.95)" />
                  <stop offset="40%" stopColor="rgba(255, 182, 193, 0.6)" />
                  <stop offset="100%" stopColor="rgba(255, 105, 180, 0.2)" />
                </linearGradient>
                <filter id={`glow${i}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <path 
                d="M23.6,0c-3.4,0-6.3,2.7-7.6,5.6C14.7,2.7,11.8,0,8.4,0C3.8,0,0,3.8,0,8.4c0,9.4,9.5,11.9,16,21.2c6.1-9.3,16-12.1,16-21.2C32,3.8,28.2,0,23.6,0z" 
                fill={`url(#crystalGrad${i})`}
                stroke="rgba(255,255,255,0.8)"
                strokeWidth="0.8"
                filter={`url(#glow${i})`}
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

/* ── GOLDEN BOKEH (Replaced Diamonds) ── */
function GoldenBokehBackground() {
  const orbs = useMemo(() => seededRands(15, 77), []);
  const delays = useMemo(() => seededRands(15, 88), []);
  const sizes  = useMemo(() => seededRands(15, 99), []);
  
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <style>{`
        @keyframes floatBokeh {
          0%   { transform: translateY(110vh) scale(0.5); opacity: 0; }
          20%  { opacity: 0.8; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(-20vh) scale(1.5); opacity: 0; }
        }
        .bokeh-orb {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(212,175,55,0.3) 0%, rgba(212,175,55,0) 70%);
          filter: blur(4px);
          mix-blend-mode: screen;
        }
      `}</style>
      {orbs.map((r, i) => {
        const size = 60 + sizes[i] * 120;
        return (
          <div key={i} className="bokeh-orb" style={{
            left: `${r * 100}%`,
            width: size, height: size,
            animation: `floatBokeh ${15 + delays[i] * 15}s ease-in-out infinite`,
            animationDelay: `-${delays[i] * 10}s`
          }} />
        );
      })}
    </div>
  );
}

/* ── 3D STARS (MIDNIGHT) ── */
function MidnightStarsBackground() {
  const stars = useMemo(() => seededRands(30, 11), []);
  const delays = useMemo(() => seededRands(30, 22), []);
  const sizes  = useMemo(() => seededRands(30, 33), []);
  
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <style>{`
        @keyframes twinkleStar {
          0%   { opacity: 0; transform: scale(0.5); }
          50%  { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(0.5); }
        }
        @keyframes driftStar {
          from { transform: translateY(0) rotate(0deg); }
          to   { transform: translateY(-50vh) rotate(360deg); }
        }
        .star-3d {
          position: absolute;
          background: #fff;
          border-radius: 50%;
          box-shadow: 0 0 8px #fff, 0 0 15px #4da6ff;
        }
      `}</style>
      {stars.map((r, i) => {
        const size = 1 + sizes[i] * 3;
        return (
          <div key={i} className="star-3d" style={{
            left: `${r * 100}%`,
            top: `${sizes[i] * 100}%`,
            width: size, height: size,
            animation: `twinkleStar ${3 + delays[i] * 4}s ease-in-out infinite, driftStar ${40 + delays[i] * 30}s linear infinite`,
            animationDelay: `-${delays[i] * 10}s`
          }} />
        );
      })}
    </div>
  );
}

/* ── 3D BUBBLES (OCEAN) ── */
function OceanBubblesBackground() {
  const bubbles = useMemo(() => seededRands(20, 55), []);
  const delays = useMemo(() => seededRands(20, 66), []);
  const sizes  = useMemo(() => seededRands(20, 77), []);
  
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <style>{`
        @keyframes floatWaterBubble {
          0%   { transform: translateY(110vh) scale(0.8) translateX(0); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.3; }
          100% { transform: translateY(-10vh) scale(1.2) translateX(20px); opacity: 0; }
        }
        .water-bubble {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.3);
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2), rgba(0,229,255,0.05));
          backdrop-filter: blur(2px);
          box-shadow: inset 0 0 10px rgba(255,255,255,0.2), 0 5px 15px rgba(0,0,0,0.2);
        }
      `}</style>
      {bubbles.map((r, i) => {
        const size = 15 + sizes[i] * 40;
        return (
          <div key={i} className="water-bubble" style={{
            left: `${r * 100}%`,
            width: size, height: size,
            animation: `floatWaterBubble ${10 + delays[i] * 15}s ease-in infinite`,
            animationDelay: `-${delays[i] * 15}s`
          }} />
        );
      })}
    </div>
  );
}

/* ── 3D EMBERS (FIREPLACE) ── */
function FireplaceEmbersBackground() {
  const embers = useMemo(() => seededRands(40, 88), []);
  const delays = useMemo(() => seededRands(40, 99), []);
  const sizes  = useMemo(() => seededRands(40, 11), []);
  
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <style>{`
        @keyframes floatEmber {
          0%   { transform: translateY(110vh) translateX(0) scale(1); opacity: 0; }
          10%  { opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translateY(-10vh) translateX(40px) scale(0.2); opacity: 0; }
        }
        .ember-spark {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, #ffcc00 0%, #ff6600 40%, transparent 100%);
          box-shadow: 0 0 10px #ff6600;
          mix-blend-mode: screen;
        }
      `}</style>
      {embers.map((r, i) => {
        const size = 3 + sizes[i] * 8;
        return (
          <div key={i} className="ember-spark" style={{
            left: `${r * 100}%`,
            width: size, height: size,
            animation: `floatEmber ${15 + delays[i] * 20}s ease-in infinite`,
            animationDelay: `-${delays[i] * 25}s`
          }} />
        );
      })}
    </div>
  );
}


export default function ChatBackground({ elements, theme }) {
  if (!elements) return null;

  switch (elements) {
    case 'hearts':
      return <HeartsBackground color={theme?.accent} />;
    case 'petals':
      return <PetalsBackground />;
    case 'stars':
      return <StarsBackground color={theme?.accent} />;
    case 'fireflies':
      return <FirefliesBackground color={theme?.accent} />;
    case 'neon-grid':
      return <NeonGridBackground color={theme?.accent} />;
    case 'bokeh':
      return <BokehBackground color1={theme?.accent} color2={theme?.bubbleMe} />;
    case 'rain':
      return <RainBackground color={theme?.accent} />;
    
    case '3d_petals': return <VelvetPetalsBackground />;
    case '3d_crystal_hearts': return <CrystalHeartsBackground />;
    case '3d_rings': return <GoldenBokehBackground />;
    case '3d_stars': return <MidnightStarsBackground />;
    case '3d_bubbles': return <OceanBubblesBackground />;
    case '3d_embers': return <FireplaceEmbersBackground />;
    default:
      return null;
  }
}
