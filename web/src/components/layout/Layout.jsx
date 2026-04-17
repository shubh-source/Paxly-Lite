import GlassSidebar from './GlassSidebar';
import BottomNav from './BottomNav'; // Fallback for mobile

export default function Layout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <GlassSidebar />
      <main style={{ 
        flex: 1, 
        marginLeft: '260px', 
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
          main { margin-left: 0 !important; padding-bottom: 80px; }
          .glass-sidebar { display: none; }
        }
      `}</style>
      <BottomNav /> 
    </div>
  );
}
