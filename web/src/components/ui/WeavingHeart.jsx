import { motion } from 'framer-motion';

export default function WeavingHeart() {
  // Heart 1: Left-oriented loop
  const h1Path = "M11.6 21.08l-1.16-1.05C6.32 16.29 3.6 13.82 3.6 10.8c0-2.46 1.94-4.4 4.4-4.4 1.39 0 2.73.65 3.6 1.67C12.47 7.05 13.81 6.4 15.2 6.4c2.46 0 4.4 1.94 4.4 4.4 0 3.02-2.72 5.49-6.84 9.23L11.6 21.08";
  
  // Heart 2: Right-oriented mirrored loop
  const h2Path = "M20.4 21.08l1.16-1.05c4.12-3.74 6.84-6.21 6.84-9.23 0-2.46-1.94-4.4-4.4-4.4-1.39 0-2.73.65-3.6 1.67-0.87-1.02-2.21-1.67-3.6-1.67-2.46 0-4.4 1.94-4.4 4.4 0 3.02 2.72 5.49 6.84 9.23l1.16 1.05z";

  return (
    <div style={{ position: 'relative', width: 280, height: 200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
      <svg width="280" height="200" viewBox="-40 0 112 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <motion.path
            d={h1Path}
            stroke="var(--accent)"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="rgba(201,169,110,0.1)"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.path
            d={h2Path}
            stroke="var(--accent)"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="rgba(201,169,110,0.1)"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.g>
      </svg>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.15 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'absolute',
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
          zIndex: -1
        }}
      />
    </div>
  );
}
