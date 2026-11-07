/**
 * Sticky notes. Kept in this browser under
 * `elva:desk:notes:<userId>:<locationId>`: notes can hold patient details, so
 * they are never shared between people or between locations.
 * Production: GET/PUT /api/desk/notes so notes follow the person.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { uid } from '@/lib/utils';
import { useWm } from '../wm/store';

const log = logger.child('notes');

export type NoteColor = 'yellow' | 'pink' | 'green' | 'blue' | 'purple' | 'gray';
export const NOTE_COLORS: NoteColor[] = ['yellow', 'pink', 'green', 'blue', 'purple', 'gray'];

export type NoteOrder = 'date' | 'color' | 'title';

export interface Note {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: NoteColor;
  text: string;
  /** Last edit, epoch ms. */
  at: number;
  /** Above windows (true) or tucked on the desktop behind them. */
  top: boolean;
  collapsed: boolean;
}

interface NotesState {
  key: string | null;
  /** Array order is paint order within each layer. */
  notes: Note[];
  hidden: boolean;
  /** Notes that just appeared (enter animation) or are leaving. */
  entering: string[];
  leaving: string[];
  /** A new note whose textarea should take focus. */
  focusId: string | null;
  /** True for a moment while notes glide to tidied places. */
  arranging: boolean;

  load(key: string | null): void;
  flush(): void;
  add(at?: { x: number; y: number } | null): void;
  update(id: string, patch: Partial<Omit<Note, 'id'>>): void;
  front(id: string): void;
  remove(id: string): void;
  duplicate(id: string): void;
  /** Tidy every note into columns down the left of the desk, sorted. */
  arrange(by: NoteOrder): void;
  /** Pile every note in a neat cascade, newest on top. */
  stack(): void;
  setAllCollapsed(collapsed: boolean): void;
  setHidden(hidden: boolean): void;
  entered(id: string): void;
  focused(): void;
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function noteTitle(n: Pick<Note, 'text'>): string {
  return (n.text.split('\n').find((l) => l.trim()) ?? 'Empty note').trim();
}

function isNote(v: unknown): v is Note {
  if (!v || typeof v !== 'object') return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.id === 'string' &&
    typeof n.x === 'number' &&
    typeof n.y === 'number' &&
    typeof n.w === 'number' &&
    typeof n.h === 'number' &&
    typeof n.text === 'string' &&
    NOTE_COLORS.includes(n.color as NoteColor)
  );
}

function read(key: string): { notes: Note[]; hidden: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null') as { notes?: unknown; hidden?: unknown } | null;
    if (!raw) return { notes: [], hidden: false };
    const notes = Array.isArray(raw.notes)
      ? raw.notes.filter(isNote).map((n) => ({ ...n, at: n.at || Date.now(), top: Boolean(n.top), collapsed: Boolean(n.collapsed) }))
      : [];
    return { notes, hidden: Boolean(raw.hidden) };
  } catch {
    return { notes: [], hidden: false };
  }
}

let saveTimer = 0;
let pending: { key: string; notes: Note[]; hidden: boolean } | null = null;

function writeNow(): void {
  window.clearTimeout(saveTimer);
  if (!pending) return;
  const { key, notes, hidden } = pending;
  pending = null;
  try {
    localStorage.setItem(key, JSON.stringify({ notes, hidden }));
  } catch (e) {
    log.warn('could not save notes', e);
  }
}

