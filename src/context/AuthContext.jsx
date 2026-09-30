// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

// ---------------------------------------------------------------------------
// Storage helpers — sessionStorage only.
// Tokens vanish when the browser tab closes.
// ---------------------------------------------------------------------------
const AUTH_KEYS = [
  'access_token',
  'refresh_token',
  'token',
  'pms_user',
  'user',
  'user_data',
  'user_role',
];

const clearAuthStorage = () => {
  AUTH_KEYS.forEach((k) => sessionStorage.removeItem(k));
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);

  // Load user from sessionStorage on mount
  useEffect(() => {
    const loadUser = () => {
      console.log('🔵 AuthProvider: Loading user from sessionStorage...');

      const storedUser =
        sessionStorage.getItem('pms_user') ||
        sessionStorage.getItem('user') ||
        sessionStorage.getItem('user_data');

      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          const normalizedUser = {
            id: parsedUser.id || parsedUser.u_id,
            u_id: parsedUser.u_id || parsedUser.id,
            u_name: parsedUser.u_name || parsedUser.name || 'User',
            name: parsedUser.name || parsedUser.u_name || 'User',
            email: parsedUser.email || '',
            role: (parsedUser.role || 'member').toLowerCase(),
            ...parsedUser,
          };
          setUser(normalizedUser);
          console.log('✅ AuthProvider: User loaded');
        } catch (error) {
          console.error('❌ Failed to parse stored user:', error);
          clearAuthStorage();
        }
      } else {
        console.log('🔵 AuthProvider: No stored user found');
      }

      setLoading(false);
    };

    loadUser();
  }, []);

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------
  // authService.login() returns the raw API payload. This context:
  //   1. Normalizes the user object
  //   2. Writes tokens + user to sessionStorage
  const login = async (email, password) => {
    try {
      setLoading(true);
      console.log('🔵 AuthContext: Attempting login for:', email);

      const response = await authService.login({ email, password });
      const userData = response.data || response;

      // Extract tokens from possible response shapes
      const accessToken =
        userData?.access || userData?.access_token || response?.access;
      const refreshToken =
        userData?.refresh || userData?.refresh_token || response?.refresh;

      const normalizedUser = {
        id: userData?.user_id || userData?.id || 0,
        u_id: userData?.u_id || userData?.user_id || userData?.id || 0,
        u_name:
          userData?.u_name ||
          userData?.name ||
          userData?.email?.split('@')[0] ||
          'User',
        name: userData?.name || userData?.u_name || 'User',
        email: userData?.email || email,
        role: (userData?.role || 'member').toLowerCase(),
        ...userData,
      };

      // ✅ Persist to sessionStorage
      if (accessToken) {
        sessionStorage.setItem('access_token', accessToken);
        sessionStorage.setItem('token', accessToken);
      }
      if (refreshToken) {
        sessionStorage.setItem('refresh_token', refreshToken);
      }
      sessionStorage.setItem('pms_user', JSON.stringify(normalizedUser));
      sessionStorage.setItem('user', JSON.stringify(normalizedUser));
      sessionStorage.setItem('user_role', normalizedUser.role);

      setUser(normalizedUser);
      console.log('✅ AuthContext: Login complete, session stored');

      return normalizedUser;
    } catch (error) {
      console.error('🔴 AuthContext: Login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Logout — clears sessionStorage
  // -------------------------------------------------------------------------
  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setNotifications([]);
      clearAuthStorage();
      toast.success('Logged out successfully');
    }
  };

  // -------------------------------------------------------------------------
  // Register
  // -------------------------------------------------------------------------
  const register = async (userData) => {
    try {
      setLoading(true);
      const response = await authService.register(userData);
      return response;
    } catch (error) {
      console.error('AuthContext: Registration error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Refresh user (from /auth/me)
  // -------------------------------------------------------------------------
  const refreshUser = async () => {
    try {
      const response = await authService.getCurrentUser();
      let userData = response;
      if (response.data && response.data.user) userData = response.data.user;
      else if (response.user) userData = response.user;
      else if (response.data) userData = response.data;

      const normalizedUser = {
        id: userData?.user_id || userData?.id || 0,
        u_id: userData?.u_id || userData?.user_id || 0,
        u_name:
          userData?.u_name ||
          userData?.name ||
          userData?.email?.split('@')[0] ||
          'User',
        name: userData?.name || userData?.u_name || 'User',
        email: userData?.email || '',
        role: (userData?.role || 'member').toLowerCase(),
        ...userData,
      };

      setUser(normalizedUser);
      sessionStorage.setItem('user', JSON.stringify(normalizedUser));
      sessionStorage.setItem('pms_user', JSON.stringify(normalizedUser));
      return normalizedUser;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      throw error;
    }
  };

  // Notification helpers
  const markNotifRead = (n_id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.n_id === n_id ? { ...n, is_read: true } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const value = {
    user,
    setUser,
    loading,
    login,
    logout,
    register,
    refreshUser,
    notifications,
    markNotifRead,
    markAllRead,
    unreadCount,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;