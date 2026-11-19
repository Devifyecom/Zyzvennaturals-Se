/**
 * ws-product.js — main product page behaviour for sections/ws-main-product.liquid
 *  <ws-product>         variant selection, price/ATC/subscription/stock updates, add to cart, countdown
 *  <ws-gallery>         swipeable gallery, thumbnails, dots, zoom dialog, variant media switching
 *  <ws-deferred-media>  click-to-load video / external video / 3D model
 *
 * Events:
 *  document 'ws:variant:change' {sectionId, variant, price, priceFormatted, available, label}  (sticky ATC listens)
 *  document 'ws:variant:select' {sectionId, variantId}                                          (sticky ATC dispatches)
 */
import { formatMoney } from '@theme/money-formatting';

const getCart = () =>
  window.wsCart
    ? Promise.resolve(window.wsCart)
    : new Promise((resolve) => document.addEventListener('ws:cart:ready', () => resolve(window.wsCart), { once: true }));

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ======================================================================= */
class WsProduct extends HTMLElement {
  connectedCallback() {
    this.sectionId = this.dataset.sectionId;
    try {
      this.variants = JSON.parse(this.querySelector('[data-ws-variants]')?.textContent || '[]');
    } catch {
      this.variants = [];
    }
    try {
      this.inventory = JSON.parse(this.querySelector('[data-ws-inventory]')?.textContent || '{}');
    } catch {
      this.inventory = {};
    }

    this.form = document.getElementById(this.dataset.formId);
    this.variantInput = this.form?.querySelector('[data-ws-variant-input]');
    this.planInput = this.form?.querySelector('[data-ws-plan-input]');
    this.atc = this.querySelector('[data-ws-main-atc]');
    this.gallery = this.querySelector('ws-gallery');

    const initialId = Number(this.variantInput?.value);
    this.variant = this.variants.find((v) => v.id === initialId) || this.variants.find((v) => v.available) || this.variants[0];
    this.plan = this.planInput?.value || this.querySelector('[data-ws-plan]:checked')?.value || '';

    this.addEventListener('change', this.onChange);
    this.form?.addEventListener('submit', this.onSubmit);
    this.querySelectorAll('[data-ws-qty]').forEach((btn) => btn.addEventListener('click', this.onQtyClick));
    document.addEventListener('ws:variant:select', this.onExternalSelect);

    this.updateOptionAvailability();
    this.initCountdown();
    requestAnimationFrame(() => this.emit());
  }

  disconnectedCallback() {
    document.removeEventListener('ws:variant:select', this.onExternalSelect);
    window.clearInterval(this.countdownTimer);
  }

  /* ---------- helpers ---------- */
  money(cents) {
    return formatMoney(Number(cents) || 0, this.dataset.moneyFormat || '{{amount}}', this.dataset.currency || 'SEK');
  }

  get selectedOptions() {
    const values = [];
    for (let pos = 1; pos <= 3; pos++) {
      const checked = this.querySelector(`input[data-ws-option][data-position="${pos}"]:checked`);
      const select = this.querySelector(`select[data-ws-option][data-position="${pos}"]`);
      const value = checked?.value ?? select?.value;
      if (value !== undefined) values.push(value);
    }
    return values;
  }

  get allocation() {
    if (!this.plan || !this.variant) return null;
    return (this.variant.selling_plan_allocations || []).find((a) => String(a.selling_plan_id) === String(this.plan)) || null;
  }

  /* ---------- events ---------- */
  onChange = (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (target.matches('[data-ws-option]')) {
      const values = this.selectedOptions;
      const match = this.variants.find((v) => v.options.every((opt, i) => opt === values[i]));
      this.setVariant(match || null);
    } else if (target.matches('[data-ws-plan]')) {
      this.plan = target.value;
      if (this.planInput) this.planInput.value = target.value;
      this.render();
      this.emit();
    }
  };

  onExternalSelect = (event) => {
    if (event.detail?.sectionId !== this.sectionId) return;
    const variant = this.variants.find((v) => String(v.id) === String(event.detail.variantId));
    if (!variant) return;
    variant.options.forEach((value, i) => {
      const pos = i + 1;
      this.querySelectorAll(`input[data-ws-option][data-position="${pos}"]`).forEach((input) => {
        input.checked = input.value === value;
      });
      const select = this.querySelector(`select[data-ws-option][data-position="${pos}"]`);
      if (select) select.value = value;
    });
    this.setVariant(variant);
  };

