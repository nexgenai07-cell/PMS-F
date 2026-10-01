// src/utils/api.js
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

console.log('🔵 Environment:', import.meta.env.MODE);
console.log('🔵 API Base URL:', API_BASE_URL || 'Using proxy (relative path)');

// 🆕 Added verify-email and resend-verification — they should NOT trigger
// the token-refresh interceptor. A 4xx from them is legitimate.
const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/verify-email',
  '/auth/resend-verification',
];

const PUBLIC_PATHS = ['/login', '/register', '/verify-email', '/'];

// ---------------------------------------------------------------------------
// Storage helpers — sessionStorage only
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

const getAccessToken = () =>
  sessionStorage.getItem('access_token') || sessionStorage.getItem('token');

const getRefreshToken = () => sessionStorage.getItem('refresh_token');

const clearAuthStorage = () => {
  AUTH_KEYS.forEach((k) => sessionStorage.removeItem(k));
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true,
});

// Request interceptor — attach token
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const url = originalRequest.url || '';

    const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => url.includes(p));

    if (status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      const refreshToken = getRefreshToken();

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh: refreshToken,
          });

          if (response.data.access) {
            sessionStorage.setItem('access_token', response.data.access);
            sessionStorage.setItem('token', response.data.access);
            originalRequest.headers.Authorization = `Bearer ${response.data.access}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        }
      }

      const onPublicPage = PUBLIC_PATHS.some((p) =>
        p === '/'
          ? window.location.pathname === '/'
          : window.location.pathname.startsWith(p)
      );

      if (!onPublicPage) {
        clearAuthStorage();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Endpoint map
// ---------------------------------------------------------------------------
export const endpoints = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    logout: '/auth/logout',
    me: '/auth/me',
    refresh: '/auth/refresh',
    verifyEmail: '/auth/verify-email',                 
    resendVerification: '/auth/resend-verification',   
  },
  users: {
    list: '/users',
    byId: (id) => `/users/${id}`,
  },
  teamMembers: {
    list: '/team_members',
    byId: (id) => `/team_members/${id}`,
  },
  projects: {
    list: '/projects',
    byId: (id) => `/projects/${id}`,
    tasks: (id) => `/projects/${id}/tasks`,
  },
  tasks: {
    list: '/task',
    byId: (id) => `/task/${id}`,
    comments: (id) => `/tasks/${id}/comments`,
  },
  leads: {
    stats: '/leads/stats/',
  },
  comments: {
    list: '/comments',
    byId: (id) => `/comments/${id}`,
    byTask: (taskId) => `/tasks/${taskId}/comments`,
    pin: (id) => `/comments/${id}/pin`,
  },
  notifications: {
    list: '/notifications',
    byId: (id) => `/notifications/${id}`,
    read: (id) => `/notifications/${id}/read`,
    readAll: '/notifications/read-all',
    delete: (id) => `/notifications/del/${id}`,
    unreadCount: '/notifications/unread-count',
  },
  pteam: {
    list: '/pteam',
    byId: (id) => `/pteam/${id}`,
    byProject: (projectId) => `/pteam?project=${projectId}`,
    add: '/pteam',
    remove: (id) => `/pteam/${id}`,
  },
};

export default api;