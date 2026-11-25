/**
 * <ws-standards> — row of principle cards where exactly one is highlighted.
 * Tap/click (or Enter/Space on the card's button) highlights a card; with [data-hover] a mouse
 * hover on hover-capable devices does too. Supports theme-editor block selection.
 */
class WsStandards extends HTMLElement {
  connectedCallback() {
    this.cards = [...this.querySelectorAll('[data-ws-card]')];
    this.cards.forEach((card) => {
      card.querySelector('.ws-std__select')?.addEventListener('click', () => this.activate(card));
    });
    if (this.hasAttribute('data-hover') && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      this.cards.forEach((card) => card.addEventListener('mouseenter', () => this.activate(card)));
    }
    this.addEventListener('shopify:block:select', (e) => {
      const card = /** @type {HTMLElement} */ (e.target).closest?.('[data-ws-card]');
      if (card) this.activate(card);
    });
  }

  /** @param {Element} card */
  activate(card) {
    this.cards.forEach((c) => {
      const on = c === card;
      c.classList.toggle('is-active', on);
      c.querySelector('.ws-std__select')?.setAttribute('aria-pressed', String(on));
    });
  }
}

if (!customElements.get('ws-standards')) customElements.define('ws-standards', WsStandards);
