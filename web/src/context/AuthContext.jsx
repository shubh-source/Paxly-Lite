import { createContext, useContext, useEffect, useState } from 'react';
import { getMe } from '../services/api';
import { wsService } from '../services/websocket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ros_token');
    if (token) {
      getMe()
        .then(u => { setUser(u); wsService.connect(token); })
        .catch(() => localStorage.removeItem('ros_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginUser = (token, userData) => {
    localStorage.setItem('ros_token', token);
    setUser(userData);
    wsService.connect(token);
  };

  const logoutUser = () => {
    localStorage.removeItem('ros_token');
    setUser(null);
    wsService.disconnect();
  };

  const refreshUser = async () => {
    try {
      const u = await getMe();
      setUser(u);
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
