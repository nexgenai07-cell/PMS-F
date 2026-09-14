// src/utils/api.js
import axios from 'axios';

// API Base URL - use from environment or fallback.
// In dev, VITE_API_BASE_URL is empty -> relative paths go through the Vite proxy.
// In prod, VITE_API_BASE_URL = https://pmsbackend.nxgenai.pro/api
// Endpoint paths below are RELATIVE to this base (no leading /api).
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
          // NOTE: API_BASE_URL already ends with /api (prod) or is '' (dev proxy).
          // So the refresh path must NOT repeat /api.
          const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
  refresh: refreshToken,
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

// All endpoint paths are RELATIVE to API_BASE_URL (which already includes /api).
export const endpoints = {
  auth: {
    register: '/auth/register/',
    login: '/auth/login/',
    logout: '/auth/logout/',
    me: '/auth/me/',
    refresh: '/auth/refresh/',
  },
  users: {
    list: '/users/',
    byId: (id) => `/users/${id}/`,
  },
  teamMembers: {
    list: '/team_members/',
    byId: (id) => `/team_members/${id}/`,
  },
  projects: {
    list: '/projects/',
    byId: (id) => `/projects/${id}/`,
    tasks: (id) => `/projects/${id}/tasks/`,
  },
  tasks: {
    list: '/task/',
    byId: (id) => `/task/${id}/`,
    comments: (id) => `/tasks/${id}/comments/`,
  },
  comments: {
    list: '/comments/',
    byId: (id) => `/comments/${id}/`,
    byTask: (taskId) => `/tasks/${taskId}/comments/`,
    pin: (id) => `/comments/${id}/pin/`,
  },
  notifications: {
    list: '/notifications/',
    byId: (id) => `/notifications/${id}/`,
    read: (id) => `/notifications/${id}/read/`,
    readAll: '/notifications/read-all/',
    delete: (id) => `/notifications/del/${id}/`,
    unreadCount: '/notifications/unread-count/',
  },
  pteam: {
    list: '/pteam/',
    byId: (id) => `/pteam/${id}/`,
    byProject: (projectId) => `/pteam/?project=${projectId}`,
    add: '/pteam/',
    remove: (id) => `/pteam/${id}/`,
  },
};

export default api;