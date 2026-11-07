/**
 * The four clock faces: Classic, Night, Flip and Digital. Each draws one
 * moment; the widget re-renders it every second. Colours come from
 * globals.css (widgets section) through class names.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ClockStyle } from '../prefs';

const pol = (r: number, deg: number, c = 88): [number, number] => [
  c + r * Math.sin((deg * Math.PI) / 180),
  c - r * Math.cos((deg * Math.PI) / 180),
];
const dayName = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

/** A document-unique id that is safe inside url(#…). */
function useSvgId(): string {
  return `c${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export const CLOCK_STYLES: [ClockStyle, string][] = [
  ['classic', 'Classic'],
  ['night', 'Night'],
  ['flip', 'Flip'],
  ['lcd', 'Digital'],
];

export function isClockStyle(v: unknown): v is ClockStyle {
  return v === 'classic' || v === 'night' || v === 'flip' || v === 'lcd';
}

export function ClockFace({ style, date }: { style: ClockStyle; date: Date }) {
  if (style === 'flip') return <FlipFace date={date} />;
  if (style === 'lcd') return <LcdFace date={date} />;
  return <AnalogFace night={style === 'night'} date={date} />;
}

// ── Classic and Night ───────────────────────────────────────────────────────

function AnalogFace({ night, date }: { night: boolean; date: Date }) {
  const id = useSvgId();
  const ticks = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const quarter = i % 15 === 0;
      if (!night && (!major || quarter)) continue;
      const r1 = night ? 69 : 64;
      const r2 = night ? (major ? 61 : 65) : 59;
      const [x1, y1] = pol(r1, i * 6);
      const [x2, y2] = pol(r2, i * 6);
      out.push({ x1, y1, x2, y2, major });
    }
    return out;
  }, [night]);

  const s = date.getSeconds();
  const m = date.getMinutes() + s / 60;
  const h = (date.getHours() % 12) + m / 60;
  const nums: [number, number][] = [
    [12, 0],
    [3, 90],
    [6, 180],
    [9, 270],
  ];

  return (
    <svg width="176" height="176" viewBox="0 0 176 176" aria-hidden="true" className={cn('clk', night ? 'clk-night' : 'clk-classic')}>
      {night ? (
        <>
          <defs>
            <filter id={`${id}-grain`}>
              <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves={2} seed={4} />
              <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0" />
              <feComposite in2="SourceGraphic" operator="in" />
            </filter>
            <radialGradient id={`${id}-dd`} cx="50%" cy="40%">
              <stop offset="0" className="s-dial-0" />
              <stop offset="1" className="s-dial-1" />
            </radialGradient>
          </defs>
          <rect x="1" y="1" width="174" height="174" rx="40" className="f-body" />
          <rect x="1" y="1" width="174" height="174" rx="40" className="f-grain" filter={`url(#${id}-grain)`} />
          <rect x="1.5" y="1.5" width="173" height="173" rx="39.5" fill="none" className="k-edge" />
          <circle cx="88" cy="88" r="75" fill={`url(#${id}-dd)`} className="k-ring" strokeWidth="1" />
        </>
      ) : (
        <>
          <defs>
            <linearGradient id={`${id}-cb`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="s-body-0" />
              <stop offset="1" className="s-body-1" />
            </linearGradient>
            <radialGradient id={`${id}-cd`} cx="45%" cy="38%">
              <stop offset="0" className="s-dial-0" />
              <stop offset="1" className="s-dial-1" />
            </radialGradient>
            <filter id={`${id}-cs`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity=".14" className="k-flood" />
            </filter>
          </defs>
          <rect x="1" y="1" width="174" height="174" rx="42" fill={`url(#${id}-cb)`} className="k-edge" />
          <circle cx="88" cy="88" r="71" fill={`url(#${id}-cd)`} filter={`url(#${id}-cs)`} />
        </>
      )}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1.toFixed(2)}
          y1={t.y1.toFixed(2)}
          x2={t.x2.toFixed(2)}
          y2={t.y2.toFixed(2)}
          className={cn('k-tick', t.major && 'major')}
          strokeWidth={t.major ? 2 : 1.1}
          strokeLinecap="round"
        />
      ))}
      {nums.map(([n, a]) => {
        const [x, y] = pol(night ? 51 : 53, a);
        return (
          <text
            key={n}
            x={x.toFixed(1)}
            y={(y + 4.5).toFixed(1)}
            textAnchor="middle"
            fontSize={night ? 12 : 13}
            fontWeight={night ? 600 : 500}
            className="f-num"
          >
            {n}
          </text>
        );
      })}
      {night ? (
        <>
          <rect x="101" y="81" width="30" height="14" rx="3" className="f-date" />
          <text x="116" y="91.2" textAnchor="middle" fontSize="8.5" fontWeight="700" className="f-date-ink">
            {`${dayName(date)} ${date.getDate()}`}
          </text>
        </>
      ) : (
        <>
          <rect x="104" y="81" width="32" height="14" rx="3" className="f-date" />
          <text x="120" y="91.2" textAnchor="middle" fontSize="8.5" fontWeight="700" className="f-date-ink">
            {`${dayName(date)} ${date.getDate()}`}
          </text>
        </>
      )}
      {night ? (
        <>
          <g transform={`rotate(${h * 30} 88 88)`}>
            <rect x="85" y="50" width="6" height="40" rx="3" className="f-hand" />
            <rect x="86.6" y="55" width="2.8" height="20" rx="1.4" className="f-inlay" />
          </g>
          <g transform={`rotate(${m * 6} 88 88)`}>
            <rect x="85.5" y="30" width="5" height="60" rx="2.5" className="f-hand" />
            <rect x="86.8" y="35" width="2.4" height="30" rx="1.2" className="f-inlay" />
          </g>
          <g transform={`rotate(${s * 6} 88 88)`}>
            <rect x="87.2" y="24" width="1.6" height="78" rx=".8" className="f-second" />
          </g>
          <circle cx="88" cy="88" r="5.5" className="f-hand" />
          <circle cx="88" cy="88" r="2" className="f-second" />
        </>
      ) : (
        <>
          <g transform={`rotate(${h * 30} 88 88)`}>
            <rect x="85.5" y="54" width="5" height="37" rx="2.5" className="f-hand" />
          </g>
          <g transform={`rotate(${m * 6} 88 88)`}>
            <rect x="86.25" y="34" width="3.5" height="57" rx="1.75" className="f-hand" />
          </g>
          <g transform={`rotate(${s * 6} 88 88)`}>
            <rect x="87.3" y="26" width="1.4" height="76" rx=".7" className="f-second" />
          </g>
          <circle cx="88" cy="88" r="4.5" className="f-hand" />
          <circle cx="88" cy="88" r="2" className="f-second" />
        </>
      )}
    </svg>
  );
}

