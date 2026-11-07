/**
 * One sticky note. Drag it by its top bar, resize it from the corner, pick a
 * colour, double-click the bar to fold it, pin it above the windows or tuck
 * it onto the desktop behind them.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { DeskSize } from '@elva/desk-sdk';
import { cn } from '@/lib/utils';
import { openContextMenu } from '../menu';
import { CloseIcon, PinIcon } from './icons';
import { NoteMenuItems } from './NotesMenuItems';
import { NOTE_COLORS, noteTitle, useNotes, type Note } from './store';

const BAR_H = 26;

/** Keep at least 60 px of a note on the desk. */
export function placeNote(n: Pick<Note, 'x' | 'y' | 'w'>, desk: DeskSize): { x: number; y: number } {
  return {
    x: Math.min(Math.max(n.x, -n.w + 60), desk.w - 60),
    y: Math.min(Math.max(n.y, 0), desk.h - 40),
  };
}

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} hr ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  note: Note;
  desk: DeskSize;
  entering: boolean;
  leaving: boolean;
  focus: boolean;
  /** Position among all notes, for staggered group motion. */
  index: number;
}

export function StickyNote({ note, desk, entering, leaving, focus, index }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [, setMetaTick] = useState(0);
  const { update, front, remove, entered, focused } = useNotes.getState();

  const w = size?.w ?? note.w;
  const h = size?.h ?? note.h;
  const pos = placeNote({ x: drag?.x ?? note.x, y: drag?.y ?? note.y, w }, desk);

  useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => {
      textRef.current?.focus();
      focused();
    }, 30);
    return () => window.clearTimeout(t);
  }, [focus, focused]);

  useEffect(() => {
    if (!colorsOpen) return;
    rootRef.current?.querySelector<HTMLElement>('.sn-colors [aria-pressed="true"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setColorsOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [colorsOpen]);

  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const bar = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    const origin = { x: note.x, y: note.y };
    let moved = false;
    let last = origin;
    bar.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      last = { x: origin.x + dx, y: origin.y + dy };
      setDrag(last);
    };
    const onUp = () => {
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', onUp);
      bar.removeEventListener('pointercancel', onUp);
    bar.removeEventListener('lostpointercapture', onUp);
      if (moved) update(note.id, placeNote({ ...last, w: note.w }, desk));
      setDrag(null);
    };
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', onUp);
    bar.addEventListener('pointercancel', onUp);
    bar.addEventListener('lostpointercapture', onUp);
  };

  const onResizeDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const grip = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    const origin = { w: note.w, h: note.h };
    let last = origin;
    grip.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      last = {
        w: Math.min(560, Math.max(170, origin.w + ev.clientX - start.x)),
        h: Math.min(600, Math.max(110, origin.h + ev.clientY - start.y)),
      };
      setSize(last);
    };
    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
    grip.removeEventListener('lostpointercapture', onUp);
      update(note.id, last);
      setSize(null);
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
    grip.addEventListener('lostpointercapture', onUp);
  };

  const title = noteTitle(note);

  return (
    <section
      ref={rootRef}
      aria-label="Sticky note"
      className={cn(
        'sn',
        `c-${note.color}`,
        note.collapsed && 'collapsed',
        entering && 'enter',
        leaving && 'leave',
        drag && 'dragging',
        size && 'resizing',
        colorsOpen && 'colors-open',
      )}
      style={
        { left: pos.x, top: pos.y, width: w, height: note.collapsed ? BAR_H : h, '--i': index } as CSSProperties
      }
      onContextMenu={(e) => {
        setColorsOpen(false);
        openContextMenu(e, <NoteMenuItems id={note.id} />, { label: 'Sticky note' });
      }}
      onPointerDownCapture={() => front(note.id)}
      onPointerEnter={() => setMetaTick((n) => n + 1)}
      onAnimationEnd={() => entering && entered(note.id)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && colorsOpen) {
          setColorsOpen(false);
          colorBtnRef.current?.focus();
        }
      }}
    >
      <div
        className="sn-bar"
        onPointerDown={onBarDown}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          update(note.id, { collapsed: !note.collapsed });
        }}
      >
        <button
          ref={colorBtnRef}
          type="button"
          className="sn-b"
          aria-label="Note colour"
          aria-expanded={colorsOpen}
          onClick={() => setColorsOpen((o) => !o)}
        >
          <span className="dot" />
        </button>
        <span className="ttl">{title}</span>
        <span className="sp" />
        <button
          type="button"
          className="sn-b"
          aria-label="Keep above windows"
          title="Keep above windows"
          aria-pressed={note.top}
          onClick={() => update(note.id, { top: !note.top })}
        >
          <PinIcon />
        </button>
        <button type="button" className="sn-b" aria-label="Delete note" title="Delete note" onClick={() => remove(note.id)}>
          <CloseIcon />
        </button>
      </div>
      <div className="sn-colors" role="group" aria-label="Colour" inert={!colorsOpen ? true : undefined}>
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`c-${c}`}
            aria-label={c}
            aria-pressed={c === note.color}
            onClick={() => {
              update(note.id, { color: c });
              setColorsOpen(false);
            }}
          />
        ))}
      </div>
      <textarea
        ref={textRef}
        aria-label="Note text"
        placeholder="Write a note…"
        spellCheck
        value={note.text}
        onChange={(e) => update(note.id, { text: e.target.value, at: Date.now() })}
        onContextMenu={(e) => {
          // With text selected, keep the browser's menu (copy, look up, spelling).
          const t = e.currentTarget;
          if (t.selectionStart !== t.selectionEnd) e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
      />
      <span className="sn-meta">Edited {ago(note.at)}</span>
      <span className="sn-rz" aria-hidden="true" onPointerDown={onResizeDown} />
    </section>
  );
}
