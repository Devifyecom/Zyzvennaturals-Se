/**
 * ws-cart-drawer.js — automatic free gift for the WS · Cart drawer.
 *
 * Config comes from <script id="ws-cart-gift-config"> (Theme settings › WS · Cart drawer).
 * After every cart change (Horizon fires the standard `cartLinesUpdate` event for all of them)
 * and once on page load it checks the cart:
 *   - cart total (excluding the gift) ≥ threshold and no gift → adds the gift (property _ws_gift)
 *   - below the threshold → removes the gift
 *   - gift quantity > 1 → back to 1
 * If the customer removes the gift themselves, it isn't re-added in this session until the
 * cart drops below the threshold again. The price itself is made 0 by an automatic discount
 * set up in Shopify admin — the theme can't change prices.
 */
import { CartLinesUpdateEvent, StandardEvents } from '@shopify/events';

const DECLINED_KEY = 'ws-gift-declined';
const routes = () => window.Theme?.routes ?? {};
const cartUrl = () => routes().cart_url || '/cart';

let busy = false;
let lastGiftKeys = new Set();

function config() {
  const el = document.getElementById('ws-cart-gift-config');
  if (!el) return null;
  try {
    const c = JSON.parse(el.textContent || '{}');
    return c.variant ? { variant: Number(c.variant), threshold: Number(c.threshold) || 0 } : null;
  } catch {
    return null;
  }
}

const isGift = (item) => Boolean(item.properties && item.properties._ws_gift);

const declined = {
  get: () => {
    try {
      return sessionStorage.getItem(DECLINED_KEY) === '1';
    } catch {
      return false;
    }
  },
  set: (on) => {
    try {
      if (on) sessionStorage.setItem(DECLINED_KEY, '1');
      else sessionStorage.removeItem(DECLINED_KEY);
    } catch {
      /* storage blocked: ignore */
    }
  },
};

function cartSectionIds() {
  return [...document.querySelectorAll('cart-items-component[data-section-id]')]
    .map((el) => /** @type {HTMLElement} */ (el).dataset.sectionId)
    .filter(Boolean);
}

/** POSTs a cart mutation with section HTML and lets Horizon re-render through the standard event. */
async function mutate(url, payload, lines) {
  const sections = cartSectionIds();
  const deferred = CartLinesUpdateEvent.createPromise();
  // 'update' (not 'add') so the drawer doesn't pop open on its own
  document.dispatchEvent(
    new CartLinesUpdateEvent({ action: 'update', context: 'cart', lines, promise: deferred.promise })
  );
  try {
    const body = { ...payload };
    if (sections.length) {
      body.sections = sections.join(',');
      body.sections_url = window.location.pathname;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const cart = await fetch(`${cartUrl()}.js`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
    deferred.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: { didError: !res.ok, items: cart.items, itemCount: cart.item_count, source: 'ws-gift', sections: data.sections },
    });
    return cart;
  } catch (error) {
    deferred.reject(error);
    throw error;
  }
}

async function sync() {
  const c = config();
  if (!c || busy) return;
  busy = true;
  try {
    const cart = await fetch(`${cartUrl()}.js`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
    const gifts = cart.items.filter(isGift);
    const giftTotal = gifts.reduce((sum, i) => sum + i.final_line_price, 0);
    const total = Math.max(0, cart.total_price - giftTotal);
    const rate = Number(window.Shopify?.currency?.rate) || 1;
    const threshold = Math.round(c.threshold * 100 * rate);
    const qualifies = total > 0 && total >= threshold;

    // Gift was in the cart last time, is gone now, and we didn't remove it → customer removed it
    if (qualifies && !gifts.length && lastGiftKeys.size) declined.set(true);
    if (!qualifies) declined.set(false);

    if (qualifies && !gifts.length && !declined.get()) {
      await mutate(
        routes().cart_add_url || '/cart/add.js',
        { items: [{ id: c.variant, quantity: 1, properties: { _ws_gift: '1' } }] },
        [{ merchandiseId: String(c.variant), quantity: 1 }]
      );
    } else if (!qualifies && gifts.length) {
      const updates = Object.fromEntries(gifts.map((g) => [g.key, 0]));
      await mutate(`${cartUrl()}/update.js`, { updates }, gifts.map((g) => ({ id: g.key, quantity: 0 })));
    } else if (qualifies && gifts.length && (gifts.length > 1 || gifts[0].quantity > 1)) {
      const updates = Object.fromEntries(gifts.map((g, i) => [g.key, i === 0 ? 1 : 0]));
      await mutate(`${cartUrl()}/update.js`, { updates }, gifts.map((g, i) => ({ id: g.key, quantity: i === 0 ? 1 : 0 })));
    }

    const after = await fetch(`${cartUrl()}.js`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
    lastGiftKeys = new Set(after.items.filter(isGift).map((i) => i.key));
  } catch (error) {
    console.warn('[ws-cart-drawer] gift sync failed', error);
  } finally {
    busy = false;
  }
}

document.addEventListener(StandardEvents.cartLinesUpdate, (event) => {
  const e = /** @type {any} */ (event);
  // Our own mutations resolve with source 'ws-gift'; skip them to avoid loops
  e.promise
    ?.then((result) => {
      if (result?.detail?.source === 'ws-gift') return;
      // Let Horizon finish its own re-render first
      window.setTimeout(sync, 150);
    })
    .catch(() => {});
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
else sync();
