// Small HTTP helpers shared by every route.

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

/** Throw from anywhere in a route to answer with a clean JSON error. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = message => new HttpError(400, message);
export const unauthorised = () => new HttpError(401, 'Please sign in to continue.');
export const forbidden = message => new HttpError(403, message || 'You do not have access to this.');
export const notFound = message => new HttpError(404, message || 'Not found.');

/** Parses a JSON body (max 16 KB). Anything else becomes an empty object. */
export async function readBody(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 16_384) throw new HttpError(413, 'That request is too large.');
  try {
    const data = await request.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function readCookie(request, name) {
  return request.headers.get('Cookie')
    ?.split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export const text = (value, max) => String(value ?? '').trim().slice(0, max ?? 10_000);
export const normaliseEmail = value => String(value || '').trim().toLowerCase();
export const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

/** South African or international numbers: 9–15 digits, optional leading +, spaces/dashes allowed. */
export function cleanPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[\s()-]/g, '');
  return /^\+?\d{9,15}$/.test(digits) ? digits : null;
}

/** Today's date in South Africa as YYYY-MM-DD. */
export function todayInSouthAfrica() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
