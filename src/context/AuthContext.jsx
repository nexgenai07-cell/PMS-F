// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);

  // Load user from localStorage on mount
  useEffect(() => {
    const loadUser = () => {
      console.log('🔵 AuthProvider: Loading user from localStorage...');
      const storedUser = localStorage.getItem('pms_user') || 
                         localStorage.getItem('user') || 
                         localStorage.getItem('user_data');
      
      console.log('🔵 AuthProvider: Raw stored user:', storedUser);
      
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          console.log('🔵 AuthProvider: Parsed user:', parsedUser);
          console.log('🔵 AuthProvider: User role:', parsedUser?.role);
          
          // ✅ Normalize user data - handle both id and u_id
          const normalizedUser = {
            id: parsedUser.id || parsedUser.u_id,
            u_id: parsedUser.u_id || parsedUser.id,
            u_name: parsedUser.u_name || parsedUser.name || 'User',
            name: parsedUser.name || parsedUser.u_name || 'User',
            email: parsedUser.email || '',
            role: (parsedUser.role || 'member').toLowerCase(),
            ...parsedUser
          };
          
          setUser(normalizedUser);
          console.log('✅ AuthProvider: User loaded successfully!');
        } catch (error) {
          console.error('❌ Failed to parse stored user:', error);
          localStorage.removeItem('pms_user');
          localStorage.removeItem('user');
          localStorage.removeItem('user_data');
        }
      } else {
        console.log('🔵 AuthProvider: No stored user found');
      }
      
      setLoading(false);
    };

    loadUser();
  }, []);

  // Login with API
  const login = async (email, password) => {
    try {
      setLoading(true);
      console.log('🔵 AuthContext: Attempting login for:', email);
      
      const response = await authService.login({ email, password });
      console.log('🔵 AuthContext: Login response:', response);
      
      // ✅ Extract user data from the correct location
      const userData = response.data || response;
      
      console.log('🔵 AuthContext: Extracted user data:', userData);
      
      // ✅ Normalize user data
      const normalizedUser = {
        id: userData?.user_id || userData?.id || 0,
        u_id: userData?.u_id || userData?.user_id || 0,
        u_name: userData?.u_name || userData?.name || userData?.email?.split('@')[0] || 'User',
        name: userData?.name || userData?.u_name || 'User',
        email: userData?.email || email,
        role: (userData?.role || 'member').toLowerCase(),
        ...userData
      };
      
      console.log('🔵 AuthContext: Normalized user:', normalizedUser);
      console.log('🔵 AuthContext: User role:', normalizedUser.role);
      
      setUser(normalizedUser);
      
      // Store in localStorage
      localStorage.setItem('pms_user', JSON.stringify(normalizedUser));
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('user_role', normalizedUser.role);
      
      return normalizedUser;
    } catch (error) {
      console.error('🔴 AuthContext: Login error:', error);
      // ✅ Re-throw the error so the component can handle it
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setNotifications([]);
      localStorage.clear();
      toast.success('Logged out successfully');
    }
  };

  // Register
  const register = async (userData) => {
    try {
      setLoading(true);
      console.log('AuthContext: Attempting registration for:', userData.username || userData.u_name);
      const response = await authService.register(userData);
      console.log('AuthContext: Registration response:', response);
      return response;
    } catch (error) {
      console.error('AuthContext: Registration error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Refresh user
  const refreshUser = async () => {
    try {
      const response = await authService.getCurrentUser();
      let userData = response;
      if (response.data && response.data.user) {
        userData = response.data.user;
      } else if (response.user) {
        userData = response.user;
      } else if (response.data) {
        userData = response.data;
      }
      
      const normalizedUser = {
        id: userData?.user_id || userData?.id || 0,
        u_id: userData?.u_id || userData?.user_id || 0,
        u_name: userData?.u_name || userData?.name || userData?.email?.split('@')[0] || 'User',
        name: userData?.name || userData?.u_name || 'User',
        email: userData?.email || '',
        role: (userData?.role || 'member').toLowerCase(),
        ...userData
      };
      
      setUser(normalizedUser);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      localStorage.setItem('pms_user', JSON.stringify(normalizedUser));
      return normalizedUser;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      throw error;
    }
  };

  // Notification functions
  const markNotifRead = (n_id) => {
    setNotifications(prev => 
      prev.map(n => n.n_id === n_id ? { ...n, is_read: true } : n)
    );
  };

  const markAllRead = () => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, is_read: true }))
    );
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

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

  console.log('🔵 AuthProvider: Current state:', { 
    hasUser: !!user, 
    loading, 
    userRole: user?.role 
  });

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;