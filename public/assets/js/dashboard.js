// Account portal. One page, two views:
//   customer — my bookings (status timeline, 4Guard notes, cancel, review), messages, my details
//   owner    — all bookings (counts, filters, confirm with date + note), messages, reviews,
//              booking on behalf of a customer, my details + temporary customer passwords
// Every permission is also enforced by the Worker API; hiding a button is never the only protection.

import { api, escapeHtml, formatDate, formatDateTime, getMe, icon, localToday, showStatus, signOut, toast } from './api.js';
import { CATEGORIES, CLEANING_SERVICES, PEST_SERVICES, PROPERTY_TYPES, TIME_SLOTS, categoryByApiValue } from './catalog.js';

const tabsEl = document.querySelector('[data-tabs]');
const panelsEl = document.querySelector('[data-panels]');
const titleEl = document.querySelector('[data-portal-title]');
const subtitleEl = document.querySelector('[data-portal-subtitle]');

const STATUS_LABEL = { PENDING: 'Waiting for confirmation', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
const statusBadge = status => `<span class="status status-${status.toLowerCase()}">${STATUS_LABEL[status] || escapeHtml(status)}</span>`;
const categoryLabel = value => categoryByApiValue(value)?.label || value;
const serviceList = booking => (booking.service_options || categoryLabel(booking.service_type)).split('; ').join(', ');
const shortTime = slot => (slot || '').split(' (')[0].toLowerCase();

let user;
let state = { bookings: [], messages: [], reviews: [], stats: null, filter: { status: '', q: '', today: false } };

document.querySelector('[data-sign-out]').addEventListener('click', async () => {
  await signOut();
  location.assign('/');
});

// ---- Tabs -------------------------------------------------------------------------------------
let tabs = [];
function renderTabs(active) {
  tabsEl.innerHTML = tabs.map(tab => `<button type="button" role="tab" id="tab-${tab.id}" aria-selected="${tab.id === active}" aria-controls="panel">${escapeHtml(tab.label)}${tab.count ? ` <span class="count-pill" aria-label="${tab.count} new">${tab.count}</span>` : ''}</button>`).join('');
  tabsEl.querySelectorAll('button').forEach(button => button.addEventListener('click', () => openTab(button.id.slice(4))));
}
async function openTab(id) {
  const tab = tabs.find(item => item.id === id) || tabs[0];
  history.replaceState(null, '', `#${tab.id}`);
  renderTabs(tab.id);
  panelsEl.id = 'panel';
  panelsEl.setAttribute('role', 'tabpanel');
  panelsEl.setAttribute('aria-labelledby', `tab-${tab.id}`);
  panelsEl.innerHTML = '<p class="summary-empty">Loading…</p>';
  try { await tab.render(); } catch (error) {
    panelsEl.innerHTML = `<div class="alert alert-error">${icon('x')}<p>${escapeHtml(error.message)}</p></div>`;
  }
}

// ---- Shared pieces ----------------------------------------------------------------------------
function whenText(booking) {
  if (booking.scheduled_date && booking.status !== 'PENDING') {
    return `<strong>${formatDate(booking.scheduled_date, { weekday: true })}</strong><span>${escapeHtml(shortTime(booking.scheduled_time) || 'time to be confirmed')}</span>`;
  }
  return `<strong>${formatDate(booking.preferred_date, { weekday: true })}</strong><span>Requested, ${escapeHtml(shortTime(booking.preferred_time) || 'any time')}</span>`;
}

function trackHtml(booking) {
  if (booking.status === 'CANCELLED') return '';
  const order = ['PENDING', 'CONFIRMED', 'COMPLETED'];
  const at = order.indexOf(booking.status);
  const labels = ['Requested', 'Confirmed', 'Completed'];
  return `<ol class="track" aria-label="Progress">${labels.map((label, index) => {
    const state = index < at || booking.status === 'COMPLETED' ? 'done' : index === at ? 'current' : 'todo';
    return `<li data-state="${index === 0 ? 'done' : state}">${label}</li>`;
  }).join('')}</ol>`;
}

function factsHtml(booking, forOwner) {
  const facts = [
    ['pin', 'Address', [booking.address, booking.location].filter(Boolean).join(', ')],
    [booking.property_type === 'Commercial' ? 'office' : 'home', 'Property', [booking.property_type === 'Commercial' ? 'Business' : 'Home', booking.premises].filter(Boolean).join(', ')],
    ['phone', 'Phone', booking.contact_phone],
  ];
  if (forOwner) facts.unshift(['user', 'Customer', `${booking.customer_name} (${booking.customer_email})`]);
  return `<dl class="job-facts">${facts.filter(fact => fact[2]).map(([iconName, label, value]) => `<div>${icon(iconName)}<span><dt>${label}</dt><dd>${
    label === 'Phone' ? `<a href="tel:${escapeHtml(value)}">${escapeHtml(value)}</a>` : escapeHtml(value)}</dd></span></div>`).join('')}</dl>`;
}

function threadHtml(messages, viewer) {
  if (!messages.length) return '<p class="summary-empty">No messages about this booking yet.</p>';
  return `<div class="thread">${messages.map(message => {
    const fromOwner = Number(message.from_admin) === 1;
    const who = fromOwner ? (viewer === 'owner' ? 'You' : '4Guard') : (viewer === 'owner' ? message.customer_name : 'You');
    return `<div class="bubble ${fromOwner ? 'from-4guard' : 'from-customer'}"><p>${escapeHtml(message.message)}</p><small>${escapeHtml(who)}, ${formatDateTime(message.created_at)}</small></div>`;
  }).join('')}</div>`;
}

function replyFormHtml(bookingId, placeholder) {
  return `<form class="reply-form" data-reply="${bookingId}"><label class="sr-only" for="reply-${bookingId}">Message</label>
    <textarea id="reply-${bookingId}" name="message" maxlength="1500" placeholder="${placeholder}" required></textarea>
    <button class="btn" type="submit">Send</button></form>`;
}

function wireReplyForms(root, path, after) {
  root.querySelectorAll('[data-reply]').forEach(replyForm => replyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const message = replyForm.elements.message.value.trim();
    if (!message) { replyForm.elements.message.focus(); return; }
    const button = replyForm.querySelector('button');
    button.disabled = true;
    try {
      const result = await api(path, { method: 'POST', body: { booking_id: replyForm.dataset.reply, message } });
      toast(result.message);
      await after(replyForm.dataset.reply);
    } catch (error) { toast(error.message); button.disabled = false; }
  }));
}

