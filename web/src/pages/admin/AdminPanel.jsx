import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../../components/ui/Icons';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [filterSource, setFilterSource] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const queryParam = filterSource !== 'all' ? `?source=${encodeURIComponent(filterSource)}` : '';
      const res = await api.get(`/admin/logs${queryParam}`);
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data.stats || null);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [filterSource]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
  }, [activeTab]);

  const handleDeleteLog = async (logId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this log?")) return;
    try {
      await api.delete(`/admin/logs/${logId}`);
      setLogs(prev => prev.filter(l => l.id !== logId));
    } catch (err) {
      alert("Failed to delete log");
    }
  };

  const handleClearAllLogs = async () => {
    if (!window.confirm("⚠️ Are you sure you want to clear ALL error logs?")) return;
    try {
      await api.delete('/admin/logs');
      setLogs([]);
    } catch (err) {
      alert("Failed to clear logs");
    }
  };

  const copyToClipboard = (text, id, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredLogs = logs.filter(log => {
    const q = searchQuery.toLowerCase();
    return (
      (log.error_message && log.error_message.toLowerCase().includes(q)) ||
      (log.stack_trace && log.stack_trace.toLowerCase().includes(q)) ||
      (log.url && log.url.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0c', color: '#f0ede8', fontFamily: 'DM Sans, sans-serif', paddingBottom: '60px' }}>
      {/* Top Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(15,15,18,0.85)', backdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '8px 12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <Icons.Back size={18} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#fff', letterSpacing: '0.3px' }}>
                Vlynxly Command Center
              </h1>
              <span style={{ fontSize: '0.65rem', background: 'rgba(201,169,110,0.15)', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.3)', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>
                ADMIN
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>
              Real-time Crash Monitor & System Diagnostics
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(110,207,160,0.1)', border: '1px solid rgba(110,207,160,0.2)', padding: '6px 12px', borderRadius: 20 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6ECFA0', boxShadow: '0 0 8px #6ECFA0' }} />
            <span style={{ fontSize: '0.75rem', color: '#6ECFA0', fontWeight: 600 }}>Engine Active</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
          <button
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: activeTab === 'logs' ? '#C9A96E' : 'rgba(255,255,255,0.04)',
              color: activeTab === 'logs' ? '#000' : 'rgba(255,255,255,0.7)',
              fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.2s'
            }}
          >
            <span>🚨 System & Crash Logs</span>
            {logs.length > 0 && (
              <span style={{
                background: activeTab === 'logs' ? '#000' : '#ff4444',
                color: activeTab === 'logs' ? '#C9A96E' : '#fff',
                fontSize: '0.7rem', padding: '1px 6px', borderRadius: 10
              }}>
                {logs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: activeTab === 'users' ? '#C9A96E' : 'rgba(255,255,255,0.04)',
              color: activeTab === 'users' ? '#000' : 'rgba(255,255,255,0.7)',
              fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.2s'
            }}
          >
            <span>👥 Registered Users</span>
            {stats?.users !== undefined && (
              <span style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.7rem', padding: '1px 6px', borderRadius: 10 }}>
                {stats.users}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            style={{
              padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: activeTab === 'stats' ? '#C9A96E' : 'rgba(255,255,255,0.04)',
              color: activeTab === 'stats' ? '#000' : 'rgba(255,255,255,0.7)',
              fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.2s'
            }}
          >
            <span>📊 Metrics Overview</span>
          </button>
        </div>

        {/* ── TAB 1: CRASH & ERROR LOGS ────────────────────────────── */}
        {activeTab === 'logs' && (
          <div>
            {/* Search and Action Bar */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16, padding: '12px 16px', marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
                <input
                  type="text"
                  placeholder="Search error messages, file names, or stack traces..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, padding: '8px 14px', color: '#fff', fontSize: '0.85rem', outline: 'none'
                  }}
                />
              </div>

              {/* Source Filters */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {['all', 'Frontend (React)', 'Backend (FastAPI)'].map(src => (
                  <button
                    key={src}
                    onClick={() => setFilterSource(src)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                      background: filterSource === src ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.04)',
                      border: filterSource === src ? '1px solid #C9A96E' : '1px solid rgba(255,255,255,0.05)',
                      color: filterSource === src ? '#C9A96E' : 'rgba(255,255,255,0.6)'
                    }}
                  >
                    {src === 'all' ? 'All Sources' : src}
                  </button>
                ))}

                <button
                  onClick={fetchLogs}
                  title="Refresh Logs"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <Icons.Star size={14} />
                </button>

                {logs.length > 0 && (
                  <button
                    onClick={handleClearAllLogs}
                    style={{ background: 'rgba(224,112,112,0.15)', border: '1px solid rgba(224,112,112,0.3)', borderRadius: 8, padding: '6px 12px', color: '#ff6b6b', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Logs List */}
            {loadingLogs ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#C9A96E' }}>
                <Icons.Loader size={32} className="spin" />
                <p style={{ fontSize: '0.85rem', marginTop: 12 }}>Loading telemetry logs...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✨</div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', margin: 0 }}>Zero Active Crashes</h3>
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                  {searchQuery ? 'No error logs match your search term.' : 'All services and frontend components are running smoothly.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredLogs.map(log => {
                  const isExpanded = expandedLogId === log.id;
                  
                  return (
                    <div
                      key={log.id}
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      style={{
                        background: 'rgba(20, 18, 22, 0.7)',
                        border: isExpanded ? '1px solid rgba(201,169,110,0.5)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 16,
                        padding: '16px 20px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: isExpanded ? '0 10px 30px rgba(0,0,0,0.5)' : 'none'
                      }}
                    >
                      {/* Card Header Row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 10,
                            background: log.source?.includes('Frontend') ? 'rgba(255, 77, 77, 0.15)' : 'rgba(124, 111, 205, 0.15)',
                            border: `1px solid ${log.source?.includes('Frontend') ? 'rgba(255, 77, 77, 0.3)' : 'rgba(124, 111, 205, 0.3)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.9rem', flexShrink: 0
                          }}>
                            {log.source?.includes('Frontend') ? '⚛️' : '🐍'}
                          </div>

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#C9A96E', letterSpacing: '0.5px' }}>
                                LOG #{log.id}
                              </span>
                              <span style={{
                                fontSize: '0.65rem',
                                background: log.source?.includes('Frontend') ? 'rgba(255,77,77,0.15)' : 'rgba(124,111,205,0.15)',
                                color: log.source?.includes('Frontend') ? '#ff7777' : '#9f94f5',
                                border: '1px solid rgba(255,255,255,0.08)',
                                padding: '2px 8px', borderRadius: 6, fontWeight: 600
                              }}>
                                {log.source || 'General'}
                              </span>
                              {log.url && (
                                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                                  {log.url}
                                </span>
                              )}
                            </div>

                            <h4 style={{ margin: '6px 0 0', fontSize: '0.95rem', fontWeight: 600, color: '#ff9999', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                              {log.error_message}
                            </h4>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                            {log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}
                          </span>
                          <button
                            onClick={(e) => handleDeleteLog(log.id, e)}
                            title="Delete log"
                            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4 }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Expanded Trace View */}
                      {isExpanded && (
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#C9A96E', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Exact Stack Trace & Line Details:
                            </span>

                            <button
                              onClick={(e) => copyToClipboard(`Error: ${log.error_message}\n\nStack:\n${log.stack_trace}`, log.id, e)}
                              style={{
                                background: copiedId === log.id ? 'rgba(110,207,160,0.2)' : 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px',
                                color: copiedId === log.id ? '#6ECFA0' : '#fff', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              {copiedId === log.id ? '✓ Copied!' : 'Copy Stack Trace'}
                            </button>
                          </div>

                          <div style={{
                            background: '#0d0d10', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
                            padding: '12px 16px', overflowX: 'auto', maxHeight: 320
                          }}>
                            <pre style={{ margin: 0, fontSize: '0.78rem', color: '#e0e0e0', lineHeight: 1.6, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {log.stack_trace || 'No detailed stack trace captured.'}
                            </pre>
                          </div>

                          {log.ip_address && (
                            <div style={{ marginTop: 10, fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
                              Origin IP: <span style={{ color: 'rgba(255,255,255,0.6)' }}>{log.ip_address}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: USERS ─────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Registered Users ({users.length})</h3>
              <button onClick={fetchUsers} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                Refresh
              </button>
            </div>

            {loadingUsers ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#C9A96E' }}>
                <Icons.Loader size={28} className="spin" />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {users.map(u => (
                  <div key={u.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #C9A96E, #7C6FCD)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', color: '#000' }}>
                        {u.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>{u.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{u.email}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 6, background: u.role === 'admin' ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.05)', color: u.role === 'admin' ? '#C9A96E' : 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                        {u.role?.toUpperCase()}
                      </span>
                      {u.is_premium && (
                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 6, background: 'rgba(201,169,110,0.15)', color: '#C9A96E', fontWeight: 700 }}>
                          PREMIUM
                        </span>
                      )}
                      {u.couple_space_id ? (
                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 6, background: 'rgba(110,207,160,0.15)', color: '#6ECFA0' }}>
                          Linked Couple
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                          Solo
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: STATS ─────────────────────────────────────────── */}
        {activeTab === 'stats' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px' }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Total Users</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#C9A96E', marginTop: 4 }}>{stats?.users || 0}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px' }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Active Spaces</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#7C6FCD', marginTop: 4 }}>{stats?.spaces || 0}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px' }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Total Bookings</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#6ECFA0', marginTop: 4 }}>{stats?.bookings || 0}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px' }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Total Errors Logged</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ff6b6b', marginTop: 4 }}>{logs.length}</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