// ── Flip ────────────────────────────────────────────────────────────────────

/** One flip card. The digit flips in each time it changes, never on first paint. */
function FlipCard({ value, left }: { value: string; left: number }) {
  const prev = useRef(value);
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlipping(true);
    }
  }, [value]);
  return (
    <div className={cn('flip-card', flipping && 'flip')} style={{ left }}>
      <span key={value}>{value}</span>
    </div>
  );
}

const DOTS = Array.from({ length: 18 }, (_, i) => ({ left: (i % 6) * 7, top: Math.floor(i / 6) * 7 }));

function FlipFace({ date }: { date: Date }) {
  const h = String(date.getHours() % 12 || 12);
  const m = String(date.getMinutes()).padStart(2, '0');
  const pm = date.getHours() >= 12;
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return (
    <div className="flip-face">
      <div className="flip-screen" />
      <FlipCard value={h} left={14} />
      <FlipCard value={m} left={94} />
      <div className="flip-dots">
        {DOTS.map((d, i) => (
          <i key={i} style={d} />
        ))}
      </div>
      <div className="flip-date">{`${dayName(date)} ${month} ${date.getDate()}`}</div>
      <div className="flip-ampm">
        <span className={cn(!pm && 'lit')}>{pm ? 'AM' : '▸ AM'}</span>
        <span className={cn(pm && 'lit')}>{pm ? '▸ PM' : 'PM'}</span>
      </div>
    </div>
  );
}

// ── Digital ─────────────────────────────────────────────────────────────────