function emptyState(iconName, heading, text, action = '') {
  return `<div class="empty">${icon(iconName)}<h3>${heading}</h3><p>${text}</p>${action}</div>`;
}

// =============================================================================================
// Customer view
// =============================================================================================
async function loadCustomerData() {
  const [{ bookings }, { messages }] = await Promise.all([api('/bookings'), api('/messages')]);
  state.bookings = bookings;
  state.messages = messages;
}

function customerJob(booking) {
  const open = ['PENDING', 'CONFIRMED'].includes(booking.status);
  const conversation = state.messages.filter(message => message.booking_id === booking.id);
  let review = '';
  if (booking.status === 'COMPLETED') {
    review = booking.review_id
      ? `<span class="summary-empty">${booking.review_status === 'APPROVED' ? 'Your review is published.' : booking.review_status === 'REJECTED' ? 'Your review was not published.' : 'Your review is waiting for approval.'} ${'★'.repeat(booking.review_rating || 0)}</span>`
      : `<button class="btn btn-small" type="button" data-open="review">${icon('star')}Review this job</button>`;
  }
  return `<article class="job" data-booking="${booking.id}">
    <div class="job-top">
      <div>${statusBadge(booking.status)} <span class="job-ref">${escapeHtml(booking.reference || '')}</span>
        <h3>${escapeHtml(serviceList(booking))}</h3>
        <p class="services">${escapeHtml(categoryLabel(booking.service_type))}</p></div>
      <div class="job-when">${whenText(booking)}</div>
    </div>
    ${trackHtml(booking)}
    ${booking.admin_note ? `<div class="job-note"><strong>Note from 4Guard</strong><p>${escapeHtml(booking.admin_note)}</p></div>` : booking.status === 'PENDING' ? '<div class="job-note" style="border-color:var(--line-strong);background:var(--surface)"><strong style="color:var(--muted)">What happens next</strong><p>4Guard will confirm the date and tell you how to prepare. You will see it here.</p></div>' : ''}
    ${factsHtml(booking, false)}
    ${booking.details && booking.details !== 'No extra details given.' ? `<p class="job-details">${escapeHtml(booking.details)}</p>` : ''}
    <div class="job-actions">
      <button class="btn btn-small btn-outline" type="button" data-open="messages">${icon('chat')}Messages${conversation.length ? ` (${conversation.length})` : ''}</button>
      ${review}
      <span class="grow"></span>
      ${open ? `<button class="btn btn-small btn-danger" type="button" data-open="cancel">Cancel booking</button>` : ''}
    </div>
    <div class="job-panel" data-panel="messages" hidden>${threadHtml(conversation, 'customer')}${booking.status === 'CANCELLED' ? '' : replyFormHtml(booking.id, 'Ask 4Guard about this booking')}</div>
    <div class="job-panel" data-panel="cancel" hidden>
      <p><strong>Cancel booking ${escapeHtml(booking.reference || '')}?</strong> 4Guard will be told straight away.</p>
      <div class="field"><label for="reason-${booking.id}">Reason <span class="optional">(optional)</span></label><input id="reason-${booking.id}" type="text" maxlength="600" data-cancel-reason></div>
      <div class="hero-actions"><button class="btn btn-danger" type="button" data-confirm-cancel>Yes, cancel booking</button><button class="btn btn-outline" type="button" data-open="cancel">Keep booking</button></div>
    </div>
    <div class="job-panel" data-panel="review" hidden>
      <fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:700;color:var(--navy);margin-bottom:6px">How did we do?</legend>
        <div class="star-input">${[5, 4, 3, 2, 1].map(value => `<input type="radio" name="rating-${booking.id}" id="r${value}-${booking.id}" value="${value}"><label for="r${value}-${booking.id}" title="${value} star${value > 1 ? 's' : ''}">${icon('star')}<span class="sr-only">${value} star${value > 1 ? 's' : ''}</span></label>`).join('')}</div></fieldset>
      <div class="field"><label for="review-${booking.id}">Your review <span class="optional">(optional)</span></label><textarea id="review-${booking.id}" maxlength="1200" data-review-text placeholder="What was the problem and how did it go?"></textarea></div>
      <div><button class="btn" type="button" data-send-review>Send review</button></div>
    </div>
  </article>`;
}