  onQtyClick = (event) => {
    const btn = /** @type {HTMLElement} */ (event.currentTarget);
    const input = btn.closest('[data-ws-qty-wrap]')?.querySelector('input');
    if (!input) return;
    const next = Math.max(1, (Number(input.value) || 1) + Number(btn.dataset.wsQty));
    input.value = String(next);
  };

  /* ---------- state ---------- */
  setVariant(variant) {
    this.variant = variant;
    if (variant && this.variantInput) this.variantInput.value = String(variant.id);

    this.querySelectorAll('[data-ws-opt-current]').forEach((el) => {
      const pos = Number(/** @type {HTMLElement} */ (el).dataset.wsOptCurrent);
      el.textContent = this.selectedOptions[pos - 1] ?? '';
    });

    this.updateOptionAvailability();
    this.render();

    if (variant) {
      if (variant.featured_media?.id) this.gallery?.goToMedia(variant.featured_media.id);
      if (this.dataset.updateUrl === 'true') {
        const url = new URL(this.dataset.productUrl || window.location.pathname, window.location.origin);
        url.searchParams.set('variant', String(variant.id));
        window.history.replaceState(window.history.state, '', url.toString());
      }
    }
    this.emit();
  }

  /** Marks values that can't form an available variant with the other current selections. */
  updateOptionAvailability() {
    const selected = this.selectedOptions;
    if (!selected.length) return;
    selected.forEach((_, i) => {
      const pos = i + 1;
      const isAvailable = (value) =>
        this.variants.some((v) => v.available && v.options[i] === value && v.options.every((o, j) => j === i || o === selected[j]));

      this.querySelectorAll(`input[data-ws-option][data-position="${pos}"]`).forEach((input) => {
        const label = /** @type {HTMLElement | null} */ (input.nextElementSibling);
        label?.classList.toggle('is-unavailable', !isAvailable(input.value));
      });
      this.querySelectorAll(`select[data-ws-option][data-position="${pos}"] option`).forEach((option) => {
        option.dataset.wsUnavailable = String(!isAvailable(option.value));
      });
    });
  }

  render() {
    const v = this.variant;
    const alloc = this.allocation;
    const price = alloc ? alloc.price : v?.price;
    const compare = alloc ? alloc.compare_at_price || v?.price : v?.compare_at_price;
    const onSale = v && compare && compare > price;

    const current = this.querySelector('[data-ws-price-current]');
    if (current && v) {
      current.textContent = this.money(price);
      current.classList.toggle('is-sale', Boolean(onSale));
    }
    const compareWrap = this.querySelector('[data-ws-price-compare-wrap]');
    const compareEl = this.querySelector('[data-ws-price-compare]');
    if (compareWrap && compareEl) {
      compareWrap.hidden = !onSale;
      if (onSale) compareEl.textContent = this.money(compare);
    }
    const save = this.querySelector('[data-ws-price-save]');
    if (save) {
      save.hidden = !onSale;
      if (onSale) {
        const pct = Math.round(((compare - price) / compare) * 100);
        save.textContent = (this.dataset.saveTemplate || '').replace('[percent]', String(pct));
      }
    }

    const unit = this.querySelector('[data-ws-unit-price]');
    if (unit) {
      const m = v?.unit_price_measurement;
      unit.hidden = !(v && v.unit_price && m);
      if (v && v.unit_price && m) {
        unit.textContent = `${this.money(v.unit_price)}/${m.reference_value !== 1 ? m.reference_value : ''}${m.reference_unit}`;
      }
    }

    /* Subscription prices for the selected variant */
    this.querySelectorAll('[data-ws-plan-price]').forEach((el) => {
      const planId = /** @type {HTMLElement} */ (el).dataset.wsPlanPrice;
      if (!v) return;
      if (!planId) {
        el.textContent = this.money(v.price);
      } else {
        const a = (v.selling_plan_allocations || []).find((x) => String(x.selling_plan_id) === planId);
        el.textContent = this.money(a ? a.price : v.price);
      }
    });

    /* Add to cart */
    if (this.atc) {
      const label = this.atc.querySelector('[data-ws-atc-label]');
      const available = Boolean(v && v.available);
      this.atc.disabled = !available;
      if (label) label.textContent = !v ? this.dataset.labelUnavailable : available ? this.dataset.labelAdd : this.dataset.labelSoldOut;
      const atcPrice = this.atc.querySelector('[data-ws-atc-price]');
      if (atcPrice) {
        atcPrice.hidden = !available;
        if (v) atcPrice.textContent = this.money(price);
      }
    }

    /* Low stock (honest – real inventory only) */
    const stock = this.querySelector('[data-ws-stock]');
    if (stock) {
      const qty = v ? this.inventory[String(v.id)] : undefined;
      stock.hidden = !qty;
      const text = stock.querySelector('[data-ws-stock-text]');
      if (qty && text) text.textContent = (stock.dataset.template || '').replace('[count]', String(qty));
    }
  }

