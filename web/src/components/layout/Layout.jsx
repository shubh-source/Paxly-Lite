export default function Layout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'radial-gradient(circle at 50% -20%, #1e1e24, #0D0D0F 80%)' }}>
      <main style={{ 
        flex: 1, 
        minHeight: '100vh', 
        position: 'relative'
      }}>
        <div className="content">
          {children}
        </div>
      </main>
    </div>
  );
}
