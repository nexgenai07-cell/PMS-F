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

  /**
   * Login — purely an API call.
   * ⚠️ Does NOT write to storage. AuthContext owns persistence.
   */
  async login(credentials) {
    try {
      console.log('AuthService: Logging in user:', credentials.email);

      const response = await api.post(endpoints.auth.login, {
        email: credentials.email,
        password: credentials.password,
      });

      console.log('AuthService: Login response received');
      return response.data;
    } catch (error) {
      console.error('AuthService: Login error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Logout — API call only.
   * ⚠️ Does NOT touch storage. AuthContext owns cleanup.
   */
  async logout() {
    try {
      await api.post(endpoints.auth.logout);
    } catch (error) {
      console.error('AuthService: Logout API error:', error);
    }
  }

  /**
   * Verify email with uid + token from the link.
   * POST /api/auth/verify-email
   */
  async verifyEmail(uid, token) {
    try {
      const response = await api.post(endpoints.auth.verifyEmail, { uid, token });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Resend verification email.
   * POST /api/auth/resend-verification
   */
  async resendVerification(email) {
    try {
      const response = await api.post(endpoints.auth.resendVerification, { email });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
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
      return response.data;
    } catch (error) {
      console.error('AuthService: Error updating profile:', error);
      throw this.handleError(error);
    }
  }

  /**
   * ⬇️ NEW: Request a password change.
   *
   * POST /api/auth/request-password-change
   * body: { current, new }
   *
   * This does NOT change the password. It asks the backend to
   * verify the current password and send a confirmation link
   * to the user's inbox. The change only happens when the user
   * clicks that link.
   */
  async requestPasswordChange({ current, newPassword }) {
    try {
      const response = await api.post(endpoints.auth.requestPasswordChange, {
        current,
        new: newPassword,
      });
      return response.data;
    } catch (error) {
      console.error('AuthService: Error requesting password change:', error);
      throw this.handleError(error);
    }
  }

  /**
   * ⬇️ NEW: Confirm a password change with the emailed token.
   *
   * POST /api/auth/confirm-password-change
   * body: { uid, token, new_password }
   */
  async confirmPasswordChange({ uid, token, newPassword }) {
    try {
      const response = await api.post(endpoints.auth.confirmPasswordChange, {
        uid,
        token,
        new_password: newPassword,
      });
      return response.data;
    } catch (error) {
      console.error('AuthService: Error confirming password change:', error);
      throw this.handleError(error);
    }
  }

  // ⚠️ Reads from sessionStorage
  isAuthenticated() {
    return !!(
      sessionStorage.getItem('access_token') || sessionStorage.getItem('token')
    );
  }

  // ⚠️ Reads from sessionStorage
  getStoredUser() {
    const user =
      sessionStorage.getItem('user') || sessionStorage.getItem('pms_user');
    return user ? JSON.parse(user) : null;
  }

  /**
   * Normalize backend error shapes into a consistent object.
   */
  handleError(error) {
    if (error.response) {
      const d = error.response.data || {};
      const nested = d.error && typeof d.error === 'object' ? d.error : d;

      const detail =
        nested.detail ||
        (Array.isArray(nested.non_field_errors) && nested.non_field_errors[0]) ||
        nested.message ||
        (typeof nested === 'string' ? nested : null) ||
        'An error occurred';

      return {
        status: error.response.status,
        message: typeof detail === 'string' ? detail : 'An error occurred',
        code: nested.code || d.code || null,
        data: d,
      };
    }
    if (error.request) {
      return {
        message:
          'No response from server. Please check if the backend server is running.',
      };
    }
    return {
      message: error.message || 'Network error occurred',
    };
  }
}

export default new AuthService();