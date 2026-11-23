/**
 * <ws-collection-tabs> — pick a collection, see all its products in place.
 * Uses Shopify section rendering: /collections/<handle>?section_id=<id>[&page=n] returns this same
 * section with that collection active, so no extra API or app is needed.
 * WAI-ARIA tabs (arrow keys / Home / End), "Visa fler" appends the next page, results are cached,
 * and Okendo star widgets in new cards are initialised.
 */
const initReviewWidgets = () => {
  try {
    window.okeWidgetApi?.initAllWidgets?.();
  } catch {}
};

class WsCollectionTabs extends HTMLElement {
  connectedCallback() {
    this.sectionId = this.dataset.sectionId;
    this.panel = this.querySelector('[data-ws-ctabs-panel]');
    this.tabs = [...this.querySelectorAll('[role="tab"]')];
    this.cache = new Map();
    if (!this.panel) return;
    /* "Visa fler" works with or without tabs (single-collection sections have no tab row) */
    this.panel.addEventListener('click', this.onPanelClick);
    if (!this.tabs.length) return;

    const active = this.tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    if (active) this.cache.set(active.dataset.url, this.panel.innerHTML);

    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => this.select(tab));
      tab.addEventListener('keydown', this.onKeydown);
    });
    this.addEventListener('shopify:block:select', (e) => {
      const tab = /** @type {HTMLElement} */ (e.target).closest?.('[role="tab"]');
      if (tab) this.select(tab);
    });
  }

  sectionUrl(url, page) {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('section_id', this.sectionId);
    if (page) u.searchParams.set('page', String(page));
    return u.toString();
  }

  async fetchPanel(url, page) {
    const response = await fetch(this.sectionUrl(url, page));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const panel = doc.querySelector('[data-ws-ctabs-panel]');
    if (!panel) throw new Error('Panel missing in response');
    return panel;
  }

  async select(tab, focus = false) {
    if (focus) tab.focus();
    if (tab.getAttribute('aria-selected') === 'true' && !this.panel.querySelector('.ws-ctabs__error')) return;

    this.tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    this.panel.setAttribute('aria-labelledby', tab.id);
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    const url = tab.dataset.url;
    if (this.cache.has(url)) {
      this.panel.innerHTML = this.cache.get(url);
      initReviewWidgets();
      return;
    }

    this.panel.setAttribute('aria-busy', 'true');
    try {
      const fresh = await this.fetchPanel(url);
      /* Ignore stale responses if the user switched again meanwhile */
      if (tab.getAttribute('aria-selected') !== 'true') return;
      this.panel.innerHTML = fresh.innerHTML;
      this.cache.set(url, fresh.innerHTML);
      initReviewWidgets();
    } catch (error) {
      console.warn('[ws-collection-tabs]', error);
      this.showError(() => this.select(tab));
    } finally {
      this.panel.removeAttribute('aria-busy');
    }
  }

  onPanelClick = async (event) => {
    const more = /** @type {HTMLElement} */ (event.target).closest('[data-ws-ctabs-more]');
    if (!more) return;
    const grid = this.panel.querySelector('[data-ws-ctabs-grid]');
    if (!grid) return;

    more.setAttribute('aria-busy', 'true');
    more.disabled = true;
    const firstNewIndex = grid.children.length;
    try {
      const fresh = await this.fetchPanel(more.dataset.url, Number(more.dataset.nextPage));
      const items = fresh.querySelectorAll('[data-ws-ctabs-grid] > li');
      items.forEach((li) => grid.appendChild(document.importNode(li, true)));
      const footer = this.panel.querySelector('[data-ws-ctabs-footer]');
      const freshFooter = fresh.querySelector('[data-ws-ctabs-footer]');
      if (footer && freshFooter) footer.replaceWith(document.importNode(freshFooter, true));
      else footer?.remove();
      /* Keep the cache in sync so switching back restores everything loaded so far */
      const activeTab = this.tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      if (activeTab) this.cache.set(activeTab.dataset.url, this.panel.innerHTML);
      initReviewWidgets();
      /* Move focus to the first newly loaded product for keyboard / screen reader users */
      grid.children[firstNewIndex]?.querySelector('a')?.focus({ preventScroll: true });
    } catch (error) {
      console.warn('[ws-collection-tabs]', error);
      more.removeAttribute('aria-busy');
      more.disabled = false;
      more.textContent = this.dataset.retryText || more.textContent;
    }
  };

  showError(retry) {
    this.panel.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ws-ctabs__error';
    const p = document.createElement('p');
    p.setAttribute('role', 'alert');
    p.textContent = this.dataset.errorText || 'Error';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ws-btn ws-btn--secondary';
    btn.textContent = this.dataset.retryText || 'Retry';
    btn.addEventListener('click', retry);
    wrap.append(p, btn);
    this.panel.append(wrap);
  }

  onKeydown = (event) => {
    const i = this.tabs.indexOf(/** @type {HTMLElement} */ (event.currentTarget));
    let next = -1;
    if (event.key === 'ArrowRight') next = (i + 1) % this.tabs.length;
    else if (event.key === 'ArrowLeft') next = (i - 1 + this.tabs.length) % this.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    this.select(this.tabs[next], true);
  };
}

if (!customElements.get('ws-collection-tabs')) customElements.define('ws-collection-tabs', WsCollectionTabs);
