// src/services/api.js — Axios instance + all API calls
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 — refresh token flow
api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('refresh_token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {}, {
          headers: { Authorization: `Bearer ${refresh}` }
        });
        localStorage.setItem('access_token',  data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

/* ── AUTH ─────────────────────────────────────────────────── */
export const authAPI = {
  register:  (data)              => api.post('/auth/register', data),
  verifyOTP: (email, otp)        => api.post('/auth/verify-otp', { email, otp }),
  login:     (email, password)   => api.post('/auth/login', { email, password }),
  resendOTP: (email)             => api.post('/auth/resend-otp', { email }),
  refresh:   ()                  => api.post('/auth/refresh'),
};

/* ── USERS / PROFILE ──────────────────────────────────────── */
export const userAPI = {
  getProfile:      ()       => api.get('/users/profile'),
  updateProfile:   (data)   => api.put('/users/profile', data),
  addExperience:   (data)   => api.post('/users/experience', data),
  updateExperience:(id, d)  => api.put(`/users/experience/${id}`, d),
  deleteExperience:(id)     => api.delete(`/users/experience/${id}`),
  addEducation:    (data)   => api.post('/users/education', data),
  updateSkills:    (skills) => api.put('/users/skills', { skills }),
  uploadCV:        (file)   => {
    const fd = new FormData(); fd.append('cv', file);
    return api.post('/users/cv', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

/* ── JOBS ─────────────────────────────────────────────────── */
export const jobAPI = {
  search:       (params) => api.get('/jobs', { params }),
  getOne:       (id)     => api.get(`/jobs/${id}`),
  create:       (data)   => api.post('/jobs', data),
  apply:        (id, d)  => api.post(`/jobs/${id}/apply`, d),
  boost:        (id, d)  => api.post(`/jobs/${id}/boost`, d),
  getApplicants:(id)     => api.get(`/jobs/${id}/applicants`),
  updateStatus: (appId, status) => api.patch(`/jobs/applications/${appId}/status`, { status }),
  myJobs:       ()       => api.get('/jobs?my=true'),
};

/* ── COURSES ──────────────────────────────────────────────── */
export const courseAPI = {
  search:       (params) => api.get('/courses', { params }),
  getOne:       (id)     => api.get(`/courses/${id}`),
  create:       (data)   => api.post('/courses', data),
  submit:       (id)     => api.patch(`/courses/${id}/submit`),
  enroll:       (id)     => api.post(`/courses/${id}/enroll`),
  updateProgress:(enrollId, data) => api.patch(`/courses/enrollments/${enrollId}/progress`, data),
  claimCert:    (id)     => api.post(`/courses/${id}/certificate`),
  getLessons:   (id)     => api.get(`/courses/${id}/lessons`),
  review:       (id, d)  => api.post(`/courses/${id}/reviews`, d),
  getAnalytics: (id)     => api.get(`/courses/${id}/analytics`),
};

/* ── CREDITS ──────────────────────────────────────────────── */
export const creditAPI = {
  balance:        ()         => api.get('/credits/balance'),
  transactions:   (params)   => api.get('/credits/transactions', { params }),
  topup:          (data)     => api.post('/credits/topup', data),
  withdraw:       (data)     => api.post('/credits/withdraw', data),
};

/* ── MATCHING & AI RECOMMENDATIONS ───────────────────────── */
export const matchingAPI = {
  scoreForJob:    (jobId)   => api.get(`/matching/job/${jobId}/score`),
  coursesForJob:  (jobId)   => api.get(`/matching/job/${jobId}/courses`),
  recJobs:        ()        => api.get('/recommendations/jobs'),
  recCourses:     ()        => api.get('/recommendations/courses'),
  recProfile:     ()        => api.get('/recommendations/profile'),
  searchCandidates:(params) => api.get('/matching/candidates', { params }),
};

/* ── CLAUDE AI ────────────────────────────────────────────── */
export const claudeAPI = {
  explainMatch:     (data) => api.post('/matching/ai/explain-match', data),
  coverLetter:      (data) => api.post('/matching/ai/cover-letter', data),
  analyzeProfile:   (data) => api.post('/matching/ai/profile-analysis', data),
  interviewPrep:    (data) => api.post('/matching/ai/interview-prep', data),
  learningPath:     (data) => api.post('/matching/ai/learning-path', data),
  chat:             (data) => api.post('/matching/ai/chat', data),
};

/* ── ADMIN ────────────────────────────────────────────────── */
export const adminAPI = {
  pendingCourses: ()        => api.get('/admin/courses/pending'),
  approveCourse:  (id)      => api.patch(`/admin/courses/${id}/approve`),
  rejectCourse:   (id, r)   => api.patch(`/admin/courses/${id}/reject`, { reason: r }),
  users:          (params)  => api.get('/admin/users', { params }),
  suspendUser:    (id)      => api.patch(`/admin/users/${id}/suspend`),
  analytics:      ()        => api.get('/admin/analytics'),
  creditAdjust:   (data)    => api.post('/admin/credits/adjust', data),
};

/* ── NOTIFICATIONS ────────────────────────────────────────── */
export const notifAPI = {
  list:      (params) => api.get('/notifications', { params }),
  markRead:  (id)     => api.patch(`/notifications/${id}/read`),
  readAll:   ()       => api.patch('/notifications/read-all'),
};

export default api;
