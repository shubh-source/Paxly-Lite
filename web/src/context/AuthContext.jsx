import { createContext, useContext, useEffect, useState } from 'react';
import { getMe } from '../services/api';
import { wsService } from '../services/websocket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ros_token');
    const cachedUser = localStorage.getItem('ros_user');
    
    if (cachedUser) {
      try { setUser(JSON.parse(cachedUser)); } catch (e) {}
    }

    if (token) {
      getMe()
        .then(u => { 
          setUser(u); 
          localStorage.setItem('ros_user', JSON.stringify(u));
          wsService.connect(token, u.couple_space_id); 
        })
        .catch((err) => {
          // Only log out if it's an explicit auth failure (401/403)
          if (err.response && (err.response.status === 401 || err.response.status === 403)) {
            localStorage.removeItem('ros_token');
            localStorage.removeItem('ros_user');
            setUser(null);
          }
          // Otherwise, it's a network error/timeout, keep the cached user!
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

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
