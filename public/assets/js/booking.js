// Booking wizard: service → property → date & contact → check and send.
// Answers are kept in sessionStorage, so a refresh or signing in never loses them.
// Visitors without an account can create one (or log in) in the last step; one button does both.

import { api, escapeHtml, formatDate, getMe, icon, localToday, showStatus } from './api.js';
import { CATEGORIES, CLEANING_SERVICES, PEST_SERVICES, PROPERTY_TYPES, TIME_SLOTS, categoryById, findService } from './catalog.js';
import { SITE } from './config.js';

const DRAFT_KEY = 'fourguard.booking.draft';
const form = document.getElementById('booking-form');
const steps = [...form.querySelectorAll('[data-step]')];
const markers = [...document.querySelectorAll('[data-step-marker]')];
const backButton = form.querySelector('[data-back]');
const nextButton = form.querySelector('[data-next]');
const sendButton = form.querySelector('[data-send]');
const summaries = document.querySelectorAll('[data-summary]');
const accountArea = form.querySelector('[data-account-area]');
const sendStatus = form.querySelector('[data-send-status]');

let current = 0;
let user = null;
let authMode = 'signup';

const blank = () => ({ category: '', services: [], property_type: '', premises: '', address: '', location: '', preferred_date: '', preferred_time: '', contact_phone: '', details: '' });
let draft = blank();
try { draft = { ...draft, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') }; } catch { /* storage unavailable */ }
const save = () => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ } };

// Links like /booking?service=cockroaches or ?category=cleaning pre-select the service.
const params = new URLSearchParams(location.search);
const linkedService = params.get('service');
const linkedCategory = params.get('category');
if (linkedService && findService(linkedService)) {
  const isPest = PEST_SERVICES.some(service => service.id === linkedService);
  draft.category = isPest ? 'pest' : 'cleaning';
  draft.services = [linkedService];
} else if (linkedCategory && categoryById(linkedCategory)) {
  if (draft.category !== linkedCategory) { draft.category = linkedCategory; draft.services = []; }
}
if (linkedService || linkedCategory) history.replaceState(null, '', location.pathname);

// ---- Rendering choices from the catalogue --------------------------------------------------------
const categoryIcons = { pest: 'roach', cleaning: 'sparkle', both: 'shield' };
const categoryHints = { pest: 'Insects, rodents, termites, fumigation', cleaning: 'Home, deep, office, move-out', both: 'Treatment, then a clean' };

function radioCard(name, value, label, iconName, hint, checked, big = false) {
  return `<label class="choice${big ? ' big' : ''}"><input type="radio" name="${name}" value="${escapeHtml(value)}"${checked ? ' checked' : ''}>
    <span>${iconName ? icon(iconName) : ''}<span>${escapeHtml(label)}${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span></span></label>`;
}

function renderCategories() {
  form.querySelector('[data-category-choices]').innerHTML = CATEGORIES
    .map(category => radioCard('category', category.id, category.label, categoryIcons[category.id], categoryHints[category.id], draft.category === category.id, true))
    .join('');
}

function renderServices() {
  const group = form.querySelector('[data-options-group]');
  const holder = form.querySelector('[data-service-choices]');
  group.hidden = !draft.category;
  if (!draft.category) return;
  const box = service => `<label class="choice"><input type="checkbox" name="services" value="${service.id}"${draft.services.includes(service.id) ? ' checked' : ''}>
    <span>${icon(service.icon)}<span>${escapeHtml(service.label)}</span></span></label>`;
  if (draft.category === 'both') {
    holder.className = '';
    holder.innerHTML = `<p class="label" style="margin:0 0 8px;font-weight:700;color:var(--muted)">Pest control</p><div class="choice-grid">${PEST_SERVICES.map(box).join('')}</div>
      <p class="label" style="margin:18px 0 8px;font-weight:700;color:var(--muted)">Cleaning</p><div class="choice-grid">${CLEANING_SERVICES.map(box).join('')}</div>`;
  } else {
    holder.className = 'choice-grid';
    holder.innerHTML = (draft.category === 'pest' ? PEST_SERVICES : CLEANING_SERVICES).map(box).join('');
  }
  form.querySelector('#options-label').textContent = draft.category === 'cleaning' ? 'Which type of cleaning?' : draft.category === 'pest' ? 'Which pests? Choose all that apply.' : 'Choose at least one of each';
}

function renderProperty() {
  form.querySelector('[data-property-choices]').innerHTML = PROPERTY_TYPES
    .map(type => radioCard('property_type', type.id, type.label, type.id === 'Residential' ? 'home' : 'office', type.premises.slice(0, 3).join(', '), draft.property_type === type.id))
    .join('');
  const select = form.querySelector('#premises');
  const type = PROPERTY_TYPES.find(item => item.id === draft.property_type);
  select.innerHTML = `<option value="">${type ? 'Choose one' : 'Choose home or business first'}</option>` +
    (type ? type.premises.map(premises => `<option${draft.premises === premises ? ' selected' : ''}>${escapeHtml(premises)}</option>`).join('') : '');
  select.disabled = !type;
}

