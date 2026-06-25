import { createContext, useContext, useEffect, useState } from 'react';
import { getMe, getSpace, getMessages } from '../services/api';
import { wsService } from '../services/websocket';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('ros_user')) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ros_token');
    const cachedUser = localStorage.getItem('ros_user');
    
    let isCached = false;
    if (cachedUser) {
      try { 
        setUser(JSON.parse(cachedUser)); 
        isCached = true;
        // 3s artificial delay so the premium splash screen animation can fully complete
        setTimeout(() => setLoading(false), 3000);
      } catch (e) {}
    }

    if (token) {
      Promise.all([
        getMe().catch(e => { throw e; }),
        getSpace().catch(() => null),
        getMessages().catch(() => [])
      ])
      .then(([u, spaceData, msgsData]) => {
        setUser(u);
        localStorage.setItem('ros_user', JSON.stringify(u));
        wsService.connect(token, u.couple_space_id);
        
        if (spaceData) {
          localStorage.setItem('cached_space', JSON.stringify(spaceData));
          localStorage.setItem('cached_partner', JSON.stringify(spaceData.partner));
        }
        if (msgsData && msgsData.length >= 0) {
          const sorted = [...msgsData].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          localStorage.setItem('cached_messages', JSON.stringify(sorted));
        }
        
        // Background Notifications (Non-blocking)
        // Delay pre-fetching so it doesn't block the lock screen PIN verification network queue
        setTimeout(() => {
          const customApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
          customApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          Promise.all([
            customApi.get('/notifications'),
            customApi.get('/memories/'),
            customApi.get('/voice-notes/'),
            customApi.get('/dates/')
          ]).then(([notifRes, memRes, voiceRes, datesRes]) => {
            localStorage.setItem('cached_notifications', JSON.stringify(notifRes.data));
            localStorage.setItem('cached_memories', JSON.stringify(memRes.data));
            localStorage.setItem('cached_voicenotes', JSON.stringify(voiceRes.data));
            localStorage.setItem('cached_dates', JSON.stringify(datesRes.data));
          }).catch(()=>{});
        }, 2500);

      })
      .catch((err) => {
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          localStorage.removeItem('ros_token');
          localStorage.removeItem('ros_user');
          setUser(null);
        }
      })
      .finally(() => {
        if (!isCached) setLoading(false);
      });
    } else {
      if (!isCached) setLoading(false);
    }
  }, []);

  // Global Presence Notification Listener
  useEffect(() => {
    if (!user) return;
    
    // Request permission once
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const off = wsService.on('presence', (d) => {
      if (d.online && d.user_id !== user.id) {
        if ("Notification" in window && Notification.permission === "granted") {
          const notif = new Notification("Vlynxly Space", {
            body: `${d.user_name || 'Your partner'} just entered the space! ❤️`,
            icon: '/vite.svg',
            silent: false
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        }
      }
    });

    return () => off();
  }, [user?.id]);

  const loginUser = (token, userData) => {
    localStorage.setItem('ros_token', token);
    localStorage.setItem('ros_user', JSON.stringify(userData));
    setUser(userData);
    wsService.connect(token, userData.couple_space_id);
  };

  const logoutUser = () => {
    localStorage.removeItem('ros_token');
    localStorage.removeItem('ros_user');
    setUser(null);
    wsService.disconnect();
  };

  const refreshUser = async () => {
    try {
      const u = await getMe();
      setUser(u);
      localStorage.setItem('ros_user', JSON.stringify(u));
      return u;
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logoutUser, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
