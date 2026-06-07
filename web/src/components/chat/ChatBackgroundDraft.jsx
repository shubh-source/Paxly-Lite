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

/* ── 3D CUBES ── */
function Cubes3DBackground() {
  const cubes = useMemo(() => seededRands(12, 11), []);
  const delays = useMemo(() => seededRands(12, 22), []);
  const sizes  = useMemo(() => seededRands(12, 33), []);
  
  return (
    <div style={{ perspective: '800px', width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <style>{`
        @keyframes floatCube {
          0%   { transform: translateY(110vh) rotateX(0deg) rotateY(0deg); opacity: 0; }
          10%  { opacity: 0.8; }
          90%  { opacity: 0.5; }
          100% { transform: translateY(-10vh) rotateX(360deg) rotateY(360deg); opacity: 0; }
        }
        .cube-3d {
          position: absolute;
          transform-style: preserve-3d;
          background: rgba(255,255,255,0.03);
          box-shadow: inset 0 0 15px rgba(255,255,255,0.1), 0 10px 30px rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255,255,255,0.05);
        }
      `}</style>
      {cubes.map((r, i) => {
        const size = 30 + sizes[i] * 60;
        return (
          <div key={i} className="cube-3d" style={{
            left: \`\${r * 100}%\`,
            width: size, height: size,
            animation: \`floatCube \${15 + delays[i] * 10}s linear infinite\`,
            animationDelay: \`-\${delays[i] * 15}s\`
          }} />
        );
      })}
    </div>
  );
}

/* ── 3D SPHERES ── */
function Spheres3DBackground() {
  const spheres = useMemo(() => seededRands(8, 44), []);
  const delays = useMemo(() => seededRands(8, 55), []);
  const sizes  = useMemo(() => seededRands(8, 66), []);
  
  return (
    <>
      <style>{`
        @keyframes floatSphere {
          0%   { transform: translateY(110vh) scale(0.8); opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translateY(-20vh) scale(1.2); opacity: 0; }
        }
        .sphere-3d {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2), rgba(0,0,0,0.8));
          box-shadow: 0 15px 35px rgba(0,0,0,0.6), inset 0 -10px 20px rgba(0,0,0,0.5), inset 0 5px 10px rgba(255,255,255,0.3);
        }
      `}</style>
      {spheres.map((r, i) => {
        const size = 80 + sizes[i] * 120;
        return (
          <div key={i} className="sphere-3d" style={{
            left: \`\${r * 90}%\`,
            width: size, height: size,
            animation: \`floatSphere \${20 + delays[i] * 15}s ease-in-out infinite\`,
            animationDelay: \`-\${delays[i] * 20}s\`,
            filter: \`blur(\${sizes[i] > 0.6 ? 4 : 0}px)\`
          }} />
        );
      })}
    </>
  );
}

/* ── 3D PARTICLES (GOLD) ── */
function Particles3DBackground() {
  const particles = useMemo(() => seededRands(30, 77), []);
  const delays = useMemo(() => seededRands(30, 88), []);
  const sizes  = useMemo(() => seededRands(30, 99), []);
  
  return (
    <>
      <style>{`
        @keyframes floatParticle {
          0%   { transform: translateY(100vh) scale(0); opacity: 0; }
          10%  { opacity: 1; transform: translateY(90vh) scale(1); }
          90%  { opacity: 0.8; }
          100% { transform: translateY(-10vh) scale(0); opacity: 0; }
        }
        .particle-3d {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, #ffe699 0%, #b8860b 50%, transparent 100%);
          box-shadow: 0 0 15px rgba(212, 175, 55, 0.6);
        }
      `}</style>
      {particles.map((r, i) => {
        const size = 3 + sizes[i] * 8;
        return (
          <div key={i} className="particle-3d" style={{
            left: \`\${r * 100}%\`,
            width: size, height: size,
            animation: \`floatParticle \${8 + delays[i] * 12}s ease-in infinite\`,
            animationDelay: \`-\${delays[i] * 10}s\`
          }} />
        );
      })}
    </>
  );
}

export default function ChatBackground({ elements, theme }) {
  switch (elements) {
    case '3d_cubes':
      return <Cubes3DBackground />;
    case '3d_spheres':
      return <Spheres3DBackground />;
    case '3d_particles':
      return <Particles3DBackground />;
    default:
      return null;
  }
}
