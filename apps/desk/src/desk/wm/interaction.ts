/**
 * Runtime handles the window manager must not put in React state: the live
 * app instance per window, and whether a drag or resize is in progress.
 */
import { create } from 'zustand';
import type { DeskAppInstance, DeskAppManifest, DeskIntent } from '@elva/desk-sdk';
import { logger } from '@/lib/logger';
import type { WinRect } from './geometry';

const log = logger.child('wm');

export type Busy = 'drag' | 'resize' | null;

/** Where a dragged window will land if dropped now, drawn just under it. */
export interface SnapPreview {
  rect: WinRect;
  z: number;
}

interface InteractionState {
  busy: Busy;
  snap: SnapPreview | null;
  setBusy(busy: Busy): void;
  setSnap(snap: SnapPreview | null): void;
}

export const useInteraction = create<InteractionState>()((set) => ({
  busy: null,
  snap: null,
  setBusy: (busy) => set({ busy }),
  setSnap: (snap) => set({ snap }),
}));

export interface LiveWindow {
  instance: DeskAppInstance;
  manifest: DeskAppManifest;
}

const live = new Map<string, LiveWindow>();

export const liveWindows = {
  get: (id: string) => live.get(id),
  set: (id: string, w: LiveWindow) => live.set(id, w),
  delete: (id: string) => live.delete(id),
};

export function dispatchIntent(id: string, intent: DeskIntent): void {
  const w = live.get(id);
  if (!w) return;
  try {
    w.instance.handleIntent?.(intent);
  } catch (e) {
    log.error('handleIntent threw', e);
  }
}