function wireCustomerJobs(root) {
  root.querySelectorAll('[data-booking]').forEach(card => {
    const id = card.dataset.booking;
    card.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
      const panel = card.querySelector(`[data-panel="${button.dataset.open}"]`);
      const opening = panel.hidden;
      card.querySelectorAll('[data-panel]').forEach(other => { other.hidden = true; });
      panel.hidden = !opening;
      if (opening) panel.querySelector('textarea, input, button')?.focus();
    }));
    card.querySelector('[data-confirm-cancel]')?.addEventListener('click', async event => {
      event.target.disabled = true;
      try {
        const result = await api(`/bookings/${id}/cancel`, { method: 'POST', body: { reason: card.querySelector('[data-cancel-reason]').value } });
        toast(result.message);
        await refreshCustomer();
      } catch (error) { toast(error.message); event.target.disabled = false; }
    });
    card.querySelector('[data-send-review]')?.addEventListener('click', async event => {
      const rating = card.querySelector(`input[name="rating-${id}"]:checked`)?.value;
      if (!rating) { toast('Choose a star rating first.'); return; }
      event.target.disabled = true;
      try {
        const result = await api('/reviews', { method: 'POST', body: { booking_id: id, rating: Number(rating), review_text: card.querySelector('[data-review-text]').value } });
        toast(result.message);
        await refreshCustomer();
      } catch (error) { toast(error.message); event.target.disabled = false; }
    });
  });
  wireReplyForms(root, '/messages', async bookingId => { await refreshCustomer(); reopen(bookingId, 'messages'); });
}

function reopen(bookingId, panel) {
  const card = panelsEl.querySelector(`[data-booking="${bookingId}"]`);
  const target = card?.querySelector(`[data-panel="${panel}"]`);
  if (target) { target.hidden = false; target.querySelector('textarea')?.focus(); }
}

async function refreshCustomer() {
  await loadCustomerData();
  const active = tabsEl.querySelector('[aria-selected="true"]')?.id.slice(4) || 'bookings';
  setCustomerCounts();
  await openTab(active);
}

function renderCustomerBookings() {
  const upcoming = state.bookings.filter(booking => ['PENDING', 'CONFIRMED'].includes(booking.status));
  const past = state.bookings.filter(booking => !['PENDING', 'CONFIRMED'].includes(booking.status));
  if (!state.bookings.length) {
    panelsEl.innerHTML = emptyState('calendar', 'No bookings yet', 'Book pest control or cleaning and it will appear here with its status.', '<a class="btn" href="/booking">Book a service</a>');
    return;
  }
  panelsEl.innerHTML = `
    <h2 style="font-size:var(--step-2)">Upcoming</h2>
    ${upcoming.length ? `<div class="job-list">${upcoming.map(customerJob).join('')}</div>` : '<p class="summary-empty">No upcoming bookings. <a href="/booking">Book a service</a>.</p>'}
    ${past.length ? `<h2 style="font-size:var(--step-2);margin-top:40px">Past and cancelled</h2><div class="job-list">${past.map(customerJob).join('')}</div>` : ''}`;
  wireCustomerJobs(panelsEl);
}

