import { useLocation } from 'react-router-dom';
import GlassSidebar from './GlassSidebar';
import BottomNav from './BottomNav'; // Fallback for mobile

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const isImmersive = pathname.startsWith('/chat') || pathname.startsWith('/call');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'radial-gradient(circle at 50% -20%, #1e1e24, #0D0D0F 80%)' }}>
      {!isImmersive && <GlassSidebar />}
      <main style={{ 
        flex: 1, 
        marginLeft: isImmersive ? '0' : '260px', 
        minHeight: '100vh', 
        position: 'relative',
        transition: 'margin 0.3s ease'
      }}>
        <div className="content">
          {children}
        </div>
      </main>
      
      {/* Mobile Nav - only visible on small screens */}
      <style>{`
        @media (max-width: 900px) {
          main { margin-left: 0 !important; padding-bottom: ${isImmersive ? '0' : '80px'}; }
          .glass-sidebar { display: none; }
        }
      `}</style>
      {!isImmersive && <BottomNav />}
    </div>
  );
}
