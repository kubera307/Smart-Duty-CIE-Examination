import api from './api';

export const conflictApi = {
  getAll: () => api.get('/conflicts'),
};
