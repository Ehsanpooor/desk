/**
 * Window-placement glyphs for the menus: a screen outline with the target area
 * filled, so "Left half" or "Top right" read at a glance.
 */
import type { SnapZone } from '../wm/geometry';

export type ZoneGlyph = SnapZone | 'max' | 'center' | 'cascade' | 'grid' | 'columns';

type Box = [x: number, y: number, w: number, h: number];

const FILL: Record<Exclude<ZoneGlyph, 'cascade'>, Box[]> = {
  left: [[3, 4, 4.5, 8]],
  right: [[8.5, 4, 4.5, 8]],
  tl: [[3, 4, 4.5, 3.5]],
  tr: [[8.5, 4, 4.5, 3.5]],
  bl: [[3, 8.5, 4.5, 3.5]],
  br: [[8.5, 8.5, 4.5, 3.5]],
  max: [[3, 4, 10, 8]],
  center: [[5, 5.5, 6, 5]],
  grid: [
    [3, 4, 4.5, 3.5],
    [8.5, 4, 4.5, 3.5],
    [3, 8.5, 4.5, 3.5],
    [8.5, 8.5, 4.5, 3.5],
  ],
  columns: [
    [3, 4, 2.8, 8],
    [6.6, 4, 2.8, 8],
    [10.2, 4, 2.8, 8],
  ],
};

export function ZoneIcon({ zone, className }: { zone: ZoneGlyph; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2.2" stroke="currentColor" strokeWidth="1.3" />
      {zone === 'cascade' ? (
        <>
          <rect x="3.2" y="4.2" width="6.5" height="4.6" rx="0.9" fill="currentColor" opacity="0.45" />
          <rect x="6.3" y="7" width="6.5" height="4.6" rx="0.9" fill="currentColor" />
        </>
      ) : (
        FILL[zone].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="0.9" fill="currentColor" />
        ))
      )}
    </svg>
  );
}
