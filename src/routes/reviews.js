// Reviews: one per completed booking, published only after the owner approves it.

import { requireAdmin, requireUser } from '../lib/auth.js';
import { badRequest, HttpError, json, notFound, readBody, text } from '../lib/http.js';

export async function listPublicReviews(request, env) {
  const [reviews, summary] = await env.DB.batch([
    env.DB.prepare("select customer_name, service_type, rating, review_text, created_at from reviews where status = 'APPROVED' order by created_at desc limit 12"),
    env.DB.prepare("select count(*) as total_reviews, coalesce(round(avg(rating), 1), 0) as average_rating from reviews where status = 'APPROVED'"),
  ]);
  // Public pages show first name and surname initial only.
  const shortName = name => {
    const [first, ...rest] = String(name || 'Customer').trim().split(/\s+/);
    return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
  };
  return json(
    {
      reviews: reviews.results.map(review => ({ ...review, customer_name: shortName(review.customer_name) })),
      summary: summary.results[0] || { total_reviews: 0, average_rating: 0 },
    },
  );
}

export async function createReview(request, env) {
  const user = await requireUser(request, env);
  const data = await readBody(request);
  const bookingId = text(data.booking_id, 64);
  const rating = Number(data.rating);
  const reviewText = text(data.review_text, 2000);
  if (!bookingId || !Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest('Choose a rating from 1 to 5 stars.');
  if (reviewText.length > 1200) throw badRequest('Keep your review under 1,200 characters.');

  const booking = await env.DB.prepare('select id, status, service_type from bookings where id = ? and customer_id = ?').bind(bookingId, user.id).first();
  if (!booking) throw notFound('That booking is not on your account.');
  if (booking.status !== 'COMPLETED') throw badRequest('You can review a job once 4Guard marks it as completed.');
  const existing = await env.DB.prepare('select id from reviews where booking_id = ?').bind(bookingId).first();
  if (existing) throw new HttpError(409, 'You have already reviewed this job.');

  await env.DB.prepare('insert into reviews (id, booking_id, customer_id, customer_name, service_type, rating, review_text, status) values (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), bookingId, user.id, user.full_name, booking.service_type, rating, reviewText, 'PENDING').run();
  return json({ message: 'Thank you. Your review will appear on the website once 4Guard approves it.' }, 201);
}

export async function listAdminReviews(request, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(
    `select reviews.id, reviews.customer_name, reviews.service_type, reviews.rating, reviews.review_text, reviews.status, reviews.created_at,
            bookings.reference
       from reviews left join bookings on bookings.id = reviews.booking_id
      order by case reviews.status when 'PENDING' then 0 else 1 end, reviews.created_at desc limit 200`
  ).all();
  return json({ reviews: results });
}

export async function moderateReview(request, env, id) {
  await requireAdmin(request, env);
  const status = String((await readBody(request)).status || '');
  if (!['APPROVED', 'REJECTED'].includes(status)) throw badRequest('Choose approve or reject.');
  const result = await env.DB.prepare('update reviews set status = ? where id = ?').bind(status, id).run();
  if (!result.meta.changes) throw notFound('Review not found.');
  return json({ message: status === 'APPROVED' ? 'Review published.' : 'Review hidden.' });
}
