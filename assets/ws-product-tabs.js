/**
 * <ws-product-tabs> — "Related products" / "Recently viewed" tabs.
 * Related: Shopify product recommendations API (section rendering).
 * Recently viewed: product ids the theme already stores in localStorage ('viewedProducts'),
 * rendered through the search endpoint with this section's id. WAI-ARIA tabs keyboard pattern.
 */
class WsProductTabs extends HTMLElement {
  connectedCallback() {
    this.tabs = [...this.querySelectorAll('[role="tab"]')];
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => this.select(tab));
      tab.addEventListener('keydown', this.onKeydown);
    });

    this.loaded = new Set();
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.observer.disconnect();
          Promise.all([this.load('related'), this.load('recent')]).then(() => this.preferNonEmpty());
        }
      },
      { rootMargin: '400px 0px' }
    );
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }

  select(tab, focus = false) {
    this.tabs.forEach((t) => {
      const active = t === tab;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') || '');
      if (panel) panel.hidden = !active;
    });
    if (focus) tab.focus();
  }

  onKeydown = (event) => {
    const i = this.tabs.indexOf(event.currentTarget);
    let next = -1;
    if (event.key === 'ArrowRight') next = (i + 1) % this.tabs.length;
    else if (event.key === 'ArrowLeft') next = (i - 1 + this.tabs.length) % this.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    this.select(this.tabs[next], true);
  };

  panel(name) {
    return this.querySelector(`[data-ws-panel="${name}"]`);
  }

  async fetchPanel(url, name) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = new DOMParser().parseFromString(await response.text(), 'text/html');
    return html.querySelector(`[data-ws-panel="${name}"]`);
  }

  async load(name) {
    const panel = this.panel(name);
    if (!panel || this.loaded.has(name)) return;
    this.loaded.add(name);
    const { sectionId, productId, limit, intent, recoUrl, searchUrl } = this.dataset;

    try {
      if (name === 'related') {
        if (!panel.querySelector('[data-ws-loading]')) return;
        const url = `${recoUrl}?product_id=${productId}&limit=${limit}&section_id=${sectionId}&intent=${intent}`;
        const fresh = await this.fetchPanel(url, 'related');
        if (fresh) panel.innerHTML = fresh.innerHTML;
      }

      if (name === 'recent') {
        let ids = [];
        try {
          ids = JSON.parse(localStorage.getItem('viewedProducts') || '[]').map(String);
        } catch {}
        ids = ids.filter((id) => id !== String(productId)).slice(0, Number(limit) || 4);
        if (!ids.length) return;

        const q = ids.map((id) => `id:${id}`).join(' OR ');
        const url = `${searchUrl}?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=${ids.length}&resources[options][unavailable_products]=last&section_id=${sectionId}`;
        const fresh = await this.fetchPanel(url, 'recent');
        if (!fresh) return;
        const list = fresh.querySelector('ul');
        if (list) {
          /* Keep most-recent-first order */
          [...list.children]
            .sort((a, b) => ids.indexOf(a.getAttribute('data-product-id')) - ids.indexOf(b.getAttribute('data-product-id')))
            .forEach((li) => list.appendChild(li));
        }
        panel.innerHTML = fresh.innerHTML;
      }
    } catch (error) {
      console.warn('[ws-product-tabs]', error);
      const loading = panel.querySelector('[data-ws-loading]');
      if (loading) loading.remove();
    }
  }

  /** If "Related" ended up empty but "Recently viewed" has products, show that tab instead. */
  preferNonEmpty() {
    if (this.tabs.length < 2) return;
    const related = this.panel('related');
    const recent = this.panel('recent');
    const recentTab = this.tabs.find((t) => t.dataset.wsTab === 'recent');
    if (related?.querySelector('[data-ws-empty]') && recent && !recent.querySelector('[data-ws-empty]') && recentTab) {
      this.select(recentTab);
    }
  }
}

if (!customElements.get('ws-product-tabs')) customElements.define('ws-product-tabs', WsProductTabs);
