import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getNotifications, markAllNotificationsRead } from '../services/api';
import { Icons } from '../components/ui/Icons';
import { formatDistanceToNow } from 'date-fns';

export default function Notifications() {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    getNotifications().then(data => {
      setNotifs(data);
      setLoading(false);
      markAllNotificationsRead();
    });
  }, []);

  const handleClick = (n) => {
    if (n.type === 'ai_report') {
      nav('/ai/lab');
    } else if (n.type === 'call_missed') {
      nav('/dashboard');
    }
  };

  return (
    <div className="page" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <header className="header" style={{ background:'rgba(22,22,24,0.4)', borderBottom:'1px solid rgba(255,255,255,0.05)', margin:'20px 20px 12px', borderRadius:'24px', padding:'16px 20px', boxShadow:'0 10px 30px rgba(0,0,0,0.3)' }}>
        <Link to="/dashboard" style={{ color:'var(--muted)', padding:'0 8px', textDecoration:'none', display: 'flex', alignItems: 'center' }}>
          <Icons.Back size={20} />
        </Link>
        <span className="header-title" style={{ color:'var(--text)', flex: 1, textAlign: 'center', marginRight: 28 }}>Notifications</span>
      </header>

      <div className="content" style={{ padding: '0 20px 40px' }}>
        {loading ? (
          <div className="center" style={{ padding: 40 }}><div className="loader" /></div>
        ) : notifs.length === 0 ? (
          <div className="center" style={{ padding: 40, color: 'var(--muted)', textAlign: 'center' }}>
            <Icons.Bell size={40} color="var(--s2)" style={{ marginBottom: 16 }} />
            <p>No new notifications</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {notifs.map(n => (
              <div 
                key={n.id} 
                className="card" 
                onClick={() => handleClick(n)}
                style={{ 
                  display: 'flex', gap: 16, alignItems: 'flex-start', cursor: 'pointer',
                  background: n.read ? 'var(--s1)' : 'rgba(201,169,110,0.1)',
                  border: n.read ? '1px solid transparent' : '1px solid rgba(201,169,110,0.3)',
                  transition: 'transform 0.2s'
                }}
              >
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}>
                  {n.type === 'ai_report' ? <Icons.Star size={20} color="var(--accent)" /> : <Icons.Bell size={20} color="var(--text)" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4, color: n.read ? 'var(--text)' : 'var(--accent)' }}>{n.title}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.4, marginBottom: 8 }}>{n.body}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--s2)' }}>
                    {formatDistanceToNow(new Date(n.created_at))} ago
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
