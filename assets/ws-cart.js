/**
 * ws-cart.js — shared add-to-cart for all ws- sections.
 *
 * Does NOT build a cart. It talks to Horizon's existing cart the same way the theme's own
 * product-form does: it dispatches the standard `shopify:cart:lines-update` event (with a deferred
 * promise), posts to /cart/add.js requesting the cart-items section HTML, then resolves the promise
 * so the existing cart drawer, cart icon bubble and cart items re-render themselves.
 */
import { CartLinesUpdateEvent, CartErrorEvent } from '@shopify/events';

const routes = () => window.Theme?.routes ?? { cart_add_url: '/cart/add.js', cart_url: '/cart' };

/** Section ids of every rendered <cart-items-component> (drawer / cart page) */
function cartSectionIds() {
  const ids = new Set();
  document.querySelectorAll('cart-items-component[data-section-id]').forEach((el) => {
    if (el instanceof HTMLElement && el.dataset.sectionId) ids.add(el.dataset.sectionId);
  });
  return [...ids];
}

/** Opens Horizon's cart drawer; falls back to the cart page when the theme uses cart type "page". */
export function wsOpenCartDrawer() {
  const drawer = /** @type {any} */ (document.querySelector('theme-drawer#cart-drawer'));
  if (drawer && typeof drawer.open === 'function') {
    if (!drawer.isOpen) drawer.open();
    return true;
  }
  window.location.href = routes().cart_url;
  return false;
}

/**
 * Adds one or more lines in a single /cart/add.js request.
 * @param {{id: string|number, quantity?: number, selling_plan?: string|number, properties?: object}[]} items
 * @param {{source?: string, target?: EventTarget, openDrawer?: boolean}} [options]
 * @returns {Promise<{ok: boolean, cart?: any, message?: string}>}
 */
export async function wsAddToCart(items, { source = 'ws', target = document, openDrawer = true } = {}) {
  const lines = items
    .filter((item) => item && item.id && (item.quantity ?? 1) > 0)
    .map((item) => {
      const line = { id: Number(item.id), quantity: Number(item.quantity ?? 1) };
      if (item.selling_plan) line.selling_plan = Number(item.selling_plan);
      if (item.properties) line.properties = item.properties;
      return line;
    });
  if (!lines.length) return { ok: false, message: 'No items' };

  const sectionIds = cartSectionIds();
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const deferred = CartLinesUpdateEvent.createPromise();

  target.dispatchEvent(
    new CartLinesUpdateEvent({
      action: 'add',
      context: 'product',
      lines: lines.map((l) => ({ merchandiseId: String(l.id), quantity: l.quantity })),
      promise: deferred.promise,
    })
  );

  const fetchCart = () =>
    fetch(`${routes().cart_url}.js`, { headers: { Accept: 'application/json' } }).then((r) => r.json());

  try {
    const body = { items: lines };
    if (sectionIds.length) {
      body.sections = sectionIds.join(',');
      body.sections_url = window.location.pathname;
    }
    const response = await fetch(routes().cart_add_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (!response.ok || data.status) {
      const message = data.description || data.message || 'Add to cart failed';
      target.dispatchEvent(
        new CartErrorEvent({ error: message, code: 'INVALID', detail: { description: data.description, errors: data.errors } })
      );
      fetchCart()
        .then((cart) =>
          deferred.resolve({
            cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
            detail: { didError: true, items: cart.items, source, sourceId: source, itemCount },
          })
        )
        .catch(deferred.reject);
      return { ok: false, message };
    }

    const cart = await fetchCart();
    deferred.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: { didError: false, items: cart.items, source, sourceId: source, itemCount, sections: data.sections },
    });

    if (openDrawer) requestAnimationFrame(() => wsOpenCartDrawer());
    document.dispatchEvent(new CustomEvent('ws:cart:added', { detail: { items: lines, cart } }));
    return { ok: true, cart };
  } catch (error) {
    console.error('[ws-cart]', error);
    deferred.reject(error);
    target.dispatchEvent(
      new CartErrorEvent({ error: error?.message || 'Network error during add to cart', code: 'SERVICE_UNAVAILABLE' })
    );
    return { ok: false, message: error?.message };
  }
}

/**
 * <ws-add-button data-variant-id data-open-drawer data-added-text data-error-text>
 *   <button>…<span data-label>Add</span></button><span data-status role="status"></span>
 * </ws-add-button>
 */
class WsAddButton extends HTMLElement {
  connectedCallback() {
    this.button = this.querySelector('button');
    this.label = this.querySelector('[data-label]');
    this.status = this.querySelector('[data-status]');
    this.button?.addEventListener('click', this.onClick);
  }

  disconnectedCallback() {
    this.button?.removeEventListener('click', this.onClick);
  }

  onClick = async (event) => {
    event.preventDefault();
    if (!this.button || this.button.getAttribute('aria-busy') === 'true') return;

    const original = this.label?.textContent ?? '';
    this.button.setAttribute('aria-busy', 'true');
    this.classList.add('is-loading');

    const quantity = Number(this.dataset.quantity || 1);
    const result = await wsAddToCart([{ id: this.dataset.variantId, quantity }], {
      source: 'ws-add-button',
      target: this,
      openDrawer: this.dataset.openDrawer !== 'false',
    });

    this.classList.remove('is-loading');
    this.button.removeAttribute('aria-busy');

    const message = result.ok ? this.dataset.addedText : result.message || this.dataset.errorText;
    this.classList.add(result.ok ? 'is-added' : 'is-error');
    if (this.label && message) this.label.textContent = message;
    if (this.status && message) this.status.textContent = message;

    window.setTimeout(() => {
      this.classList.remove('is-added', 'is-error');
      if (this.label) this.label.textContent = original;
      if (this.status) this.status.textContent = '';
    }, 2200);
  };
}

if (!customElements.get('ws-add-button')) customElements.define('ws-add-button', WsAddButton);

/* Shared handle for other ws- modules (avoids importing this file under a second, un-versioned URL). */
window.wsCart = { add: wsAddToCart, openDrawer: wsOpenCartDrawer };
document.dispatchEvent(new CustomEvent('ws:cart:ready'));
