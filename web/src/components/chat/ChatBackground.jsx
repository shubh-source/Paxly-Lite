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
    default:
      return null;
  }
}