function renderCustomerMessages() {
  const withMessages = state.bookings.filter(booking => state.messages.some(message => message.booking_id === booking.id));
  if (!state.bookings.length) {
    panelsEl.innerHTML = emptyState('chat', 'No messages yet', 'Once you have a booking you can message 4Guard about it here.', '<a class="btn" href="/booking">Book a service</a>');
    return;
  }
  const others = state.bookings.filter(booking => !withMessages.includes(booking) && booking.status !== 'CANCELLED');
  panelsEl.innerHTML = `<div class="inbox">
    ${withMessages.map(booking => `<section class="conversation"><div class="conversation-head"><strong>${escapeHtml(booking.reference || '')}: ${escapeHtml(serviceList(booking))}</strong><span>${STATUS_LABEL[booking.status]}</span></div>
      ${threadHtml(state.messages.filter(message => message.booking_id === booking.id), 'customer')}
      ${booking.status === 'CANCELLED' ? '' : replyFormHtml(booking.id, 'Write a message')}</section>`).join('')}
    ${others.length ? `<section class="conversation"><div class="conversation-head"><strong>Start a conversation</strong><span>Choose the booking it is about</span></div>
      <form class="form" data-new-message><div class="field"><label for="new-message-booking">Booking</label><select id="new-message-booking" name="booking_id">${others.map(booking => `<option value="${booking.id}">${escapeHtml(booking.reference || '')}: ${escapeHtml(serviceList(booking))}</option>`).join('')}</select></div>
      <div class="field"><label for="new-message-text">Message</label><textarea id="new-message-text" name="message" maxlength="1500" required></textarea></div><div><button class="btn" type="submit">Send message</button></div></form></section>` : ''}
  </div>`;
  wireReplyForms(panelsEl, '/messages', async () => { await refreshCustomer(); });
  panelsEl.querySelector('[data-new-message]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    if (!data.message.trim()) return;
    try { toast((await api('/messages', { method: 'POST', body: data })).message); await refreshCustomer(); } catch (error) { toast(error.message); }
  });
}

function setCustomerCounts() {
  const unread = state.messages.filter(message => Number(message.from_admin) === 1 && !message.read_at).length;
  tabs = [
    { id: 'bookings', label: 'My bookings', render: renderCustomerBookings },
    { id: 'messages', label: 'Messages', count: unread, render: renderCustomerMessages },
    { id: 'details', label: 'My details', render: renderDetails },
  ];
}

// =============================================================================================
// Owner view
// =============================================================================================
async function loadOwnerData() {
  const query = new URLSearchParams();
  if (state.filter.status) query.set('status', state.filter.status);
  if (state.filter.q) query.set('q', state.filter.q);
  const [{ bookings }, stats] = await Promise.all([api(`/bookings?${query}`), api('/admin/stats')]);
  state.bookings = bookings;
  state.stats = stats;
}

function ownerJob(booking) {
  const timeOptions = TIME_SLOTS.map(slot => `<option${(booking.scheduled_time || booking.preferred_time) === slot ? ' selected' : ''}>${slot}</option>`).join('');
  return `<article class="job" data-booking="${booking.id}">
    <div class="job-top">
      <div>${statusBadge(booking.status)} <span class="job-ref">${escapeHtml(booking.reference || '')}</span>
        <h3>${escapeHtml(serviceList(booking))}</h3>
        <p class="services">${escapeHtml(categoryLabel(booking.service_type))}, requested ${formatDate(booking.created_at)}</p></div>
      <div class="job-when">${whenText(booking)}</div>
    </div>
    ${factsHtml(booking, true)}
    ${booking.details ? `<p class="job-details">${escapeHtml(booking.details)}</p>` : ''}
    ${booking.admin_note ? `<div class="job-note"><strong>Your note to the customer</strong><p>${escapeHtml(booking.admin_note)}</p></div>` : ''}
    <div class="job-actions">
      <button class="btn btn-small" type="button" data-open="manage">${booking.status === 'PENDING' ? 'Confirm or update' : 'Update booking'}</button>
      <button class="btn btn-small btn-outline" type="button" data-open="messages">${icon('chat')}Message customer</button>
      ${booking.review_id ? `<span class="summary-empty">Reviewed ${'★'.repeat(booking.review_rating || 0)}</span>` : ''}
    </div>
    <form class="job-panel" data-panel="manage" hidden>
      <div class="form-row">
        <div class="field"><label for="status-${booking.id}">Status</label><select id="status-${booking.id}" name="status">${Object.keys(STATUS_LABEL).map(status => `<option value="${status}"${booking.status === status ? ' selected' : ''}>${STATUS_LABEL[status]}</option>`).join('')}</select></div>
        <div class="field"><label for="date-${booking.id}">Booked for</label><input id="date-${booking.id}" name="scheduled_date" type="date" value="${escapeHtml(booking.scheduled_date || booking.preferred_date)}"></div>
        <div class="field"><label for="time-${booking.id}">Time of day</label><select id="time-${booking.id}" name="scheduled_time">${timeOptions}</select></div>
      </div>
      <div class="field"><label for="note-${booking.id}">Note to the customer</label><textarea id="note-${booking.id}" name="admin_note" maxlength="1500" placeholder="Required when confirming. For example: we will arrive between 08:00 and 10:00. Please clear kitchen cupboards and keep pets outside.">${escapeHtml(booking.admin_note || '')}</textarea>
        <p class="hint">The customer sees this note on their booking.</p></div>
      <div class="hero-actions"><button class="btn" type="submit">Save changes</button><button class="btn btn-outline" type="button" data-open="manage">Close</button></div>
    </form>
    <div class="job-panel" data-panel="messages" hidden><div data-thread><p class="summary-empty">Loading…</p></div>${replyFormHtml(booking.id, `Write to ${escapeHtml(booking.customer_name)}`)}</div>
  </article>`;
}

