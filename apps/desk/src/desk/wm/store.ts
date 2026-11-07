/**
 * The window manager. Pure state: records, geometry, z-order, tiers.
 * Mounting the app into a window happens in DeskWindow.tsx, driven by
 * `mounted` and `status` here. Motion is DeskWindow's job too: an action that
 * should animate a window's move bumps its `anim` counter.
 */
import { create } from 'zustand';
import type { DeskIntent, DeskSize } from '@elva/desk-sdk';
import { config } from '@/config';
import { clamp, uid } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { appById, canOpen, type DeskAppDef } from '@/registry/apps';
import { SNAP_ZONES, snapRect, workArea, DESK_GAP, type SnapZone, type WinRect } from './geometry';

export type { SnapZone, WinRect } from './geometry';

const log = logger.child('wm');

export type WinStatus = 'loading' | 'ready' | 'failed' | 'locked' | 'dormant';
export type ArrangeMode = 'cascade' | 'grid' | 'columns';

export interface WinRecord {
  id: string;
  appId: string;
  title: string;
  badge: number;
  dirty: boolean;
  rect: WinRect;
  /** The size to go back to after full screen or a snap. */
  restoreRect: WinRect | null;
  z: number;
  minimized: boolean;
  maximized: boolean;
  /** Snapped to a half or a quarter of the desk. */
  snap: SnapZone | null;
  /** Stays above ordinary windows (still under notes pinned on top). */
  onTop: boolean;
  /** True while the app module should be mounted in the content element. */
  mounted: boolean;
  status: WinStatus;
  error: string | null;
  /** The app's serializable view state. */
  state: unknown;
  intent: DeskIntent | null;
  lastActiveAt: number;
  minimizedAt: number | null;
  /** Bumped to force a remount after a failure. */
  generation: number;
  /** Bumped when the next rect change should glide instead of jump. */
  anim: number;
  /** Stagger for that glide, ms. */
  animDelay: number;
}

interface SavedWindow {
  appId: string;
  rect: WinRect;
  state: unknown;
  minimized: boolean;
  maximized: boolean;
  snap?: SnapZone | null;
  onTop?: boolean;
}

interface WmState {
  windows: Record<string, WinRecord>;
  activeId: string | null;
  zTop: number;
  cascade: number;
  deskSize: DeskSize;
  permissions: string[];
  /** A window with unsaved changes the user tried to close. */
  pendingCloseId: string | null;
  /** "Show desktop": every open window is swept off screen until toggled back. */
  desktopShown: boolean;
  /** "Show all windows": every open window laid out side by side. */
  overview: boolean;

  setDeskSize(size: DeskSize): void;
  setPermissions(permissions: string[]): void;
  open(appId: string, intent?: DeskIntent): string | null;
  requestClose(id: string): void;
  close(id: string): void;
  cancelClose(): void;
  minimize(id: string): void;
  restore(id: string): void;
  toggleMaximize(id: string): void;
  /** Back from full screen or a snap to the size it had before. */
  restoreSize(id: string): void;
  snapTo(id: string, zone: SnapZone): void;
  center(id: string): void;
  /** The app's default size, centred. */
  resetSize(id: string): void;
  toggleOnTop(id: string): void;
  focus(id: string): void;
  blurAll(): void;
  setRect(id: string, rect: Partial<WinRect>): void;
  setTitle(id: string, title: string): void;
  setBadge(id: string, badge: number): void;
  setDirty(id: string, dirty: boolean): void;
  setState(id: string, state: unknown): void;
  setStatus(id: string, status: WinStatus, error?: string | null): void;
  retry(id: string): void;
  cycle(direction: 1 | -1): void;
  minimizeOthers(id: string): void;
  minimizeAll(): void;
  restoreAll(): void;
  arrange(mode: ArrangeMode): void;
  toggleDesktop(force?: boolean): void;
  setOverview(on: boolean): void;
  closeAll(): void;
  /** Tier maintenance: unmount stale minimized windows. */
  tick(): void;
  hydrate(userId: string): void;
  persist(userId: string): void;
}

const DEFAULT_SIZE: DeskSize = { w: 980, h: 640 };
/** Windows stack from here. Widgets are at 0 and unpinned notes at 5. */
const Z_BASE = 11;
/** Renumber well before "keep on top" windows begin. */
const Z_COMPACT_AT = 2000;
/** Added to a "keep on top" window's z. Pinned notes (7000) and the drag shield (7500) stay above. */
export const ON_TOP_BOOST = 2500;

