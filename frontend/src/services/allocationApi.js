import api from './api';

export const allocationApi = {
  getPreview: (cieId, semesterId = null, semesterIds = null) => {
    let url = `/allocation/preview/${cieId}`;
    const params = [];
    if (semesterId) params.push(`semester_id=${semesterId}`);
    if (semesterIds && semesterIds.length > 0) params.push(`semester_ids=${semesterIds.join(',')}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return api.get(url);
  },
  generate: (cieId, semesterId = null, semesterIds = null) => {
    let payload = typeof cieId === 'object' ? cieId : { cie_id: cieId };
    if (semesterId) payload.semester_id = semesterId;
    if (semesterIds) payload.semester_ids = semesterIds;
    return api.post('/allocation/generate', payload);
  },
  getResults: (cieId, params) => api.get(`/allocation/results/${cieId}`, { params }),
  getExplanation: (dutyId) => api.get(`/allocation/duty/${dutyId}/explanation`),
  override: (data) => api.post('/allocation/override', data),
  createDuty: (data) => api.post('/allocation/duty', data),
  updateStatus: (dutyId, status) => api.put(`/allocation/duty/${dutyId}/status`, { status }),
  checkFacultyConflicts: (params) => api.get('/allocation/check-faculty-conflicts', { params }),
  createSwapRequest: (data) => api.post('/allocation/swap-requests', data),
  getSwapRequests: (params) => api.get('/allocation/swap-requests', { params }),
  approveSwapRequest: (id, data = {}) => api.post(`/allocation/swap-requests/${id}/approve`, data),
  rejectSwapRequest: (id, data = {}) => api.post(`/allocation/swap-requests/${id}/reject`, data),
  updateAttendance: (dutyId, status) => api.post(`/allocation/duties/${dutyId}/attendance`, { attendance_status: status }),
  getEmergencyStandby: (dutyId) => api.get(`/allocation/emergency-standby/${dutyId}`),
  emergencyReassign: (dutyId, data) => api.post(`/allocation/duties/${dutyId}/emergency-reassign`, data),
};