async function renderOwnerBookings() {
  await loadOwnerData();
  const counts = state.stats.bookings;
  const statButton = (status, label, value) => `<button type="button" class="stat" data-stat="${status}" aria-pressed="${status === 'TODAY' ? state.filter.today : !state.filter.today && state.filter.status === status}"><strong>${value}</strong><span>${label}</span></button>`;
  let list = state.bookings;
  if (state.filter.today) list = list.filter(booking => booking.status === 'CONFIRMED' && booking.scheduled_date === localToday());
  panelsEl.innerHTML = `
    <div class="stat-grid">
      ${statButton('PENDING', 'Waiting for you', counts.PENDING)}
      ${statButton('TODAY', 'Jobs today', state.stats.jobs_today)}
      ${statButton('CONFIRMED', 'Confirmed', counts.CONFIRMED)}
      ${statButton('COMPLETED', 'Completed', counts.COMPLETED)}
      ${statButton('CANCELLED', 'Cancelled', counts.CANCELLED)}
    </div>
    <form class="toolbar" data-filter role="search">
      <label class="sr-only" for="booking-search">Search bookings</label>
      <input id="booking-search" type="search" name="q" value="${escapeHtml(state.filter.q)}" placeholder="Search name, email, phone, suburb or reference">
      <label class="sr-only" for="booking-status">Status</label>
      <select id="booking-status" name="status"><option value="">All statuses</option>${Object.keys(STATUS_LABEL).map(status => `<option value="${status}"${state.filter.status === status && !state.filter.today ? ' selected' : ''}>${STATUS_LABEL[status]}</option>`).join('')}</select>
      <button class="btn btn-navy" type="submit">Search</button>
      ${state.filter.q || state.filter.status || state.filter.today ? '<button class="btn btn-outline" type="button" data-clear>Show all</button>' : ''}
    </form>
    ${list.length ? `<div class="job-list">${list.map(ownerJob).join('')}</div>` : emptyState('clipboard', 'No bookings here', state.filter.q || state.filter.status || state.filter.today ? 'Nothing matches this filter.' : 'New booking requests will appear here.')}`;

  panelsEl.querySelectorAll('[data-stat]').forEach(button => button.addEventListener('click', () => {
    const value = button.dataset.stat;
    const active = button.getAttribute('aria-pressed') === 'true';
    state.filter = { q: state.filter.q, status: active || value === 'TODAY' ? '' : value, today: !active && value === 'TODAY' };
    renderOwnerBookings();
  }));
  panelsEl.querySelector('[data-filter]').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.filter = { q: data.q.trim(), status: data.status, today: false };
    renderOwnerBookings();
  });
  panelsEl.querySelector('[data-clear]')?.addEventListener('click', () => { state.filter = { q: '', status: '', today: false }; renderOwnerBookings(); });

  panelsEl.querySelectorAll('[data-booking]').forEach(card => {
    const id = card.dataset.booking;
    card.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', async () => {
      const panel = card.querySelector(`[data-panel="${button.dataset.open}"]`);
      const opening = panel.hidden;
      card.querySelectorAll('[data-panel]').forEach(other => { other.hidden = true; });
      panel.hidden = !opening;
      if (opening && button.dataset.open === 'messages') await loadOwnerThread(card, id);
      if (opening) panel.querySelector('select, textarea')?.focus();
    }));
    card.querySelector('[data-panel="manage"]').addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      if (data.status === 'CONFIRMED' && !data.admin_note.trim()) {
        toast('Add a note to the customer before confirming.');
        event.target.elements.admin_note.focus();
        return;
      }
      try {
        toast((await api(`/bookings/${id}`, { method: 'PATCH', body: data })).message);
        await renderOwnerBookings();
        setOwnerCounts();
        renderTabs('bookings');
      } catch (error) { toast(error.message); }
    });
  });
  wireReplyForms(panelsEl, '/admin/messages', async bookingId => {
    const card = panelsEl.querySelector(`[data-booking="${bookingId}"]`);
    card.querySelector('textarea[name="message"]').value = '';
    card.querySelector('[data-reply] button').disabled = false;
    await loadOwnerThread(card, bookingId);
  });
}

