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
            left: \`\${r * 100}%\`,
            width: size, height: size,
            animation: \`floatPetal \${12 + delays[i] * 10}s ease-in-out infinite\`,
            animationDelay: \`-\${delays[i] * 12}s\`
          }} />
        );
      })}
    </div>
  );
}

/* ── 3D CRYSTAL HEARTS ── */
function CrystalHeartsBackground() {
  const hearts = useMemo(() => seededRands(10, 44), []);
  const delays = useMemo(() => seededRands(10, 55), []);
  const sizes  = useMemo(() => seededRands(10, 66), []);
  
  return (
    <div style={{ perspective: '800px', width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <style>{`
        @keyframes floatHeart3D {
          0%   { transform: translateY(110vh) rotateY(0deg) scale(0.8); opacity: 0; }
          20%  { opacity: 0.8; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(-20vh) rotateY(360deg) scale(1.2); opacity: 0; }
        }
        .heart-3d-container {
          position: absolute;
          transform-style: preserve-3d;
        }
        .heart-3d {
          position: relative;
          width: 100%; height: 100%;
          transform-style: preserve-3d;
        }
        .heart-3d::before, .heart-3d::after {
          content: "";
          position: absolute;
          top: 0;
          width: 50%; height: 80%;
          background: linear-gradient(135deg, rgba(255,182,193,0.4), rgba(255,105,180,0.1));
          border-radius: 50% 50% 0 0;
          backdrop-filter: blur(8px);
          box-shadow: inset 0 0 10px rgba(255,255,255,0.6), 0 10px 20px rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.4);
        }
        .heart-3d::before {
          left: 50%;
          transform: rotate(-45deg);
          transform-origin: 0 100%;
        }
        .heart-3d::after {
          left: 0;
          transform: rotate(45deg);
          transform-origin: 100% 100%;
        }
      `}</style>
      {hearts.map((r, i) => {
        const size = 40 + sizes[i] * 60;
        return (
          <div key={i} className="heart-3d-container" style={{
            left: \`\${r * 90}%\`,
            width: size, height: size,
            animation: \`floatHeart3D \${18 + delays[i] * 12}s linear infinite\`,
            animationDelay: \`-\${delays[i] * 20}s\`
          }}>
            <div className="heart-3d" />
          </div>
        );
      })}
    </div>
  );
}

/* ── 3D GOLDEN RINGS ── */
function GoldenRingsBackground() {
  const rings = useMemo(() => seededRands(8, 77), []);
  const delays = useMemo(() => seededRands(8, 88), []);
  const sizes  = useMemo(() => seededRands(8, 99), []);
  
  return (
    <div style={{ perspective: '1000px', width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <style>{`
        @keyframes floatRing {
          0%   { transform: translateY(110vh) rotateX(60deg) rotateY(0deg); opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translateY(-20vh) rotateX(60deg) rotateY(360deg); opacity: 0; }
        }
        .ring-3d {
          position: absolute;
          border-radius: 50%;
          border: 8px solid #d4af37;
          box-shadow: 
            inset 0 4px 5px rgba(255,255,255,0.8), 
            inset 0 -4px 5px rgba(0,0,0,0.5),
            0 10px 15px rgba(0,0,0,0.6),
            0 -2px 5px rgba(255,255,255,0.6);
          transform-style: preserve-3d;
        }
      `}</style>
      {rings.map((r, i) => {
        const size = 60 + sizes[i] * 80;
        return (
          <div key={i} className="ring-3d" style={{
            left: \`\${r * 85}%\`,
            width: size, height: size,
            animation: \`floatRing \${20 + delays[i] * 15}s linear infinite\`,
            animationDelay: \`-\${delays[i] * 10}s\`
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
      return <GoldenRingsBackground />;
    default:
      return null;
  }
}
