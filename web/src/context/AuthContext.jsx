import { createContext, useContext, useEffect, useState } from 'react';
import api, { getMe, getSpace } from '../services/api';
import { wsService } from '../services/websocket';
import { clearUserBrowserStorage } from '../services/auraStorage';
import { showInstantPresenceNotification } from '../services/systemNotification';

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
    let parsedUser = null;
    if (cachedUser) {
      try { 
        parsedUser = JSON.parse(cachedUser);
        setUser(parsedUser); 
        isCached = true;
        // 3s artificial delay so the premium splash screen animation can fully complete
        setTimeout(() => setLoading(false), 600);
      } catch (e) {}
    }

    if (token) {
      // 🚀 Connect WebSocket IMMEDIATELY on boot with 0 delay (don't wait for HTTP roundtrips!)
      if (parsedUser?.couple_space_id) {
        wsService.connect(token, parsedUser.couple_space_id);
      }

      Promise.all([
        getMe().catch(e => { throw e; }),
        getSpace().catch(() => null)
      ])
      .then(([u, spaceData]) => {
        setUser(u);
        localStorage.setItem('ros_user', JSON.stringify(u));
        // Keep connected / ensure synced with verified server space_id
        wsService.connect(token, u.couple_space_id);
        
        if (spaceData) {
          localStorage.setItem('cached_space', JSON.stringify(spaceData));
          localStorage.setItem('cached_partner', JSON.stringify(spaceData.partner));
        }
        
        // Background Notifications (Non-blocking)
        // Delay pre-fetching so it doesn't block the lock screen PIN verification network queue
        setTimeout(() => {
          Promise.all([
            api.get('/notifications'),
            api.get('/memories/'),
            api.get('/voice-notes/'),
            api.get('/dates/')
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
          clearUserBrowserStorage();
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
    
    // Proactively request permission once
    if (typeof window !== 'undefined' && "Notification" in window && Notification.permission === "default") {
      try {
        Notification.requestPermission().catch(() => {});
      } catch {}
    }

    let lastPresenceNotif = 0;
    const off = wsService.on('presence', (d) => {
      if (d.online && d.user_id !== user.id) {
        const now = Date.now();
        // Debounce notifications to avoid repeated alerts within 15 seconds
        if (now - lastPresenceNotif > 15000) {
          lastPresenceNotif = now;
          showInstantPresenceNotification(
            "Vlynxly Space",
            `${d.user_name || 'Your partner'} just entered the space! ❤️`
          );
        }
      }
    });

    // Global Safety & Crisis Alert Listener
    const offSafety = wsService.on('safety_alert', (d) => {
      showInstantPresenceNotification(
        d.title || "Aura Care Alert 💜",
        d.body || "Your partner is feeling overwhelmed and needs your support right now.",
        { requireInteraction: true }
      );
    });

    return () => {
      off();
      offSafety();
    };
  }, [user?.id]);

  const loginUser = (token, userData) => {
    // If switching users or stale guest data exists, ensure partitioned clean state
    const currentUserId = user?.id;
    if (currentUserId && userData?.id && currentUserId !== userData.id) {
      clearUserBrowserStorage();
    }
    localStorage.setItem('ros_token', token);
    localStorage.setItem('ros_user', JSON.stringify(userData));
    setUser(userData);
    wsService.connect(token, userData.couple_space_id);
  };

  const logoutUser = () => {
    clearUserBrowserStorage();
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
