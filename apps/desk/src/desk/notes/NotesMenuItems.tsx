/**
 * Sticky-note menus. `NotesMenuItems` acts on all notes (menu bar button and
 * the desktop's right-click menu); `NoteMenuItems` is one note's right-click.
 */
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  BringToFront,
  CalendarClock,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCopy,
  Copy,
  Layers,
  Palette,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { logger } from '@/lib/logger';
import { alt, MenuCheckItem, MenuItem, MenuSeparator, MenuSub, MenuSwatches } from '../menu';
import { EyeIcon, PlusIcon } from './icons';
import { NOTE_COLORS, useNotes, type NoteColor } from './store';

const log = logger.child('notes');

const SWATCHES = NOTE_COLORS.map((c) => ({
  id: c,
  name: c[0]?.toUpperCase() + c.slice(1),
  style: { background: `var(--sn-${c}-bar)` },
}));

export function NotesMenuItems({ at, withNew = true }: { at: { x: number; y: number } | null; withNew?: boolean }) {
  const { count, allCollapsed } = useNotes(
    useShallow((s) => ({ count: s.notes.length, allCollapsed: s.notes.length > 0 && s.notes.every((n) => n.collapsed) })),
  );
  const hidden = useNotes((s) => s.hidden);
  const { add, setHidden, arrange, stack, setAllCollapsed } = useNotes.getState();
  return (
    <>
      {withNew && (
        <MenuItem icon={<PlusIcon />} shortcut={alt('N')} onSelect={() => add(at)}>
          New sticky note
        </MenuItem>
      )}
      {count > 0 && (
        <>
          {withNew && <MenuSeparator />}
          <MenuItem icon={<EyeIcon />} onSelect={() => setHidden(!hidden)}>
            {hidden ? `Show notes (${count})` : 'Hide notes'}
          </MenuItem>
          <MenuSub icon={<ArrowDownWideNarrow />} label="Arrange notes">
            <MenuItem icon={<CalendarClock />} onSelect={() => arrange('date')}>
              By date, newest first
            </MenuItem>
            <MenuItem icon={<Palette />} onSelect={() => arrange('color')}>
              By colour
            </MenuItem>
            <MenuItem icon={<ArrowDownAZ />} onSelect={() => arrange('title')}>
              By title
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Layers />} onSelect={stack}>
              Stack
            </MenuItem>
          </MenuSub>
          <MenuItem
            icon={allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
            onSelect={() => setAllCollapsed(!allCollapsed)}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </MenuItem>
        </>
      )}
    </>
  );
}

export function NoteMenuItems({ id }: { id: string }) {
  const note = useNotes((s) => s.notes.find((n) => n.id === id));
  if (!note) return null;
  const { update, front, duplicate, remove, add } = useNotes.getState();

  const copy = () => {
    navigator.clipboard
      .writeText(note.text)
      .then(() => toast('Note copied'))
      .catch((e: unknown) => log.warn('copy failed', e));
  };

  return (
    <>
      <MenuSwatches<NoteColor>
        label="Colour"
        options={SWATCHES}
        value={note.color}
        onPick={(color) => update(id, { color })}
      />
      <MenuSeparator />
      <MenuItem
        icon={note.collapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
        onSelect={() => update(id, { collapsed: !note.collapsed })}
      >
        {note.collapsed ? 'Expand' : 'Collapse'}
      </MenuItem>
      <MenuCheckItem checked={note.top} onCheckedChange={(top) => update(id, { top })}>
        Keep above windows
      </MenuCheckItem>
      <MenuItem icon={<BringToFront />} onSelect={() => front(id)}>
        Bring to front
      </MenuItem>
      <MenuItem icon={<Copy />} onSelect={() => duplicate(id)}>
        Duplicate
      </MenuItem>
      <MenuItem icon={<ClipboardCopy />} disabled={!note.text.trim()} onSelect={copy}>
        Copy text
      </MenuItem>
      <MenuSeparator />
      <NotesMenuItems at={null} withNew={false} />
      <MenuSeparator />
      <MenuItem icon={<PlusIcon />} shortcut={alt('N')} onSelect={() => add(null)}>
        New sticky note
      </MenuItem>
      <MenuSeparator />
      <MenuItem variant="destructive" icon={<Trash2 />} onSelect={() => remove(id)}>
        Delete note
      </MenuItem>
    </>
  );
}