function renderTimes() {
  form.querySelector('[data-time-choices]').innerHTML = TIME_SLOTS
    .map(slot => radioCard('preferred_time', slot, slot.split(' (')[0], slot.startsWith('Any') ? 'calendar' : 'clock', slot.includes('(') ? slot.slice(slot.indexOf('(') + 1, -1) : 'We will suggest a time', draft.preferred_time === slot))
    .join('');
}

function fillInputs() {
  for (const name of ['address', 'location', 'preferred_date', 'contact_phone', 'details']) {
    const input = form.elements[name];
    if (input && document.activeElement !== input) input.value = draft[name] || '';
  }
  form.elements.preferred_date.min = localToday();
}

function renderSummary() {
  const category = categoryById(draft.category);
  const services = draft.services.map(id => findService(id)?.label).filter(Boolean);
  const rows = [
    ['Service', category && `${category.label}${services.length ? `: ${services.join(', ')}` : ''}`],
    ['Property', [PROPERTY_TYPES.find(type => type.id === draft.property_type)?.label, draft.premises].filter(Boolean).join(', ')],
    ['Address', [draft.address, draft.location].filter(Boolean).join(', ')],
    ['Preferred date', draft.preferred_date && `${formatDate(draft.preferred_date, { weekday: true })}${draft.preferred_time ? `, ${draft.preferred_time.toLowerCase()}` : ''}`],
    ['Phone', draft.contact_phone],
    ['Details', draft.details],
  ].filter(([, value]) => value);
  const markup = rows.length
    ? rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')
    : '<p class="summary-empty">Your choices will appear here as you go.</p>';
  summaries.forEach(list => { list.innerHTML = markup; });
}

// ---- The account part of the last step ----------------------------------------------------------
function renderAccount() {
  if (user) {
    accountArea.innerHTML = `<div class="signed-in-as">${icon('user')}<p>Booking as <strong>${escapeHtml(user.full_name)}</strong> (${escapeHtml(user.email)}). <button type="button" class="link-button" data-switch-user>Not you?</button></p></div>`;
    accountArea.querySelector('[data-switch-user]').addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      user = null;
      renderAccount();
    });
    return;
  }
  const signup = authMode === 'signup';
  accountArea.innerHTML = `
    <div class="alert" style="margin:20px 0">${icon('user')}<p>You need a free 4Guard account to send a booking, so you can follow it afterwards.</p></div>
    <div class="tabs" role="tablist" aria-label="Account">
      <button type="button" role="tab" aria-selected="${signup}" data-auth-mode="signup">I am new to 4Guard</button>
      <button type="button" role="tab" aria-selected="${!signup}" data-auth-mode="login">I have an account</button>
    </div>
    <div class="form">
      ${signup ? `<div class="field"><label for="auth-name">Full name</label><input id="auth-name" name="auth_full_name" type="text" autocomplete="name" maxlength="120"></div>` : ''}
      <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="auth_email" type="email" autocomplete="email"></div>
      <div class="field" data-owner-key hidden><label for="auth-key">Owner setup key</label><input id="auth-key" name="auth_setup_key" type="password" autocomplete="off"></div>
      <div class="field"><label for="auth-password">${signup ? 'Choose a password' : 'Password'}</label><div class="password-wrap"><input id="auth-password" name="auth_password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}"><button type="button" data-show-password>Show</button></div>${signup ? '<p class="hint">At least 8 characters.</p>' : ''}</div>
    </div>`;
  accountArea.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => {
    authMode = button.dataset.authMode;
    renderAccount();
    accountArea.querySelector('input')?.focus();
  }));
  wirePasswordToggles(accountArea);
  const email = accountArea.querySelector('#auth-email');
  email.addEventListener('input', () => {
    accountArea.querySelector('[data-owner-key]').hidden = !(signup && email.value.trim().toLowerCase() === SITE.adminEmail);
  });
}

function wirePasswordToggles(root) {
  root.querySelectorAll('[data-show-password]').forEach(button => button.addEventListener('click', () => {
    const input = button.previousElementSibling;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
  }));
}

