/**
 * <ws-bundle> — "Bundle & save" builder (snippets/ws-bundle-builder.liquid).
 *
 * DISPLAY ONLY: it shows the tier discount and adds all chosen lines to the cart in ONE
 * /cart/add.js request. The real discount must come from Shopify automatic discounts that
 * mirror the configured tiers (see setup guide), so the numbers here match checkout.
 */
import { formatMoney } from '@theme/money-formatting';

const getCart = () =>
  window.wsCart
    ? Promise.resolve(window.wsCart)
    : new Promise((resolve) => document.addEventListener('ws:cart:ready', () => resolve(window.wsCart), { once: true }));

class WsBundle extends HTMLElement {
  connectedCallback() {
    try {
      this.tiers = JSON.parse(this.dataset.tiers || '[]').sort((a, b) => a.qty - b.qty);
    } catch {
      this.tiers = [];
    }
    this.items = [...this.querySelectorAll('[data-ws-bundle-item]')];
    this.addBtn = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-ws-bundle-add]'));

    this.addEventListener('click', this.onClick);
    this.addEventListener('change', this.onChange);
    this.addBtn?.addEventListener('click', this.onAdd);
    this.update();
  }

  money(cents) {
    return formatMoney(Math.round(cents), this.dataset.moneyFormat || '{{amount}}', this.dataset.currency || 'SEK');
  }

  onClick = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const inc = target.closest('[data-ws-bundle-inc]');
    const dec = target.closest('[data-ws-bundle-dec]');
    if (!inc && !dec) return;
    const item = /** @type {HTMLElement} */ ((inc || dec).closest('[data-ws-bundle-item]'));
    if (!item) return;
    const qty = Math.max(0, (Number(item.dataset.qty) || 0) + (inc ? 1 : -1));
    this.setQty(item, qty, inc ? 'inc' : 'dec');
  };

  onChange = (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.target);
    if (!select.matches('[data-ws-bundle-variant]')) return;
    const item = /** @type {HTMLElement} */ (select.closest('[data-ws-bundle-item]'));
    const option = select.selectedOptions[0];
    if (!item || !option) return;
    item.dataset.variantId = select.value;
    item.dataset.price = option.dataset.price || item.dataset.price;
    const priceEl = item.querySelector('[data-ws-bundle-item-price]');
    if (priceEl) priceEl.textContent = this.money(Number(item.dataset.price));
    this.update();
  };

  setQty(item, qty, source) {
    item.dataset.qty = String(qty);
    const stepper = /** @type {HTMLElement | null} */ (item.querySelector('[data-ws-bundle-stepper]'));
    const addBtn = /** @type {HTMLElement | null} */ (item.querySelector('.ws-bundle__add-btn'));
    const qtyEl = item.querySelector('[data-ws-bundle-qty]');
    if (qtyEl) qtyEl.textContent = String(qty);
    if (stepper) stepper.hidden = qty === 0;
    if (addBtn) addBtn.hidden = qty > 0;
    item.classList.toggle('is-selected', qty > 0);

    /* Keep keyboard focus on a sensible control when the "Add" button swaps for the stepper */
    if (source === 'inc' && qty === 1) item.querySelector('[data-ws-bundle-stepper] [data-ws-bundle-inc]')?.focus();
    if (source === 'dec' && qty === 0) addBtn?.focus();
    this.update();
  }

  get selection() {
    return this.items
      .map((el) => ({ id: el.dataset.variantId, quantity: Number(el.dataset.qty) || 0, price: Number(el.dataset.price) || 0 }))
      .filter((i) => i.quantity > 0);
  }

  update() {
    const sel = this.selection;
    const count = sel.reduce((n, i) => n + i.quantity, 0);
    const original = sel.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const active = [...this.tiers].reverse().find((t) => count >= t.qty) || null;
    const next = this.tiers.find((t) => count < t.qty) || null;
    const percent = active ? active.percent : 0;
    const total = Math.round(original * (1 - percent / 100));
    const saved = original - total;

    /* Tier cards */
    this.querySelectorAll('[data-ws-tier]').forEach((el) => {
      const q = Number(/** @type {HTMLElement} */ (el).dataset.wsTier);
      el.classList.toggle('is-active', Boolean(active && q === active.qty));
      el.classList.toggle('is-reached', count >= q);
    });

    /* Hint */
    const hint = this.querySelector('[data-ws-bundle-hint]');
    if (hint) {
      let text = '';
      if (next && !active) text = this.dataset.hintStart || '';
      else if (next) text = this.dataset.hintNext || '';
      else if (active) text = this.dataset.hintMax || '';
      const target = next || active;
      hint.textContent = text
        .replace('[count]', String(next ? next.qty - count : 0))
        .replace('[percent]', String(target ? target.percent : 0));
    }

    /* Totals */
    const totals = /** @type {HTMLElement | null} */ (this.querySelector('[data-ws-bundle-totals]'));
    if (totals) totals.hidden = count === 0;
    const set = (sel, text) => {
      const el = this.querySelector(sel);
      if (el) el.textContent = text;
    };
    set('[data-ws-bundle-count]', `${count} ${this.dataset.productsLabel || ''}`.trim());
    set('[data-ws-bundle-discount]', percent ? `${this.dataset.discountLabel || ''} −${percent} %`.trim() : '');
    set('[data-ws-bundle-original]', percent ? this.money(original) : '');
    set('[data-ws-bundle-total]', this.money(total));
    set('[data-ws-bundle-saved]', percent ? (this.dataset.savedLabel || '').replace('[amount]', this.money(saved)) : '');

    if (this.addBtn) this.addBtn.disabled = count === 0;
  }

  onAdd = async () => {
    const sel = this.selection;
    if (!sel.length || !this.addBtn) return;
    const label = this.addBtn.querySelector('[data-label]');
    const original = label?.textContent ?? '';
    const status = this.querySelector('[data-ws-bundle-status]');

    this.addBtn.setAttribute('aria-busy', 'true');
    this.addBtn.disabled = true;

    const cart = await getCart();
    const result = await cart.add(
      sel.map(({ id, quantity }) => ({ id, quantity })),
      { source: 'ws-bundle', target: this, openDrawer: true }
    );

    this.addBtn.removeAttribute('aria-busy');
    const message = result.ok ? this.dataset.addedText : result.message || this.dataset.errorText;
    if (label && message) label.textContent = message;
    if (status && message) status.textContent = message;

    if (result.ok) this.items.forEach((item) => this.setQty(item, 0));

    window.setTimeout(() => {
      if (label) label.textContent = original;
      if (status) status.textContent = '';
      this.update();
    }, 2200);
  };
}

if (!customElements.get('ws-bundle')) customElements.define('ws-bundle', WsBundle);
