// Bookings: customers create, view and cancel their own; the owner manages all of them.

import { CATEGORIES, PROPERTY_TYPES, STATUSES, TIME_SLOTS, servicesFor } from '../../public/assets/js/catalog.js';
import { isAdmin, requireAdmin, requireUser } from '../lib/auth.js';
import {
  badRequest, cleanPhone, HttpError, isEmail, isRealDate, json, normaliseEmail, notFound, readBody, text, todayInSouthAfrica,
} from '../lib/http.js';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, easy to read over the phone

function newReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `4G-${Array.from(bytes, byte => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')}`;
}

/** Checks a booking request against the service catalogue. Returns clean values or throws 400. */
export function validateBooking(data) {
  const serviceType = text(data.service_type, 60);
  if (!CATEGORIES.some(category => category.apiValue === serviceType)) throw badRequest('Choose pest control, cleaning or both.');

  const allowed = servicesFor(serviceType);
  const requested = Array.isArray(data.service_options) ? data.service_options.map(String) : [];
  const chosen = allowed.filter(service => requested.includes(service.id));
  if (!chosen.length) throw badRequest('Choose at least one service.');
  if (chosen.length !== new Set(requested).size) throw badRequest('One of the chosen services is not available for this booking.');

  const property = PROPERTY_TYPES.find(type => type.id === data.property_type);
  if (!property) throw badRequest('Choose whether this is a home or a business.');
  const premises = text(data.premises, 80);
  if (!property.premises.includes(premises)) throw badRequest('Choose the type of property.');

  const preferredDate = text(data.preferred_date, 10);
  if (!isRealDate(preferredDate) || preferredDate < todayInSouthAfrica()) throw badRequest('Choose a date from today onwards.');
  const preferredTime = text(data.preferred_time, 40);
  if (!TIME_SLOTS.includes(preferredTime)) throw badRequest('Choose a preferred time of day.');

  const address = text(data.address, 300);
  const location = text(data.location, 300);
  if (!address || address.length > 200) throw badRequest('Enter the street address (up to 200 characters).');
  if (!location || location.length > 120) throw badRequest('Enter the suburb or town (up to 120 characters).');

  const phone = cleanPhone(data.contact_phone);
  if (!phone) throw badRequest('Enter a phone number we can call on the day, for example 082 123 4567.');

  const details = text(data.details, 4000);
  if (details.length > 3000) throw badRequest('Keep the extra details under 3,000 characters.');

  return {
    service_type: serviceType,
    service_options: chosen.map(service => service.label).join('; '),
    property_type: property.id,
    premises,
    preferred_date: preferredDate,
    preferred_time: preferredTime,
    address,
    location,
    contact_phone: phone,
    details: details || 'No extra details given.',
  };
}