async function loadOwnerThread(card, bookingId) {
  const { messages } = await api('/admin/messages');
  state.messages = messages;
  card.querySelector('[data-thread]').innerHTML = threadHtml(messages.filter(message => message.booking_id === bookingId), 'owner');
}

async function renderOwnerMessages() {
  const { messages } = await api('/admin/messages');
  state.messages = messages;
  const groups = new Map();
  for (const message of messages) {
    if (!groups.has(message.booking_id)) groups.set(message.booking_id, []);
    groups.get(message.booking_id).push(message);
  }
  const conversations = [...groups.values()].map(thread => ({
    thread,
    unread: thread.filter(message => Number(message.from_admin) === 0 && !message.read_at).length,
    last: thread[thread.length - 1].created_at,
  })).sort((a, b) => (b.unread > 0) - (a.unread > 0) || b.last.localeCompare(a.last));
  if (!conversations.length) {
    panelsEl.innerHTML = emptyState('chat', 'No messages yet', 'When customers message you about a booking, it appears here.');
    return;
  }
  panelsEl.innerHTML = `<div class="toolbar"><button class="btn btn-outline btn-small" type="button" data-mark-read>${icon('check')}Mark all as read</button></div>
    <div class="inbox">${conversations.map(({ thread, unread }) => {
      const first = thread[0];
      return `<section class="conversation"><div class="conversation-head"><strong>${unread ? '<span class="unread-dot" aria-hidden="true"></span>' : ''}${escapeHtml(first.customer_name)}, ${escapeHtml(first.reference || '')}</strong><span>${escapeHtml(first.customer_email)}${first.booking_status ? `, ${STATUS_LABEL[first.booking_status]}` : ''}${unread ? `, ${unread} new` : ''}</span></div>
        ${threadHtml(thread, 'owner')}${replyFormHtml(first.booking_id, `Reply to ${escapeHtml(first.customer_name)}`)}</section>`;
    }).join('')}</div>`;
  panelsEl.querySelector('[data-mark-read]').addEventListener('click', async () => {
    await api('/admin/messages/read', { method: 'POST', body: {} });
    await refreshOwnerCounts();
    await openTab('messages');
  });
  wireReplyForms(panelsEl, '/admin/messages', async () => { await refreshOwnerCounts(); await openTab('messages'); });
}

async function renderOwnerReviews() {
  const { reviews } = await api('/admin/reviews');
  if (!reviews.length) {
    panelsEl.innerHTML = emptyState('star', 'No reviews yet', 'Customers can review a booking after you mark it as completed.');
    return;
  }
  panelsEl.innerHTML = `<div class="inbox">${reviews.map(review => `<section class="conversation" data-review="${review.id}">
      <div class="conversation-head"><strong>${escapeHtml(review.customer_name)}, ${escapeHtml(review.reference || '')}</strong><span>${formatDate(review.created_at)}, ${review.status === 'PENDING' ? 'waiting for approval' : review.status === 'APPROVED' ? 'published' : 'hidden'}</span></div>
      <div class="stars" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
      <p style="margin:0">${escapeHtml(review.review_text || 'No written comment.')}</p>
      <div class="hero-actions">${review.status !== 'APPROVED' ? '<button class="btn btn-small" type="button" data-moderate="APPROVED">Publish on website</button>' : ''}${review.status !== 'REJECTED' ? '<button class="btn btn-small btn-outline" type="button" data-moderate="REJECTED">Hide</button>' : ''}</div>
    </section>`).join('')}</div>`;
  panelsEl.querySelectorAll('[data-moderate]').forEach(button => button.addEventListener('click', async () => {
    try {
      toast((await api(`/reviews/${button.closest('[data-review]').dataset.review}`, { method: 'PATCH', body: { status: button.dataset.moderate } })).message);
      await refreshOwnerCounts();
      await openTab('reviews');
    } catch (error) { toast(error.message); }
  }));
}

