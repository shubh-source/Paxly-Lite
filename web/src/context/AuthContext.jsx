import { createContext, useContext, useEffect, useState } from 'react';
import { getMe, getSpace, getMessages } from '../services/api';
import { wsService } from '../services/websocket';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ros_token');
    const cachedUser = localStorage.getItem('ros_user');
    
    if (cachedUser) {
      try { 
        setUser(JSON.parse(cachedUser)); 
        setLoading(false); // Instant boot if cached!
      } catch (e) {}
    }

    if (token) {
      getMe()
        .then(u => { 
          setUser(u); 
          localStorage.setItem('ros_user', JSON.stringify(u));
          wsService.connect(token, u.couple_space_id); 
          
          // Background Global Prefetch (SWR pattern)
          setTimeout(() => {
            getSpace().then(d => {
              localStorage.setItem('cached_space', JSON.stringify(d));
              localStorage.setItem('cached_partner', JSON.stringify(d.partner));
            }).catch(()=>{});
            
            getMessages().then(d => {
              localStorage.setItem('cached_messages', JSON.stringify(d));
            }).catch(()=>{});

            const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            api.get('/notifications').then(res => {
              localStorage.setItem('cached_notifications', JSON.stringify(res.data));
            }).catch(()=>{});

          }, 1000); // 1 second after boot
        })
        .catch((err) => {
          if (err.response && (err.response.status === 401 || err.response.status === 403)) {
            localStorage.removeItem('ros_token');
            localStorage.removeItem('ros_user');
            setUser(null);
            setLoading(false);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
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
