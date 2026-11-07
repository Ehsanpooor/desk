/** Shortcut labels in the reader's platform convention: ⌥← on a Mac, Alt+← elsewhere. */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function alt(key: string): string {
  return isMac ? `⌥${key}` : `Alt+${key}`;
}

export function ctrl(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

/** True when the keystroke is going into a text field (where ⌥ keys type characters on a Mac). */
export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit';
}
