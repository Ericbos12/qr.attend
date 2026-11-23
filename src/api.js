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

export function isLocalhostOrigin() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
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
    throw err;
  }

  return data;
}

export const api = {
  // Teacher Administrator Auth
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      public: true,
      body: JSON.stringify({ email, password }),
    }),
  register: (name, email, password) =>
    request('/api/auth/register', {
      method: 'POST',
      public: true,
      body: JSON.stringify({ name, email, password }),
    }),
  me: () => request('/api/auth/me'),

  // Silent LAN IP helper for local Wi-Fi QR scanning
  getNetworkInfo: () => request('/api/network-info'),

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
  removeRecord: (sessionId, recordId) =>
    request(`/api/sessions/${sessionId}/records/${recordId}`, { method: 'DELETE' }),
  getExportCsvUrl: (sessionId) =>
    `/api/sessions/${sessionId}/export.csv?auth=${encodeURIComponent(getAuthToken())}`,
  getStreamUrl: (sessionId) =>
    `/api/sessions/${sessionId}/stream?auth=${encodeURIComponent(getAuthToken())}`,

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