async function insertBooking(env, customer, booking) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference();
    try {
      await env.DB.prepare(
        `insert into bookings (id, reference, customer_id, customer_email, customer_name, service_type, service_options, property_type, premises,
          preferred_date, preferred_time, address, location, contact_phone, details)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), reference, customer.id, customer.email, customer.full_name, booking.service_type, booking.service_options,
        booking.property_type, booking.premises, booking.preferred_date, booking.preferred_time, booking.address, booking.location,
        booking.contact_phone, booking.details,
      ).run();
      return reference;
    } catch (error) {
      if (!String(error?.message || '').includes('UNIQUE')) throw error; // retry only on a reference clash
    }
  }
  throw new Error('Could not create a unique booking reference.');
}

export async function createBooking(request, env) {
  const user = await requireUser(request, env);
  const booking = validateBooking(await readBody(request));
  // Remember the phone number on the account for next time.
  if (!user.phone) await env.DB.prepare('update users set phone = ? where id = ?').bind(booking.contact_phone, user.id).run();
  const reference = await insertBooking(env, user, booking);
  return json({ message: 'Booking request sent.', reference }, 201);
}

/** Owner books on behalf of an existing customer account (e.g. a phone booking). */
export async function createBookingForCustomer(request, env) {
  await requireAdmin(request, env);
  const data = await readBody(request);
  const email = normaliseEmail(data.customer_email);
  if (!isEmail(email)) throw badRequest('Enter the email address of a registered customer.');
  const customer = await env.DB.prepare('select id, full_name, email from users where email = ?').bind(email).first();
  if (!customer || isAdmin(customer, env)) {
    throw notFound('No customer account uses that email. Ask the customer to create an account first.');
  }
  const reference = await insertBooking(env, customer, validateBooking(data));
  return json({ message: `Booking ${reference} created for ${customer.full_name}. It is now in their portal.`, reference }, 201);
}

const BOOKING_SELECT = `select bookings.*, reviews.id as review_id, reviews.rating as review_rating,
  reviews.review_text as review_text, reviews.status as review_status
  from bookings left join reviews on reviews.booking_id = bookings.id`;

export async function listBookings(request, env, url) {
  const user = await requireUser(request, env);
  if (!isAdmin(user, env)) {
    const { results } = await env.DB.prepare(`${BOOKING_SELECT} where bookings.customer_id = ? order by bookings.created_at desc`).bind(user.id).all();
    return json({ bookings: results });
  }
  // Owner: optional status filter and a search across name, email, reference, phone and suburb.
  const status = url.searchParams.get('status') || '';
  const query = text(url.searchParams.get('q') || url.searchParams.get('email') || '', 120).toLowerCase();
  const where = [];
  const values = [];
  if (STATUSES.includes(status)) { where.push('bookings.status = ?'); values.push(status); }
  if (query) {
    where.push(`(lower(bookings.customer_name) like ? or bookings.customer_email like ? or lower(coalesce(bookings.reference, '')) like ?
      or coalesce(bookings.contact_phone, '') like ? or lower(bookings.location) like ?)`);
    const like = `%${query.replace(/[%_]/g, '')}%`;
    values.push(like, like, like, like, like);
  }
  const sql = `${BOOKING_SELECT}${where.length ? ` where ${where.join(' and ')}` : ''}
    order by case bookings.status when 'PENDING' then 0 when 'CONFIRMED' then 1 else 2 end,
             coalesce(bookings.scheduled_date, bookings.preferred_date) asc, bookings.created_at desc limit 300`;
  const { results } = await env.DB.prepare(sql).bind(...values).all();
  return json({ bookings: results });
}

/** Owner updates status, schedule and the note the customer sees. */
export async function updateBooking(request, env, id) {
  await requireAdmin(request, env);
  const data = await readBody(request);
  const booking = await env.DB.prepare('select * from bookings where id = ?').bind(id).first();
  if (!booking) throw notFound('Booking not found.');

  const status = String(data.status || booking.status);
  if (!STATUSES.includes(status)) throw badRequest('Choose a valid status.');
  const note = text(data.admin_note ?? booking.admin_note ?? '', 2000);
  if (note.length > 1500) throw badRequest('Keep the note to the customer under 1,500 characters.');

  let scheduledDate = text(data.scheduled_date ?? booking.scheduled_date ?? '', 10);
  let scheduledTime = text(data.scheduled_time ?? booking.scheduled_time ?? '', 40);
  if (status === 'CONFIRMED') {
    if (!note) throw badRequest('Add a message for the customer before confirming (for example what to prepare).');
    scheduledDate ||= booking.preferred_date;
    scheduledTime ||= booking.preferred_time || 'Any time';
    if (!isRealDate(scheduledDate)) throw badRequest('Choose the date the job is booked for.');
    if (!TIME_SLOTS.includes(scheduledTime)) throw badRequest('Choose the time of day the job is booked for.');
  } else if (scheduledDate && !isRealDate(scheduledDate)) {
    throw badRequest('Choose a valid scheduled date.');
  }

  await env.DB.prepare(
    "update bookings set status = ?, admin_note = ?, scheduled_date = ?, scheduled_time = ?, updated_at = datetime('now') where id = ?"
  ).bind(status, note || null, scheduledDate || null, scheduledTime || null, id).run();
  return json({ message: `Booking ${booking.reference || ''} updated.`.replace('  ', ' ') });
}

/** Customers can cancel their own booking until the job is done. */
export async function cancelBooking(request, env, id) {
  const user = await requireUser(request, env);
  const booking = await env.DB.prepare('select id, status, reference from bookings where id = ? and customer_id = ?').bind(id, user.id).first();
  if (!booking) throw notFound('That booking is not on your account.');
  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) throw new HttpError(409, 'Only upcoming bookings can be cancelled.');
  const reason = text((await readBody(request)).reason, 600);
  await env.DB.batch([
    env.DB.prepare("update bookings set status = 'CANCELLED', updated_at = datetime('now') where id = ?").bind(id),
    // Leave a message so the owner knows why.
    env.DB.prepare(
      `insert into customer_feedback (id, booking_id, customer_id, customer_name, customer_email, service_type, message, from_admin)
       select ?, bookings.id, users.id, users.full_name, users.email, bookings.service_type, ?, 0 from bookings join users on users.id = bookings.customer_id where bookings.id = ?`
    ).bind(crypto.randomUUID(), `Cancelled by the customer.${reason ? ` Reason: ${reason}` : ''}`, id),
  ]);
  return json({ message: `Booking ${booking.reference || ''} cancelled.`.replace('  ', ' ') });
}

/** Numbers for the owner dashboard. */
export async function adminStats(request, env) {
  await requireAdmin(request, env);
  const [statuses, today, reviews, messages, customers] = await env.DB.batch([
    env.DB.prepare('select status, count(*) as total from bookings group by status'),
    env.DB.prepare("select count(*) as total from bookings where status = 'CONFIRMED' and scheduled_date = ?").bind(todayInSouthAfrica()),
    env.DB.prepare("select count(*) as total from reviews where status = 'PENDING'"),
    env.DB.prepare('select count(*) as total from customer_feedback where from_admin = 0 and read_at is null'),
    env.DB.prepare('select count(*) as total from users'),
  ]);
  const byStatus = Object.fromEntries(STATUSES.map(status => [status, 0]));
  for (const row of statuses.results) byStatus[row.status] = row.total;
  return json({
    bookings: byStatus,
    jobs_today: today.results[0]?.total || 0,
    reviews_pending: reviews.results[0]?.total || 0,
    messages_unread: messages.results[0]?.total || 0,
    accounts: Math.max(0, (customers.results[0]?.total || 0) - 1),
  });
}
