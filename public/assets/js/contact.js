// Contact page question form: prepares an email (or WhatsApp message) to 4Guard.
// Nothing is stored on the server, so no account is needed.

import { showStatus } from './api.js';
import { SITE } from './config.js';

const form = document.getElementById('enquiry-form');
const status = form.querySelector('.form-status');

form.addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  for (const [name, message] of [['name', 'Enter your name.'], ['phone', 'Enter your phone number.'], ['topic', 'Choose what your question is about.'], ['message', 'Write your message.']]) {
    const input = form.elements[name];
    input.removeAttribute('aria-invalid');
    if (!String(data[name] || '').trim()) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      showStatus(status, message, 'error');
      return;
    }
  }
  const body = `${data.message}\n\nName: ${data.name}\nPhone: ${data.phone}`;
  if (SITE.email) {
    location.href = `mailto:${SITE.email}?subject=${encodeURIComponent(`Question about ${data.topic.toLowerCase()}`)}&body=${encodeURIComponent(body)}`;
    showStatus(status, 'Your email app should open with the message filled in. Press send there to reach 4Guard.', 'success');
  } else if (SITE.whatsapp) {
    window.open(`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(`${data.topic}\n\n${body}`)}`, '_blank', 'noopener');
    showStatus(status, 'WhatsApp should open with the message filled in. Press send there to reach 4Guard.', 'success');
  } else {
    showStatus(status, 'Contact details have not been added to the website yet. Please book online instead.', 'warn');
  }
});
