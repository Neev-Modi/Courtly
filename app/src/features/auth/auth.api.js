import { request } from '../../shared/api/client';
export const authApi = {
  config: () => request('/auth/config'),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  admin: () => request('/auth/admin'),
  loginUrl: '/api/auth/google',
};
