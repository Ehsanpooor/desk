/**
 * Widget motion. Showing a widget lifts it out of a blur with a small spring;
 * hiding sinks it back into the blur. Both are Web Animations on the widget's
 * root, so nothing is left behind on the element.
 */

/** The widget's own CSS filter (the clock's drop shadow), kept under the blur. */
function baseFilter(el: HTMLElement): string {
  const f = getComputedStyle(el).filter;
  return f && f !== 'none' ? ` ${f}` : '';
}

export function widgetEnter(el: HTMLElement, index: number, reduced: boolean, extraDelay = 0): Animation {
  if (reduced) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'backwards' });
  const base = baseFilter(el);
  return el.animate(
    [
      { opacity: 0, transform: 'perspective(900px) translateY(28px) scale(0.82) rotateX(16deg)', filter: `blur(14px)${base}` },
      { opacity: 1, transform: 'perspective(900px) translateY(-4px) scale(1.025) rotateX(0deg)', filter: `blur(0px)${base}`, offset: 0.62 },
      { opacity: 1, transform: 'perspective(900px) translateY(0) scale(1) rotateX(0deg)', filter: `blur(0px)${base}` },
    ],
    { duration: 780, delay: extraDelay + index * 90, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
  );
}

export function widgetExit(el: HTMLElement, index: number, reduced: boolean): Animation {
  if (reduced) return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
  const base = baseFilter(el);
  return el.animate(
    [
      { opacity: 1, transform: 'perspective(900px) translateY(0) scale(1) rotateX(0deg)', filter: `blur(0px)${base}` },
      { opacity: 1, transform: 'perspective(900px) translateY(-6px) scale(1.03) rotateX(0deg)', filter: `blur(0px)${base}`, offset: 0.22 },
      { opacity: 0, transform: 'perspective(900px) translateY(22px) scale(0.84) rotateX(-12deg)', filter: `blur(12px)${base}` },
    ],
    { duration: 420, delay: index * 60, easing: 'cubic-bezier(0.55, 0, 0.75, 0.3)', fill: 'forwards' },
  );
}

/** After a size change: the new size settles in from a soft blur. */
export function widgetResize(el: HTMLElement, reduced: boolean): void {
  if (reduced) return;
  const base = baseFilter(el);
  el.animate(
    [
      { opacity: 0.35, transform: 'scale(0.9)', filter: `blur(6px)${base}` },
      { opacity: 1, transform: 'scale(1.02)', filter: `blur(0px)${base}`, offset: 0.6 },
      { opacity: 1, transform: 'scale(1)', filter: `blur(0px)${base}` },
    ],
    { duration: 520, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
}

/** Glide from the old position to the new one (reset position). */
export function widgetMove(el: HTMLElement, dx: number, dy: number, reduced: boolean): void {
  if (reduced || (!dx && !dy)) return;
  el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
    duration: 560,
    easing: 'cubic-bezier(0.2, 1, 0.3, 1)',
  });
}
