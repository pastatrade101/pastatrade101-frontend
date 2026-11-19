/**
 * Helpers for popups (sheets and dialogs).
 *
 * lockPageScroll — stops the page behind a popup from scrolling. The lock goes on <html>, not
 * <body>: app.css sets `overflow-x: clip` on <html>, which stops <body>'s overflow from reaching
 * the window, so `body { overflow: hidden }` alone leaves the page scrollable. Locks nest (a
 * statement opened over a sheet), and the scroll position never moves, so a sticky header stays put.
 *
 * fitVisualViewport — keeps a fixed overlay the size of the part of the screen you can see.
 * When a phone keyboard opens, the browser shrinks the visible area instead of the page, so a
 * bottom sheet pinned to the full screen ends up behind the keyboard and the browser shifts
 * everything around to reach the input. Following `window.visualViewport` keeps the sheet sitting
 * right above the keyboard.
 */

let locks = 0;
let saved: { overflow: string; overscroll: string; padding: string } | null = null;

export const lockPageScroll = (): (() => void) => {
  const html = document.documentElement;
  if (locks++ === 0) {
    const scrollbar = window.innerWidth - html.clientWidth;
    saved = {
      overflow: html.style.overflow,
      overscroll: html.style.overscrollBehavior,
      padding: document.body.style.paddingRight
    };
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    // Keep the page from shifting sideways when a desktop scrollbar disappears.
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0 && saved) {
      html.style.overflow = saved.overflow;
      html.style.overscrollBehavior = saved.overscroll;
      document.body.style.paddingRight = saved.padding;
      saved = null;
    }
  };
};

/** Svelte action: locks the page for as long as the element is on screen. */
export const scrollLock = (_node: HTMLElement) => {
  const release = lockPageScroll();
  return { destroy: release };
};

/** Svelte action for a `position: fixed` overlay: matches its top and height to the visible screen. */
export const fitVisualViewport = (node: HTMLElement) => {
  const vv = window.visualViewport;
  if (!vv) return {};
  let frame = 0;
  const apply = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      node.style.height = `${vv.height}px`;
      node.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
    });
  };
  apply();
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  return {
    destroy() {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    }
  };
};
