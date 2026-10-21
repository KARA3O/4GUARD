const SESSION_DAYS = 7;
const encoder = new TextEncoder();
const DEFAULT_ADMIN_EMAIL = 'guardddmt@gmail.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await routeApi(request, env, url);
    } catch (error) {
      console.error('4Guard API error:', error);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  }
};

async function routeApi(request, env, url) {
  const path = url.pathname;
  if (request.method === 'GET' && path === '/api/health') {
    try {
      const tables = await env.DB.prepare("select name from sqlite_master where type = 'table' and name in ('users', 'sessions', 'bookings', 'reviews', 'customer_feedback')").all();
      const ready = (tables.results || []).length === 5;
      return ready
        ? json({ ok: true, service: '4Guard API', database: 'connected', schema: 'ready' })
        : json({ ok: false, service: '4Guard API', database: 'connected', schema: 'incomplete', hint: 'Run the D1 schema command in CLOUDFLARE_SETUP.md.' }, 503);
    } catch {
      return json({ ok: false, service: '4Guard API', database: 'unavailable', hint: 'Check the Cloudflare D1 binding and run the database schema.' }, 503);
    }
  }
  if (request.method === 'POST' && path === '/api/auth/signup') return signUp(request, env);
  if (request.method === 'POST' && path === '/api/auth/login') return signIn(request, env);
  if (request.method === 'POST' && path === '/api/auth/logout') return signOut(request, env);
  if (request.method === 'GET' && path === '/api/me') return getMe(request, env);
  if (request.method === 'GET' && path === '/api/reviews') return listPublicReviews(request, env);
  if (request.method === 'GET' && path === '/api/admin/reviews') return listAdminReviews(request, env);
  if (request.method === 'POST' && path === '/api/reviews') return createReview(request, env);
  if (request.method === 'PATCH' && path.startsWith('/api/reviews/')) return moderateReview(request, env, path.split('/').pop());
  if (request.method === 'GET' && path === '/api/feedback') return listFeedback(request, env);
  if (request.method === 'POST' && path === '/api/feedback') return createFeedback(request, env);
  if (request.method === 'GET' && path === '/api/admin/feedback') return listAdminFeedback(request, env);
  if (request.method === 'GET' && path === '/api/bookings') return listBookings(request, env, url);
  if (request.method === 'POST' && path === '/api/bookings') return createBooking(request, env);
  if (request.method === 'POST' && path === '/api/admin/bookings') return createAdminBooking(request, env);
  if (request.method === 'PATCH' && path.startsWith('/api/bookings/')) return updateBooking(request, env, path.split('/').pop());
  return json({ error: 'Not found.' }, 404);
}

async function signUp(request, env) {
  const data = await requestBody(request);
  const fullName = String(data.full_name || '').trim();
  const email = normaliseEmail(data.email);
  const password = String(data.password || '');
  if (!fullName || fullName.length > 120 || !isEmail(email) || email.length > 254 || password.length < 8 || password.length > 128) {
    return json({ error: 'Enter a name (up to 120 characters), a valid email and a password of 8–128 characters.' }, 400);
  }
  const existing = await env.DB.prepare('select id from users where email = ?').bind(email).first();
  if (existing) return json({ error: 'An account already exists for this email. Please sign in instead.' }, 409);

  // Protect the first owner registration: knowing the public owner email alone must not grant admin access.
  const ownerEmail = normaliseEmail(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
  if (email === ownerEmail) {
    const setupKey = String(env.ADMIN_SETUP_KEY || '');
    if (!setupKey || String(data.admin_setup_key || '') !== setupKey) {
      return json({ error: 'To register the owner account, configure ADMIN_SETUP_KEY in Cloudflare and enter the owner setup key. Other customers can register normally.' }, 403);
    }
  }

  const salt = randomToken(16);
  const passwordHash = await hashPassword(password, salt);
  const user = {
    id: crypto.randomUUID(),
    full_name: fullName,
    email,
    password_hash: passwordHash,
    password_salt: salt
  };
  await env.DB.prepare('insert into users (id, full_name, email, password_hash, password_salt) values (?, ?, ?, ?, ?)')
    .bind(user.id, user.full_name, user.email, user.password_hash, user.password_salt).run();

  // Create a session immediately after registration. Admin access is determined server-side by email.
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)')
    .bind(tokenHash, user.id, expires).run();
  return json({ message: 'Account created.', user: publicUser(user, env) }, 201, {
    'Set-Cookie': sessionCookie(token, false, new URL(request.url).protocol === 'https:')
  });
}

async function signIn(request, env) {
  const data = await requestBody(request);
  const email = normaliseEmail(data.email);
  const password = String(data.password || '');
  if (!isEmail(email) || !password) return json({ error: 'Enter your email and password.' }, 400);

  const user = await env.DB.prepare('select * from users where email = ?').bind(email).first();
  if (!user || !(await hashPassword(password, user.password_salt) === user.password_hash)) {
    return json({ error: 'Incorrect email or password. Check your details or create an account.' }, 401);
  }
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)')
    .bind(tokenHash, user.id, expires).run();
  return json({ user: publicUser(user, env) }, 200, {
    'Set-Cookie': sessionCookie(token, false, new URL(request.url).protocol === 'https:')
  });
}

