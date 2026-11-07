/**
 * Window geometry: the work area (the desk minus the dock), snap zones, and the
 * "all windows" overview layout. Pure functions, desk coordinates.
 */
import type { DeskSize } from '@elva/desk-sdk';

export interface WinRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Halves and quarters of the work area. Full screen is `maximized`, not a zone. */
export type SnapZone = 'left' | 'right' | 'tl' | 'tr' | 'bl' | 'br';
/** Where a dragged window can be dropped to snap. */
export type DropZone = SnapZone | 'max';

export const SNAP_ZONES: SnapZone[] = ['left', 'right', 'tl', 'tr', 'bl', 'br'];

export const DESK_GAP = 8;
/** Room kept free for the dock at the bottom of the desk. */
export const DOCK_RESERVE = 96;

export function workArea(desk: DeskSize): WinRect {
  return {
    x: DESK_GAP,
    y: DESK_GAP,
    w: Math.max(0, desk.w - DESK_GAP * 2),
    h: Math.max(0, desk.h - DESK_GAP * 2 - DOCK_RESERVE),
  };
}

export function snapRect(zone: SnapZone, desk: DeskSize): WinRect {
  const a = workArea(desk);
  const w2 = Math.floor((a.w - DESK_GAP) / 2);
  const h2 = Math.floor((a.h - DESK_GAP) / 2);
  const right = a.x + a.w - w2;
  const bottom = a.y + a.h - h2;
  switch (zone) {
    case 'left':
      return { x: a.x, y: a.y, w: w2, h: a.h };
    case 'right':
      return { x: right, y: a.y, w: w2, h: a.h };
    case 'tl':
      return { x: a.x, y: a.y, w: w2, h: h2 };
    case 'tr':
      return { x: right, y: a.y, w: w2, h: h2 };
    case 'bl':
      return { x: a.x, y: bottom, w: w2, h: h2 };
    case 'br':
      return { x: right, y: bottom, w: w2, h: h2 };
  }
}

export function dropRect(zone: DropZone, desk: DeskSize): WinRect {
  return zone === 'max' ? workArea(desk) : snapRect(zone, desk);
}

/**
 * The zone under a dragged window's pointer (desk coordinates; the pointer may
 * be above the desk, over the menu bar). Edges snap to halves, the ends of the
 * side edges to quarters, the top edge to full screen.
 */
export function zoneAt(px: number, py: number, desk: DeskSize): DropZone | null {
  const EDGE = 6;
  const CORNER = 96;
  const bottom = workArea(desk).y + workArea(desk).h;
  if (px <= EDGE) return py < CORNER ? 'tl' : py > bottom - CORNER ? 'bl' : 'left';
  if (px >= desk.w - EDGE) return py < CORNER ? 'tr' : py > bottom - CORNER ? 'br' : 'right';
  if (py <= 2) return 'max';
  return null;
}

/**
 * Lays the visible windows out in a grid for the overview, each scaled to fit
 * its cell (never enlarged) and centred, with room for a title underneath.
 * Picks the column count that keeps windows largest; keeps reading order close
 * to where the windows already are.
 */
export function overviewLayout(items: { id: string; rect: WinRect }[], desk: DeskSize): Record<string, WinRect> {
  const out: Record<string, WinRect> = {};
  const n = items.length;
  if (!n) return out;
  const PAD = 56;
  const GAP = 36;
  const LABEL = 34;
  const area = { x: PAD, y: PAD - 16, w: desk.w - PAD * 2, h: desk.h - PAD - DOCK_RESERVE };

  let best: { cols: number; rows: number; cw: number; ch: number; score: number } | null = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (area.w - GAP * (cols - 1)) / cols;
    const ch = (area.h - GAP * (rows - 1)) / rows - LABEL;
    if (cw <= 40 || ch <= 40) continue;
    const score = items.reduce((sum, it) => sum + Math.min(1, cw / it.rect.w, ch / it.rect.h), 0);
    if (!best || score > best.score + 0.001) best = { cols, rows, cw, ch, score };
  }
  if (!best) return out;

  const ordered = [...items].sort((a, b) => {
    const ra = Math.round((a.rect.y + a.rect.h / 2) / 160);
    const rb = Math.round((b.rect.y + b.rect.h / 2) / 160);
    return ra - rb || a.rect.x + a.rect.w / 2 - (b.rect.x + b.rect.w / 2);
  });

  const { cols, rows, cw, ch } = best;
  const usedH = rows * (ch + LABEL) + GAP * (rows - 1);
  const top = area.y + Math.max(0, (area.h - usedH) / 2);
  ordered.forEach((it, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const rowOffset = ((cols - inRow) * (cw + GAP)) / 2;
    const s = Math.min(1, cw / it.rect.w, ch / it.rect.h);
    const w = it.rect.w * s;
    const h = it.rect.h * s;
    const x0 = area.x + rowOffset + col * (cw + GAP);
    const y0 = top + row * (ch + LABEL + GAP);
    out[it.id] = { x: Math.round(x0 + (cw - w) / 2), y: Math.round(y0 + (ch - h) / 2), w, h };
  });
  return out;
}
