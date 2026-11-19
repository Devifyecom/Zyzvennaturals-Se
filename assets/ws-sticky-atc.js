/**
 * <ws-sticky-atc> — sticky add-to-cart bar for the ws- product template.
 * Visible only while the main [data-ws-main-atc] button is scrolled above the viewport and the
 * footer is not in view. Stays in sync with <ws-product> through document events and adds to cart
 * through the main product's own addToCart() so quantity / selling plan / drawer behaviour match.
 */
class WsStickyAtc extends HTMLElement {
  connectedCallback() {
    this.product = /** @type {any} */ (document.querySelector('ws-product'));
    this.mainAtc = this.product?.querySelector('[data-ws-main-atc]');
    if (!this.product || !this.mainAtc) return;

    this.button = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-ws-sticky-atc]'));
    this.label = this.querySelector('[data-ws-sticky-label]');
    this.price = this.querySelector('[data-ws-sticky-price]');
    this.select = /** @type {HTMLSelectElement | null} */ (this.querySelector('[data-ws-sticky-variant]'));

    this.atcPassed = false;
    this.footerVisible = false;

    this.atcObserver = new IntersectionObserver(([entry]) => {
      this.atcPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      this.toggle();
    });
    this.atcObserver.observe(this.mainAtc);

    const footer = document.querySelector('footer');
    if (footer) {
      this.footerObserver = new IntersectionObserver(([entry]) => {
        this.footerVisible = entry.isIntersecting;
        this.toggle();
      });
      this.footerObserver.observe(footer);
    }

    this.button?.addEventListener('click', this.onAdd);
    this.select?.addEventListener('change', () => {
      document.dispatchEvent(
        new CustomEvent('ws:variant:select', { detail: { sectionId: this.product.dataset.sectionId, variantId: this.select.value } })
      );
    });
    document.addEventListener('ws:variant:change', this.onVariantChange);
  }

  disconnectedCallback() {
    this.atcObserver?.disconnect();
    this.footerObserver?.disconnect();
    document.removeEventListener('ws:variant:change', this.onVariantChange);
  }

  toggle() {
    const show = this.atcPassed && !this.footerVisible;
    this.classList.toggle('is-visible', show);
    this.toggleAttribute('inert', !show);
    this.setAttribute('aria-hidden', String(!show));
  }

  onVariantChange = (event) => {
    const d = event.detail;
    if (!d || d.sectionId !== this.product.dataset.sectionId) return;
    if (this.price && d.priceFormatted) this.price.textContent = d.priceFormatted;
    if (this.label && d.label) this.label.textContent = d.label;
    if (this.button) this.button.disabled = !d.available;
    if (this.select && d.variant) this.select.value = String(d.variant.id);
  };

  onAdd = async () => {
    if (!this.button || typeof this.product.addToCart !== 'function') return;
    const original = this.label?.textContent ?? '';
    const result = await this.product.addToCart(this.button);
    if (this.label) {
      this.label.textContent = result?.ok ? this.product.dataset.labelAdded : this.product.dataset.labelError;
      window.setTimeout(() => (this.label.textContent = original), 2000);
    }
  };
}

if (!customElements.get('ws-sticky-atc')) customElements.define('ws-sticky-atc', WsStickyAtc);
