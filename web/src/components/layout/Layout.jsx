import { useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const isImmersive = pathname.startsWith('/chat') || pathname.startsWith('/call');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'radial-gradient(circle at 50% -20%, #1e1e24, #0D0D0F 80%)' }}>
      <main style={{ 
        flex: 1, 
        minHeight: '100vh', 
        position: 'relative'
      }}>
        {isImmersive ? children : <div className="content">{children}</div>}
      </main>
    </div>
  );
}
