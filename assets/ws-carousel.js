/**
 * <ws-carousel> — lightweight, dependency-free carousel used by ws- sections.
 * Native horizontal scrolling with scroll-snap (touch swipe for free), mouse drag on desktop,
 * prev/next buttons, keyboard arrow keys on the focused track, editor block-select support.
 *
 * Markup:
 *   <ws-carousel>
 *     <button data-ws-prev></button><button data-ws-next></button>
 *     <ul class="ws-scroller" data-ws-track tabindex="0">…<li>…</li></ul>
 *   </ws-carousel>
 */
class WsCarousel extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-ws-track]');
    if (!this.track) return;
    this.prevBtn = this.querySelector('[data-ws-prev]');
    this.nextBtn = this.querySelector('[data-ws-next]');
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.prevBtn?.addEventListener('click', () => this.go(-1));
    this.nextBtn?.addEventListener('click', () => this.go(1));
    this.track.addEventListener('scroll', this.onScroll, { passive: true });
    this.track.addEventListener('keydown', this.onKeydown);
    this.track.addEventListener('pointerdown', this.onPointerDown);
    this.track.addEventListener('click', this.onClickCapture, true);
    this.addEventListener('shopify:block:select', this.onBlockSelect);

    this.resizeObserver = new ResizeObserver(() => this.updateButtons());
    this.resizeObserver.observe(this.track);
    this.updateButtons();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    this.track?.removeEventListener('scroll', this.onScroll);
  }

  get dir() {
    return getComputedStyle(this.track).direction === 'rtl' ? -1 : 1;
  }

  get step() {
    const item = this.track.firstElementChild;
    if (!item) return this.track.clientWidth;
    const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
    const itemWidth = item.getBoundingClientRect().width + gap;
    const perView = Math.max(1, Math.floor((this.track.clientWidth + gap) / itemWidth));
    return itemWidth * perView;
  }

  go(direction) {
    this.track.scrollBy({ left: direction * this.step * this.dir, behavior: this.reduceMotion ? 'auto' : 'smooth' });
  }

  onScroll = () => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.updateButtons();
    });
  };

  updateButtons() {
    if (!this.track) return;
    const max = this.track.scrollWidth - this.track.clientWidth;
    const pos = Math.abs(this.track.scrollLeft);
    const scrollable = max > 2;
    this.toggleAttribute('data-scrollable', scrollable);
    if (this.prevBtn) this.prevBtn.disabled = !scrollable || pos <= 2;
    if (this.nextBtn) this.nextBtn.disabled = !scrollable || pos >= max - 2;
  }

  onKeydown = (event) => {
    if (event.target !== this.track) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.go(this.dir);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.go(-this.dir);
    }
  };

  /* Mouse drag (touch/pen use native scrolling) */
  onPointerDown = (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    this.drag = { x: event.clientX, left: this.track.scrollLeft, moved: false };
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp, { once: true });
  };

  onPointerMove = (event) => {
    if (!this.drag) return;
    const dx = event.clientX - this.drag.x;
    if (!this.drag.moved && Math.abs(dx) > 5) {
      this.drag.moved = true;
      this.track.classList.add('is-dragging');
    }
    if (this.drag.moved) this.track.scrollLeft = this.drag.left - dx;
  };

  onPointerUp = () => {
    window.removeEventListener('pointermove', this.onPointerMove);
    const moved = this.drag?.moved;
    this.track.classList.remove('is-dragging');
    this.suppressClick = moved;
    this.drag = null;
    if (moved) {
      // Let scroll-snap settle on the nearest item
      const step = this.track.firstElementChild?.getBoundingClientRect().width || 1;
      const left = Math.round(this.track.scrollLeft / step) * step;
      this.track.scrollTo({ left, behavior: this.reduceMotion ? 'auto' : 'smooth' });
    }
  };

  onClickCapture = (event) => {
    if (this.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      this.suppressClick = false;
    }
  };

  onBlockSelect = (event) => {
    const item = /** @type {HTMLElement} */ (event.target).closest('[data-ws-track] > *');
    if (!item) return;
    this.track.scrollTo({ left: item.offsetLeft - this.track.offsetLeft, behavior: 'auto' });
  };
}

if (!customElements.get('ws-carousel')) customElements.define('ws-carousel', WsCarousel);
