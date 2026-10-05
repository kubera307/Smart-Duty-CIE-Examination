import api from './api';

export const analyticsApi = {
  getDashboard: (params) => api.get('/analytics/dashboard', { params }),
  getWorkload: (params) => api.get('/analytics/workload', { params }),
  getCie: (params) => api.get('/analytics/cie', { params }),
};

