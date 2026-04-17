import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { path: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { path: '/chat',      icon: '💬', label: 'Chat'      },
  { path: '/memories',  icon: '📸', label: 'Memories'  },
  { path: '/voice',     icon: '🎙️', label: 'Voice'     },
  { path: '/ai',        icon: '✨', label: 'AI'        },
  { path: '/settings',  icon: '⚙️', label: 'Settings'  },
];

export default function GlassSidebar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  return (
    <aside className="glass-sidebar">
      <div className="sidebar-logo">
        <span className="logo-spark">✨</span>
        <span className="logo-text">Paxly Premium</span>
      </div>

      <nav className="sidebar-nav">
        {TABS.map(t => (
          <Link 
            key={t.path} 
            to={t.path} 
            className={`sidebar-item ${pathname.startsWith(t.path) ? 'active' : ''}`}
          >
            <span className="sidebar-icon">{t.icon}</span>
            <span className="sidebar-label">{t.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <Link to="/profile" className="sidebar-profile">
          <div className="avatar-sm">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Profile" />
            ) : (
              user?.name?.[0]?.toUpperCase()
            )}
          </div>
          <div className="profile-info">
            <span className="profile-name">{user?.name || 'User'}</span>
            <span className="profile-status">Online</span>
          </div>
        </Link>
      </div>

      <style>{`
        .glass-sidebar {
          width: 260px;
          height: 100vh;
          background: rgba(13, 13, 15, 0.4);
          backdrop-filter: blur(20px) saturate(180%);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: 24px 16px;
          position: fixed;
          left: 0;
          top: 0;
          z-index: 1000;
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 12px 32px;
        }

        .logo-spark { font-size: 1.4rem; }
        .logo-text { 
          font-family: var(--font-d); 
          font-size: 1.3rem; 
          font-weight: 500; 
          color: var(--accent);
          letter-spacing: 0.5px;
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .sidebar-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          border-radius: 14px;
          color: var(--muted);
          transition: var(--t);
          text-decoration: none;
        }

        .sidebar-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text);
          transform: translateX(4px);
        }

        .sidebar-item.active {
          background: rgba(201, 169, 110, 0.12);
          color: var(--accent);
          border: 1px solid rgba(201, 169, 110, 0.2);
        }

        .sidebar-icon { font-size: 1.3rem; }
        .sidebar-label { font-size: 0.93rem; font-weight: 500; }

        .sidebar-footer {
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }

        .sidebar-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          border-radius: 12px;
          transition: var(--t);
        }

        .sidebar-profile:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .avatar-sm {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--accent), var(--purple));
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          color: #fff;
          overflow: hidden;
        }

        .avatar-sm img { width: 100%; height: 100%; object-fit: cover; }

        .profile-info { display: flex; flex-direction: column; }
        .profile-name { font-size: 0.88rem; font-weight: 600; color: var(--text); }
        .profile-status { font-size: 0.7rem; color: var(--success); }

        @media (max-width: 900px) {
          .glass-sidebar { display: none; }
        }
      `}</style>
    </aside>
  );
}
