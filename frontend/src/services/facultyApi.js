import api from './api';

export const facultyApi = {
  getAll: (params) => api.get('/faculty', { params }),
  getProfile: (id) => api.get(`/faculty/${id}/profile`),
  create: (data) => api.post('/faculty', data),
  update: (id, data) => api.put(`/faculty/${id}`, data),
  delete: (id) => api.delete(`/faculty/${id}`),
  clearAll: () => api.post('/faculty/clear-all'),
  addUnavailability: (id, data) => api.post(`/faculty/${id}/unavailability`, data),
  getDutyQuotas: () => api.get('/faculty/duty-quotas'),
  saveDutyQuotas: (data) => api.post('/faculty/duty-quotas', data),
  assignByQuotas: (cieId, data = {}) => api.post('/faculty/duty-quotas/assign', { cie_id: cieId, ...data }),
};

