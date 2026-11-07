/**
 * One desktop widget: positioned on the desk, draggable anywhere, with the
 * prototype's round settings button and its scale-in popover, and a
 * right-click menu (size, the widget's own choices, reset, remove).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { DeskSize } from '@elva/desk-sdk';
import { Move, Scaling, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTheme } from '@/theme/store';
import {
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  openContextMenu,
} from '../menu';
import { useWm } from '../wm/store';
import { widgetMove, widgetResize } from './motion';
import {
  boxOf,
  defaultPos,
  SIZE_LABEL,
  sizeOf,
  useWidgetPrefs,
  WIDGET_BOX,
  type Pos,
  type WidgetId,
  type WidgetSize,
} from './prefs';

export interface ShellApi {
  open(): void;
  close(): void;
}

interface Props {
  id: WidgetId;
  label: string;
  className: string;
  buttonLabel: string;
  buttonIcon: ReactNode;
  popLabel: string;
  pop: (api: ShellApi) => ReactNode;
  /** Called after the popover opens, to move focus into it. */
  onOpened?(root: HTMLElement): void;
  attrs?: Record<string, string>;
  /** The widget's own rows in its right-click menu. */
  menu?: ReactNode;
  /** A word after each size in the menu ("with picture"). */
  sizeHints?: Partial<Record<WidgetSize, string>>;
  children: ReactNode | ((api: ShellApi) => ReactNode);
}

/** The prototype keeps widgets 8 px inside the desk and 110 px above its bottom (the dock). */
function clampPos(p: Pos, desk: DeskSize, w: number, h: number): Pos {
  return {
    x: Math.min(Math.max(p.x, 8), desk.w - w - 8),
    y: Math.min(Math.max(p.y, 8), desk.h - h - 110),
  };
}

/** Hide a widget, with a way back. */
export function removeWidget(id: WidgetId, label: string): void {
  useWidgetPrefs.getState().setHidden(id, true);
  toast(`${label} removed`, {
    description: 'Right-click the desktop and choose Widgets to bring it back.',
    duration: 8000,
    action: { label: 'Undo', onClick: () => useWidgetPrefs.getState().setHidden(id, false) },
  });
}

export function WidgetShell({
  id,
  label,
  className,
  buttonLabel,
  buttonIcon,
  popLabel,
  pop,
  onOpened,
  attrs,
  menu,
  sizeHints,
  children,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(0);
  const [drag, setDrag] = useState<Pos | null>(null);
  const [open, setOpen] = useState(false);
  const desk = useWm((s) => s.deskSize);
  const prefs = useWidgetPrefs((s) => s.prefs);
  const update = useWidgetPrefs((s) => s.update);
  const size = sizeOf(prefs, id);
  const width = boxOf(prefs, id).w;
  const stored = prefs.pos?.[id];

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pos = clampPos(drag ?? stored ?? defaultPos(prefs, id, desk, height), desk, width, height);

  // A new size settles in from a soft blur.
  const firstSize = useRef(true);
  useLayoutEffect(() => {
    if (firstSize.current) {
      firstSize.current = false;
      return;
    }
    if (rootRef.current) widgetResize(rootRef.current, useTheme.getState().reducedMotion);
  }, [size]);

  // "Reset position" glides home instead of jumping.
  const moveFrom = useRef<Pos | null>(null);
  useLayoutEffect(() => {
    const from = moveFrom.current;
    moveFrom.current = null;
    if (from && rootRef.current) widgetMove(rootRef.current, from.x - pos.x, from.y - pos.y, useTheme.getState().reducedMotion);
  }, [pos.x, pos.y]);

  const api: ShellApi = {
    open: () => setOpen(true),
    close: () => setOpen(false),
  };

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (root && onOpened) onOpened(root);
    const onDown = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, onOpened]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, .style-pop')) return;
      const el = e.currentTarget;
      const start = { x: e.clientX, y: e.clientY };
      const origin = { x: el.offsetLeft, y: el.offsetTop };
      let moved = false;
      let last: Pos = origin;
      el.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        last = clampPos({ x: origin.x + dx, y: origin.y + dy }, useWm.getState().deskSize, width, el.offsetHeight);
        setDrag(last);
      };
      const onUp = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.removeEventListener('lostpointercapture', onUp);
        if (moved) update((p) => ({ pos: { ...p.pos, [id]: last } }));
        setDrag(null);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('lostpointercapture', onUp);
    },
    [id, update, width],
  );

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && open) {
      setOpen(false);
      btnRef.current?.focus();
    }
  };

  const resetPosition = () => {
    const el = rootRef.current;
    if (el) moveFrom.current = { x: el.offsetLeft, y: el.offsetTop };
    useWidgetPrefs.getState().resetPosition(id);
  };

  return (
    <section
      ref={rootRef}
      aria-label={label}
      className={cn('dw', className, `sz-${size}`, drag && 'dragging', open && 'menu-open')}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        setOpen(false);
        openContextMenu(
          e,
          <WidgetMenuItems
            id={id}
            label={label}
            extra={menu}
            sizeHints={sizeHints}
            customize={popLabel}
            onCustomize={() => setOpen(true)}
            onResetPosition={resetPosition}
          />,
          { label: `${label} widget` },
        );
      }}
      {...attrs}
    >
      {typeof children === 'function' ? children(api) : children}
      <button
        ref={btnRef}
        type="button"
        className="style-btn"
        aria-label={buttonLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {buttonIcon}
      </button>
      <div className="style-pop" role="dialog" aria-label={popLabel} inert={!open ? true : undefined}>
        {pop(api)}
      </div>
    </section>
  );
}

function WidgetMenuItems({
  id,
  label,
  extra,
  sizeHints,
  customize,
  onCustomize,
  onResetPosition,
}: {
  id: WidgetId;
  label: string;
  extra?: ReactNode;
  sizeHints?: Partial<Record<WidgetSize, string>>;
  customize: string;
  onCustomize(): void;
  onResetPosition(): void;
}) {
  const size = useWidgetPrefs((s) => sizeOf(s.prefs, id));
  const moved = useWidgetPrefs((s) => Boolean(s.prefs.pos?.[id]));
  const sizes = Object.keys(WIDGET_BOX[id]) as WidgetSize[];
  return (
    <>
      <MenuLabel>{label}</MenuLabel>
      <MenuSub icon={<Scaling />} label="Size">
        <MenuRadioGroup value={size} onChange={(v) => useWidgetPrefs.getState().setSize(id, v, useWm.getState().deskSize.w)}>
          {sizes.map((s) => (
            <MenuRadioItem key={s} value={s} hint={sizeHints?.[s]}>
              {SIZE_LABEL[s]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSub>
      {extra}
      <MenuSeparator />
      <MenuItem icon={<SlidersHorizontal />} onSelect={onCustomize}>
        {customize}…
      </MenuItem>
      <MenuItem icon={<Move />} disabled={!moved} onSelect={onResetPosition}>
        Reset position
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<X />} onSelect={() => removeWidget(id, label)}>
        Remove widget
      </MenuItem>
    </>
  );
}
