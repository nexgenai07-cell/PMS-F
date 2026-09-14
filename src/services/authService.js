// src/services/authService.js
import api, { endpoints } from '../utils/api';

class AuthService {
  async register(userData) {
    try {
      console.log('AuthService: Registering user:', userData);

      const payload = {
        u_name: userData.u_name || userData.name,
        email: userData.email,
        password: userData.password,
        role: userData.role || 'member',
      };

      const response = await api.post(endpoints.auth.register, payload);
      return response.data;
    } catch (error) {
      console.error('AuthService: Registration error:', error);
      throw this.handleError(error);
    }
  }

  async login(credentials) {
    try {
      console.log('AuthService: Logging in user:', credentials.email);

      const response = await api.post(endpoints.auth.login, {
        email: credentials.email,
        password: credentials.password,
      });

      console.log('AuthService: Login response:', response.data);

      const data = response.data;

      // Get tokens - handle both nested and flat responses
      const accessToken = data.data?.access || data.access || data.data?.access_token;
      const refreshToken = data.data?.refresh || data.refresh || data.data?.refresh_token;

      // Get user data - the API returns user_id, not u_id
      const userData = {
        id: data.data?.user_id || data.user_id || data.data?.id,
        u_name: data.data?.u_name || data.u_name || data.data?.name || credentials.email?.split('@')[0] || 'User',
        email: data.data?.email || data.email || credentials.email,
        role: data.data?.role || data.role || 'member',
      };

      console.log('✅ Access Token:', accessToken?.substring(0, 20) + '...');
      console.log('✅ Refresh Token:', refreshToken?.substring(0, 20) + '...');
      console.log('✅ User Data:', userData);

      // Store tokens in localStorage
      if (accessToken) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('token', accessToken);
        console.log('✅ Access token stored');
      }

      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
        console.log('✅ Refresh token stored');
      }

      // Store user data
      if (userData.id || userData.u_name) {
        const userToStore = {
          u_id: userData.id, // Store as u_id for backward compatibility
          id: userData.id,
          u_name: userData.u_name,
          email: userData.email,
          role: userData.role,
        };
        localStorage.setItem('user', JSON.stringify(userToStore));
        localStorage.setItem('pms_user', JSON.stringify(userToStore));
        localStorage.setItem('user_role', userData.role || 'member');
        console.log('✅ User data stored');
      }

      return response.data;
    } catch (error) {
      console.error('AuthService: Login error:', error);
      throw this.handleError(error);
    }
  }

  async logout() {
    try {
      await api.post(endpoints.auth.logout);
    } catch (error) {
      console.error('AuthService: Logout API error:', error);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      localStorage.removeItem('pms_user');
      localStorage.removeItem('user_role');
    }
  }

  async getCurrentUser() {
    try {
      const response = await api.get(endpoints.auth.me);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ✅ Update current user profile
  async updateProfile(userData) {
    try {
      const payload = {
        u_name: userData.u_name || userData.name,
        email: userData.email,
        role: userData.role,
      };

      console.log('📤 Updating profile with payload:', payload);

      const response = await api.patch(endpoints.auth.me, payload);

      // ✅ Update stored user data after successful update
      if (response.data) {
        const updatedUser = {
          id: response.data.id || response.data.user_id,
          u_id: response.data.u_id || response.data.id || response.data.user_id,
          u_name: response.data.u_name || response.data.name,
          email: response.data.email,
          role: response.data.role,
        };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        localStorage.setItem('pms_user', JSON.stringify(updatedUser));
        localStorage.setItem('user_role', updatedUser.role || 'member');
      }

      return response.data;
    } catch (error) {
      console.error('AuthService: Error updating profile:', error);
      throw this.handleError(error);
    }
  }

  // ✅ Change password — path relative to baseURL (no /api prefix)
  async changePassword(passwordData) {
    try {
      const response = await api.post('/auth/change-password', {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
      });
      return response.data;
    } catch (error) {
      console.error('AuthService: Error changing password:', error);
      throw this.handleError(error);
    }
  }

  // ✅ Request password reset — path relative to baseURL
  async requestPasswordReset(email) {
    try {
      const response = await api.post('/auth/password-reset-request', { email });
      return response.data;
    } catch (error) {
      console.error('AuthService: Error requesting password reset:', error);
      throw this.handleError(error);
    }
  }

  // ✅ Reset password with token — path relative to baseURL
  async resetPassword(token, newPassword) {
    try {
      const response = await api.post('/auth/password-reset', {
        token,
        new_password: newPassword,
      });
      return response.data;
    } catch (error) {
      console.error('AuthService: Error resetting password:', error);
      throw this.handleError(error);
    }
  }

  isAuthenticated() {
    return !!localStorage.getItem('access_token') || !!localStorage.getItem('token');
  }

  getStoredUser() {
    const user = localStorage.getItem('user') || localStorage.getItem('pms_user');
    return user ? JSON.parse(user) : null;
  }

  handleError(error) {
    if (error.response) {
      return {
        status: error.response.status,
        message:
          error.response.data.message ||
          error.response.data.detail ||
          error.response.data.error ||
          'An error occurred',
        data: error.response.data,
      };
    }
    if (error.request) {
      return {
        message: 'No response from server. Please check if the backend server is running.',
      };
    }
    return {
      message: error.message || 'Network error occurred',
    };
  }
}

export default new AuthService();