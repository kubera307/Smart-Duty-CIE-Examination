import api from './api';

export const cieApi = {
  getAll: (params) => api.get('/cie', { params }),
  getAcademicYears: () => api.get('/cie/academic-years'),
  createAcademicYear: (data) => api.post('/cie/academic-years', data),
  setCurrentAcademicYear: (data) => api.post('/cie/academic-years/current', data),
  getById: (id) => api.get(`/cie/${id}`),
  getSessions: (cieId, semId = null) => {
    const url = semId ? `/cie/${cieId}/sessions?semester_id=${semId}` : `/cie/${cieId}/sessions`;
    return api.get(url);
  },
  createSession: (cieId, data) => api.post(`/cie/${cieId}/sessions`, data),
  setup5th7th: (cieId) => api.post(`/cie/${cieId}/setup-5th-7th`),
  setupAllSemesters: (cieId, data = {}) => api.post(`/cie/${cieId}/setup-all-semesters`, data),
  autoSplitRooms: (data) => api.post('/cie/auto-split-rooms', data),
  getSession: (sessionId) => api.get(`/cie/sessions/${sessionId}`),
  updateSession: (sessionId, data) => api.put(`/cie/sessions/${sessionId}`, data),
  shiftSlotTime: (data) => api.post('/cie/sessions/shift-slot-time', data),
  batchUpdateSessions: (data) => api.post('/cie/sessions/batch-update', data),
  clearSemesterSessions: (cieId, semId) => api.delete(`/cie/${cieId}/sessions/by-semester/${semId}`),
};