export function effectiveZ(w: Pick<WinRecord, 'z' | 'onTop'>): number {
  return w.z + (w.onTop ? ON_TOP_BOOST : 0);
}

function placeNew(def: DeskAppDef, desk: DeskSize, cascade: number): WinRect {
  const w = clamp(def.defaultSize?.w ?? DEFAULT_SIZE.w, config.minWindow.w, Math.max(config.minWindow.w, desk.w - 40));
  const h = clamp(def.defaultSize?.h ?? DEFAULT_SIZE.h, config.minWindow.h, Math.max(config.minWindow.h, desk.h - 110));
  const big = Boolean(def.defaultSize);
  const x = big ? Math.max(20, (desk.w - w) / 2) : Math.max(20, (desk.w - w) / 2 - 120 + cascade * 34);
  const y = big ? 14 : Math.max(16, 34 + cascade * 30);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function clampRect(rect: WinRect, desk: DeskSize): WinRect {
  const w = clamp(rect.w, config.minWindow.w, Math.max(config.minWindow.w, desk.w));
  const h = clamp(rect.h, config.minWindow.h, Math.max(config.minWindow.h, desk.h));
  const x = clamp(rect.x, -w + 120, Math.max(0, desk.w - 120));
  const y = clamp(rect.y, 0, Math.max(0, desk.h - 60));
  return { x, y, w, h };
}

/** A rect of the given size centred in the work area. */
function centered(size: { w: number; h: number }, desk: DeskSize): WinRect {
  const a = workArea(desk);
  const w = Math.round(Math.min(size.w, a.w));
  const h = Math.round(Math.min(size.h, a.h));
  return { x: Math.round(a.x + (a.w - w) / 2), y: Math.round(a.y + (a.h - h) / 2), w, h };
}

function isSnapZone(v: unknown): v is SnapZone {
  return typeof v === 'string' && (SNAP_ZONES as string[]).includes(v);
}

function storageKey(userId: string): string {
  return `elva:desk:windows:${userId}`;
}

export const useWm = create<WmState>()((set, get) => {
  const update = (id: string, patch: Partial<WinRecord> | ((w: WinRecord) => Partial<WinRecord>)) => {
    const w = get().windows[id];
    if (!w) return;
    const p = typeof patch === 'function' ? patch(w) : patch;
    set((s) => ({ windows: { ...s.windows, [id]: { ...w, ...p } } }));
  };

  /** Move a window to `rect` with a glide. */
  const glide = (id: string, rect: WinRect, extra: Partial<WinRecord> = {}, delay = 0) =>
    update(id, (w) => ({ rect, anim: w.anim + 1, animDelay: delay, ...extra }));

  const topVisible = (except?: string): string | null => {
    let best: WinRecord | null = null;
    for (const w of Object.values(get().windows)) {
      if (w.minimized || w.id === except) continue;
      if (!best || effectiveZ(w) > effectiveZ(best)) best = w;
    }
    return best?.id ?? null;
  };

  const anyVisible = () => Object.values(get().windows).some((w) => !w.minimized);

  /** The size a window had before it was made full screen or snapped. */
  const freeRect = (w: WinRecord): WinRect => (w.maximized || w.snap ? (w.restoreRect ?? w.rect) : w.rect);

  return {
    windows: {},
    activeId: null,
    zTop: Z_BASE - 1,
    cascade: 0,
    deskSize: { w: window.innerWidth, h: window.innerHeight - 30 },
    permissions: [],
    pendingCloseId: null,
    desktopShown: false,
    overview: false,

    setDeskSize(deskSize) {
      set({ deskSize });
      // Full-screen and snapped windows follow the desk's new size.
      for (const w of Object.values(get().windows)) {
        if (w.maximized) update(w.id, { rect: workArea(deskSize) });
        else if (w.snap) update(w.id, { rect: snapRect(w.snap, deskSize) });
      }
    },

    setPermissions(permissions) {
      set({ permissions });
      // Windows whose app is no longer permitted here show the locked page.
      for (const w of Object.values(get().windows)) {
        const def = appById(w.appId);
        if (!def) continue;
        const allowed = canOpen(def, permissions);
        if (!allowed && w.status !== 'locked') update(w.id, { status: 'locked', mounted: false, error: null });
        if (allowed && w.status === 'locked') update(w.id, { status: 'loading', mounted: true, generation: w.generation + 1 });
      }
    },

    open(appId, intent) {
      const def = appById(appId);
      if (!def || def.mode !== 'federated') return null;
      const existing = Object.values(get().windows).find((w) => w.appId === appId);
      if (existing) {
        if (existing.minimized) get().restore(existing.id);
        else get().focus(existing.id);
        if (intent) update(existing.id, { intent });
        return existing.id;
      }
      const s = get();
      const allowed = canOpen(def, s.permissions);
      const id = uid('w');
      const z = s.zTop + 1;
      const rec: WinRecord = {
        id,
        appId,
        title: def.name,
        badge: 0,
        dirty: false,
        rect: placeNew(def, s.deskSize, s.cascade),
        restoreRect: null,
        z,
        minimized: false,
        maximized: false,
        snap: null,
        onTop: false,
        mounted: allowed,
        status: allowed ? 'loading' : 'locked',
        error: null,
        state: undefined,
        intent: intent ?? null,
        lastActiveAt: Date.now(),
        minimizedAt: null,
        generation: 0,
        anim: 0,
        animDelay: 0,
      };
      set((st) => ({
        windows: { ...st.windows, [id]: rec },
        activeId: id,
        zTop: z,
        cascade: (st.cascade + 1) % 6,
        desktopShown: false,
        overview: false,
      }));
      log.info('open', { appId, id, allowed });
      return id;
    },

    requestClose(id) {
      const w = get().windows[id];
      if (!w) return;
      if (w.dirty) set({ pendingCloseId: id });
      else get().close(id);
    },

    close(id) {
      if (!get().windows[id]) return;
      set((s) => {
        const windows = { ...s.windows };
        delete windows[id];
        return { windows, pendingCloseId: s.pendingCloseId === id ? null : s.pendingCloseId };
      });
      const next = get().desktopShown ? null : topVisible();
      set({ activeId: next });
      if (next) update(next, { lastActiveAt: Date.now() });
      if (!anyVisible()) set({ desktopShown: false, overview: false });
      log.info('close', { id });
    },

    cancelClose() {
      set({ pendingCloseId: null });
    },

    minimize(id) {
      const w = get().windows[id];
      if (!w || w.minimized) return;
      update(id, { minimized: true, minimizedAt: Date.now() });
      set({ activeId: topVisible(id) });
      if (!anyVisible()) set({ desktopShown: false, overview: false });
    },

    restore(id) {
      const w = get().windows[id];
      if (!w) return;
      update(id, (cur) => ({
        minimized: false,
        minimizedAt: null,
        mounted: cur.status === 'locked' ? false : true,
        status: cur.status === 'dormant' ? 'loading' : cur.status,
        generation: cur.status === 'dormant' ? cur.generation + 1 : cur.generation,
      }));
      get().focus(id);
    },

    toggleMaximize(id) {
      const w = get().windows[id];
      if (!w) return;
      const desk = get().deskSize;
      if (!w.maximized) glide(id, workArea(desk), { maximized: true, snap: null, restoreRect: freeRect(w) });
      else glide(id, clampRect(w.restoreRect ?? w.rect, desk), { maximized: false, restoreRect: null });
      get().focus(id);
    },

    restoreSize(id) {
      const w = get().windows[id];
      if (!w) return;
      if (w.maximized) return get().toggleMaximize(id);
      if (w.snap) glide(id, clampRect(w.restoreRect ?? w.rect, get().deskSize), { snap: null, restoreRect: null });
      get().focus(id);
    },

    snapTo(id, zone) {
      const w = get().windows[id];
      if (!w) return;
      if (w.minimized) get().restore(id);
      glide(id, snapRect(zone, get().deskSize), { snap: zone, maximized: false, restoreRect: freeRect(w) });
      get().focus(id);
    },

    center(id) {
      const w = get().windows[id];
      if (!w) return;
      if (w.minimized) get().restore(id);
      glide(id, centered(freeRect(w), get().deskSize), { maximized: false, snap: null, restoreRect: null });
      get().focus(id);
    },

    resetSize(id) {
      const w = get().windows[id];
      const def = w ? appById(w.appId) : undefined;
      if (!w || !def) return;
      if (w.minimized) get().restore(id);
      const size = def.defaultSize ?? DEFAULT_SIZE;
      glide(
        id,
        centered({ w: Math.max(size.w, config.minWindow.w), h: Math.max(size.h, config.minWindow.h) }, get().deskSize),
        { maximized: false, snap: null, restoreRect: null },
      );
      get().focus(id);
    },

    toggleOnTop(id) {
      update(id, (w) => ({ onTop: !w.onTop }));
      get().focus(id);
    },

    focus(id) {
      const w = get().windows[id];
      if (!w) return;
      // Keep window z-indexes in their band: renumber from the bottom when the
      // counter climbs, preserving the stacking order.
      if (get().zTop >= Z_COMPACT_AT) {
        const ordered = Object.values(get().windows).sort((a, b) => a.z - b.z);
        const windows: Record<string, WinRecord> = {};
        ordered.forEach((rec, i) => {
          windows[rec.id] = { ...rec, z: Z_BASE + i };
        });
        set({ windows, zTop: Z_BASE + ordered.length - 1 });
      }
      const z = get().zTop + 1;
      // Focusing a window always brings the windows back.
      set({ activeId: id, zTop: z, desktopShown: false, overview: false });
      update(id, { z, lastActiveAt: Date.now() });
    },

    blurAll() {
      set({ activeId: null });
    },

    setRect(id, rect) {
      const w = get().windows[id];
      if (!w) return;
      update(id, {
        rect: clampRect({ ...w.rect, ...rect }, get().deskSize),
        maximized: false,
        snap: null,
        restoreRect: null,
      });
    },

    setTitle(id, title) {
      update(id, { title });
    },
    setBadge(id, badge) {
      update(id, { badge: Math.max(0, badge | 0) });
    },
    setDirty(id, dirty) {
      update(id, { dirty });
    },
    setState(id, state) {
      update(id, { state });
    },
    setStatus(id, status, error = null) {
      update(id, { status, error });
    },

    retry(id) {
      const w = get().windows[id];
      if (!w || w.status === 'locked') return;
      update(id, (cur) => ({ status: 'loading', error: null, mounted: true, generation: cur.generation + 1 }));
    },

    cycle(direction) {
      const visible = Object.values(get().windows)
        .filter((w) => !w.minimized)
        .sort((a, b) => effectiveZ(a) - effectiveZ(b));
      if (visible.length < 2) return;
      const active = get().activeId;
      const idx = visible.findIndex((w) => w.id === active);
      const next = direction === 1 ? visible[(idx + 1) % visible.length] : visible[(idx - 1 + visible.length) % visible.length];
      if (next) get().focus(next.id);
    },

    minimizeOthers(id) {
      const now = Date.now();
      for (const w of Object.values(get().windows)) {
        if (w.id !== id && !w.minimized) update(w.id, { minimized: true, minimizedAt: now });
      }
      get().focus(id);
    },

    minimizeAll() {
      const now = Date.now();
      for (const w of Object.values(get().windows)) {
        if (!w.minimized) update(w.id, { minimized: true, minimizedAt: now });
      }
      set({ activeId: null, desktopShown: false, overview: false });
    },

    restoreAll() {
      const hidden = Object.values(get().windows)
        .filter((w) => w.minimized)
        .sort((a, b) => a.z - b.z);
      for (const w of hidden) get().restore(w.id);
    },

    arrange(mode) {
      const desk = get().deskSize;
      const a = workArea(desk);
      const vis = Object.values(get().windows)
        .filter((w) => !w.minimized)
        .sort((x, y) => effectiveZ(x) - effectiveZ(y));
      const n = vis.length;
      if (!n) return;
      const rects: WinRect[] = [];
      if (mode === 'cascade') {
        const step = 34;
        const maxW = Math.max(config.minWindow.w, a.w - step * (n - 1));
        const maxH = Math.max(config.minWindow.h, a.h - step * (n - 1));
        const sizes = vis.map((w) => {
          const r = freeRect(w);
          return { w: Math.min(r.w, maxW), h: Math.min(r.h, maxH) };
        });
        const spanW = Math.max(...sizes.map((s, i) => s.w + i * step));
        const spanH = Math.max(...sizes.map((s, i) => s.h + i * step));
        const x0 = a.x + Math.max(0, (a.w - spanW) / 2);
        const y0 = a.y + Math.max(0, (a.h - spanH) / 2);
        sizes.forEach((s, i) => rects.push({ x: Math.round(x0 + i * step), y: Math.round(y0 + i * step), w: s.w, h: s.h }));
      } else {
        const cols = mode === 'columns' ? n : Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        const cellH = (a.h - DESK_GAP * (rows - 1)) / rows;
        for (let i = 0; i < n; i++) {
          const row = Math.floor(i / cols);
          const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
          const col = i % cols;
          const cellW = (a.w - DESK_GAP * (inRow - 1)) / inRow;
          rects.push({
            x: Math.round(a.x + col * (cellW + DESK_GAP)),
            y: Math.round(a.y + row * (cellH + DESK_GAP)),
            w: Math.round(cellW),
            h: Math.round(cellH),
          });
        }
      }
      vis.forEach((w, i) => {
        const r = rects[i];
        if (r) glide(w.id, r, { maximized: false, snap: null, restoreRect: null }, i * 45);
      });
      const top = vis[n - 1];
      if (top) get().focus(top.id);
    },

    toggleDesktop(force) {
      const on = force ?? !get().desktopShown;
      if (on === get().desktopShown) return;
      if (on && !anyVisible()) return;
      set({ desktopShown: on, overview: false, activeId: on ? null : topVisible() });
    },

    setOverview(on) {
      if (on === get().overview) return;
      if (on && !anyVisible()) return;
      set({ overview: on, desktopShown: false, activeId: get().activeId ?? topVisible() });
    },

    closeAll() {
      set({ windows: {}, activeId: null, pendingCloseId: null, desktopShown: false, overview: false });
    },

    tick() {
      const now = Date.now();
      const all = Object.values(get().windows);
      const mounted = all.filter((w) => w.mounted);
      const limit = config.dormantAfterMinutes * 60_000;
      for (const w of mounted) {
        if (w.minimized && w.minimizedAt && now - w.minimizedAt > limit) {
          update(w.id, { mounted: false, status: 'dormant' });
          log.info('dormant (age)', { id: w.id });
        }
      }
      const stillMounted = Object.values(get().windows).filter((w) => w.mounted);
      if (stillMounted.length > config.maxMountedWindows) {
        const candidates = stillMounted.filter((w) => w.minimized).sort((a, b) => a.lastActiveAt - b.lastActiveAt);
        const excess = stillMounted.length - config.maxMountedWindows;
        for (const w of candidates.slice(0, excess)) {
          update(w.id, { mounted: false, status: 'dormant' });
          log.info('dormant (cap)', { id: w.id });
        }
      }
    },

    hydrate(userId) {
      let saved: SavedWindow[] = [];
      try {
        saved = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]') as SavedWindow[];
      } catch {
        saved = [];
      }
      if (!Array.isArray(saved)) return;
      for (const s of saved) {
        const id = get().open(s.appId);
        if (!id) continue;
        // The screen may be smaller than when it was saved: keep it above the dock.
        const desk = get().deskSize;
        const free = clampRect({ ...s.rect, h: Math.min(s.rect.h, desk.h - 110) }, desk);
        const maximized = Boolean(s.maximized);
        const snap = !maximized && isSnapZone(s.snap) ? s.snap : null;
        update(id, {
          rect: maximized ? workArea(desk) : snap ? snapRect(snap, desk) : free,
          restoreRect: maximized || snap ? free : null,
          state: s.state,
          minimized: Boolean(s.minimized),
          minimizedAt: s.minimized ? Date.now() : null,
          maximized,
          snap,
          onTop: Boolean(s.onTop),
        });
      }
      if (saved.length) set({ activeId: topVisible() });
    },

    persist(userId) {
      const list: SavedWindow[] = Object.values(get().windows)
        .sort((a, b) => a.z - b.z)
        .map((w) => ({
          appId: w.appId,
          rect: freeRect(w),
          state: w.state,
          minimized: w.minimized,
          maximized: w.maximized,
          snap: w.snap,
          onTop: w.onTop,
        }));
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(list));
      } catch {
        /* ignore */
      }
    },
  };
});

/** Windows in z order, lowest first. */
export function selectOrdered(s: WmState): WinRecord[] {
  return Object.values(s.windows).sort((a, b) => a.z - b.z);
}
