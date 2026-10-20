const SESSION_DAYS = 7;
const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await routeApi(request, env, url);
    } catch (error) {
      console.error(error);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  }
};

async function routeApi(request, env, url) {
  const path = url.pathname;
  if (request.method === 'POST' && path === '/api/auth/signup') return signUp(request, env);
  if (request.method === 'POST' && path === '/api/auth/login') return signIn(request, env);
  if (request.method === 'POST' && path === '/api/auth/logout') return signOut(request, env);
  if (request.method === 'GET' && path === '/api/me') return getMe(request, env);
  if (request.method === 'GET' && path === '/api/bookings') return listBookings(request, env, url);
  if (request.method === 'POST' && path === '/api/bookings') return createBooking(request, env);
  if (request.method === 'PATCH' && path.startsWith('/api/bookings/')) return updateBooking(request, env, path.split('/').pop());
  return json({ error: 'Not found.' }, 404);
}

async function signUp(request, env) {
  const data = await requestBody(request);
  const fullName = String(data.full_name || '').trim();
  const email = normaliseEmail(data.email);
  const password = String(data.password || '');
  if (!fullName || !isEmail(email) || password.length < 8) return json({ error: 'Enter a name, a valid email and a password of at least 8 characters.' }, 400);
  const existing = await env.DB.prepare('select id from users where email = ?').bind(email).first();
  if (existing) return json({ error: 'An account already exists for this email. Please sign in.' }, 409);
  const salt = randomToken(16);
  const passwordHash = await hashPassword(password, salt);
  await env.DB.prepare('insert into users (id, full_name, email, password_hash, password_salt) values (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), fullName, email, passwordHash, salt).run();
  return json({ message: 'Account created. You can now sign in.' }, 201);
}

async function signIn(request, env) {
  const data = await requestBody(request);
  const email = normaliseEmail(data.email);
  const password = String(data.password || '');
  const user = await env.DB.prepare('select * from users where email = ?').bind(email).first();
  if (!user || !(await hashPassword(password, user.password_salt) === user.password_hash)) return json({ error: 'Incorrect email or password.' }, 401);
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').bind(tokenHash, user.id, expires).run();
  return json({ user: publicUser(user, env) }, 200, { 'Set-Cookie': sessionCookie(token, false, new URL(request.url).protocol === 'https:') });
}

async function signOut(request, env) {
  const token = readCookie(request, 'fourguard_session');
  if (token) await env.DB.prepare('delete from sessions where token_hash = ?').bind(await sha256(token)).run();
  return json({ message: 'Signed out.' }, 200, { 'Set-Cookie': sessionCookie('', true, new URL(request.url).protocol === 'https:') });
}

async function getMe(request, env) {
  const user = await requireUser(request, env);
  return user ? json({ user: publicUser(user, env) }) : unauthorised();
}

async function createBooking(request, env) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  const data = await requestBody(request);
  const service = String(data.service_type || '').trim();
  const property = String(data.property_type || '').trim();
  const preferredDate = String(data.preferred_date || '').trim();
  const location = String(data.location || '').trim();
  const details = String(data.details || '').trim();
  if (!service || !property || !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || !location || !details) return json({ error: 'Please complete all booking fields.' }, 400);
  await env.DB.prepare('insert into bookings (id, customer_id, customer_email, customer_name, service_type, property_type, preferred_date, location, details) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), user.id, user.email, user.full_name, service, property, preferredDate, location, details).run();
  return json({ message: 'Your booking request has been sent.' }, 201);
}

async function listBookings(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  const owner = isAdmin(user, env);
  const email = normaliseEmail(url.searchParams.get('email') || '');
  let statement;
  if (owner && email) statement = env.DB.prepare('select * from bookings where customer_email = ? order by created_at desc').bind(email);
  else if (owner) statement = env.DB.prepare('select * from bookings order by created_at desc');
  else statement = env.DB.prepare('select * from bookings where customer_id = ? order by created_at desc').bind(user.id);
  const { results } = await statement.all();
  return json({ bookings: results });
}

async function updateBooking(request, env, id) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  if (!isAdmin(user, env)) return json({ error: 'Only the owner can update bookings.' }, 403);
  const data = await requestBody(request);
  const statuses = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
  if (!statuses.includes(data.status)) return json({ error: 'Invalid booking status.' }, 400);
  const result = await env.DB.prepare("update bookings set status = ?, admin_note = ?, updated_at = datetime('now') where id = ?").bind(data.status, String(data.admin_note || '').trim() || null, id).run();
  if (!result.meta.changes) return json({ error: 'Booking not found.' }, 404);
  return json({ message: 'Booking updated.' });
}

async function requireUser(request, env) {
  const token = readCookie(request, 'fourguard_session');
  if (!token) return null;
  return env.DB.prepare("select users.* from sessions join users on users.id = sessions.user_id where sessions.token_hash = ? and datetime(sessions.expires_at) > datetime('now')").bind(await sha256(token)).first();
}

function publicUser(user, env) { return { id: user.id, full_name: user.full_name, email: user.email, is_admin: isAdmin(user, env) }; }
function isAdmin(user, env) { return normaliseEmail(user.email) === normaliseEmail(env.ADMIN_EMAIL); }
function normaliseEmail(value) { return String(value || '').trim().toLowerCase(); }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function readCookie(request, name) { return request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1); }
function sessionCookie(value, remove, secure) { return `fourguard_session=${value}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${remove ? 0 : SESSION_DAYS * 86400}`; }
function randomToken(byteLength) { return Array.from(crypto.getRandomValues(new Uint8Array(byteLength)), byte => byte.toString(16).padStart(2, '0')).join(''); }
async function sha256(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join(''); }
async function hashPassword(password, salt) { const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 150000, hash: 'SHA-256' }, material, 256); return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join(''); }
async function requestBody(request) { try { return await request.json(); } catch { return {}; } }
function json(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } }); }
function unauthorised() { return json({ error: 'Please sign in to continue.' }, 401); }
