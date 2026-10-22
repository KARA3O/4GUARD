// Messages about a booking, in both directions (stored in the customer_feedback table).
// from_admin = 0: written by the customer; from_admin = 1: a reply from 4Guard.

import { requireAdmin, requireUser } from '../lib/auth.js';
import { badRequest, json, notFound, readBody, text } from '../lib/http.js';

const MAX_LENGTH = 1500;

function readMessage(data) {
  const bookingId = text(data.booking_id, 64);
  const message = text(data.message, 3000);
  if (!bookingId) throw badRequest('Choose the booking this message is about.');
  if (!message) throw badRequest('Write a message first.');
  if (message.length > MAX_LENGTH) throw badRequest('Keep messages under 1,500 characters.');
  return { bookingId, message };
}

export async function listMyMessages(request, env) {
  const user = await requireUser(request, env);
  const { results } = await env.DB.prepare(
    `select customer_feedback.id, customer_feedback.booking_id, customer_feedback.service_type, customer_feedback.message,
            customer_feedback.from_admin, customer_feedback.read_at, customer_feedback.created_at, bookings.reference
       from customer_feedback left join bookings on bookings.id = customer_feedback.booking_id
      where customer_feedback.customer_id = ? order by customer_feedback.created_at asc limit 500`
  ).bind(user.id).all();
  // Opening the portal counts as reading 4Guard's replies.
  await env.DB.prepare("update customer_feedback set read_at = datetime('now') where customer_id = ? and from_admin = 1 and read_at is null").bind(user.id).run();
  return json({ messages: results });
}

export async function sendMyMessage(request, env) {
  const user = await requireUser(request, env);
  const { bookingId, message } = readMessage(await readBody(request));
  const booking = await env.DB.prepare('select id, service_type from bookings where id = ? and customer_id = ?').bind(bookingId, user.id).first();
  if (!booking) throw notFound('That booking is not on your account.');
  await env.DB.prepare(
    'insert into customer_feedback (id, booking_id, customer_id, customer_name, customer_email, service_type, message, from_admin) values (?, ?, ?, ?, ?, ?, ?, 0)'
  ).bind(crypto.randomUUID(), booking.id, user.id, user.full_name, user.email, booking.service_type, message).run();
  return json({ message: 'Message sent to 4Guard.' }, 201);
}

export async function listAllMessages(request, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(
    `select customer_feedback.id, customer_feedback.booking_id, customer_feedback.customer_name, customer_feedback.customer_email,
            customer_feedback.service_type, customer_feedback.message, customer_feedback.from_admin, customer_feedback.read_at,
            customer_feedback.created_at, bookings.reference, bookings.status as booking_status
       from customer_feedback left join bookings on bookings.id = customer_feedback.booking_id
      order by customer_feedback.created_at asc limit 1000`
  ).all();
  return json({ messages: results });
}

export async function replyToCustomer(request, env) {
  await requireAdmin(request, env);
  const { bookingId, message } = readMessage(await readBody(request));
  const booking = await env.DB.prepare(
    'select bookings.id, bookings.service_type, users.id as customer_id, users.full_name, users.email from bookings join users on users.id = bookings.customer_id where bookings.id = ?'
  ).bind(bookingId).first();
  if (!booking) throw notFound('Booking not found.');
  await env.DB.batch([
    env.DB.prepare(
      'insert into customer_feedback (id, booking_id, customer_id, customer_name, customer_email, service_type, message, from_admin) values (?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(crypto.randomUUID(), booking.id, booking.customer_id, booking.full_name, booking.email, booking.service_type, message),
    // Replying means the owner has read this conversation.
    env.DB.prepare("update customer_feedback set read_at = datetime('now') where booking_id = ? and from_admin = 0 and read_at is null").bind(booking.id),
  ]);
  return json({ message: `Reply sent to ${booking.full_name}.` }, 201);
}

export async function markAllRead(request, env) {
  await requireAdmin(request, env);
  const bookingId = text((await readBody(request)).booking_id, 64);
  const statement = bookingId
    ? env.DB.prepare("update customer_feedback set read_at = datetime('now') where booking_id = ? and from_admin = 0 and read_at is null").bind(bookingId)
    : env.DB.prepare("update customer_feedback set read_at = datetime('now') where from_admin = 0 and read_at is null");
  await statement.run();
  return json({ message: 'Marked as read.' });
}
