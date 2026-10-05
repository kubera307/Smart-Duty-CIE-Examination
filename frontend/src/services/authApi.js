import api from './api';

export const authApi = {
  loginAdmin: (credentials) => api.post('/auth/login', { role: 'admin', ...credentials }),
  loginStaff: (credentials) => api.post('/auth/login', { role: 'staff', ...credentials }),
  getStaffDirectory: () => api.get('/auth/staff-directory'),
  logout: () => {
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('logged_in_faculty');
  },
  getCurrentUser: () => {
    const role = localStorage.getItem('auth_role');
    const userStr = localStorage.getItem('auth_user');
    if (!role) return null;
    try {
      return { role, user: userStr ? JSON.parse(userStr) : null };
    } catch {
      return { role, user: null };
    }
  }
};
