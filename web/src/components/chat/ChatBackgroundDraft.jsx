import { useMemo } from 'react';

/* ── Utility: stable random numbers per seed ── */
function seededRands(count, seed = 42) {
  const arr = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    arr.push(s / 233280);
  }
  return arr;
}

/* ── 3D ROSE PETALS ── */
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
          100% { transform: translateY(-10vh) translateX(30px) scale(0.2); opacity: 0; }
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
            animation: `floatEmber ${5 + delays[i] * 8}s ease-in infinite`,
            animationDelay: `-${delays[i] * 10}s`
          }} />
        );
      })}
    </div>
  );
}

export default function ChatBackground({ elements, theme }) {
  switch (elements) {
    case '3d_petals':
      return <VelvetPetalsBackground />;
    case '3d_crystal_hearts':
      return <CrystalHeartsBackground />;
    case '3d_rings':
      return <GoldenBokehBackground />;
    case '3d_stars':
      return <MidnightStarsBackground />;
    case '3d_bubbles':
      return <OceanBubblesBackground />;
    case '3d_embers':
      return <FireplaceEmbersBackground />;
    default:
      return null;
  }
}
