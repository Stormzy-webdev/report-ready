const API_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'rca_token';

const NAME_KEY = 'rca_teacher_name';
const ID_KEY = 'rca_teacher_id';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getTeacherName = () => localStorage.getItem(NAME_KEY) ?? '';
export const getTeacherId = () => localStorage.getItem(ID_KEY) ?? '';
export function setSession(token, teacher) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NAME_KEY, teacher?.name ?? '');
  localStorage.setItem(ID_KEY, String(teacher?.id ?? ''));
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(ID_KEY);
}

// Per-teacher flags for the onboarding guide ("seen the welcome", "hid the checklist").
export function getFlag(name) {
  try { return localStorage.getItem(`rca_${name}_${getTeacherId()}`) === '1'; } catch { return false; }
}
export function setFlag(name) {
  try { localStorage.setItem(`rca_${name}_${getTeacherId()}`, '1'); } catch { /* only a convenience */ }
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body && JSON.stringify(body),
  });

  if (res.status === 401 && token) {
    clearToken();
    window.location.assign('/login');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data);
  }
  return res;
}

// body may be a plain object (sent as JSON) or FormData (sent as-is).
export async function api(path, options) {
  const res = await request(path, options);
  return res.status === 204 ? null : res.json();
}

// Downloads a file from an authenticated route (a plain link can't send the token).
export async function download(path) {
  const res = await request(path);
  const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'download';
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}