function renderOwnerNewBooking() {
  const checkbox = service => `<label class="choice"><input type="checkbox" name="service_options" value="${service.id}"><span>${icon(service.icon)}<span>${escapeHtml(service.label)}</span></span></label>`;
  panelsEl.innerHTML = `<div class="panel" style="max-width:860px">
    <h2 style="font-size:var(--step-2)">Book for a customer</h2>
    <p>For phone or walk-in bookings. The customer needs a 4Guard account; the booking appears in their portal.</p>
    <form class="form" data-owner-booking novalidate>
      <div class="field"><label for="ob-email">Customer's account email</label><input id="ob-email" name="customer_email" type="email" required></div>
      <div class="field"><label for="ob-category">Type of service</label><select id="ob-category" name="service_type" required><option value="">Choose one</option>${CATEGORIES.map(category => `<option value="${category.apiValue}">${category.label}</option>`).join('')}</select></div>
      <div class="field" data-ob-pest hidden><span class="label">Pest control</span><div class="choice-grid">${PEST_SERVICES.map(checkbox).join('')}</div></div>
      <div class="field" data-ob-cleaning hidden><span class="label">Cleaning</span><div class="choice-grid">${CLEANING_SERVICES.map(checkbox).join('')}</div></div>
      <div class="form-row">
        <div class="field"><label for="ob-property">Home or business</label><select id="ob-property" name="property_type" required><option value="">Choose one</option>${PROPERTY_TYPES.map(type => `<option value="${type.id}">${type.label}</option>`).join('')}</select></div>
        <div class="field"><label for="ob-premises">Type of property</label><select id="ob-premises" name="premises" required><option value="">Choose home or business first</option></select></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="ob-address">Street address</label><input id="ob-address" name="address" maxlength="200" required></div>
        <div class="field"><label for="ob-location">Suburb or town</label><input id="ob-location" name="location" maxlength="120" required></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="ob-date">Preferred date</label><input id="ob-date" name="preferred_date" type="date" min="${localToday()}" required></div>
        <div class="field"><label for="ob-time">Time of day</label><select id="ob-time" name="preferred_time" required>${TIME_SLOTS.map(slot => `<option>${slot}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="ob-phone">Phone number for the day</label><input id="ob-phone" name="contact_phone" type="tel" required></div>
      <div class="field"><label for="ob-details">Details <span class="optional">(optional)</span></label><textarea id="ob-details" name="details" maxlength="3000"></textarea></div>
      <p class="form-status" role="status" aria-live="polite"></p>
      <div><button class="btn" type="submit">Create booking</button></div>
    </form></div>`;
  const form = panelsEl.querySelector('[data-owner-booking]');
  form.elements.service_type.addEventListener('change', event => {
    const value = event.target.value;
    form.querySelector('[data-ob-pest]').hidden = !['Fumigation / Pest Control', 'Both'].includes(value);
    form.querySelector('[data-ob-cleaning]').hidden = !['Cleaning', 'Both'].includes(value);
  });
  form.elements.property_type.addEventListener('change', event => {
    const type = PROPERTY_TYPES.find(item => item.id === event.target.value);
    form.elements.premises.innerHTML = `<option value="">${type ? 'Choose one' : 'Choose home or business first'}</option>${(type?.premises || []).map(premises => `<option>${escapeHtml(premises)}</option>`).join('')}`;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const status = form.querySelector('.form-status');
    const data = Object.fromEntries(new FormData(form));
    data.service_options = [...form.querySelectorAll('[name="service_options"]:checked')]
      .filter(input => !input.closest('[hidden]'))
      .map(input => input.value);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await api('/admin/bookings', { method: 'POST', body: data });
      showStatus(status, result.message, 'success');
      form.reset();
      form.querySelectorAll('[data-ob-pest], [data-ob-cleaning]').forEach(group => { group.hidden = true; });
      await refreshOwnerCounts();
      renderTabs('new');
    } catch (error) { showStatus(status, error.message, 'error'); }
    finally { button.disabled = false; }
  });
}

async function refreshOwnerCounts() {
  state.stats = await api('/admin/stats');
  setOwnerCounts();
  renderTabs(tabsEl.querySelector('[aria-selected="true"]')?.id.slice(4));
}

function setOwnerCounts() {
  tabs = [
    { id: 'bookings', label: 'Bookings', count: state.stats?.bookings.PENDING || 0, render: renderOwnerBookings },
    { id: 'messages', label: 'Messages', count: state.stats?.messages_unread || 0, render: renderOwnerMessages },
    { id: 'reviews', label: 'Reviews', count: state.stats?.reviews_pending || 0, render: renderOwnerReviews },
    { id: 'new', label: 'Book for a customer', render: renderOwnerNewBooking },
    { id: 'details', label: 'My details', render: renderDetails },
  ];
}

// =============================================================================================
// My details (both)
// =============================================================================================
function renderDetails() {
  panelsEl.innerHTML = `<div class="split">
    <form class="panel form" data-profile novalidate>
      <h2 style="font-size:var(--step-2);margin:0">Your details</h2>
      <div class="field"><label for="profile-name">Full name</label><input id="profile-name" name="full_name" value="${escapeHtml(user.full_name)}" maxlength="120" required autocomplete="name"></div>
      <div class="field"><span class="label">Email address</span><p style="margin:0">${escapeHtml(user.email)}</p></div>
      <div class="field"><label for="profile-phone">Phone number</label><input id="profile-phone" name="phone" type="tel" value="${escapeHtml(user.phone || '')}" autocomplete="tel"></div>
      <p class="form-status" role="status" aria-live="polite"></p>
      <div><button class="btn" type="submit">Save details</button></div>
    </form>
    <div style="display:grid;gap:28px">
      <form class="panel form" data-password novalidate>
        <h2 style="font-size:var(--step-2);margin:0">Change password</h2>
        <div class="field"><label for="current-password">Current password</label><input id="current-password" name="current_password" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="new-password">New password</label><input id="new-password" name="new_password" type="password" autocomplete="new-password" minlength="8" required><p class="hint">At least 8 characters. Other devices will be logged out.</p></div>
        <p class="form-status" role="status" aria-live="polite"></p>
        <div><button class="btn btn-navy" type="submit">Change password</button></div>
      </form>
      ${user.is_admin ? `<form class="panel form" data-reset novalidate>
        <h2 style="font-size:var(--step-2);margin:0">Customer forgot their password</h2>
        <p style="margin:0">Creates a temporary password for the customer. Give it to them by phone; they can change it under My details.</p>
        <div class="field"><label for="reset-email">Customer's account email</label><input id="reset-email" name="email" type="email" required></div>
        <p class="form-status" role="status" aria-live="polite"></p>
        <div><button class="btn btn-navy" type="submit">Create temporary password</button></div>
      </form>` : ''}
    </div></div>`;

  panelsEl.querySelector('[data-profile]').addEventListener('submit', async event => {
    event.preventDefault();
    const status = event.target.querySelector('.form-status');
    try {
      const result = await api('/me', { method: 'PATCH', body: Object.fromEntries(new FormData(event.target)) });
      user = result.user;
      showStatus(status, result.message, 'success');
    } catch (error) { showStatus(status, error.message, 'error'); }
  });
  panelsEl.querySelector('[data-password]').addEventListener('submit', async event => {
    event.preventDefault();
    const status = event.target.querySelector('.form-status');
    const data = Object.fromEntries(new FormData(event.target));
    if (data.new_password.length < 8) { showStatus(status, 'Choose a new password of at least 8 characters.', 'error'); return; }
    try {
      showStatus(status, (await api('/me/password', { method: 'POST', body: data })).message, 'success');
      event.target.reset();
    } catch (error) { showStatus(status, error.message, 'error'); }
  });
  panelsEl.querySelector('[data-reset]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const status = event.target.querySelector('.form-status');
    try {
      const result = await api('/admin/users/reset-password', { method: 'POST', body: Object.fromEntries(new FormData(event.target)) });
      showStatus(status, `${result.message} Temporary password: ${result.temporary_password}`, 'success');
    } catch (error) { showStatus(status, error.message, 'error'); }
  });
}

// =============================================================================================
// Start
// =============================================================================================
(async () => {
  try {
    user = await getMe();
  } catch (error) {
    panelsEl.innerHTML = `<div class="alert alert-error">${icon('x')}<p>${escapeHtml(error.message)}</p></div>`;
    return;
  }
  if (!user) { location.replace('/login?next=/dashboard'); return; }

  if (user.is_admin) {
    titleEl.textContent = 'Owner portal';
    subtitleEl.textContent = `Signed in as ${user.full_name}. Confirm bookings, reply to customers and publish reviews.`;
    document.querySelector('[data-book-button]').hidden = true;
    state.stats = await api('/admin/stats');
    setOwnerCounts();
  } else {
    titleEl.textContent = `Hello, ${user.full_name.split(' ')[0]}`;
    subtitleEl.textContent = 'Your bookings, messages from 4Guard and your account details.';
    await loadCustomerData();
    setCustomerCounts();
  }
  await openTab(location.hash.slice(1) || 'bookings');
})();