async function signInFromStep() {
  const value = name => accountArea.querySelector(`[name="${name}"]`)?.value.trim() || '';
  const email = value('auth_email');
  const password = accountArea.querySelector('[name="auth_password"]')?.value || '';
  if (authMode === 'signup') {
    if (!value('auth_full_name')) throw new Error('Enter your full name to create your account.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (password.length < 8) throw new Error('Choose a password of at least 8 characters.');
    const result = await api('/auth/signup', { method: 'POST', body: { full_name: value('auth_full_name'), email, password, phone: draft.contact_phone, admin_setup_key: value('auth_setup_key') } });
    return result.user;
  }
  if (!email || !password) throw new Error('Enter your email address and password.');
  return (await api('/auth/login', { method: 'POST', body: { email, password } })).user;
}

// ---- Steps, validation and navigation ---------------------------------------------------------------
function setError(step, message, field) {
  const element = form.querySelector(`[data-error="step${step}"]`);
  if (element) element.textContent = message || '';
  steps[step].querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
  if (field) {
    const input = form.elements[field];
    if (input?.setAttribute) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  }
  return !message;
}

function validate(step) {
  if (step === 0) {
    if (!draft.category) return setError(0, 'Choose pest control, cleaning or both.');
    if (!draft.services.length) return setError(0, 'Choose at least one service.');
    if (draft.category === 'both') {
      const hasPest = draft.services.some(id => PEST_SERVICES.some(service => service.id === id));
      const hasCleaning = draft.services.some(id => CLEANING_SERVICES.some(service => service.id === id));
      if (!hasPest || !hasCleaning) return setError(0, 'Choose at least one pest service and one cleaning service, or switch to just one of them.');
    }
    return setError(0, '');
  }
  if (step === 1) {
    if (!draft.property_type) return setError(1, 'Choose whether this is a home or a business.');
    if (!draft.premises) return setError(1, 'Choose the type of property.', 'premises');
    if (!draft.address.trim()) return setError(1, 'Enter the street address.', 'address');
    if (!draft.location.trim()) return setError(1, 'Enter the suburb or town.', 'location');
    return setError(1, '');
  }
  if (step === 2) {
    if (!draft.preferred_date) return setError(2, 'Choose your preferred date.', 'preferred_date');
    if (draft.preferred_date < localToday()) return setError(2, 'Choose a date from today onwards.', 'preferred_date');
    if (!draft.preferred_time) return setError(2, 'Choose a preferred time of day.');
    if (!/^\+?\d{9,15}$/.test(draft.contact_phone.replace(/[\s()-]/g, ''))) return setError(2, 'Enter a phone number we can call on the day, for example 082 123 4567.', 'contact_phone');
    return setError(2, '');
  }
  return true;
}

function show(step, { focus = true } = {}) {
  current = step;
  steps.forEach((section, index) => { section.hidden = index !== step; });
  markers.forEach((marker, index) => {
    marker.dataset.state = index < step ? 'done' : index === step ? 'current' : 'todo';
    if (index === step) marker.setAttribute('aria-current', 'step'); else marker.removeAttribute('aria-current');
  });
  backButton.hidden = step === 0;
  nextButton.hidden = step === steps.length - 1;
  sendButton.hidden = step !== steps.length - 1;
  if (step === steps.length - 1) renderAccount();
  if (focus) {
    steps[step].querySelector('h2').focus({ preventScroll: true });
    form.closest('.panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---- Events ------------------------------------------------------------------------------------------
form.addEventListener('change', event => {
  const { name, value, checked } = event.target;
  if (name === 'category') {
    draft.category = value;
    // Keep only the services that still fit the new category.
    const allowed = value === 'pest' ? PEST_SERVICES : value === 'cleaning' ? CLEANING_SERVICES : [...PEST_SERVICES, ...CLEANING_SERVICES];
    draft.services = draft.services.filter(id => allowed.some(service => service.id === id));
    renderServices();
  } else if (name === 'services') {
    draft.services = checked ? [...new Set([...draft.services, value])] : draft.services.filter(id => id !== value);
  } else if (name === 'property_type') {
    draft.property_type = value;
    draft.premises = '';
    renderProperty();
  } else if (name in draft) {
    draft[name] = value;
  }
  save();
  renderSummary();
});
form.addEventListener('input', event => {
  const { name, value } = event.target;
  if (['address', 'location', 'contact_phone', 'details', 'preferred_date'].includes(name)) {
    draft[name] = value;
    save();
    renderSummary();
  }
});

nextButton.addEventListener('click', () => { if (validate(current)) show(current + 1); });
backButton.addEventListener('click', () => show(current - 1));

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (current !== steps.length - 1) { if (validate(current)) show(current + 1); return; }
  for (let step = 0; step < steps.length - 1; step++) {
    if (!validate(step)) { show(step); return; }
  }
  sendButton.disabled = true;
  sendButton.textContent = 'Sending…';
  showStatus(sendStatus, '');
  try {
    if (!user) user = await signInFromStep();
    const category = categoryById(draft.category);
    const result = await api('/bookings', {
      method: 'POST',
      body: { ...draft, service_type: category.apiValue, service_options: draft.services },
    });
    draft = blank();
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    form.hidden = true;
    document.querySelector('.wizard-steps').hidden = true;
    document.querySelector('.booking-summary').hidden = true;
    const done = document.querySelector('[data-done]');
    done.querySelector('[data-reference]').textContent = result.reference;
    done.hidden = false;
    done.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showStatus(sendStatus, error.message, 'error');
    if (user) renderAccount(); // signed in now, even if the booking itself failed
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = 'Send booking request';
  }
});

// ---- Start -----------------------------------------------------------------------------------------
renderCategories();
renderServices();
renderProperty();
renderTimes();
fillInputs();
renderSummary();
show(0, { focus: false });
getMe().then(me => {
  user = me;
  // Prefill the phone number saved on the account.
  if (me?.phone && !draft.contact_phone) { draft.contact_phone = me.phone; fillInputs(); renderSummary(); save(); }
  if (current === steps.length - 1) renderAccount();
}).catch(() => {});
