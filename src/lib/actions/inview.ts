import type { Action } from 'svelte/action';

interface InviewParams {
  delay?: number; // stagger delay in ms
  threshold?: number; // visibility ratio to trigger
  y?: number; // initial offset in px
  duration?: number; // transition duration in ms
}

// Subtle fade-up reveal when the element scrolls into view. The hidden state is
// applied via JS (not markup) so SSR / no-JS users always see content, and it's
// disabled under prefers-reduced-motion. Cleans up inline styles after the
// reveal so the element's own CSS transitions (e.g. card hover) keep working.
export const inview: Action<HTMLElement, InviewParams | undefined> = (node, params) => {
  const { delay = 0, threshold = 0.1, y = 24, duration = 700 } = params ?? {};

  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  node.style.opacity = '0';
  node.style.transform = `translateY(${y}px)`;
  node.style.transition = `opacity ${duration}ms ease, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  node.style.transitionDelay = `${delay}ms`;
  node.style.willChange = 'opacity, transform';

  // Commit the hidden state to a paint BEFORE observing. Without this, sections
  // that mount already in-view (e.g. the async-loaded pricing cards) reveal in
  // the same frame and the staggered transition never runs — they pop in at once.
  void node.offsetWidth;

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        node.style.opacity = '1';
        node.style.transform = 'none';
        io.disconnect();
        // Hand control back to CSS once the reveal finishes.
        window.setTimeout(() => {
          node.style.transition = '';
          node.style.transitionDelay = '';
          node.style.transform = '';
          node.style.opacity = '';
          node.style.willChange = '';
        }, delay + duration + 80);
      }
    },
    // Negative bottom margin: only reveal once the element is ~12% into the
    // viewport, so the animation actually plays in front of the user.
    { threshold, rootMargin: '0px 0px -12% 0px' }
  );
  io.observe(node);

  return {
    destroy() {
      io.disconnect();
    }
  };
};

// Fires a callback once, when the node scrolls ~12% into the viewport. Used to
// gate Svelte transitions (which reliably play on insertion) for content that
// mounts asynchronously and may already be in view (e.g. fetched pricing cards).
export const whenInView: Action<HTMLElement, (() => void) | undefined> = (node, cb) => {
  if (typeof window === 'undefined') return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          cb?.();
          io.disconnect();
        }
      }
    },
    { threshold: 0.1, rootMargin: '0px 0px -12% 0px' }
  );
  io.observe(node);
  return {
    destroy() {
      io.disconnect();
    }
  };
};
