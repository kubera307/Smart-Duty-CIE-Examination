import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'X-User': 'Exam Coordinator'
  }
});

// Response interceptor for clean error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorMsg = error.response?.data?.error || error.message || 'An unexpected communication error occurred.';
    console.error('API Request Error:', errorMsg);
    return Promise.reject(error);
  }
);

export default api;

