// Talks to the 4Guard Worker API (/api/*). The session lives in an HttpOnly cookie,
// so the browser never handles the login token directly.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error || `Request failed (${response.status}).`);
  return data;
}

let mePromise;
/** The signed-in user, or null for visitors. Cached for the page. */
export function getMe({ refresh = false } = {}) {
  if (!mePromise || refresh) {
    mePromise = api('/me').then(data => data.user || null);
  }
  return mePromise;
}

export const signOut = () => api('/auth/logout', { method: 'POST' }).catch(() => {}).finally(() => { mePromise = Promise.resolve(null); });

// ---- Small display helpers used by several pages -------------------------------------------
export const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

export function formatDate(value, options = {}) {
  if (!value) return '';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  return date.toLocaleDateString('en-ZA', { weekday: options.weekday ? 'short' : undefined, day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  return date.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="/assets/img/icons.svg#${name}"></use></svg>`;

export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function toast(message) {
  document.querySelector('.toast')?.remove();
  const element = document.createElement('div');
  element.className = 'toast';
  element.setAttribute('role', 'status');
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 4200);
}

/** Puts a message in a status element (role=status/alert) with the right colour. */
export function showStatus(element, message, type = 'success') {
  if (!element) return;
  element.className = message ? `alert alert-${type} form-status` : 'form-status';
  element.textContent = message;
}
