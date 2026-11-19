/**
 * <ws-grid-filter data-target="grid-id"> — "Alla / Rekommenderade" chips for ws- product grids.
 * Toggle buttons (aria-pressed); hides non-recommended <li> items; announces the result count.
 */
class WsGridFilter extends HTMLElement {
  connectedCallback() {
    this.grid = document.getElementById(this.dataset.target || '');
    this.status = this.querySelector('[data-ws-filter-status]');
    this.querySelectorAll('[data-filter]').forEach((chip) => chip.addEventListener('click', () => this.apply(chip)));
  }

  apply(chip) {
    if (!this.grid) return;
    const mode = chip.dataset.filter;
    this.querySelectorAll('[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));

    let visible = 0;
    this.grid.querySelectorAll(':scope > li').forEach((li) => {
      const show = mode === 'all' || li.dataset.recommended === 'true';
      li.hidden = !show;
      if (show) visible++;
    });
    /* Reset horizontal scroll for mobile carousel layout */
    this.grid.scrollLeft = 0;
    if (this.status) this.status.textContent = `${visible}`;
  }
}

if (!customElements.get('ws-grid-filter')) customElements.define('ws-grid-filter', WsGridFilter);
