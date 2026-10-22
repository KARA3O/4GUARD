// 4Guard Worker entry point.
// Everything under /api/* is handled here; every other path is a static file from /public
// (Cloudflare Workers Static Assets, configured in wrangler.toml).

import { HttpError, json } from './lib/http.js';
import { changePassword, getMe, resetCustomerPassword, signIn, signOut, signUp, updateMe } from './routes/auth.js';
import { adminStats, cancelBooking, createBooking, createBookingForCustomer, listBookings, updateBooking } from './routes/bookings.js';
import { health } from './routes/health.js';
import { listAllMessages, listMyMessages, markAllRead, replyToCustomer, sendMyMessage } from './routes/messages.js';
import { createReview, listAdminReviews, listPublicReviews, moderateReview } from './routes/reviews.js';

// [method, pattern, handler]. ":id" matches one path segment and is passed to the handler.
const ROUTES = [
  ['GET', '/api/health', health],

  ['POST', '/api/auth/signup', signUp],
  ['POST', '/api/auth/login', signIn],
  ['POST', '/api/auth/logout', signOut],
  ['GET', '/api/me', getMe],
  ['PATCH', '/api/me', updateMe],
  ['POST', '/api/me/password', changePassword],

  ['GET', '/api/bookings', listBookings],
  ['POST', '/api/bookings', createBooking],
  ['POST', '/api/bookings/:id/cancel', cancelBooking],
  ['PATCH', '/api/bookings/:id', updateBooking],

  ['GET', '/api/messages', listMyMessages],
  ['POST', '/api/messages', sendMyMessage],

  ['GET', '/api/reviews', listPublicReviews],
  ['POST', '/api/reviews', createReview],
  ['PATCH', '/api/reviews/:id', moderateReview],

  ['GET', '/api/admin/stats', adminStats],
  ['POST', '/api/admin/bookings', createBookingForCustomer],
  ['GET', '/api/admin/messages', listAllMessages],
  ['POST', '/api/admin/messages', replyToCustomer],
  ['POST', '/api/admin/messages/read', markAllRead],
  ['GET', '/api/admin/reviews', listAdminReviews],
  ['POST', '/api/admin/users/reset-password', resetCustomerPassword],
];

function match(method, pathname) {
  for (const [routeMethod, pattern, handler] of ROUTES) {
    if (routeMethod !== method) continue;
    const routeParts = pattern.split('/');
    const pathParts = pathname.replace(/\/+$/, '').split('/');
    if (routeParts.length !== pathParts.length) continue;
    let id;
    const same = routeParts.every((part, index) => {
      if (part === ':id') { id = decodeURIComponent(pathParts[index]); return Boolean(id); }
      return part === pathParts[index];
    });
    if (same) return { handler, id };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    // Requests that change data must come from this website (cross-site request forgery protection).
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return json({ error: 'Requests must come from the 4Guard website.' }, 403);
    }

    const route = match(request.method, url.pathname);
    if (!route) return json({ error: 'Not found.' }, 404);
    try {
      return await route.handler(request, env, route.id ?? url, url);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error('4Guard API error:', error);
      return json({ error: 'Something went wrong on our side. Please try again in a moment.' }, 500);
    }
  },
};
