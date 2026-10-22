// Log in / create account. After signing in, people go back to where they came from
// (?next=/booking) or to their bookings.

import { api, getMe, showStatus } from './api.js';
import { SITE } from './config.js';

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const tabs = [...document.querySelectorAll('[role="tab"]')];

// Only allow returning to pages on this website.
const next = new URLSearchParams(location.search).get('next');
const destination = next && /^\/[a-z0-9-]*(#[\w-]+)?$/i.test(next) ? next : '/dashboard';
if (next) document.querySelector('[data-next-note]').hidden = !next.startsWith('/booking');

function selectTab(tab) {
  tabs.forEach(other => {
    const selected = other === tab;
    other.setAttribute('aria-selected', String(selected));
    document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
  });
}
tabs.forEach(tab => tab.addEventListener('click', () => { selectTab(tab); document.getElementById(tab.getAttribute('aria-controls')).querySelector('input').focus(); }));
if (location.hash === '#create') selectTab(tabs[1]);

document.querySelectorAll('[data-show-password]').forEach(button => button.addEventListener('click', () => {
  const input = button.previousElementSibling;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? 'Hide' : 'Show';
}));

document.querySelector('[data-forgot]').addEventListener('click', () => {
  const help = document.querySelector('[data-forgot-help]');
  help.hidden = !help.hidden;
});

// The owner email needs the private setup key the first time.
const signupEmail = signupForm.elements.email;
signupEmail.addEventListener('input', () => {
  document.querySelector('[data-owner-key]').hidden = signupEmail.value.trim().toLowerCase() !== SITE.adminEmail;
});

// Already signed in? Skip this page.
getMe().then(user => { if (user) location.replace(destination); }).catch(() => {});

async function submit(form, path, check) {
  const status = form.querySelector('.form-status');
  const data = Object.fromEntries(new FormData(form));
  const problem = check(data);
  if (problem) { showStatus(status, problem, 'error'); return; }
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  showStatus(status, '');
  try {
    await api(path, { method: 'POST', body: data });
    showStatus(status, 'Signed in. Opening your account…', 'success');
    location.assign(destination);
  } catch (error) {
    showStatus(status, error.message, 'error');
    button.disabled = false;
  }
}

loginForm.addEventListener('submit', event => {
  event.preventDefault();
  submit(loginForm, '/auth/login', data => (!data.email || !data.password ? 'Enter your email address and password.' : ''));
});

signupForm.addEventListener('submit', event => {
  event.preventDefault();
  submit(signupForm, '/auth/signup', data => {
    if (!data.full_name.trim()) return 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) return 'Enter a valid email address.';
    if (data.password.length < 8) return 'Choose a password of at least 8 characters.';
    return '';
  });
});
