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
    // Instant cache load
    const cached = localStorage.getItem('cached_notifications');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setNotifs(parsed);
      } catch (e) {}
    }

    getNotifications().then(data => {
      setNotifs(data);
      localStorage.setItem('cached_notifications', JSON.stringify(data));
      setLoading(false);
      markAllNotificationsRead();
    });
  }, []);

  const handleClick = (n) => {
    if (n.type === 'safety_alert') {
      nav('/chat');
    } else if (n.type === 'ai_report') {
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
            {notifs.map(n => {
              const isSafety = n.type === 'safety_alert';
              return (
                <div 
                  key={n.id} 
                  className="card" 
                  onClick={() => handleClick(n)}
                  style={{ 
                    display: 'flex', gap: 16, alignItems: 'flex-start', cursor: 'pointer',
                    background: isSafety 
                      ? 'linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(236,72,153,0.12) 100%)'
                      : n.read ? 'var(--s1)' : 'rgba(201,169,110,0.1)',
                    border: isSafety
                      ? '1px solid rgba(216,180,254,0.4)'
                      : n.read ? '1px solid transparent' : '1px solid rgba(201,169,110,0.3)',
                    boxShadow: isSafety ? '0 4px 20px rgba(168,85,247,0.15)' : 'none',
                    transition: 'transform 0.2s',
                    borderRadius: 16,
                    padding: 16
                  }}
                >
                  <div style={{ 
                    padding: 10, 
                    background: isSafety ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)', 
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {isSafety ? (
                      <Icons.Heart size={22} color="#ec4899" />
                    ) : n.type === 'ai_report' ? (
                      <Icons.Star size={20} color="var(--accent)" />
                    ) : (
                      <Icons.Bell size={20} color="var(--text)" />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: 600, 
                      fontSize: '0.95rem', 
                      marginBottom: 4, 
                      color: isSafety ? '#f472b6' : n.read ? 'var(--text)' : 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span>{n.title}</span>
                      {isSafety && (
                        <span style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: 600, 
                          background: 'rgba(236,72,153,0.25)', 
                          color: '#f472b6', 
                          padding: '2px 8px', 
                          borderRadius: 12 
                        }}>Care Alert</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: isSafety ? '#e2e8f0' : 'var(--muted)', lineHeight: 1.45, marginBottom: 8 }}>
                      {n.body}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--s2)' }}>
                        {formatDistanceToNow(new Date(n.created_at))} ago
                      </div>
                      {isSafety && (
                        <div style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 600 }}>
                          Tap to open chat &rarr;
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