export const useNotes = create<NotesState>()((set, get) => {
  const persist = () => {
    const { key, notes, hidden } = get();
    if (!key) return;
    pending = { key, notes, hidden };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(writeNow, 250);
  };

  /** Move notes to new places with a staggered glide (see `.sn-layer.arranging`). */
  let arrangeTimer = 0;
  const glideAll = (placed: Note[]) => {
    window.clearTimeout(arrangeTimer);
    set({ notes: placed, arranging: !reduceMotion(), hidden: false });
    persist();
    arrangeTimer = window.setTimeout(() => set({ arranging: false }), 520 + placed.length * 30 + 200);
  };

  return {
    key: null,
    notes: [],
    hidden: false,
    entering: [],
    leaving: [],
    focusId: null,
    arranging: false,

    load(key) {
      if (key === get().key) return;
      writeNow(); // finish saving the previous person's or location's notes
      if (!key) {
        set({ key: null, notes: [], hidden: false, entering: [], leaving: [], focusId: null });
        return;
      }
      set({ key, ...read(key), entering: [], leaving: [], focusId: null });
    },

    flush: writeNow,

    add(at) {
      const { notes, hidden } = get();
      const desk = useWm.getState().deskSize;
      const k = notes.length % 6;
      const n: Note = {
        id: uid('n'),
        x: at ? at.x : desk.w / 2 - 120 + k * 24,
        y: at ? at.y : 70 + k * 24,
        w: 240,
        h: 200,
        color: NOTE_COLORS[notes.length % 4] ?? 'yellow',
        text: '',
        at: Date.now(),
        top: true,
        collapsed: false,
      };
      set({
        notes: [...notes, n],
        hidden: hidden ? false : hidden,
        entering: [...get().entering, n.id],
        focusId: n.id,
      });
      persist();
    },

    update(id, patch) {
      set({ notes: get().notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
      persist();
    },

    front(id) {
      const { notes } = get();
      const n = notes.find((x) => x.id === id);
      if (!n) return;
      const sameLayer = notes.filter((x) => x.top === n.top);
      if (sameLayer[sameLayer.length - 1]?.id === id) return;
      set({ notes: [...notes.filter((x) => x.id !== id), n] });
      persist();
    },

    remove(id) {
      const { notes } = get();
      const index = notes.findIndex((n) => n.id === id);
      const note = notes[index];
      if (!note) return;
      const gone = () => {
        set({ notes: get().notes.filter((n) => n.id !== id), leaving: get().leaving.filter((x) => x !== id) });
        persist();
      };
      if (reduceMotion()) gone();
      else {
        set({ leaving: [...get().leaving, id] });
        window.setTimeout(gone, 150);
      }
      // Empty notes go without asking.
      if (!note.text.trim()) return;
      toast('Note deleted', {
        description: noteTitle(note).slice(0, 60),
        action: {
          label: 'Undo',
          onClick: () => {
            const current = get().notes.filter((n) => n.id !== id);
            current.splice(Math.min(index, current.length), 0, note);
            set({ notes: current, entering: [...get().entering, id] });
            persist();
          },
        },
      });
    },

    duplicate(id) {
      const { notes } = get();
      const index = notes.findIndex((n) => n.id === id);
      const src = notes[index];
      if (!src) return;
      const copy: Note = { ...src, id: uid('n'), x: src.x + 28, y: src.y + 28, at: Date.now() };
      const next = [...notes];
      next.splice(index + 1, 0, copy);
      set({ notes: next, entering: [...get().entering, copy.id] });
      persist();
    },

    arrange(by) {
      const desk = useWm.getState().deskSize;
      const sorted = [...get().notes].sort((a, b) => {
        if (by === 'color') return NOTE_COLORS.indexOf(a.color) - NOTE_COLORS.indexOf(b.color) || b.at - a.at;
        if (by === 'title') return noteTitle(a).localeCompare(noteTitle(b), undefined, { sensitivity: 'base' });
        return b.at - a.at;
      });
      const TOP = 22;
      const LEFT = 24;
      const GAP = 14;
      const bottom = desk.h - 110;
      let x = LEFT;
      let y = TOP;
      let colW = 0;
      const placed = sorted.map((n) => {
        const h = n.collapsed ? 26 : n.h;
        if (y > TOP && y + h > bottom) {
          x += colW + GAP;
          y = TOP;
          colW = 0;
        }
        const out = { ...n, x, y };
        y += h + GAP;
        colW = Math.max(colW, n.w);
        return out;
      });
      glideAll(placed);
    },

    stack() {
      const placed = [...get().notes]
        .sort((a, b) => a.at - b.at)
        .map((n, i) => ({ ...n, x: 32 + i * 26, y: 24 + i * 26 }));
      glideAll(placed);
    },

    setAllCollapsed(collapsed) {
      set({ notes: get().notes.map((n) => ({ ...n, collapsed })) });
      persist();
    },

    setHidden(hidden) {
      set({ hidden });
      persist();
    },

    entered(id) {
      set({ entering: get().entering.filter((x) => x !== id) });
    },

    focused() {
      set({ focusId: null });
    },
  };
});
