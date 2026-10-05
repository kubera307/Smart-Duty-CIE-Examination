import api from './api';

export const academicApi = {
  getSemesters: () => api.get('/academic/semesters'),
  getSubjects: (semesterId) => api.get('/academic/subjects', { params: { semester_id: semesterId } }),
  createSubject: (data) => api.post('/academic/subjects', data),
  getTimetables: (params) => api.get('/academic/timetables', { params }),
  createTimetableEntry: (data) => api.post('/academic/timetables', data),
  updateTimetableEntry: (id, data) => api.put(`/academic/timetables/${id}`, data),
  deleteTimetableEntry: (id) => api.delete(`/academic/timetables/${id}`),
  clearSemesterTimetable: (semesterId) => api.delete(`/academic/timetables/semester/${semesterId}`),
  bulkCreateTimetableEntries: (data) => api.post('/academic/timetables/bulk', data),
  parseTimetableImage: (formData) =>
    api.post('/academic/timetables/parse-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
};



