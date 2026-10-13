// src/services/userService.js
import api, { endpoints } from '../utils/api';

class UserService {
  async getUsers() {
    try {
      const response = await api.get(endpoints.users.list);
      const data = response.data;
      
      // Ensure IDs are numbers
      if (data?.data && Array.isArray(data.data)) {
        data.data = data.data.map(user => ({
          ...user,
          id: Number(user.id || user.u_id),
          u_id: Number(user.u_id || user.id),
        }));
      } else if (Array.isArray(data)) {
        data.forEach(user => {
          user.id = Number(user.id || user.u_id);
          user.u_id = Number(user.u_id || user.id);
        });
      }
      
      console.log('📊 Users loaded with normalized IDs:', data?.data || data);
      return data;
    } catch (error) {
      console.error('UserService: Error fetching users:', error);
      return { data: [] };
    }
  }

  async getUser(id) {
    try {
      const response = await api.get(endpoints.users.byId(id));
      const data = response.data;
      
      if (data?.data) {
        data.data.id = Number(data.data.id || data.data.u_id);
        data.data.u_id = Number(data.data.u_id || data.data.id);
      } else if (data) {
        data.id = Number(data.id || data.u_id);
        data.u_id = Number(data.u_id || data.id);
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateUser(id, userData) {
    try {
      const payload = {
        u_name: userData.username,
        role: userData.role,
      };
      
      const response = await api.patch(endpoints.users.byId(id), payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  handleError(error) {
    if (error.response) {
      return {
        status: error.response.status,
        message: error.response.data.message || error.response.data.detail || 'An error occurred',
        data: error.response.data,
      };
    }
    return {
      message: error.message || 'Network error occurred',
    };
  }
}

export default new UserService();