import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : '/api';

const api = axios.create({ baseURL });

// Auto-attach JWT token
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('ros_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Auth
export const register = (name, email, password) =>
  api.post('/auth/register', { name, email, password }).then(r => r.data);

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data);

export const getMe = () =>
  api.get('/auth/me').then(r => r.data);

export const updateMe = (data) =>
  api.put('/auth/me', data).then(r => r.data);

// Couple
export const generateInvite = () =>
  api.post('/couple/invite/generate').then(r => r.data);

export const acceptInvite = (code) =>
  api.post('/couple/invite/accept', { code }).then(r => r.data);

export const getSpace = () =>
  api.get('/couple/space').then(r => r.data);

// Chat
export const getMessages = (skip = 0, limit = 50) =>
  api.get('/chat/messages', { params: { skip, limit } }).then(r => r.data);

export const uploadMedia = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/chat/upload-media', form).then(r => r.data);
};

export const addReaction = (messageId, emoji) =>
  api.post(`/chat/messages/${messageId}/react`, { emoji }).then(r => r.data);

// Mood
export const submitMood = (mood_type, note = '') =>
  api.post('/mood/', { mood_type, note }).then(r => r.data);

export const getTodayMoods = () =>
  api.get('/mood/today').then(r => r.data);

export const getMoodHistory = (limit = 30) =>
  api.get('/mood/history', { params: { limit } }).then(r => r.data);

// Memories
export const getMemories = () =>
  api.get('/memories/').then(r => r.data);

export const createMemory = (title, description, date, imageFile) => {
  const form = new FormData();
  form.append('title', title);
  form.append('description', description || '');
  form.append('date', date);
  if (imageFile) form.append('image', imageFile);
  return api.post('/memories/', form).then(r => r.data);
};

export const deleteMemory = (id) =>
  api.delete(`/memories/${id}`).then(r => r.data);

// Explore
export const getPlaces = (category, lat, lng) =>
  api.get('/explore/places', { params: { category, lat, lng } }).then(r => r.data);

export const getPlace = (id) =>
  api.get(`/explore/places/${id}`).then(r => r.data);

export const getCategories = () =>
  api.get('/explore/categories').then(r => r.data);

// AI
export const askAI = (messages) =>
  api.post('/ai/chat', { messages }).then(r => r.data);

export const startAISession = (days) =>
  api.post('/ai/session/start', { days }).then(r => r.data);

export const sendAIInterviewMessage = (session_id, message) =>
  api.post('/ai/session/interview', { session_id, message }).then(r => r.data);

export const finishAIInterview = (session_id, pov) =>
  api.post('/ai/session/finish-interview', null, { params: { session_id, pov } }).then(r => r.data);

export default api;
