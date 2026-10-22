// Runs on every page: mobile menu, account link, contact details from config.js, footer year.

import { getMe } from './api.js';
import { SITE } from './config.js';

// Mobile menu
const toggle = document.querySelector('.menu-toggle');
const nav = document.getElementById('main-nav');
if (toggle && nav) {
  const setOpen = open => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    toggle.querySelector('use')?.setAttribute('href', `/assets/img/icons.svg#${open ? 'x' : 'menu'}`);
    nav.classList.toggle('open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
}

// Header account link: "Log in" for visitors, "My bookings" / "Owner portal" when signed in.
const accountLinks = document.querySelectorAll('[data-account-link]');
if (accountLinks.length) {
  getMe().then(user => {
    if (!user) return;
    accountLinks.forEach(link => {
      link.href = '/dashboard';
      link.querySelector('span').textContent = user.is_admin ? 'Owner portal' : 'My bookings';
      link.title = `Signed in as ${user.full_name}`;
    });
  }).catch(() => {});
}

// Contact details. Elements with data-contact="phone|email|whatsapp|hours|areas" are filled in,
// and anything wrapped in data-requires="..." is hidden when that detail is not configured.
const links = {
  phone: value => `tel:${value.replace(/[^+\d]/g, '')}`,
  email: value => `mailto:${value}`,
  whatsapp: value => `https://wa.me/${value}`,
};
document.querySelectorAll('[data-requires]').forEach(element => {
  if (!SITE[element.dataset.requires]) element.remove();
});
document.querySelectorAll('[data-contact]').forEach(element => {
  const key = element.dataset.contact;
  const value = SITE[key];
  if (!value) return;
  if (element.tagName === 'A' && links[key]) element.href = links[key](value);
  const label = element.querySelector('[data-value]') || element;
  label.textContent = key === 'whatsapp' ? 'WhatsApp us' : value;
});

document.querySelectorAll('[data-year]').forEach(element => { element.textContent = new Date().getFullYear(); });

// Neuropulse credit link (only if a website is configured).
const credit = document.querySelector('[data-developer-link]');
if (credit && SITE.developer?.url) credit.href = SITE.developer.url;
else credit?.removeAttribute('href');
