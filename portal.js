(() => {
  const loadConfig = document.createElement('script');
  loadConfig.src = 'config.js';
  loadConfig.onload = initialise;
  document.head.appendChild(loadConfig);

  function initialise() {
    const config = window.FOURGUARD_CONFIG || {};
    const missingConfig = !config.supabaseUrl || !config.supabaseAnonKey;
    const feedback = (id, message, error = false) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.textContent = message;
      element.classList.toggle('error', error);
    };

    if (missingConfig) {
      feedback('auth-feedback', 'Portal setup is incomplete. Add the Supabase URL and anon key in config.js.', true);
      feedback('booking-feedback', 'Portal setup is incomplete. Add the Supabase URL and anon key in config.js.', true);
      feedback('dashboard-feedback', 'Portal setup is incomplete. Add the Supabase URL and anon key in config.js.', true);
      return;
    }

    const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const adminEmail = (config.adminEmail || '').toLowerCase();
    const isAdmin = user => user?.email?.toLowerCase() === adminEmail;

    document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => {
      const signingUp = button.dataset.authTab === 'signup';
      document.querySelectorAll('[data-auth-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
      document.getElementById('login-form')?.classList.toggle('is-hidden', signingUp);
      document.getElementById('signup-form')?.classList.toggle('is-hidden', !signingUp);
      feedback('auth-feedback', '');
    }));

    document.getElementById('login-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const { error } = await client.auth.signInWithPassword({ email: data.email, password: data.password });
      if (error) return feedback('auth-feedback', error.message, true);
      window.location.assign('dashboard.html');
    });

    document.getElementById('signup-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const { error } = await client.auth.signUp({ email: data.email, password: data.password, options: { data: { full_name: data.full_name } } });
      if (error) return feedback('auth-feedback', error.message, true);
      feedback('auth-feedback', 'Account created. Check your email to confirm it, then sign in.');
      event.currentTarget.reset();
    });

    document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', async () => {
      await client.auth.signOut();
      window.location.assign('login.html');
    }));

    async function requireUser() {
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        window.location.assign('login.html');
        return null;
      }
      return user;
    }

    document.getElementById('booking-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const user = await requireUser();
      if (!user) return;
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const { error } = await client.from('bookings').insert({
        customer_id: user.id,
        customer_email: user.email,
        customer_name: user.user_metadata.full_name || user.email,
        service_type: data.service_type,
        property_type: data.property_type,
        preferred_date: data.preferred_date,
        location: data.location,
        details: data.details
      });
      if (error) return feedback('booking-feedback', error.message, true);
      event.currentTarget.reset();
      feedback('booking-feedback', 'Your booking request has been sent. We will confirm the next step by email.');
    });

    const list = document.getElementById('booking-list');
    if (list) {
      requireUser().then(user => user && loadDashboard(user));
    }

    async function loadDashboard(user, email = '') {
      currentUser = user;
      const owner = isAdmin(user);
      document.getElementById('admin-tools')?.classList.toggle('is-hidden', !owner);
      if (owner) {
        document.getElementById('dashboard-kicker').textContent = 'ADMIN BOOKING MANAGEMENT';
        document.getElementById('dashboard-title').textContent = 'All service bookings.';
        document.getElementById('dashboard-description').textContent = 'Search customer bookings by email and update each request on this page.';
      }
      let query = client.from('bookings').select('*').order('created_at', { ascending: false });
      query = owner ? (email ? query.eq('customer_email', email.trim().toLowerCase()) : query) : query.eq('customer_id', user.id);
      const { data, error } = await query;
      if (error) return feedback('dashboard-feedback', error.message, true);
      feedback('dashboard-feedback', data.length ? '' : 'No bookings found.');
      list.innerHTML = data.map(bookingCard).join('');
      list.querySelectorAll('[data-update-booking]').forEach(button => button.addEventListener('click', () => updateBooking(button.dataset.updateBooking)));
    }

    function bookingCard(booking) {
      const canEdit = isAdmin(currentUser);
      return `<article class="booking-card"><div class="booking-card-top"><div><span class="status status-${booking.status.toLowerCase()}">${escapeHtml(booking.status)}</span><h2>${escapeHtml(booking.service_type)}</h2><p>${escapeHtml(booking.property_type)} · ${escapeHtml(booking.location)}</p></div><time datetime="${booking.preferred_date}">${formatDate(booking.preferred_date)}</time></div><p class="booking-details">${escapeHtml(booking.details)}</p><div class="booking-meta"><span>${escapeHtml(booking.customer_name)}</span><span>${escapeHtml(booking.customer_email)}</span></div>${canEdit ? `<div class="booking-admin-edit"><label>Status<select data-status="${booking.id}"><option ${booking.status === 'PENDING' ? 'selected' : ''}>PENDING</option><option ${booking.status === 'CONFIRMED' ? 'selected' : ''}>CONFIRMED</option><option ${booking.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option><option ${booking.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option></select></label><label>Admin note<textarea data-note="${booking.id}" rows="2">${escapeHtml(booking.admin_note || '')}</textarea></label><button class="btn navy" type="button" data-update-booking="${booking.id}">Save update <b>→</b></button></div>` : ''}</article>`;
    }

    let currentUser;
    async function updateBooking(id) {
      const status = document.querySelector(`[data-status="${id}"]`).value;
      const admin_note = document.querySelector(`[data-note="${id}"]`).value.trim() || null;
      const { error } = await client.from('bookings').update({ status, admin_note }).eq('id', id);
      if (error) return feedback('dashboard-feedback', error.message, true);
      feedback('dashboard-feedback', 'Booking updated successfully.');
      loadDashboard(currentUser, document.getElementById('email-search')?.value || '');
    }

    document.getElementById('search-bookings')?.addEventListener('click', () => loadDashboard(currentUser, document.getElementById('email-search').value));
    client.auth.getUser().then(({ data }) => { currentUser = data.user; });
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const formatDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
})();