async function signOut(request, env) {
  const token = readCookie(request, 'fourguard_session');
  if (token) await env.DB.prepare('delete from sessions where token_hash = ?').bind(await sha256(token)).run();
  return json({ message: 'Signed out.' }, 200, {
    'Set-Cookie': sessionCookie('', true, new URL(request.url).protocol === 'https:')
  });
}

async function getMe(request, env) {
  const user = await requireUser(request, env);
  return user ? json({ user: publicUser(user, env) }) : unauthorised();
}

async function createBooking(request, env) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  const data = await requestBody(request);
  const validated = validateBooking(data);
  if (validated.error) return json({ error: validated.error }, 400);
  const { service, property, preferredDate, location, details } = validated;
  await env.DB.prepare('insert into bookings (id, customer_id, customer_email, customer_name, service_type, property_type, preferred_date, location, details) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, user.email, user.full_name, service, property, preferredDate, location, details).run();
  return json({ message: 'Your booking request has been sent.' }, 201);
}

// Admin can create a booking only for an existing customer account. The booking remains
// owned by that customer, so it appears in their portal and uses the normal status flow.
async function createAdminBooking(request, env) {
  const admin = await requireUser(request, env);
  if (!admin) return unauthorised();
  if (!isAdmin(admin, env)) return json({ error: 'Only the owner can create bookings for customers.' }, 403);
  const data = await requestBody(request);
  const email = normaliseEmail(data.customer_email);
  if (!isEmail(email)) return json({ error: 'Enter the email address of a registered customer.' }, 400);
  const customer = await env.DB.prepare('select id, full_name, email from users where email = ?').bind(email).first();
  if (!customer || isAdmin(customer, env)) return json({ error: 'No customer account was found for that email. Ask the customer to create an account first.' }, 404);
  const validated = validateBooking(data);
  if (validated.error) return json({ error: validated.error }, 400);
  const { service, property, preferredDate, location, details } = validated;
  await env.DB.prepare('insert into bookings (id, customer_id, customer_email, customer_name, service_type, property_type, preferred_date, location, details) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), customer.id, customer.email, customer.full_name, service, property, preferredDate, location, details).run();
  return json({ message: `Booking created for ${customer.full_name}. It is now visible in their customer portal.` }, 201);
}

function validateBooking(data) {
  const service = String(data.service_type || '').trim();
  const property = String(data.property_type || '').trim();
  const preferredDate = String(data.preferred_date || '').trim();
  const location = String(data.location || '').trim();
  const details = String(data.details || '').trim();
  const services = ['Cleaning', 'Fumigation / Pest Control', 'Both'];
  const properties = ['Residential', 'Commercial'];
  if (!services.includes(service)) return { error: 'Choose a valid service.' };
  if (!properties.includes(property)) return { error: 'Choose a valid property type.' };
  if (!isValidBookingDate(preferredDate)) return { error: 'Choose a real date today or later.' };
  if (!location || location.length > 200) return { error: 'Enter a location of up to 200 characters.' };
  if (!details || details.length > 3000) return { error: 'Enter booking details (up to 3,000 characters).' };
  return { service, property, preferredDate, location, details };
}

function isValidBookingDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const todaySouthAfrica = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return value >= todaySouthAfrica;
}

async function listBookings(request, env, url) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  const owner = isAdmin(user, env);
  const email = normaliseEmail(url.searchParams.get('email') || '');
  const select = `select bookings.*, reviews.id as review_id, reviews.rating as review_rating,
    reviews.review_text as review_text, reviews.status as review_status
    from bookings left join reviews on reviews.booking_id = bookings.id`;
  let statement;
  if (owner && email) statement = env.DB.prepare(`${select} where bookings.customer_email = ? order by bookings.created_at desc`).bind(email);
  else if (owner) statement = env.DB.prepare(`${select} order by bookings.created_at desc`);
  else statement = env.DB.prepare(`${select} where bookings.customer_id = ? order by bookings.created_at desc`).bind(user.id);
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
  const adminNote = String(data.admin_note || '').trim();
  if (adminNote.length > 1500) return json({ error: 'Keep the customer note under 1,500 characters.' }, 400);
  if (data.status === 'CONFIRMED' && !adminNote) return json({ error: 'Add a message for the customer before confirming the booking.' }, 400);
  const result = await env.DB.prepare("update bookings set status = ?, admin_note = ?, updated_at = datetime('now') where id = ?")
    .bind(data.status, adminNote || null, id).run();
  if (!result.meta.changes) return json({ error: 'Booking not found.' }, 404);
  return json({ message: 'Booking updated.' });
}

