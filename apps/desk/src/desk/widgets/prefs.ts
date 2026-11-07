/**
 * Per-person widget layout and choices, kept in this browser under
 * `elva:desk:widgets:<userId>`.
 */
import type { DeskSize } from '@elva/desk-sdk';
import { create } from 'zustand';
import { logger } from '@/lib/logger';
import type { IconSet, WeatherKind } from './weather/types';

const log = logger.child('widgets');

export type WidgetId = 'clock' | 'weather' | 'horoscope';
export type WidgetSize = 'small' | 'medium' | 'large';
export type ClockStyle = 'classic' | 'night' | 'flip' | 'lcd';
export type HoroscopeArt = 'portraits' | 'origami';

export const WIDGETS: { id: WidgetId; name: string }[] = [
  { id: 'clock', name: 'Clock' },
  { id: 'weather', name: 'Weather' },
  { id: 'horoscope', name: 'Daily horoscope' },
];

/** Widgets need room beside the windows: they hide on desks narrower than this. */
export const MIN_DESK_WIDTH = 1100;

/** The box each widget takes at each size it offers. */
export const WIDGET_BOX: Record<WidgetId, Partial<Record<WidgetSize, { w: number; h: number }>>> = {
  clock: { small: { w: 120, h: 120 }, medium: { w: 176, h: 176 }, large: { w: 236, h: 236 } },
  weather: { small: { w: 170, h: 170 }, medium: { w: 340, h: 186 }, large: { w: 340, h: 340 } },
  // The full horoscope card grows with its reading; 330 is its usual height.
  horoscope: { small: { w: 170, h: 170 }, medium: { w: 340, h: 330 } },
};

export const SIZE_LABEL: Record<WidgetSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

export interface Pos {
  x: number;
  y: number;
}

export interface WidgetPrefs {
  clockStyle?: ClockStyle;
  wxIcons?: IconSet;
  wxPreview?: WeatherKind;
  sign?: string;
  hsArt?: HoroscopeArt;
  pos?: Partial<Record<WidgetId, Pos>>;
  size?: Partial<Record<WidgetId, WidgetSize>>;
  hidden?: Partial<Record<WidgetId, boolean>>;
}

interface PrefsState {
  userId: string | null;
  prefs: WidgetPrefs;
  load(userId: string): void;
  update(patch: Partial<WidgetPrefs> | ((prefs: WidgetPrefs) => Partial<WidgetPrefs>)): void;
  setHidden(id: WidgetId, hidden: boolean): void;
  setAllHidden(hidden: boolean): void;
  /** Change size; a widget on the right half of the desk keeps its right edge. */
  setSize(id: WidgetId, size: WidgetSize, deskWidth: number): void;
  resetPosition(id: WidgetId): void;
  resetPositions(): void;
}

const key = (userId: string) => `elva:desk:widgets:${userId}`;

function read(userId: string): WidgetPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) || '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as WidgetPrefs) : {};
  } catch {
    return {};
  }
}

export function sizeOf(prefs: WidgetPrefs, id: WidgetId): WidgetSize {
  const s = prefs.size?.[id];
  return s && WIDGET_BOX[id][s] ? s : 'medium';
}

export function boxOf(prefs: WidgetPrefs, id: WidgetId): { w: number; h: number } {
  return WIDGET_BOX[id][sizeOf(prefs, id)] ?? { w: 0, h: 0 };
}

/**
 * Where each widget sits until the person moves it: a column down the right
 * of the desk (clock, weather, horoscope); the horoscope goes beside the
 * weather when the column would run into the dock. Widgets that are hidden
 * leave no gap.
 */
export function defaultPos(prefs: WidgetPrefs, id: WidgetId, desk: DeskSize, height: number): Pos {
  const RIGHT = 28;
  const TOP = 24;
  const GAP = 22;
  const shown = (w: WidgetId) => !prefs.hidden?.[w];
  const clock = boxOf(prefs, 'clock');
  const weather = boxOf(prefs, 'weather');
  const box = boxOf(prefs, id);
  const weatherTop = shown('clock') ? TOP + clock.h + GAP : TOP;
  if (id === 'clock') return { x: desk.w - box.w - RIGHT, y: TOP };
  if (id === 'weather') return { x: desk.w - box.w - RIGHT, y: weatherTop };
  const below = shown('weather') ? weatherTop + weather.h + GAP : weatherTop;
  const h = height || box.h;
  if (desk.h - h - 110 >= below) return { x: desk.w - box.w - RIGHT, y: below };
  const besideX = shown('weather') ? desk.w - weather.w - RIGHT - GAP - box.w : desk.w - box.w - RIGHT;
  return { x: besideX, y: TOP };
}

export const useWidgetPrefs = create<PrefsState>()((set, get) => ({
  userId: null,
  prefs: {},
  load(userId) {
    if (get().userId === userId) return;
    set({ userId, prefs: read(userId) });
  },
  update(patch) {
    const { userId, prefs } = get();
    const next = { ...prefs, ...(typeof patch === 'function' ? patch(prefs) : patch) };
    set({ prefs: next });
    if (!userId) return;
    try {
      localStorage.setItem(key(userId), JSON.stringify(next));
    } catch (e) {
      log.warn('could not save widget preferences', e);
    }
  },
  setHidden(id, hidden) {
    get().update((p) => ({ hidden: { ...p.hidden, [id]: hidden } }));
  },
  setAllHidden(hidden) {
    get().update({ hidden: Object.fromEntries(WIDGETS.map((w) => [w.id, hidden])) });
  },
  setSize(id, size, deskWidth) {
    get().update((p) => {
      const pos = p.pos?.[id];
      const before = boxOf(p, id).w;
      const after = WIDGET_BOX[id][size]?.w ?? before;
      const keepRight = pos && pos.x + before / 2 > deskWidth / 2;
      return {
        size: { ...p.size, [id]: size },
        pos: keepRight ? { ...p.pos, [id]: { x: pos.x + before - after, y: pos.y } } : p.pos,
      };
    });
  },
  resetPosition(id) {
    get().update((p) => {
      const pos = { ...p.pos };
      delete pos[id];
      return { pos };
    });
  },
  resetPositions() {
    get().update({ pos: {} });
  },
}));
