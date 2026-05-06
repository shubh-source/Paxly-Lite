import { Link, useLocation } from 'react-router-dom';
import { Icons } from '../ui/Icons';

const TABS = [
  { path: '/chat',     icon: <Icons.Chat size={20} />, label: 'Chat'     },
  { path: '/mood',     icon: <Icons.Aura size={20} />, label: 'Mood'     },
  { path: '/memories', icon: <Icons.Vault size={20} />, label: 'Vault'    },
  { path: '/explore',  icon: <Icons.Explore size={20} />, label: 'Explore'  },
  { path: '/ai',       icon: <Icons.Aura size={20} />, label: 'Aura'       },
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
