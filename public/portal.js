(() => {
  const request = async (path, options = {}) => {
    const { headers = {}, ...fetchOptions } = options;
    const response = await fetch(path, {
      ...fetchOptions,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...headers }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  };
  const feedback = (id, message, error = false) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = message;
      element.classList.toggle('error', error);
    }
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const formatDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  const stars = rating => '★'.repeat(Number(rating) || 0) + '☆'.repeat(5 - (Number(rating) || 0));
  const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
  document.querySelectorAll('[data-min-today]').forEach(input => input.min = localToday());
  let currentUser;

  document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => {
    const creating = button.dataset.authTab === 'signup';
    document.querySelectorAll('[data-auth-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
    document.getElementById('login-form')?.classList.toggle('is-hidden', creating);
    document.getElementById('signup-form')?.classList.toggle('is-hidden', !creating);
    feedback('auth-feedback', '');
  }));

  const signupEmail = document.querySelector('[data-signup-email]');
  const setupKeyWrap = document.getElementById('admin-setup-key-wrap');
  const setupKeyInput = document.querySelector('[data-admin-setup-key]');
  const ownerEmail = String(window.FOURGUARD_CONFIG?.adminEmail || 'guardddmt@gmail.com').trim().toLowerCase();
  const updateOwnerKeyField = () => {
    const isOwner = String(signupEmail?.value || '').trim().toLowerCase() === ownerEmail;
    setupKeyWrap?.classList.toggle('is-hidden', !isOwner);
    if (setupKeyInput) setupKeyInput.required = isOwner;
    if (!isOwner && setupKeyInput) setupKeyInput.value = '';
  };
  signupEmail?.addEventListener('input', updateOwnerKeyField);
  updateOwnerKeyField();

  document.getElementById('signup-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const result = await request('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
      currentUser = result.user;
      form.reset();
      feedback('auth-feedback', 'Account created. Opening your dashboard…');
      window.location.assign(getPostAuthDestination(result.user));
    } catch (error) {
      feedback('auth-feedback', error.message, true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.getElementById('login-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const { user } = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
      currentUser = user;
      // The server-provided role controls the admin destination. Honour only safe local destinations.
      window.location.assign(getPostAuthDestination(user));
    } catch (error) {
      feedback('auth-feedback', error.message, true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', async () => {
    try { await request('/api/auth/logout', { method: 'POST' }); } finally { window.location.assign('index.html'); }
  }));

  function getPostAuthDestination(user) {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (next === 'booking.html') return 'booking.html';
    if (next === 'quote') return 'contact.html#quote-form';
    return user?.is_admin ? 'dashboard.html?view=admin' : 'dashboard.html';
  }

  async function getUser() {
    if (currentUser) return currentUser;
    try {
      currentUser = (await request('/api/me')).user;
      return currentUser;
    } catch (error) {
      if (error.status === 401) {
        const next = window.location.pathname.endsWith('/booking.html') || window.location.pathname === '/booking.html' ? '?next=booking.html' : '';
        window.location.assign(`login.html${next}`);
      } else {
        feedback('booking-access-message', 'The account service is temporarily unavailable. Please refresh or try again shortly.', true);
        feedback('dashboard-feedback', 'The account service is temporarily unavailable. Please refresh or try again shortly.', true);
      }
      return null;
    }
  }

  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    // Do not show the booking form until the server confirms an authenticated account.
    getUser().then(user => {
      if (!user) return; // getUser redirects unauthenticated visitors to sign-in/register.
      bookingForm.classList.remove('is-hidden');
      const accessMessage = document.getElementById('booking-access-message');
      if (accessMessage) accessMessage.textContent = `${user.is_admin ? 'Admin' : 'Customer'} · Signed in as ${user.full_name}. You can now request a service.`;
    });

    bookingForm.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!await getUser()) return;
      const submit = form.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      const payload = Object.fromEntries(new FormData(form));
      try {
        await request('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
        form.reset();
        feedback('booking-feedback', 'Your booking request has been sent. Track its status and the 4Guard note in your portal.');
      } catch (error) { feedback('booking-feedback', error.message, true); }
      finally { if (submit) submit.disabled = false; }
    });
  }

  document.getElementById('admin-create-booking-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const payload = Object.fromEntries(new FormData(form));
    if (submit) submit.disabled = true;
    try {
      const result = await request('/api/admin/bookings', { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      form.querySelectorAll('[data-min-today]').forEach(input => input.min = localToday());
      feedback('admin-create-booking-feedback', result.message || 'Booking created for the customer.');
      await loadBookings(document.getElementById('email-search')?.value || '');
    } catch (error) { feedback('admin-create-booking-feedback', error.message, true); }
    finally { if (submit) submit.disabled = false; }
  });

  if (document.getElementById('booking-list')) getUser().then(user => user && loadBookings());

  async function loadBookings(email = '') {
    const user = await getUser();
    if (!user) return;
    const adminTools = document.getElementById('admin-tools');
    adminTools?.classList.toggle('is-hidden', !user.is_admin);
    document.getElementById('review-moderation')?.classList.toggle('is-hidden', !user.is_admin);
    document.getElementById('admin-create-booking-panel')?.classList.toggle('is-hidden', !user.is_admin);
    document.getElementById('customer-feedback-panel')?.classList.toggle('is-hidden', user.is_admin);
    document.getElementById('admin-feedback-panel')?.classList.toggle('is-hidden', !user.is_admin);
    if (user.is_admin) loadAdminFeedback(); else loadCustomerFeedback();
    if (user.is_admin) {
      document.getElementById('account-role') && (document.getElementById('account-role').textContent = 'Administrator');
      document.getElementById('dashboard-kicker').textContent = 'ADMIN PORTAL · BOOKING MANAGEMENT';
      document.getElementById('dashboard-title').textContent = 'All service bookings.';
      document.getElementById('dashboard-description').textContent = 'Manage customer bookings, create a booking for a registered customer, send status notes and moderate reviews.';
      loadAdminReviews();
    } else {
      document.getElementById('account-role') && (document.getElementById('account-role').textContent = 'Customer portal');
      document.getElementById('dashboard-kicker').textContent = 'CUSTOMER PORTAL · MY BOOKINGS';
      document.getElementById('dashboard-title').textContent = 'Your bookings.';
      document.getElementById('dashboard-description').textContent = 'Track service requests, check updates and review completed work.';
    }
    try {
      const query = user.is_admin && email ? `?email=${encodeURIComponent(email.trim())}` : '';
      const { bookings } = await request(`/api/bookings${query}`);
      const list = document.getElementById('booking-list');
      list.innerHTML = bookings.map(booking => bookingCard(booking, user)).join('');
      feedback('dashboard-feedback', bookings.length ? '' : 'No bookings found.');
      list.querySelectorAll('[data-update-booking]').forEach(button => button.addEventListener('click', () => saveBooking(button.dataset.updateBooking)));
      list.querySelectorAll('[data-toggle-review]').forEach(button => button.addEventListener('click', () => {
        const form = document.querySelector(`[data-review-form="${button.dataset.toggleReview}"]`);
        if (form) form.classList.toggle('is-hidden');
      }));
      list.querySelectorAll('[data-submit-review]').forEach(button => button.addEventListener('click', () => saveReview(button.dataset.submitReview)));
      list.querySelectorAll('[data-toggle-feedback]').forEach(button => button.addEventListener('click', () => { const form = document.querySelector(`[data-feedback-form="${button.dataset.toggleFeedback}"]`); if (form) form.classList.toggle('is-hidden'); }));
      list.querySelectorAll('[data-submit-feedback]').forEach(button => button.addEventListener('click', () => saveCustomerFeedback(button.dataset.submitFeedback)));
    } catch (error) { feedback('dashboard-feedback', error.message, true); }
  }

  function bookingCard(booking, user) {
    const edit = user.is_admin ? `<div class="booking-admin-edit"><label>Status<select data-status="${booking.id}"><option ${booking.status === 'PENDING' ? 'selected' : ''}>PENDING</option><option ${booking.status === 'CONFIRMED' ? 'selected' : ''}>CONFIRMED</option><option ${booking.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option><option ${booking.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option></select></label><label>Message for customer<textarea data-note="${booking.id}" rows="2" maxlength="1500" placeholder="Required when confirming a booking">${escapeHtml(booking.admin_note || '')}</textarea></label><button class="btn navy" type="button" data-update-booking="${booking.id}">Save update <b>→</b></button></div>` : '';
    let reviewUi = '';
    if (!user.is_admin && booking.status === 'COMPLETED') {
      if (booking.review_id) {
        reviewUi = `<div class="review-status"><strong>${booking.review_status === 'APPROVED' ? 'Your review' : 'Review submitted'}</strong><span class="review-stars">${stars(booking.review_rating)}</span><p>${booking.review_status === 'APPROVED' ? 'Thank you for sharing your experience.' : 'Thank you. Your review is awaiting approval before it appears publicly.'}</p></div>`;
      } else {
        reviewUi = `<div class="booking-review"><button class="btn navy review-toggle" type="button" data-toggle-review="${booking.id}">Review this service <b>★</b></button><div class="review-form is-hidden" data-review-form="${booking.id}"><label>Rating<select data-rating="${booking.id}" required><option value="">Choose a rating</option><option value="5">5 — Excellent</option><option value="4">4 — Very good</option><option value="3">3 — Good</option><option value="2">2 — Fair</option><option value="1">1 — Poor</option></select></label><label>Your review (optional)<textarea data-review-text="${booking.id}" rows="3" maxlength="1200" placeholder="Tell us about your experience."></textarea></label><button class="btn green" type="button" data-submit-review="${booking.id}">Submit review <b>↗</b></button><p class="portal-feedback" data-review-feedback="${booking.id}" role="status"></p></div></div>`;
      }
    }
    const customerFeedbackUi = !user.is_admin ? `<div class="booking-feedback"><button class="portal-action portal-action-feedback" type="button" data-toggle-feedback="${booking.id}">Send feedback about this job</button><div class="feedback-form is-hidden" data-feedback-form="${booking.id}"><label for="feedback-message-${booking.id}">Message to 4Guard</label><textarea id="feedback-message-${booking.id}" data-feedback-message="${booking.id}" rows="3" maxlength="1500" placeholder="Ask a question or share feedback about this job request…"></textarea><button class="portal-action portal-action-book" type="button" data-submit-feedback="${booking.id}">Send message</button><p class="portal-feedback" data-feedback-status="${booking.id}" role="status"></p></div></div>` : '';
    return `<article class="booking-card"><div class="booking-card-top"><div><span class="status status-${booking.status.toLowerCase()}">${escapeHtml(booking.status)}</span><h2>${escapeHtml(booking.service_type)}</h2><p>${escapeHtml(booking.property_type)} · ${escapeHtml(booking.location)}</p></div><time datetime="${booking.preferred_date}">${formatDate(booking.preferred_date)}</time></div><p class="booking-details">${escapeHtml(booking.details)}</p><div class="booking-meta"><span>${escapeHtml(booking.customer_name)}</span><span>${escapeHtml(booking.customer_email)}</span></div>${booking.admin_note ? `<p class="booking-admin-note"><strong>4Guard note:</strong> ${escapeHtml(booking.admin_note)}</p>` : ''}${reviewUi}${customerFeedbackUi}${edit}</article>`;
  }

  async function saveBooking(id) {
    const payload = { status: document.querySelector(`[data-status="${id}"]`).value, admin_note: document.querySelector(`[data-note="${id}"]`).value };
    try {
      await request(`/api/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      feedback('dashboard-feedback', 'Booking updated successfully.');
      await loadBookings(document.getElementById('email-search')?.value || '');
    } catch (error) { feedback('dashboard-feedback', error.message, true); }
  }

  async function saveReview(id) {
    const rating = document.querySelector(`[data-rating="${id}"]`)?.value;
    const reviewText = document.querySelector(`[data-review-text="${id}"]`)?.value || '';
    const status = document.querySelector(`[data-review-feedback="${id}"]`);
    try {
      await request('/api/reviews', { method: 'POST', body: JSON.stringify({ booking_id: id, rating, review_text: reviewText }) });
      if (status) status.textContent = 'Thank you. Your review has been submitted for approval.';
      await loadBookings(document.getElementById('email-search')?.value || '');
    } catch (error) {
      if (status) { status.textContent = error.message; status.classList.add('error'); }
    }
  }

  async function saveCustomerFeedback(bookingId) {
    const messageInput = document.querySelector(`[data-feedback-message="${bookingId}"]`);
    const status = document.querySelector(`[data-feedback-status="${bookingId}"]`);
    const message = messageInput?.value.trim() || '';
    if (!message) { if (status) status.textContent = 'Please enter a message before sending.'; return; }
    try {
      await request('/api/feedback', { method: 'POST', body: JSON.stringify({ booking_id: bookingId, message }) });
      if (messageInput) messageInput.value = '';
      if (status) { status.textContent = 'Your message has been sent to 4Guard.'; status.classList.remove('error'); }
      await loadCustomerFeedback();
    } catch (error) { if (status) { status.textContent = error.message; status.classList.add('error'); } }
  }

  async function loadCustomerFeedback() {
    const list = document.getElementById('customer-feedback-list');
    if (!list) return;
    try {
      const { feedback: items } = await request('/api/feedback');
      list.innerHTML = items.length ? items.map(item => `<article class="customer-feedback-item"><div><strong>${escapeHtml(item.service_type)}</strong><small>${escapeHtml(formatDate(item.created_at.slice(0,10)))}</small></div><p>${escapeHtml(item.message)}</p><span>Sent to 4Guard</span></article>`).join('') : '<p class="review-empty">Messages you send about your jobs will appear here.</p>';
    } catch (error) { list.innerHTML = `<p class="portal-feedback error">${escapeHtml(error.message)}</p>`; }
  }

  async function loadAdminFeedback() {
    const list = document.getElementById('admin-feedback-list');
    if (!list) return;
    try {
      const { feedback: items } = await request('/api/admin/feedback');
      list.innerHTML = items.length ? items.map(item => `<article class="admin-review-card"><div><strong>${escapeHtml(item.customer_name)}</strong><small>${escapeHtml(item.customer_email)} · ${escapeHtml(item.service_type)} · ${escapeHtml(formatDate(item.created_at.slice(0,10)))}</small></div><p>${escapeHtml(item.message)}</p></article>`).join('') : '<p class="review-empty">No customer messages yet.</p>';
    } catch (error) { list.innerHTML = `<p class="portal-feedback error">${escapeHtml(error.message)}</p>`; }
  }

  async function loadAdminReviews() {
    const list = document.getElementById('admin-review-list');
    if (!list) return;
    try {
      const { reviews } = await request('/api/admin/reviews');
      list.innerHTML = reviews.length ? reviews.map(review => `<article class="admin-review-card"><div><strong>${escapeHtml(review.customer_name)}</strong><span class="review-stars">${stars(review.rating)}</span><small>${escapeHtml(review.service_type)} · ${formatDate(review.created_at.slice(0, 10))} · ${escapeHtml(review.status)}</small></div><p>${escapeHtml(review.review_text || 'No written comment provided.')}</p>${review.status === 'PENDING' ? `<div class="review-actions"><button class="btn green" type="button" data-moderate-review="${review.id}" data-review-status="APPROVED">Approve</button><button class="btn navy" type="button" data-moderate-review="${review.id}" data-review-status="REJECTED">Reject</button></div>` : ''}</article>`).join('') : '<p class="review-empty">No reviews have been submitted yet.</p>';
      list.querySelectorAll('[data-moderate-review]').forEach(button => button.addEventListener('click', async () => {
        try {
          await request(`/api/reviews/${button.dataset.moderateReview}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.reviewStatus }) });
          await loadAdminReviews();
          if (document.getElementById('public-reviews')) loadPublicReviews();
        } catch (error) { feedback('dashboard-feedback', error.message, true); }
      }));
    } catch (error) { list.innerHTML = `<p class="portal-feedback error">${escapeHtml(error.message)}</p>`; }
  }

  async function loadPublicReviews() {
    const list = document.getElementById('public-reviews');
    if (!list) return;
    try {
      const { reviews, summary } = await request('/api/reviews');
      const rating = Number(summary?.average_rating || 0);
      const ratingElement = document.getElementById('company-rating');
      const starsElement = document.getElementById('company-stars');
      const countElement = document.getElementById('company-review-count');
      if (ratingElement) ratingElement.textContent = summary?.total_reviews ? rating.toFixed(1) : '—';
      if (starsElement) starsElement.textContent = stars(Math.round(rating));
      if (countElement) countElement.textContent = `${summary?.total_reviews || 0} approved review${Number(summary?.total_reviews) === 1 ? '' : 's'}`;
      list.innerHTML = reviews.length ? reviews.map(review => `<article class="public-review-card"><span class="review-stars" aria-label="${review.rating} out of 5 stars">${stars(review.rating)}</span><blockquote>${escapeHtml(review.review_text || 'Rated service')}</blockquote><div class="public-review-by"><strong>${escapeHtml(review.customer_name)}</strong><span>${escapeHtml(review.service_type)}</span></div></article>`).join('') : '<p class="review-empty">Customer reviews will appear here after completed services have been reviewed and approved.</p>';
    } catch {
      list.innerHTML = '<p class="review-empty">Customer reviews are temporarily unavailable.</p>';
    }
  }

  document.getElementById('search-bookings')?.addEventListener('click', () => loadBookings(document.getElementById('email-search').value));
  if (document.getElementById('public-reviews')) loadPublicReviews();
})();
