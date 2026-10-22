// Home page: "What do you need help with?" tabs and approved customer reviews.

import { api, escapeHtml, formatDate } from './api.js';

// Picker tabs (arrow keys move between tabs, as screen-reader users expect).
const picker = document.querySelector('[data-picker]');
if (picker) {
  const tabs = [...picker.querySelectorAll('[role="tab"]')];
  const select = tab => {
    tabs.forEach(other => {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
    });
  };
  tabs.forEach((tab, index) => {
    tab.tabIndex = index === 0 ? 0 : -1;
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

// Reviews: the section stays hidden until there is at least one approved review.
const section = document.getElementById('reviews');
if (section) {
  api('/reviews').then(({ reviews, summary }) => {
    if (!reviews?.length) return;
    const average = Number(summary.average_rating || 0);
    section.querySelector('[data-rating-average]').textContent = average.toFixed(1);
    const stars = section.querySelector('[data-rating-stars]');
    stars.textContent = '★'.repeat(Math.round(average)) + '☆'.repeat(5 - Math.round(average));
    stars.setAttribute('aria-label', `${average.toFixed(1)} out of 5 stars`);
    section.querySelector('[data-rating-count]').textContent = `${summary.total_reviews} review${summary.total_reviews === 1 ? '' : 's'}`;
    section.querySelector('[data-review-list]').innerHTML = reviews.map(review => `
      <figure class="review">
        <div class="stars" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
        <blockquote>${escapeHtml(review.review_text || 'Rated this service.')}</blockquote>
        <footer><strong>${escapeHtml(review.customer_name)}</strong>, ${escapeHtml(review.service_type === 'Both' ? 'Pest control and cleaning' : review.service_type === 'Fumigation / Pest Control' ? 'Pest control' : review.service_type)}, ${escapeHtml(formatDate(review.created_at))}</footer>
      </figure>`).join('');
    section.hidden = false;
  }).catch(() => {});
}
