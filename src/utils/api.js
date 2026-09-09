// src/utils/api.js
import axios from 'axios';

// API Base URL - use from environment or fallback
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

console.log('🔵 Environment:', import.meta.env.MODE);
console.log('🔵 API Base URL:', API_BASE_URL || 'Using proxy (relative path)');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor - Attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token') || 
                  localStorage.getItem('token');
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('🟢 Token attached to request');
    } else {
      console.log('🟡 No token found for request');
    }
    
    console.log('🟢 Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('🔴 Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - Handle token refresh
api.interceptors.response.use(
  (response) => {
    console.log('🟢 Response:', response.status, response.config.url);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    console.error('🔴 Response Error:', error.response?.status, error.response?.data);
    
    // If token is invalid and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const refreshToken = localStorage.getItem('refresh_token');
      
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
            refresh: refreshToken
          });
          
          if (response.data.access) {
            localStorage.setItem('access_token', response.data.access);
            localStorage.setItem('token', response.data.access);
            
            originalRequest.headers.Authorization = `Bearer ${response.data.access}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          localStorage.clear();
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
        }
      } else {
        // No refresh token, clear and redirect
        localStorage.clear();
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    }
    
    return Promise.reject(error);
  }
);

export const endpoints = {
  // Auth endpoints
  auth: {
    register: '/api/auth/register',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    me: '/api/auth/me',
    refresh: '/api/auth/refresh',
  },
  
  // Users endpoints
  users: {
    list: '/api/users',
    byId: (id) => `/api/users/${id}`,
  },
  
  // Team Members endpoints
  teamMembers: {
    list: '/api/team_members',
    byId: (id) => `/api/team_members/${id}`,
  },
  
  // Projects endpoints
  projects: {
    list: '/api/projects',
    byId: (id) => `/api/projects/${id}`,
    tasks: (id) => `/api/projects/${id}/tasks`,
  },
  
  // Tasks endpoints
  tasks: {
    list: '/api/task',
    byId: (id) => `/api/task/${id}`,
    comments: (id) => `/api/tasks/${id}/comments`,
  },
  
  // Comments endpoints
  comments: {
    list: '/api/comments',
    byId: (id) => `/api/comments/${id}`,
    byTask: (taskId) => `/api/tasks/${taskId}/comments`,
    pin: (id) => `/api/comments/${id}/pin`,
  },
  
  // Notifications endpoints
  notifications: {
    list: '/api/notifications',
    byId: (id) => `/api/notifications/${id}`,
    read: (id) => `/api/notifications/${id}/read`,
    readAll: '/api/notifications/read-all',
    delete: (id) => `/api/notifications/del/${id}`,
    unreadCount: '/api/notifications/unread-count',
  },
  
  // ✅ PTeam endpoints (Project-Team Member junction table)
  pteam: {
    list: '/api/pteam',
    byId: (id) => `/api/pteam/${id}`,
    byProject: (projectId) => `/api/pteam?project=${projectId}`,
    add: '/api/pteam',
    remove: (id) => `/api/pteam/${id}`,  // DELETE /api/pteam/<pt_id>
  },
};

export default api;