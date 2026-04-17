import { Link } from 'react-router-dom';

export default function Sidebar({ isOpen, onClose }) {
  const items = [
    { to: '/call?view=history', icon: '📋', label: 'Call History', sub: 'Previous conversations' },
    { to: '/dates',  icon: '📅', label: 'Dates',      sub: 'Special days' },
    { to: '/bucket', icon: '🎯', label: 'Bucket List',sub: 'Dreams together' },
    { to: '/shop',   icon: '🛍️', label: 'Love Shop',  sub: 'Gift your person' },
    { to: '/notes',  icon: '💌', label: 'My Notes',   sub: 'Archive & more' },
  ];

  if (!isOpen) return null;

  return (
    <>
      <div 
        onClick={onClose} 
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 999 }}
      />
      <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: 280, background: 'var(--s1)', borderRight: '1px solid var(--border)', zIndex: 1000, padding: '24px 20px', display: 'flex', flexDirection: 'column', animation: 'slideIn 0.3s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar" style={{ width: 32, height: 32, fontSize: '0.8rem', overflow: 'hidden' }}>
              {user?.avatar_url ? <img src={user.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : user?.name?.[0]?.toUpperCase()}
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, background: 'var(--grad-p)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Paxly</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Secondary</p>
          {items.map(item => (
            <Link 
              key={item.to} 
              to={item.to} 
              onClick={onClose}
              style={{ textDecoration: 'none', display: 'flex', gap: 14, alignItems: 'center', padding: '12px 14px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>{item.sub}</p>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ padding: '20px 0', borderTop: '1px solid var(--border)' }}>
          <Link to="/settings" onClick={onClose} style={{ textDecoration: 'none', color: 'var(--muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚙️</span> Settings
          </Link>
        </div>

        <style>{`
          @keyframes slideIn {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </div>
    </>
  );
}
