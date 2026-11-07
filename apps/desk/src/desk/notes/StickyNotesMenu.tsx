/** The menu bar's sticky-note button and its menu. Place it in the menu bar's right group. */
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { menuButton } from '../MenuBar';
import { NoteIcon } from './icons';
import { NotesMenuItems } from './NotesMenuItems';

export function StickyNotesMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Sticky notes" title="Sticky notes" className={menuButton} data-notes-button="">
        <NoteIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="min-w-[232px]"
        // A new note focuses its own text area; returning focus to this button would steal it.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <NotesMenuItems at={null} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
