const configScript = document.createElement('script');
configScript.src = 'config.js';
configScript.onload = init4Guard;
document.head.appendChild(configScript);

function init4Guard() {
  const config = window.FOURGUARD_CONFIG || {};
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      nav.classList.toggle('open', open);
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
    }));
  }
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
  document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
    try { sessionStorage.setItem('4guard-service', link.dataset.service); } catch {}
  }));
  const serviceSelect = document.querySelector('[name="service"]');
  if (serviceSelect) {
    try {
      const selected = sessionStorage.getItem('4guard-service');
      if (selected && [...serviceSelect.options].some(o => o.value === selected || o.textContent === selected)) {
        serviceSelect.value = selected;
        sessionStorage.removeItem('4guard-service');
      }
    } catch {}
  }
  const phone = document.querySelector('[data-phone]');
  if (phone && config.phone) {
    const a = document.createElement('a'); a.href = `tel:${config.phone.replace(/[^+\d]/g, '')}`; a.textContent = config.phone; phone.replaceWith(a);
  }
  const email = document.querySelector('[data-email]');
  if (email && config.email) {
    const a = document.createElement('a'); a.href = `mailto:${config.email}`; a.textContent = config.email; email.replaceWith(a);
  }
  const footerContact = document.querySelector('[data-footer-contact]');
  if (footerContact && (config.phone || config.email)) footerContact.textContent = [config.phone, config.email].filter(Boolean).join(' · ');

  const form = document.querySelector('#quote-form');
  if (!form) return;
  const feedback = document.querySelector('#form-feedback');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) {
      feedback.textContent = 'Please complete the required fields and check the email address.';
      feedback.classList.add('error'); return;
    }
    const data = Object.fromEntries(new FormData(form));
    const body = [`Name: ${data.name}`, `Phone: ${data.phone}`, `Email: ${data.email}`, `Service: ${data.service}`, `Property: ${data.property}`, `Location: ${data.location}`, `Preferred date: ${data.date || 'Not specified'}`, '', 'Details:', data.message].join('\n');
    feedback.classList.remove('error');
    if (config.email) {
      const subject = encodeURIComponent(`4Guard enquiry — ${data.service}`);
      feedback.textContent = 'Opening your email app with the enquiry details. Please send the draft to complete your enquiry.';
      window.location.href = `mailto:${encodeURIComponent(config.email)}?subject=${subject}&body=${encodeURIComponent(body)}`;
    } else if (config.whatsapp) {
      feedback.textContent = 'Opening WhatsApp with your enquiry details. Review the message and press Send to complete your enquiry.';
      window.open(`https://wa.me/${config.whatsapp}?text=${encodeURIComponent(body)}`, '_blank', 'noopener,noreferrer');
    } else {
      feedback.textContent = 'Your details are valid, but delivery is not configured yet. Add a verified email or WhatsApp number in config.js before publishing.';
    }
  });
}
