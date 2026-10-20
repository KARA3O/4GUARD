(() => {
  const request = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  };
  const feedback = (id, message, error = false) => { const element = document.getElementById(id); if (element) { element.textContent = message; element.classList.toggle('error', error); } };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const formatDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  let currentUser;

  document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => {
    const creating = button.dataset.authTab === 'signup';
    document.querySelectorAll('[data-auth-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
    document.getElementById('login-form')?.classList.toggle('is-hidden', creating);
    document.getElementById('signup-form')?.classList.toggle('is-hidden', !creating);
    feedback('auth-feedback', '');
  }));

  document.getElementById('signup-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try { await request('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) }); event.currentTarget.reset(); feedback('auth-feedback', 'Account created. You can now sign in.'); }
    catch (error) { feedback('auth-feedback', error.message, true); }
  });

  document.getElementById('login-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try { await request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }); window.location.assign('dashboard.html'); }
    catch (error) { feedback('auth-feedback', error.message, true); }
  });

  document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', async () => { await request('/api/auth/logout', { method: 'POST' }); window.location.assign('login.html'); }));

  async function getUser() {
    if (currentUser) return currentUser;
    try { currentUser = (await request('/api/me')).user; return currentUser; }
    catch { window.location.assign('login.html'); return null; }
  }

  document.getElementById('booking-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!await getUser()) return;
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try { await request('/api/bookings', { method: 'POST', body: JSON.stringify(payload) }); event.currentTarget.reset(); feedback('booking-feedback', 'Your booking request has been sent. 4Guard will confirm availability by email.'); }
    catch (error) { feedback('booking-feedback', error.message, true); }
  });

  if (document.getElementById('booking-list')) getUser().then(user => user && loadBookings());

  async function loadBookings(email = '') {
    const user = await getUser();
    if (!user) return;
    const adminTools = document.getElementById('admin-tools');
    adminTools?.classList.toggle('is-hidden', !user.is_admin);
    if (user.is_admin) {
      document.getElementById('dashboard-kicker').textContent = 'ADMIN BOOKING MANAGEMENT';
      document.getElementById('dashboard-title').textContent = 'All service bookings.';
      document.getElementById('dashboard-description').textContent = 'Search bookings by customer email and update each request here.';
    }
    try {
      const query = user.is_admin && email ? `?email=${encodeURIComponent(email.trim())}` : '';
      const { bookings } = await request(`/api/bookings${query}`);
      const list = document.getElementById('booking-list');
      list.innerHTML = bookings.map(bookingCard).join('');
      feedback('dashboard-feedback', bookings.length ? '' : 'No bookings found.');
      list.querySelectorAll('[data-update-booking]').forEach(button => button.addEventListener('click', () => saveBooking(button.dataset.updateBooking)));
    } catch (error) { feedback('dashboard-feedback', error.message, true); }
  }

  function bookingCard(booking) {
    const edit = currentUser?.is_admin ? `<div class="booking-admin-edit"><label>Status<select data-status="${booking.id}"><option ${booking.status === 'PENDING' ? 'selected' : ''}>PENDING</option><option ${booking.status === 'CONFIRMED' ? 'selected' : ''}>CONFIRMED</option><option ${booking.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option><option ${booking.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option></select></label><label>Admin note<textarea data-note="${booking.id}" rows="2">${escapeHtml(booking.admin_note || '')}</textarea></label><button class="btn navy" type="button" data-update-booking="${booking.id}">Save update <b>→</b></button></div>` : '';
    return `<article class="booking-card"><div class="booking-card-top"><div><span class="status status-${booking.status.toLowerCase()}">${escapeHtml(booking.status)}</span><h2>${escapeHtml(booking.service_type)}</h2><p>${escapeHtml(booking.property_type)} · ${escapeHtml(booking.location)}</p></div><time datetime="${booking.preferred_date}">${formatDate(booking.preferred_date)}</time></div><p class="booking-details">${escapeHtml(booking.details)}</p><div class="booking-meta"><span>${escapeHtml(booking.customer_name)}</span><span>${escapeHtml(booking.customer_email)}</span></div>${booking.admin_note ? `<p class="booking-admin-note"><strong>4Guard note:</strong> ${escapeHtml(booking.admin_note)}</p>` : ''}${edit}</article>`;
  }

  async function saveBooking(id) {
    const payload = { status: document.querySelector(`[data-status="${id}"]`).value, admin_note: document.querySelector(`[data-note="${id}"]`).value };
    try { await request(`/api/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); feedback('dashboard-feedback', 'Booking updated successfully.'); loadBookings(document.getElementById('email-search')?.value || ''); }
    catch (error) { feedback('dashboard-feedback', error.message, true); }
  }

  document.getElementById('search-bookings')?.addEventListener('click', () => loadBookings(document.getElementById('email-search').value));
})();
