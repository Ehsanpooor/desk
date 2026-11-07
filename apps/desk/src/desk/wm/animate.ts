/** Window motion. Every animation is Web Animations API, so no transform stays on the element. */
import type { DeskSize } from '@elva/desk-sdk';
import type { WinRect } from './geometry';

const OPEN_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const CLOSE_EASE = 'cubic-bezier(0.77, 0, 0.175, 1)';

export function dockItemRect(appId: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(`[data-dock-item="${appId}"]`);
  return el ? el.getBoundingClientRect() : null;
}

/** Grow out of the dock icon (or shrink back into it when `reverse`). */
export function animateFromDock(el: HTMLElement, appId: string, reverse: boolean, reduced: boolean): Animation {
  const r = el.getBoundingClientRect();
  const d = dockItemRect(appId);
  const prev = el.style.transformOrigin;
  el.style.transformOrigin = '0 0';
  const from: Keyframe = d
    ? {
        transform: `translate(${d.left - r.left}px, ${d.top - r.top}px) scale(${d.width / r.width}, ${d.height / r.height})`,
        opacity: 0,
      }
    : { transform: 'scale(0.9)', opacity: 0 };
  const to: Keyframe = { transform: 'none', opacity: 1 };
  const frames = reduced ? [{ opacity: reverse ? 1 : 0 }, { opacity: reverse ? 0 : 1 }] : reverse ? [to, from] : [from, to];
  const a = el.animate(frames, {
    duration: reduced ? 140 : reverse ? 320 : 380,
    easing: reverse ? CLOSE_EASE : OPEN_EASE,
    fill: reverse ? 'forwards' : 'none',
  });
  a.addEventListener('finish', () => {
    el.style.transformOrigin = prev;
  });
  return a;
}

export function animateClose(el: HTMLElement, reduced: boolean): Animation {
  const prev = el.style.transformOrigin;
  el.style.transformOrigin = '50% 50%';
  const a = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], {
    duration: reduced ? 100 : 160,
    easing: OPEN_EASE,
    fill: 'forwards',
  });
  a.addEventListener('finish', () => {
    el.style.transformOrigin = prev;
  });
  return a;
}

/** A soft spring: quick off the mark, settles without a bounce. */
const GLIDE_EASE = 'cubic-bezier(0.2, 1, 0.3, 1)';

/**
 * FLIP from one desk rect to another: the element is already at `to`; it is
 * drawn at `from` and glides home. `delay` staggers a group (arrange).
 */
export function glideRect(el: HTMLElement, from: WinRect, to: WinRect, delay: number, reduced: boolean): void {
  if (reduced || to.w === 0 || to.h === 0) return;
  if (from.x === to.x && from.y === to.y && from.w === to.w && from.h === to.h) return;
  const prev = el.style.transformOrigin;
  el.style.transformOrigin = '0 0';
  const a = el.animate(
    [
      { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w}, ${from.h / to.h})` },
      { transform: 'none' },
    ],
    { duration: 420, delay, easing: GLIDE_EASE, fill: 'backwards' },
  );
  const reset = () => {
    el.style.transformOrigin = prev;
  };
  a.addEventListener('finish', reset);
  a.addEventListener('cancel', reset);
}

/**
 * "Show desktop": sweep a window off the nearest edge of the desk (or back in
 * when `back`). Windows leave in a quick stagger and return the same way.
 */
export function animateAway(
  el: HTMLElement,
  rect: WinRect,
  desk: DeskSize,
  index: number,
  back: boolean,
  reduced: boolean,
): Animation {
  if (reduced) {
    const frames = [{ opacity: 1 }, { opacity: 0 }];
    return el.animate(back ? frames.reverse() : frames, { duration: 160, fill: back ? 'none' : 'forwards' });
  }
  const vx = rect.x + rect.w / 2 - desk.w / 2;
  const vy = rect.y + rect.h / 2 - desk.h / 2;
  const len = Math.hypot(vx, vy);
  const dx = len < 1 ? 0 : vx / len;
  const dy = len < 1 ? -1 : vy / len;
  // How far along (dx, dy) until the box clears the desk.
  const need = (pos: number, size: number, d: number, span: number) =>
    d > 0.001 ? (span - pos) / d : d < -0.001 ? (pos + size) / -d : Infinity;
  const travel = Math.min(need(rect.x, rect.w, dx, desk.w), need(rect.y, rect.h, dy, desk.h)) + 48;
  const away = `translate(${Math.round(dx * travel)}px, ${Math.round(dy * travel)}px) scale(0.92)`;
  const frames: Keyframe[] = [
    { transform: 'none', opacity: 1 },
    { transform: away, opacity: 0 },
  ];
  return el.animate(back ? frames.reverse() : frames, {
    duration: back ? 620 : 460,
    delay: index * 36,
    easing: back ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.64, 0, 0.78, 0)',
    fill: back ? 'backwards' : 'forwards',
  });
}
