import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getNotifications, markAllNotificationsRead } from '../services/api';
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

  const handleSaveRespond = async (e, n, allowed) => {
    e.stopPropagation();
    try {
      await api.post('/chat/media-save-respond', {
        request_id: n.data?.sender_id,
        allowed,
        message_id: n.data?.message_id,
        media_url: n.data?.media_url,
        notification_id: n.id
      });
      setNotifs(prev => prev.map(item => item.id === n.id ? {
        ...item,
        read: true,
        data: { ...(item.data || {}), status: allowed ? 'allowed' : 'denied' }
      } : item));
    } catch (err) {
      alert('Failed to respond: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleClick = (n) => {
    if (n.type === 'safety_alert' || n.type === 'media_save_request') {
      nav('/chat');
    } else if (n.type === 'ai_report') {
      nav('/ai/lab');
    } else if (n.type === 'call_missed') {
      nav('/dashboard');
    } else if (n.type === 'love_note' || n.type === 'love_note_gift' || n.type === 'love_note_author_unlocked' || n.type === 'love_note_capsule') {
      nav('/notes');
    } else if (n.type === 'anniversary_reminder') {
      nav('/dates');
    } else if (n.type === 'intruder_alert') {
      nav('/profile/settings?sub=logs');
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
              const isIntruder = n.type === 'intruder_alert';
              return (
                <div 
                  key={n.id} 
                  className="card" 
                  onClick={() => handleClick(n)}
                  style={{ 
                    display: 'flex', gap: 16, alignItems: 'flex-start', cursor: 'pointer',
                    background: isSafety 
                      ? 'linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(236,72,153,0.12) 100%)'
                      : isIntruder
                      ? 'linear-gradient(135deg, rgba(255,59,48,0.18) 0%, rgba(180,20,30,0.1) 100%)'
                      : n.read ? 'var(--s1)' : 'rgba(201,169,110,0.1)',
                    border: isSafety
                      ? '1px solid rgba(216,180,254,0.4)'
                      : isIntruder
                      ? '1px solid rgba(255,59,48,0.4)'
                      : n.read ? '1px solid transparent' : '1px solid rgba(201,169,110,0.3)',
                    boxShadow: isSafety ? '0 4px 20px rgba(168,85,247,0.15)' : isIntruder ? '0 4px 20px rgba(255,59,48,0.2)' : 'none',
                    transition: 'transform 0.2s',
                    borderRadius: 16,
                    padding: 16
                  }}
                >
                  <div style={{ 
                    padding: 10, 
                    background: isSafety ? 'rgba(168,85,247,0.2)' : isIntruder ? 'rgba(255,59,48,0.2)' : 'rgba(255,255,255,0.05)', 
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {isSafety ? (
                      <Icons.Heart size={22} color="#ec4899" />
                    ) : isIntruder ? (
                      <Icons.Shield size={22} color="#FF3B30" />
                    ) : n.type === 'media_save_request' ? (
                      <Icons.Download size={22} color="var(--accent)" />
                    ) : (n.type === 'love_note' || n.type === 'love_note_gift' || n.type === 'love_note_author_unlocked' || n.type === 'love_note_capsule') ? (
                      <Icons.LoveNote size={20} color="var(--accent)" />
                    ) : n.type === 'anniversary_reminder' ? (
                      <Icons.Milestone size={20} color="var(--accent)" />
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
                      color: isSafety ? '#f472b6' : isIntruder ? '#FF453A' : n.read ? 'var(--text)' : 'var(--accent)',
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
                      {isIntruder && (
                        <span style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: 700, 
                          background: 'rgba(255,59,48,0.25)', 
                          color: '#FF3B30', 
                          padding: '2px 8px', 
                          borderRadius: 12 
                        }}>Breach Alert</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: isSafety || isIntruder ? '#e2e8f0' : 'var(--muted)', lineHeight: 1.45, marginBottom: 8 }}>
                      {n.body}
                    </div>
                    {n.type === 'media_save_request' && (
                      <div style={{ marginTop: 8, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                        {(!n.data?.status || n.data?.status === 'pending') ? (
                          <>
                            <button
                              onClick={(e) => handleSaveRespond(e, n, false)}
                              style={{
                                padding: '6px 14px',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 8,
                                color: '#fff',
                                fontSize: '0.82rem',
                                cursor: 'pointer'
                              }}
                            >
                              Deny
                            </button>
                            <button
                              onClick={(e) => handleSaveRespond(e, n, true)}
                              style={{
                                padding: '6px 16px',
                                background: 'var(--accent)',
                                border: 'none',
                                borderRadius: 8,
                                color: '#000',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                cursor: 'pointer'
                              }}
                            >
                              Allow Save
                            </button>
                          </>
                        ) : (
                          <span style={{
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: n.data?.status === 'allowed' ? '#4ade80' : '#f87171',
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: n.data?.status === 'allowed' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)'
                          }}>
                            {n.data?.status === 'allowed' ? '✓ Allowed' : '✗ Denied'}
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--s2)' }}>
                        {formatDistanceToNow(new Date(n.created_at))} ago
                      </div>
                      {isSafety && (
                        <div style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 600 }}>
                          Tap to open chat &rarr;
                        </div>
                      )}
                      {isIntruder && (
                        <div style={{ fontSize: '0.75rem', color: '#FF453A', fontWeight: 600 }}>
                          View intruder logs &rarr;
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