  emit() {
    const v = this.variant;
    const alloc = this.allocation;
    const price = v ? (alloc ? alloc.price : v.price) : null;
    const available = Boolean(v && v.available);
    document.dispatchEvent(
      new CustomEvent('ws:variant:change', {
        detail: {
          sectionId: this.sectionId,
          variant: v,
          price,
          priceFormatted: price !== null ? this.money(price) : '',
          available,
          label: !v ? this.dataset.labelUnavailable : available ? this.dataset.labelAdd : this.dataset.labelSoldOut,
        },
      })
    );
  }

  /* ---------- add to cart (also used by the sticky bar) ---------- */
  onSubmit = (event) => {
    event.preventDefault();
    this.addToCart(this.atc);
  };

  /** @param {HTMLButtonElement | null} [button] the button to show loading state on */
  async addToCart(button = this.atc) {
    if (!this.variant || !this.variant.available) return { ok: false };
    const data = this.form ? new FormData(this.form) : new FormData();
    const item = {
      id: data.get('id') || this.variant.id,
      quantity: Number(data.get('quantity') || 1),
      selling_plan: data.get('selling_plan') || this.plan || undefined,
    };

    const buttons = [this.atc, button].filter(Boolean);
    buttons.forEach((b) => b.setAttribute('aria-busy', 'true'));

    const cart = await getCart();
    const result = await cart.add([item], {
      source: 'ws-main-product',
      target: this.form || this,
      openDrawer: this.dataset.openDrawer !== 'false',
    });

    buttons.forEach((b) => b.removeAttribute('aria-busy'));

    const msg = this.querySelector('[data-ws-form-msg]');
    if (msg) {
      msg.classList.toggle('is-error', !result.ok);
      msg.textContent = result.ok ? this.dataset.labelAdded || '' : result.message || this.dataset.labelError || '';
      window.setTimeout(() => (msg.textContent = ''), result.ok ? 2500 : 6000);
    }
    return result;
  }

  /* ---------- cutoff countdown ---------- */
  initCountdown() {
    const wrap = /** @type {HTMLElement | null} */ (this.querySelector('[data-ws-countdown]'));
    const out = wrap?.querySelector('[data-ws-countdown-text]');
    if (!wrap || !out) return;

    const cutoff = Number(wrap.dataset.cutoff) * 60;
    const days = (wrap.dataset.days || '1,2,3,4,5').split(',').map((d) => Number(d.trim()));
    const tz = wrap.dataset.tz || undefined;
    const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

    const tick = () => {
      let parts;
      try {
        parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      } catch {
        parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      }
      const get = (type) => parts.find((p) => p.type === type)?.value;
      const day = map[get('weekday')];
      const now = Number(get('hour')) * 60 + Number(get('minute'));
      const left = cutoff - now;

      if (!days.includes(day) || left <= 0) {
        out.hidden = true;
        return;
      }
      const h = Math.floor(left / 60);
      const m = left % 60;
      const time = h > 0 ? `${h} h ${m} min` : `${m} min`;
      const template = wrap.dataset.template || '[time]';
      out.textContent = '';
      const [before, after = ''] = template.split('[time]');
      const strong = document.createElement('strong');
      strong.textContent = time;
      out.append(before, strong, after);
      out.hidden = false;
    };

    tick();
    this.countdownTimer = window.setInterval(tick, 30000);
  }
}

