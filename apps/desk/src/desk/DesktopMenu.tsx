/**
 * Right-click on the bare desktop: new note, window management, widgets,
 * sticky notes, apps and appearance.
 */
import { LayoutGrid, Palette, Shapes } from 'lucide-react';
import { AppearanceMenuItems } from './AppearanceMenu';
import { alt, ctrl, MenuItem, MenuSeparator, MenuSub } from './menu';
import { NoteIcon, NotesMenuItems, useNotes } from './notes';
import { WidgetsMenuItems } from './widgets';
import { AllWindowsItems } from './wm/WindowMenu';

export function DesktopMenuItems({ at, onOpenLauncher }: { at: { x: number; y: number }; onOpenLauncher(): void }) {
  const noteCount = useNotes((s) => s.notes.length);
  return (
    <>
      <MenuItem icon={<NoteIcon />} shortcut={alt('N')} onSelect={() => useNotes.getState().add(at)}>
        New sticky note
      </MenuItem>
      <MenuSeparator />
      <AllWindowsItems />
      <MenuSeparator />
      <MenuSub icon={<Shapes />} label="Widgets">
        <WidgetsMenuItems />
      </MenuSub>
      <MenuSub icon={<NoteIcon />} label="Sticky notes" disabled={noteCount === 0}>
        <NotesMenuItems at={at} withNew={false} />
      </MenuSub>
      <MenuSeparator />
      <MenuItem icon={<LayoutGrid />} shortcut={ctrl('K')} onSelect={onOpenLauncher}>
        Open an app…
      </MenuItem>
      <MenuSub icon={<Palette />} label="Appearance">
        <AppearanceMenuItems />
      </MenuSub>
    </>
  );
}
