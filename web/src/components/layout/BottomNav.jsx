import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { path: '/chat',     icon: '💬', label: 'Chat'     },
  { path: '/mood',     icon: '🌙', label: 'Mood'     },
  { path: '/memories', icon: '📸', label: 'Memories' },
  { path: '/explore',  icon: '🗺️', label: 'Explore'  },
  { path: '/ai',       icon: '✨', label: 'AI'       },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav">
      {TABS.map(t => (
        <Link key={t.path} to={t.path} className={`nav-item ${pathname.startsWith(t.path) ? 'active' : ''}`}>
          <span className="nav-icon">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
