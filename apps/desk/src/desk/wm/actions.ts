/**
 * Window actions that need the window's element as well as the store: closing
 * plays the close animation first. Used by the title bar, menus and shortcuts.
 */
import { useTheme } from '@/theme/store';
import { animateClose } from './animate';
import { useWm } from './store';

function frameOf(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-window="${CSS.escape(id)}"]`);
}

/** Close with the fade-and-shrink; a window with unsaved changes asks first. */
export function closeWindow(id: string): void {
  const wm = useWm.getState();
  const w = wm.windows[id];
  if (!w) return;
  if (w.dirty) return wm.requestClose(id);
  const el = frameOf(id);
  if (!el || w.minimized || wm.desktopShown) return wm.close(id);
  const a = animateClose(el, useTheme.getState().reducedMotion);
  a.addEventListener('finish', () => useWm.getState().close(id));
}

/** Close several windows. Clean ones close; the first with unsaved changes asks. */
export function closeWindows(ids: string[]): void {
  const wm = useWm.getState();
  let asked = false;
  for (const id of ids) {
    const w = wm.windows[id];
    if (!w) continue;
    if (w.dirty) {
      if (!asked) wm.requestClose(id);
      asked = true;
    } else closeWindow(id);
  }
}

export function closeOtherWindows(id: string): void {
  closeWindows(Object.keys(useWm.getState().windows).filter((x) => x !== id));
}

export function closeAllWindows(): void {
  closeWindows(Object.keys(useWm.getState().windows));
}
