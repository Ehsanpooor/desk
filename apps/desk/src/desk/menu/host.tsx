/**
 * The desk's one right-click menu. Anything on the desk calls
 * `openContextMenu(event, <Items />)` from its `onContextMenu`; the innermost
 * element wins because the event stops there. A right-click the desk does not
 * claim (inside an app, on selected text, or with Shift held) keeps the
 * browser's own menu.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { create } from 'zustand';
import { MENU_SURFACE } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface MenuRequest {
  id: number;
  x: number;
  y: number;
  side: 'top' | 'bottom';
  align: 'start' | 'center';
  label: string;
  content: ReactNode;
  /** Marked with `data-ctx` while its menu is open, so it can show a ring. */
  target: HTMLElement | null;
}

const useMenu = create<{ req: MenuRequest | null }>(() => ({ req: null }));
let seq = 0;

export interface OpenOptions {
  /** Read by screen readers as the menu's name. */
  label: string;
  /** Open at this point (viewport px) instead of the pointer. */
  at?: { x: number; y: number };
  side?: 'top' | 'bottom';
  align?: 'start' | 'center';
}

interface MenuEvent {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  currentTarget: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}

/** Opens the desk menu. Returns false when the browser's menu should show instead. */
export function openContextMenu(e: MenuEvent, content: ReactNode, opts: OpenOptions): boolean {
  if (e.shiftKey) return false;
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
  useMenu.setState({
    req: {
      id: ++seq,
      x: opts.at?.x ?? e.clientX,
      y: opts.at?.y ?? e.clientY,
      side: opts.side ?? 'bottom',
      align: opts.align ?? 'start',
      label: opts.label,
      content,
      target,
    },
  });
  return true;
}

export function closeContextMenu(): void {
  useMenu.setState({ req: null });
}

export function ContextMenuHost() {
  const req = useMenu((s) => s.req);
  // Keep the last menu on screen while it fades out.
  const last = useRef<MenuRequest | null>(null);
  if (req) last.current = req;
  const shown = req ?? last.current;

  useEffect(() => {
    const el = req?.target;
    if (!el) return;
    el.setAttribute('data-ctx', '');
    return () => el.removeAttribute('data-ctx');
  }, [req]);

  // Resizing the browser or leaving the tab closes the menu, as on a desktop.
  useEffect(() => {
    if (!req) return;
    const close = () => closeContextMenu();
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [req]);

  return (
    <Menu.Root open={req !== null} onOpenChange={(o) => !o && closeContextMenu()} modal={false}>
      <Menu.Trigger asChild>
        <span
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none fixed size-px"
          style={{ left: shown?.x ?? 0, top: shown?.y ?? 0 }}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          key={shown?.id}
          aria-label={shown?.label}
          side={shown?.side}
          align={shown?.align}
          sideOffset={shown?.side === 'top' ? 10 : 2}
          collisionPadding={8}
          loop
          className={cn(MENU_SURFACE, 'min-w-[232px]')}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {shown?.content}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
