/**
 * <ws-announcement> — rotating announcement messages + live free-shipping progress.
 * Rotation pauses on hover/focus (WCAG 2.2.2). Free-shipping progress updates whenever the
 * theme's standard cart event fires (adds from product form, quick add, drawer quantity changes).
 */
import { formatMoney } from '@theme/money-formatting';

class WsAnnouncement extends HTMLElement {
  connectedCallback() {
    this.slides = [...this.querySelectorAll('[data-ws-slide]')];
    this.index = Math.max(0, this.slides.findIndex((s) => s.classList.contains('is-active')));
    this.interval = Number(this.dataset.interval) || 5000;
    this.paused = false;

    this.querySelector('[data-ws-prev]')?.addEventListener('click', () => this.show(this.index - 1, true));
    this.querySelector('[data-ws-next]')?.addEventListener('click', () => this.show(this.index + 1, true));
    this.addEventListener('mouseenter', () => (this.paused = true));
    this.addEventListener('mouseleave', () => (this.paused = false));
    this.addEventListener('focusin', () => (this.paused = true));
    this.addEventListener('focusout', () => (this.paused = false));
    this.addEventListener('shopify:block:select', (e) => {
      const i = this.slides.indexOf(/** @type {HTMLElement} */ (e.target));
      if (i >= 0) {
        this.paused = true;
        this.show(i);
      }
    });
    this.addEventListener('shopify:block:deselect', () => (this.paused = false));

    if (this.slides.length > 1 && this.dataset.autoplay === 'true') {
      this.timer = window.setInterval(() => {
        if (!this.paused && !document.hidden) this.show(this.index + 1);
      }, this.interval);
    }

    this.shipping = this.querySelector('[data-ws-shipping]');
    if (this.shipping) {
      this.updateShipping(Number(this.shipping.dataset.total) || 0);
      document.addEventListener('shopify:cart:lines-update', this.onCartUpdate);
    }
  }

  disconnectedCallback() {
    window.clearInterval(this.timer);
    document.removeEventListener('shopify:cart:lines-update', this.onCartUpdate);
  }

  show(next, userInitiated = false) {
    if (!this.slides.length) return;
    const count = this.slides.length;
    this.index = (next + count) % count;
    this.slides.forEach((slide, i) => {
      const active = i === this.index;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.querySelectorAll('a, button').forEach((el) => (active ? el.removeAttribute('tabindex') : el.setAttribute('tabindex', '-1')));
    });
    if (userInitiated) this.paused = true;
  }

  onCartUpdate = (event) => {
    const refresh = () =>
      fetch(`${window.Theme?.routes?.cart_url ?? '/cart'}.js`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((cart) => this.updateShipping(cart.total_price))
        .catch(() => {});
    if (event.promise) event.promise.then(refresh, () => {});
    else refresh();
  };

  /** @param {number} totalCents cart total in presentment currency minor units */
  updateShipping(totalCents) {
    const el = this.shipping;
    if (!el) return;
    const rate = Number(window.Shopify?.currency?.rate) || 1;
    const threshold = Math.round((Number(el.dataset.threshold) || 0) * rate);
    const remaining = Math.max(0, threshold - totalCents);
    const progress = threshold > 0 ? Math.min(100, (totalCents / threshold) * 100) : 100;
    const currency = el.dataset.currency || window.Shopify?.currency?.active || 'SEK';
    const amount = formatMoney(remaining, el.dataset.format || '{{amount}}', currency);

    const textEl = el.querySelector('[data-ws-shipping-text]');
    const message = remaining > 0 ? el.dataset.progressMsg : el.dataset.reachedMsg;
    if (textEl && message) textEl.textContent = message.replace('[remaining]', amount);
    el.closest('[data-ws-slide]')?.style.setProperty('--ws-progress', `${progress}%`);
    el.classList.toggle('is-reached', remaining === 0);
  }
}

if (!customElements.get('ws-announcement')) customElements.define('ws-announcement', WsAnnouncement);
