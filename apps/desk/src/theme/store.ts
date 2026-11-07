/**
 * The desk owns the theme. It applies it once on <html>; every app re-themes
 * through the shared CSS variables. The preference is mirrored to the
 * `.elva.ai` cookie so standalone apps and the account app follow it.
 */
import { create } from 'zustand';
import type { DeskTheme } from '@elva/desk-sdk';
import { createReadable } from '@elva/desk-sdk/host';
import { logger } from '@/lib/logger';

const log = logger.child('theme');

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * The themes. Each is a palette family with a light and a dark variant; its
 * tokens are the `[data-theme]` blocks in globals.css. The id is what apps
 * receive in `ctx.theme` and what the `elva_theme` cookie carries.
 */
export const THEMES = [
  { id: 'elva', name: 'ELVA' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'iris', name: 'Iris' },
  { id: 'rose', name: 'Rose' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'forest', name: 'Forest' },
  { id: 'sandstone', name: 'Sandstone' },
  { id: 'graphite', name: 'Graphite' },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];
const DEFAULT_THEME: ThemeId = 'elva';

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

/** Holds only a choice the person made. The default is never written. */
const STORAGE_KEY = 'elva:desk:appearance';
const COOKIE = 'elva_theme';
const CHANNEL = 'elva-theme';
/** Light, like the prototype. Dark and system are a choice in the menu bar. */
const DEFAULT_MODE: ThemeMode = 'light';

function isMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

interface ThemeState {
  theme: string;
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  reducedMotion: boolean;
  fontScale: number;
  setMode(mode: ThemeMode): void;
  setTheme(theme: string): void;
  setFontScale(scale: number): void;
  /** Applies the saved preference and starts listening. Returns a disposer. */
  init(): () => void;
}

/** Where the last press happened: a theme change reveals itself from there. */
let lastPress: { x: number; y: number; at: number } | null = null;

/**
 * Run a theme change as a circle growing from the last press (or the middle
 * of the screen after a keyboard choice). Falls back to an instant change
 * where View Transitions are missing or motion is reduced.
 */
function reveal(change: () => void, reduced: boolean): void {
  if (reduced || typeof document.startViewTransition !== 'function') return change();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const p = lastPress && performance.now() - lastPress.at < 2500 ? lastPress : { x: w / 2, y: h / 2 };
  const r = Math.hypot(Math.max(p.x, w - p.x), Math.max(p.y, h - p.y));
  const root = document.documentElement;
  root.classList.add('desk-theme-reveal');
  const vt = document.startViewTransition(change);
  vt.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${p.x}px ${p.y}px)`, `circle(${r}px at ${p.x}px ${p.y}px)`] },
        { duration: 720, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
  vt.finished.finally(() => root.classList.remove('desk-theme-reveal')).catch(() => {});
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');
const systemReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)');

/** The person's choice here, else the one another ELVA app wrote to the platform cookie, else the default. */
function readSaved(): { theme: string; mode: ThemeMode; fontScale: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<{
      theme: string;
      mode: ThemeMode;
      fontScale: number;
    }> | null;
    if (raw && isMode(raw.mode)) {
      return {
        theme: isThemeId(raw.theme) ? raw.theme : DEFAULT_THEME,
        mode: raw.mode,
        fontScale: typeof raw.fontScale === 'number' ? raw.fontScale : 1,
      };
    }
  } catch {
    /* fall through */
  }
  const m = document.cookie.match(/(?:^|; )elva_theme=([^.;]+)\.(light|dark|system)/);
  if (m?.[1] && isMode(m[2])) return { theme: isThemeId(m[1]) ? m[1] : DEFAULT_THEME, mode: m[2], fontScale: 1 };
  return { theme: DEFAULT_THEME, mode: DEFAULT_MODE, fontScale: 1 };
}

/** The readable handed to apps. Updated whenever the store changes. */
export const themeReadable = createReadable<DeskTheme>({
  id: 'elva',
  mode: 'light',
  reducedMotion: false,
  fontScale: 1,
});

export const useTheme = create<ThemeState>()((set, get) => {
  /** Applies the current state to <html>. `persist` only for an explicit choice. */
  const apply = (persist = false) => {
    const { theme, mode, fontScale } = get();
    const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark().matches ? 'dark' : 'light') : mode;
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-mode', resolved);
    root.style.colorScheme = resolved;
    root.style.setProperty('--font-scale', String(fontScale));
    set({ resolved });
    themeReadable.set({ id: theme, mode: resolved, reducedMotion: get().reducedMotion, fontScale });
    log.debug('applied', { theme, mode, resolved, fontScale, persist });
    if (!persist) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, mode, fontScale }));
    } catch {
      /* ignore */
    }
    const host = window.location.hostname;
    const domain = host.endsWith('.elva.ai') ? '; Domain=.elva.ai' : '';
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}=${theme}.${mode}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`;
    channel?.postMessage({ theme, mode });
  };

  let channel: BroadcastChannel | null = null;

  const saved = readSaved();
  return {
    theme: saved.theme,
    mode: saved.mode,
    resolved: 'light',
    reducedMotion: false,
    fontScale: saved.fontScale,

    setMode(mode) {
      if (mode === get().mode) return;
      reveal(() => {
        set({ mode });
        apply(true);
      }, get().reducedMotion);
    },
    setTheme(theme) {
      if (theme === get().theme || !isThemeId(theme)) return;
      reveal(() => {
        set({ theme });
        apply(true);
      }, get().reducedMotion);
    },
    setFontScale(scale) {
      set({ fontScale: Math.min(1.4, Math.max(0.85, scale)) });
      apply(true);
    },

    init() {
      if (typeof BroadcastChannel !== 'undefined' && !channel) channel = new BroadcastChannel(CHANNEL);
      const dark = systemDark();
      const reduced = systemReduced();
      set({ reducedMotion: reduced.matches });
      apply();

      const onDark = () => {
        if (get().mode === 'system') apply();
      };
      const onReduced = () => {
        set({ reducedMotion: reduced.matches });
        apply();
      };
      const onPress = (e: PointerEvent) => {
        lastPress = { x: e.clientX, y: e.clientY, at: performance.now() };
      };
      window.addEventListener('pointerdown', onPress, true);
      const onMessage = (ev: MessageEvent<{ theme: string; mode: ThemeMode }>) => {
        const { theme, mode } = ev.data;
        if (!isThemeId(theme) || !isMode(mode)) return;
        if (theme !== get().theme || mode !== get().mode) {
          set({ theme, mode });
          apply();
        }
      };
      dark.addEventListener('change', onDark);
      reduced.addEventListener('change', onReduced);
      channel?.addEventListener('message', onMessage);
      return () => {
        dark.removeEventListener('change', onDark);
        reduced.removeEventListener('change', onReduced);
        channel?.removeEventListener('message', onMessage);
        window.removeEventListener('pointerdown', onPress, true);
      };
    },
  };
});
