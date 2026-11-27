const TOKEN_KEY = 'attendqr_teacher_token';
const DEVICE_KEY = 'attendqr_student_device_id';
const STUDENT_PROFILE_KEY = 'attendqr_student_profile';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
    id = `dev_${rand}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getSavedStudentProfile() {
  try {
    return JSON.parse(localStorage.getItem(STUDENT_PROFILE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveStudentProfile(profile) {
  localStorage.setItem(STUDENT_PROFILE_KEY, JSON.stringify(profile));
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      qs.set(k, String(v).trim());
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

async function request(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token && !options.public) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Teacher Administrator Auth & Password Management
  getAuthProviders: () => request('/api/auth/providers', { public: true }),
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      public: true,
      body: JSON.stringify({ email, password }),
    }),
  register: (name, email, password, consentAccepted = true) =>
    request('/api/auth/register/request', {
      method: 'POST',
      public: true,
      body: JSON.stringify({ name, email, password, consentAccepted }),
    }),
  verifyRegister: (email, code) =>
    request('/api/auth/register/verify', {
      method: 'POST',
      public: true,
      body: JSON.stringify({ email, code }),
    }),
  me: () => request('/api/auth/me'),
  heartbeat: () => request('/api/auth/heartbeat', { method: 'POST' }),
  getOwnerMetrics: () => request('/api/owner/metrics'),
  requestOwnerCode: () => request('/api/owner/request-code', { method: 'POST' }),
  verifyOwnerCode: (code) =>
    request('/api/owner/verify-code', { method: 'POST', body: JSON.stringify({ code }) }),
  lockOwnerMonitor: () => request('/api/owner/lock', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  deleteAccount: (confirmation) =>
    request('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
    }),
  reportProblem: (payload) =>
    request('/api/support/report', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  forgotPassword: (email) =>
    request('/api/auth/forgot-password', {
      method: 'POST',
      public: true,
      body: JSON.stringify({ email }),
    }),
  verifyResetCode: (email, code) =>
    request('/api/auth/verify-reset-code', {
      method: 'POST',
      public: true,
      body: JSON.stringify({ email, code }),
    }),
  resetPassword: (email, code, newPassword) =>
    request('/api/auth/reset-password', {
      method: 'POST',
      public: true,
      body: JSON.stringify({ email, code, newPassword }),
    }),

  // Saved Course Codes / Classes
  getClasses: () => request('/api/classes'),
  createClass: (payload) =>
    request('/api/classes', { method: 'POST', body: JSON.stringify(payload) }),
  updateClass: (id, payload) =>
    request(`/api/classes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteClass: (id) =>
    request(`/api/classes/${id}`, { method: 'DELETE' }),

  // Sessions
  getSessions: (classId = '') =>
    request(`/api/sessions${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`),
  createSession: (payload) =>
    request('/api/sessions', { method: 'POST', body: JSON.stringify(payload) }),
  getSession: (id) => request(`/api/sessions/${id}`),
  getSessionQr: (id) => request(`/api/sessions/${id}/qr`),
  updateSession: (id, payload) =>
    request(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteSession: (id) =>
    request(`/api/sessions/${id}`, { method: 'DELETE' }),
  manualCheckIn: (sessionId, payload) =>
    request(`/api/sessions/${sessionId}/manual-checkin`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRecord: (sessionId, recordId, payload) =>
    request(`/api/sessions/${sessionId}/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  removeRecord: (sessionId, recordId) =>
    request(`/api/sessions/${sessionId}/records/${recordId}`, { method: 'DELETE' }),
  getExportCsvUrl: (sessionId) =>
    `/api/sessions/${sessionId}/export.csv?auth=${encodeURIComponent(getAuthToken())}`,
  getStreamUrl: (sessionId) =>
    `/api/sessions/${sessionId}/stream?auth=${encodeURIComponent(getAuthToken())}`,

  // Reports & Bulk Export
  getReportSummary: (filters = {}) =>
    request(`/api/reports/summary${buildQuery(filters)}`),
  getReportSummaryCsvUrl: (filters = {}) =>
    `/api/reports/summary.csv${buildQuery({ ...filters, auth: getAuthToken() })}`,
  getReportRecordsCsvUrl: (filters = {}) =>
    `/api/reports/records.csv${buildQuery({ ...filters, auth: getAuthToken() })}`,

  // Public Student QR Claim + Check-In
  claimQrScan: (payload) =>
    request('/api/public/claim', {
      method: 'POST',
      public: true,
      body: JSON.stringify(payload),
    }),
  studentCheckIn: (payload) =>
    request('/api/public/checkin', {
      method: 'POST',
      public: true,
      body: JSON.stringify(payload),
    }),
};