const SEG_W = 34;
const SEG_H = 50;
const SEG_T = 6.5;
const SEG_G = 0.9;
const hseg = (y: number) =>
  `${SEG_G + SEG_T / 2},${y} ${SEG_G + SEG_T},${y - SEG_T / 2} ${SEG_W - SEG_G - SEG_T},${y - SEG_T / 2} ${SEG_W - SEG_G - SEG_T / 2},${y} ${SEG_W - SEG_G - SEG_T},${y + SEG_T / 2} ${SEG_G + SEG_T},${y + SEG_T / 2}`;
const vseg = (x: number, y0: number, y1: number) =>
  `${x},${y0 + SEG_G + SEG_T / 2} ${x + SEG_T / 2},${y0 + SEG_G + SEG_T} ${x + SEG_T / 2},${y1 - SEG_G - SEG_T} ${x},${y1 - SEG_G - SEG_T / 2} ${x - SEG_T / 2},${y1 - SEG_G - SEG_T} ${x - SEG_T / 2},${y0 + SEG_G + SEG_T}`;
const SEG: [string, string][] = [
  ['a', hseg(SEG_T / 2)],
  ['g', hseg(SEG_H / 2)],
  ['d', hseg(SEG_H - SEG_T / 2)],
  ['f', vseg(SEG_T / 2, 0, SEG_H / 2)],
  ['b', vseg(SEG_W - SEG_T / 2, 0, SEG_H / 2)],
  ['e', vseg(SEG_T / 2, SEG_H / 2, SEG_H)],
  ['c', vseg(SEG_W - SEG_T / 2, SEG_H / 2, SEG_H)],
];
const DIG: Record<number, string> = {
  0: 'abcdef',
  1: 'bc',
  2: 'abged',
  3: 'abgcd',
  4: 'fgbc',
  5: 'afgcd',
  6: 'afgedc',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
};

function Digit({ x, y, value }: { x: number; y: number; value: number | null }) {
  const lit = value === null ? '' : (DIG[value] ?? '');
  return (
    <g transform={`translate(${x} ${y}) skewX(-6)`}>
      {SEG.map(([k, p]) => (
        <polygon key={k} points={p} className={cn('seg', lit.includes(k) && 'on')} />
      ))}
    </g>
  );
}

function LcdFace({ date }: { date: Date }) {
  const id = useSvgId();
  const h = date.getHours() % 12 || 12;
  const m = date.getMinutes();
  const vals = [h >= 10 ? 1 : null, h % 10, Math.floor(m / 10), m % 10];
  const pm = date.getHours() >= 12;
  const panel = (y: number, a: number | null | undefined, b: number | null | undefined) => (
    <>
      <rect x="44" y={y} width="122" height="74" rx="12" fill={`url(#${id}-lcdg)`} />
      <rect x="44" y={y} width="122" height="74" rx="12" fill="none" className="k-panel-edge" />
      <Digit x={61} y={y + 12} value={a ?? null} />
      <Digit x={109} y={y + 12} value={b ?? null} />
    </>
  );
  return (
    <svg width="176" height="176" viewBox="0 0 176 176" aria-hidden="true" className="clk clk-lcd">
      <defs>
        <linearGradient id={`${id}-lb`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="s-body-0" />
          <stop offset="1" className="s-body-1" />
        </linearGradient>
        <linearGradient id={`${id}-lcdg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="s-panel-0" />
          <stop offset="1" className="s-panel-1" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="174" height="174" rx="40" fill={`url(#${id}-lb)`} className="k-edge" />
      {panel(12, vals[0], vals[1])}
      {panel(90, vals[2], vals[3])}
      <text x="14" y="34" fontSize="12" fontWeight="500" className="f-ink" opacity={pm ? 0.35 : 1}>
        am
      </text>
      <text x="14" y="50" fontSize="12" fontWeight="500" className="f-ink" opacity={pm ? 1 : 0.35}>
        pm
      </text>
      <text x="14" y="128" fontSize="10" fontWeight="700" letterSpacing=".8" className="f-label">
        {dayName(date)}
      </text>
      <text x="14" y="150" fontSize="20" fontWeight="700" className="f-ink">
        {date.getDate()}
      </text>
      <polygon points="0,0 0,8 -6,4" className="f-ink" transform={`translate(42 ${pm ? 42 : 26})`} />
    </svg>
  );
}