async function createReview(request, env) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  const data = await requestBody(request);
  const bookingId = String(data.booking_id || '').trim();
  const rating = Number(data.rating);
  const reviewText = String(data.review_text || '').trim();
  if (!bookingId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json({ error: 'Choose a booking and a rating from 1 to 5 stars.' }, 400);
  }
  if (reviewText.length > 1200) return json({ error: 'Please keep your review under 1,200 characters.' }, 400);
  const booking = await env.DB.prepare('select id, status, service_type from bookings where id = ? and customer_id = ?')
    .bind(bookingId, user.id).first();
  if (!booking) return json({ error: 'That booking could not be found on your account.' }, 404);
  if (booking.status !== 'COMPLETED') return json({ error: 'You can review a service after 4Guard marks the booking as completed.' }, 400);
  const existing = await env.DB.prepare('select id from reviews where booking_id = ?').bind(bookingId).first();
  if (existing) return json({ error: 'You have already submitted a review for this booking.' }, 409);
  await env.DB.prepare('insert into reviews (id, booking_id, customer_id, customer_name, service_type, rating, review_text, status) values (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), bookingId, user.id, user.full_name, booking.service_type, rating, reviewText, 'PENDING').run();
  return json({ message: 'Thank you. Your review has been submitted and will appear after it is approved.' }, 201);
}

async function listPublicReviews(request, env) {
  const { results } = await env.DB.prepare(
    "select customer_name, service_type, rating, review_text, created_at from reviews where status = 'APPROVED' order by created_at desc limit 12"
  ).all();
  const { results: stats } = await env.DB.prepare(
    "select count(*) as total_reviews, coalesce(round(avg(rating), 1), 0) as average_rating from reviews where status = 'APPROVED'"
  ).all();
  return json({ reviews: results, summary: stats[0] || { total_reviews: 0, average_rating: 0 } });
}

async function listAdminReviews(request, env) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  if (!isAdmin(user, env)) return json({ error: 'Only the owner can manage reviews.' }, 403);
  const { results } = await env.DB.prepare(
    'select id, customer_name, service_type, rating, review_text, status, created_at from reviews order by created_at desc limit 100'
  ).all();
  return json({ reviews: results });
}

async function moderateReview(request, env, id) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  if (!isAdmin(user, env)) return json({ error: 'Only the owner can moderate reviews.' }, 403);
  const data = await requestBody(request);
  const status = String(data.status || '');
  if (!['APPROVED', 'REJECTED'].includes(status)) return json({ error: 'Choose APPROVED or REJECTED.' }, 400);
  const result = await env.DB.prepare('update reviews set status = ? where id = ?').bind(status, id).run();
  if (!result.meta.changes) return json({ error: 'Review not found.' }, 404);
  return json({ message: `Review ${status.toLowerCase()}.` });
}

async function createFeedback(request, env) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  const data = await requestBody(request);
  const bookingId = String(data.booking_id || '').trim();
  const message = String(data.message || '').trim();
  if (!bookingId || !message) return json({ error: 'Choose a job and enter your feedback.' }, 400);
  if (message.length > 1500) return json({ error: 'Please keep feedback under 1,500 characters.' }, 400);
  const booking = await env.DB.prepare('select id, service_type from bookings where id = ? and customer_id = ?').bind(bookingId, user.id).first();
  if (!booking) return json({ error: 'That job request could not be found on your account.' }, 404);
  await env.DB.prepare('insert into customer_feedback (id, booking_id, customer_id, customer_name, customer_email, service_type, message) values (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), booking.id, user.id, user.full_name, user.email, booking.service_type, message).run();
  return json({ message: 'Your feedback has been sent to 4Guard.' }, 201);
}

async function listFeedback(request, env) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  const { results } = await env.DB.prepare('select id, booking_id, service_type, message, created_at from customer_feedback where customer_id = ? order by created_at desc limit 100').bind(user.id).all();
  return json({ feedback: results });
}

async function listAdminFeedback(request, env) {
  const user = await requireUser(request, env);
  if (!user) return unauthorised();
  if (!isAdmin(user, env)) return json({ error: 'Only the owner can view customer feedback.' }, 403);
  const { results } = await env.DB.prepare('select id, booking_id, customer_name, customer_email, service_type, message, created_at from customer_feedback order by created_at desc limit 200').all();
  return json({ feedback: results });
}

async function requireUser(request, env) {
  const token = readCookie(request, 'fourguard_session');
  if (!token) return null;
  return env.DB.prepare("select users.* from sessions join users on users.id = sessions.user_id where sessions.token_hash = ? and datetime(sessions.expires_at) > datetime('now')")
    .bind(await sha256(token)).first();
}

function publicUser(user, env) {
  return { id: user.id, full_name: user.full_name, email: user.email, is_admin: isAdmin(user, env) };
}
function isAdmin(user, env) {
  const configured = normaliseEmail(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
  return normaliseEmail(user.email) === configured;
}
function normaliseEmail(value) { return String(value || '').trim().toLowerCase(); }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function readCookie(request, name) {
  return request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
function sessionCookie(value, remove, secure) {
  return `fourguard_session=${value}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${remove ? 0 : SESSION_DAYS * 86400}`;
}
function randomToken(byteLength) {
  return Array.from(crypto.getRandomValues(new Uint8Array(byteLength)), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function sha256(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function hashPassword(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, material, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function requestBody(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 16_384) return {};
  try {
    const data = await request.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function unauthorised() { return json({ error: 'Please sign in to continue.' }, 401); }