/* ======================================================================= */
class WsGallery extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-ws-track]');
    if (!this.track) return;
    this.slides = [...this.track.children];
    this.thumbs = [...this.querySelectorAll('[data-ws-thumb]')];
    this.dots = [...this.querySelectorAll('.ws-gallery__dot')];
    this.prev = this.querySelector('[data-ws-prev]');
    this.next = this.querySelector('[data-ws-next]');
    this.dialog = /** @type {HTMLDialogElement | null} */ (this.querySelector('[data-ws-zoom-dialog]'));
    this.index = 0;

    this.thumbs.forEach((t) => t.addEventListener('click', () => this.goTo(Number(t.dataset.wsThumb))));
    this.prev?.addEventListener('click', () => this.goTo(this.index - 1));
    this.next?.addEventListener('click', () => this.goTo(this.index + 1));
    this.track.addEventListener('scroll', this.onScroll, { passive: true });
    this.track.addEventListener('keydown', this.onKeydown);

    this.querySelectorAll('[data-ws-zoom-open]').forEach((btn) =>
      btn.addEventListener('click', () => this.openZoom(Number(/** @type {HTMLElement} */ (btn).dataset.wsZoomOpen), btn))
    );
    this.querySelector('[data-ws-zoom-close]')?.addEventListener('click', () => this.dialog?.close());
    this.dialog?.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
    });

    /* Start on the selected variant's image without animation */
    const initial = this.dataset.initialMedia;
    if (initial) this.goToMedia(initial, false);
    this.updateUI();
  }

  goTo(i, smooth = true) {
    const count = this.slides.length;
    if (!count) return;
    const index = Math.max(0, Math.min(count - 1, i));
    const slide = this.slides[index];
    this.track.scrollTo({ left: slide.offsetLeft - this.track.offsetLeft, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
    this.index = index;
    this.updateUI();
  }

  goToMedia(mediaId, smooth = true) {
    const i = this.slides.findIndex((s) => s.dataset.mediaId === String(mediaId));
    if (i >= 0) this.goTo(i, smooth);
  }

  onScroll = () => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      const w = this.track.clientWidth || 1;
      const i = Math.round(Math.abs(this.track.scrollLeft) / w);
      if (i !== this.index) {
        this.index = i;
        this.updateUI();
      }
    });
  };

  onKeydown = (e) => {
    if (e.target !== this.track) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.goTo(this.index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.goTo(this.index - 1);
    }
  };

  updateUI() {
    this.thumbs.forEach((t, i) => {
      const active = i === this.index;
      t.setAttribute('aria-current', String(active));
      if (active) {
        const strip = t.closest('.ws-gallery__thumbs');
        const li = t.parentElement;
        if (strip && li) {
          const target = li.offsetLeft - strip.clientWidth / 2 + li.clientWidth / 2;
          strip.scrollTo({ left: target, behavior: reduceMotion() ? 'auto' : 'smooth' });
        }
      }
    });
    this.dots.forEach((d, i) => d.classList.toggle('is-active', i === this.index));
    if (this.prev) this.prev.disabled = this.index <= 0;
    if (this.next) this.next.disabled = this.index >= this.slides.length - 1;

    /* Pause media that scrolled out of view */
    this.slides.forEach((slide, i) => {
      if (i === this.index) return;
      slide.querySelectorAll('video').forEach((v) => v.pause());
      slide.querySelectorAll('iframe').forEach((f) => {
        try {
          f.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
          f.contentWindow?.postMessage('{"method":"pause"}', '*');
        } catch {}
      });
    });
  }

  openZoom(index, opener) {
    if (!this.dialog) return;
    this.dialog.querySelectorAll('img[data-src]').forEach((img) => {
      img.setAttribute('src', img.getAttribute('data-src'));
      img.removeAttribute('data-src');
    });
    this.dialog.showModal();
    const target = this.dialog.querySelector(`[data-ws-zoom-index="${index}"]`);
    requestAnimationFrame(() => target?.scrollIntoView({ block: 'start' }));
    this.dialog.addEventListener('close', () => opener?.focus(), { once: true });
  }
}

/* ======================================================================= */
class WsDeferredMedia extends HTMLElement {
  connectedCallback() {
    this.querySelector('[data-ws-poster]')?.addEventListener('click', () => this.load());
  }

  load() {
    if (this.loaded) return;
    this.loaded = true;
    const template = this.querySelector('template');
    if (!template) return;
    const content = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
    this.querySelector('[data-ws-poster]')?.remove();
    this.appendChild(content);

    if (this.dataset.type === 'model' && window.Shopify?.loadFeatures) {
      window.Shopify.loadFeatures([
        {
          name: 'model-viewer-ui',
          version: '1.0',
          onLoad: (errors) => {
            if (errors) return;
            const viewer = this.querySelector('model-viewer');
            if (viewer && window.Shopify.ModelViewerUI) {
              this.modelUI = new window.Shopify.ModelViewerUI(viewer);
              this.modelUI.play?.();
            }
          },
        },
      ]);
    }

    const focusable = this.querySelector('video, iframe, model-viewer');
    if (focusable instanceof HTMLElement) {
      if (focusable.tagName === 'MODEL-VIEWER' || focusable.tagName === 'VIDEO') focusable.setAttribute('tabindex', '0');
      focusable.focus();
    }
  }
}

if (!customElements.get('ws-product')) customElements.define('ws-product', WsProduct);
if (!customElements.get('ws-gallery')) customElements.define('ws-gallery', WsGallery);
if (!customElements.get('ws-deferred-media')) customElements.define('ws-deferred-media', WsDeferredMedia);
