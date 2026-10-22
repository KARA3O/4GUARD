// Passwords, sessions and roles.
//
// - Passwords: PBKDF2-SHA256, 100,000 iterations (the maximum Cloudflare Workers accepts), per-user salt.
//   Kept identical to v1 so existing accounts can still sign in.
// - Sessions: a random token in an HttpOnly cookie; only its SHA-256 hash is stored in D1.
// - Admin: the account whose email equals ADMIN_EMAIL (checked on the server for every admin route).

import { forbidden, normaliseEmail, readCookie, unauthorised } from './http.js';

export const SESSION_COOKIE = 'fourguard_session';
export const SESSION_DAYS = 7;
export const DEFAULT_ADMIN_EMAIL = 'guardddmt@gmail.com';
const encoder = new TextEncoder();

const toHex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

export function randomToken(byteLength) {
  return toHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(value) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export async function hashPassword(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100_000, hash: 'SHA-256' }, material, 256);
  return toHex(bits);
}

/** Constant-time string comparison (avoids leaking how many characters matched). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

export const adminEmail = env => normaliseEmail(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
export const isAdmin = (user, env) => Boolean(user) && normaliseEmail(user.email) === adminEmail(env);

export function publicUser(user, env) {
  return { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone || '', is_admin: isAdmin(user, env) };
}

export function sessionCookie(request, value, remove = false) {
  const secure = new URL(request.url).protocol === 'https:' ? 'Secure; ' : '';
  return `${SESSION_COOKIE}=${value}; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=${remove ? 0 : SESSION_DAYS * 86_400}`;
}

/** Creates a session row and returns the Set-Cookie header value. */
export async function startSession(request, env, userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("delete from sessions where user_id = ? and datetime(expires_at) <= datetime('now')").bind(userId),
    env.DB.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').bind(await sha256(token), userId, expires),
  ]);
  return sessionCookie(request, token);
}

/** The signed-in user, or null. */
export async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare(
    "select users.* from sessions join users on users.id = sessions.user_id where sessions.token_hash = ? and datetime(sessions.expires_at) > datetime('now')"
  ).bind(await sha256(token)).first();
}

export async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw unauthorised();
  return user;
}

export async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!isAdmin(user, env)) throw forbidden('Only the 4Guard owner account can do this.');
  return user;
}

// ---- Slowing down password guessing -------------------------------------------------------
const MAX_FAILURES = 8;
const WINDOW_MINUTES = 15;

export async function tooManyFailures(env, email) {
  const row = await env.DB.prepare(
    `select count(*) as failures from login_attempts where email = ? and datetime(created_at) > datetime('now', '-${WINDOW_MINUTES} minutes')`
  ).bind(email).first();
  return Number(row?.failures || 0) >= MAX_FAILURES;
}

export async function recordFailure(env, email) {
  await env.DB.batch([
    env.DB.prepare('insert into login_attempts (email) values (?)').bind(email),
    env.DB.prepare("delete from login_attempts where datetime(created_at) < datetime('now', '-1 day')"),
  ]);
}

export const clearFailures = (env, email) => env.DB.prepare('delete from login_attempts where email = ?').bind(email).run();
