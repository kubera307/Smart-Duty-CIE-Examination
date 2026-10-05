import api from './api';

export const auditApi = {
  getLogs: (params) => api.get('/audit/logs', { params }),
  getSettings: () => api.get('/audit/settings'),
  updateSettings: (data) => api.put('/audit/settings', data),
};
