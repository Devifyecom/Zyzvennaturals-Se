/**
 * <ws-testimonials> — swipeable row of testimonial cards with pagination dots.
 * Native scroll-snap (touch swipe), mouse drag on desktop, arrow keys on the focused track,
 * dots that follow the scroll position and jump to a card, editor block-select support.
 */
class WsTestimonials extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-ws-track]');
    this.dotsWrap = this.querySelector('[data-ws-dots]');
    if (!this.track) return;
    this.cards = [...this.track.children];
    this.dots = this.dotsWrap ? [...this.dotsWrap.querySelectorAll('button')] : [];
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.dots.forEach((dot, i) => dot.addEventListener('click', () => this.goTo(i)));
    this.track.addEventListener('scroll', this.onScroll, { passive: true });
    this.track.addEventListener('keydown', this.onKeydown);
    this.track.addEventListener('pointerdown', this.onPointerDown);
    this.track.addEventListener('click', this.onClickCapture, true);
    this.addEventListener('shopify:block:select', (e) => {
      const i = this.cards.indexOf(/** @type {HTMLElement} */ (e.target).closest?.('[data-ws-card]'));
      if (i >= 0) this.goTo(i, true);
    });

    this.resizeObserver = new ResizeObserver(() => this.update());
    this.resizeObserver.observe(this.track);
    this.update();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  get maxScroll() {
    return Math.max(0, this.track.scrollWidth - this.track.clientWidth);
  }

  /** Left offset of card i relative to the track's scroll origin, clamped to what can scroll */
  offsetOf(i) {
    const card = this.cards[i];
    if (!card) return 0;
    return Math.min(this.maxScroll, card.offsetLeft - this.cards[0].offsetLeft);
  }

  goTo(i, instant = false) {
    this.track.scrollTo({ left: this.offsetOf(i), behavior: instant || this.reduceMotion ? 'auto' : 'smooth' });
  }

  get activeIndex() {
    const left = this.track.scrollLeft;
    if (left >= this.maxScroll - 2) return this.cards.length - 1;
    let best = 0;
    let bestDist = Infinity;
    this.cards.forEach((_, i) => {
      const d = Math.abs(this.offsetOf(i) - left);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  onScroll = () => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.update();
    });
  };

  update() {
    const scrollable = this.maxScroll > 2;
    this.toggleAttribute('data-scrollable', scrollable);
    if (this.dotsWrap) this.dotsWrap.hidden = !scrollable;
    const active = this.activeIndex;
    this.dots.forEach((dot, i) => {
      dot.setAttribute('aria-current', String(i === active));
    });
  }

  onKeydown = (event) => {
    if (event.target !== this.track) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = this.activeIndex + (event.key === 'ArrowRight' ? 1 : -1);
    this.goTo(Math.max(0, Math.min(this.cards.length - 1, next)));
  };

  /* Mouse drag (touch and pen use native scrolling) */
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
    if (moved) this.goTo(this.activeIndex);
  };

  onClickCapture = (event) => {
    if (this.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      this.suppressClick = false;
    }
  };
}

if (!customElements.get('ws-testimonials')) customElements.define('ws-testimonials', WsTestimonials);
