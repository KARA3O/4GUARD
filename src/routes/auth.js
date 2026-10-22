// Accounts: create account, sign in, sign out, my details, change password.

import {
  adminEmail, clearFailures, currentUser, hashPassword, isAdmin, publicUser, randomToken, recordFailure,
  requireAdmin, requireUser, safeEqual, sessionCookie, sha256, startSession, tooManyFailures, SESSION_COOKIE,
} from '../lib/auth.js';
import { badRequest, cleanPhone, forbidden, HttpError, isEmail, json, normaliseEmail, readBody, readCookie, text } from '../lib/http.js';

export async function signUp(request, env) {
  const data = await readBody(request);
  const fullName = text(data.full_name, 200);
  const email = normaliseEmail(data.email);
  const password = String(data.password || '');
  const phone = cleanPhone(data.phone);

  if (!fullName || fullName.length > 120) throw badRequest('Enter your full name (up to 120 characters).');
  if (!isEmail(email)) throw badRequest('Enter a valid email address.');
  if (password.length < 8 || password.length > 128) throw badRequest('Choose a password of at least 8 characters.');
  if (phone === null) throw badRequest('Enter a valid phone number, for example 082 123 4567.');

  const existing = await env.DB.prepare('select id from users where email = ?').bind(email).first();
  if (existing) throw new HttpError(409, 'There is already an account for this email. Sign in instead.');

  // The owner email is public, so claiming it needs the private setup key.
  if (email === adminEmail(env)) {
    const setupKey = String(env.ADMIN_SETUP_KEY || '');
    if (!setupKey || !safeEqual(String(data.admin_setup_key || ''), setupKey)) {
      throw forbidden('This is the 4Guard owner email. Enter the owner setup key to create this account.');
    }
  }

  const salt = randomToken(16);
  const user = { id: crypto.randomUUID(), full_name: fullName, email, phone: phone || null };
  await env.DB.prepare('insert into users (id, full_name, email, password_hash, password_salt, phone) values (?, ?, ?, ?, ?, ?)')
    .bind(user.id, user.full_name, user.email, await hashPassword(password, salt), salt, user.phone).run();

  const cookie = await startSession(request, env, user.id);
  return json({ message: 'Account created.', user: publicUser(user, env) }, 201, { 'Set-Cookie': cookie });
}

export async function signIn(request, env) {
  const data = await readBody(request);
  const email = normaliseEmail(data.email);
  const password = String(data.password || '');
  if (!isEmail(email) || !password) throw badRequest('Enter your email address and password.');

  if (await tooManyFailures(env, email)) {
    throw new HttpError(429, 'Too many incorrect attempts. Wait 15 minutes and try again.');
  }
  const user = await env.DB.prepare('select * from users where email = ?').bind(email).first();
  const valid = user && safeEqual(await hashPassword(password, user.password_salt), user.password_hash);
  if (!valid) {
    await recordFailure(env, email);
    throw new HttpError(401, 'That email and password do not match. Check them, or create an account.');
  }
  await clearFailures(env, email);
  const cookie = await startSession(request, env, user.id);
  return json({ user: publicUser(user, env) }, 200, { 'Set-Cookie': cookie });
}

export async function signOut(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('delete from sessions where token_hash = ?').bind(await sha256(token)).run();
  return json({ message: 'Signed out.' }, 200, { 'Set-Cookie': sessionCookie(request, '', true) });
}

/** The signed-in user, or { user: null } for visitors (not an error: every page asks this). */
export async function getMe(request, env) {
  const user = await currentUser(request, env);
  return json({ user: user ? publicUser(user, env) : null });
}

export async function updateMe(request, env) {
  const user = await requireUser(request, env);
  const data = await readBody(request);
  const fullName = data.full_name === undefined ? user.full_name : text(data.full_name, 200);
  const phone = data.phone === undefined ? user.phone : cleanPhone(data.phone);
  if (!fullName || fullName.length > 120) throw badRequest('Enter your full name (up to 120 characters).');
  if (phone === null) throw badRequest('Enter a valid phone number, for example 082 123 4567.');
  await env.DB.prepare('update users set full_name = ?, phone = ? where id = ?').bind(fullName, phone || null, user.id).run();
  return json({ message: 'Details saved.', user: publicUser({ ...user, full_name: fullName, phone }, env) });
}

export async function changePassword(request, env) {
  const user = await requireUser(request, env);
  const data = await readBody(request);
  const current = String(data.current_password || '');
  const next = String(data.new_password || '');
  if (!safeEqual(await hashPassword(current, user.password_salt), user.password_hash)) {
    throw badRequest('Your current password is not correct.');
  }
  if (next.length < 8 || next.length > 128) throw badRequest('Choose a new password of at least 8 characters.');
  const salt = randomToken(16);
  // Changing the password signs out every other device.
  await env.DB.batch([
    env.DB.prepare('update users set password_hash = ?, password_salt = ? where id = ?').bind(await hashPassword(next, salt), salt, user.id),
    env.DB.prepare('delete from sessions where user_id = ?').bind(user.id),
  ]);
  const cookie = await startSession(request, env, user.id);
  return json({ message: 'Password changed. Other devices have been signed out.', is_admin: isAdmin(user, env) }, 200, { 'Set-Cookie': cookie });
}

/**
 * Owner-only: give a customer a temporary password (there is no email service for automatic resets).
 * The owner reads the temporary password to the customer, who then changes it under "My details".
 */
export async function resetCustomerPassword(request, env) {
  await requireAdmin(request, env);
  const email = normaliseEmail((await readBody(request)).email);
  if (!isEmail(email)) throw badRequest('Enter the customer’s email address.');
  const customer = await env.DB.prepare('select id, full_name, email from users where email = ?').bind(email).first();
  if (!customer) throw new HttpError(404, 'No account uses that email.');
  if (isAdmin(customer, env)) throw forbidden('Change the owner password under My details instead.');
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const temporary = Array.from(crypto.getRandomValues(new Uint8Array(10)), byte => alphabet[byte % alphabet.length]).join('');
  const salt = randomToken(16);
  await env.DB.batch([
    env.DB.prepare('update users set password_hash = ?, password_salt = ? where id = ?').bind(await hashPassword(temporary, salt), salt, customer.id),
    env.DB.prepare('delete from sessions where user_id = ?').bind(customer.id),
    env.DB.prepare('delete from login_attempts where email = ?').bind(customer.email),
  ]);
  return json({ message: `Temporary password set for ${customer.full_name}.`, temporary_password: temporary });
}
