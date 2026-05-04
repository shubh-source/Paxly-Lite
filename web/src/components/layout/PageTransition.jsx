import { motion } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, y: 15, scale: 0.98 },
  in: { opacity: 1, y: 0, scale: 1 },
  out: { opacity: 0, y: -15, scale: 1.02 }
};

const pageTransition = {
  type: 'tween',
  ease: 'easeInOut',
  duration: 0.35
};

export default function PageTransition({ children, layoutId }) {
  return (
    <motion.div
      key={layoutId}
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
      style={{ width: '100%', height: '100%' }}
    >
      {children}
    </motion.div>
  );
}
