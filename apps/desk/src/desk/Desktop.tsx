/**
 * The desk: wallpaper, menu bar, windows, dock. Also the place where the
 * session, theme and window manager are wired together, and where the
 * desk-wide layers live: the right-click menu, the snap preview, the
 * "show all windows" overview and the "show desktop" pill.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toDeskSession, useSession } from '@/auth/session';
import { bus } from '@/events/bus';
import { tokenStore } from '@/api/tokens';
import { appById } from '@/registry/apps';
import { themeReadable } from '@/theme/store';
import { DesktopMenuItems } from './DesktopMenu';
import { Dock } from './Dock';
import { IdleLockOverlay, useIdleLock } from './IdleLock';
import { Launcher } from './Launcher';
import { alt, ContextMenuHost, isEditable, isMac, openContextMenu } from './menu';
import { MenuBar } from './MenuBar';
import { StickyNotesLayer, StickyNotesMenu } from './notes';
import { DesktopWidgets } from './widgets';
import { closeWindow } from './wm/actions';
import { DeskWindow } from './wm/DeskWindow';
import { overviewLayout, type WinRect } from './wm/geometry';
import { sessionReadable } from './wm/context';
import { useInteraction } from './wm/interaction';
import { selectOrdered, useWm, type WinRecord } from './wm/store';

export function Desktop() {
  const me = useSession((s) => s.me);
  // selectOrdered builds a new array each call; compare it shallowly or React loops.
  const windows = useWm(useShallow(selectOrdered));
  const activeId = useWm((s) => s.activeId);
  const overview = useWm((s) => s.overview);
  const desk = useWm((s) => s.deskSize);
  const busy = useInteraction((s) => s.busy);
  const deskRef = useRef<HTMLElement>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const userId = me?.user?.id ?? null;

  useIdleLock();

  const layout = useMemo(
    () =>
      overview
        ? overviewLayout(
            windows.filter((w) => !w.minimized).map((w) => ({ id: w.id, rect: w.rect })),
            desk,
          )
        : null,
    [overview, windows, desk],
  );

  // Desk size follows the element, not the viewport.
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) useWm.getState().setDeskSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Session → apps: readable, permissions, location change event.
  const lastLocation = useRef<string | null>(null);
  useEffect(() => {
    const session = toDeskSession(me);
    sessionReadable.set(session);
    useWm.getState().setPermissions(session?.access.permissions ?? []);
    const loc = session?.location.id ?? null;
    if (loc && lastLocation.current && loc !== lastLocation.current) bus.emit('location:changed', { locationId: loc });
    lastLocation.current = loc;
  }, [me]);

  // Restore the user's windows once, then persist on every change.
  const hydrated = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || hydrated.current === userId) return;
    hydrated.current = userId;
    useWm.getState().hydrate(userId);
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let t = 0;
    const unsub = useWm.subscribe(() => {
      window.clearTimeout(t);
      t = window.setTimeout(() => useWm.getState().persist(userId), 300);
    });
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, [userId]);

  // Theme events, visibility, token upkeep, dormancy.
  useEffect(() => {
    const offTheme = themeReadable.subscribe((t) => bus.emit('theme:changed', t));
    const onVisibility = () => {
      bus.emit('desk:visibility', { hidden: document.hidden });
      if (!document.hidden && tokenStore.isNearExpiry()) void useSession.getState().refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const upkeep = setInterval(() => {
      if (tokenStore.isNearExpiry()) void useSession.getState().refresh();
      useWm.getState().tick();
    }, 60_000);
    return () => {
      offTheme();
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(upkeep);
    };
  }, []);

  // Tell apps when the session ends.
  useEffect(() => {
    return () => {
      const reason = useSession.getState().endReason ?? 'logout';
      bus.emit('session:ended', { reason });
    };
  }, []);

  // Desk shortcuts. The browser owns Ctrl/Cmd+W, so window commands use Alt
  // (⌥ on a Mac). Keys are matched by position so ⌥ letters work on a Mac too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const wm = useWm.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        setLauncherOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape' && wm.overview) {
        e.preventDefault();
        wm.setOverview(false);
        return;
      }
      if (!e.altKey || mod || e.defaultPrevented) return;
      // In a text field ⌥ types characters on a Mac and moves by word with the arrows.
      if (isMac && isEditable(e.target)) return;
      const id = wm.activeId;
      const win = id ? wm.windows[id] : undefined;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      switch (e.code) {
        case 'KeyW':
          if (id) run(() => closeWindow(id));
          break;
        case 'KeyM':
          if (id) run(() => wm.minimize(id));
          break;
        case 'KeyC':
          if (id) run(() => wm.center(id));
          break;
        case 'ArrowLeft':
          if (id) run(() => wm.snapTo(id, 'left'));
          break;
        case 'ArrowRight':
          if (id) run(() => wm.snapTo(id, 'right'));
          break;
        case 'ArrowUp':
          if (win && !win.maximized) run(() => wm.toggleMaximize(win.id));
          break;
        case 'ArrowDown':
          if (win) run(() => (win.maximized || win.snap ? wm.restoreSize(win.id) : wm.minimize(win.id)));
          break;
        case 'KeyD':
          run(() => wm.toggleDesktop());
          break;
        case 'KeyA':
          run(() => wm.setOverview(!wm.overview));
          break;
        case 'Backquote':
          run(() => wm.cycle(e.shiftKey ? -1 : 1));
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider>
      <div className="fixed inset-0 bg-[image:var(--desk-wallpaper)]" aria-hidden="true">
        <svg className="absolute bottom-0 left-0 h-[55%] w-full opacity-60" viewBox="0 0 1440 600" preserveAspectRatio="none">
          <path d="M0 330C220 250 420 260 640 320s470 90 800-30V600H0Z" fill="var(--desk-wallpaper-wave)" />
          <path d="M0 420c260-70 520-40 760 10s450 40 680-40V600H0Z" fill="var(--desk-wallpaper-wave)" />
        </svg>
      </div>

      <MenuBar onOpenLauncher={() => setLauncherOpen(true)} rightSlot={<StickyNotesMenu />} />

      <main
        ref={deskRef}
        data-overview={overview ? '' : undefined}
        className="fixed inset-x-0 top-(--desk-menubar-h) bottom-0 z-[1]"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) useWm.getState().blurAll();
        }}
        onContextMenu={(e) => {
          // Only the bare desktop: windows, widgets and notes have their own menus.
          if (e.target !== e.currentTarget) return;
          const box = e.currentTarget.getBoundingClientRect();
          openContextMenu(
            e,
            <DesktopMenuItems
              at={{ x: e.clientX - box.left, y: e.clientY - box.top }}
              onOpenLauncher={() => setLauncherOpen(true)}
            />,
            { label: 'Desktop' },
          );
        }}
      >
        {/* Widgets sit at z 0, notes at z 5 (and 7000 when pinned on top), windows from z 11. */}
        <DesktopWidgets />
        <StickyNotesLayer />
        <OverviewBackdrop show={overview} />
        <SnapPreview />
        {windows.map((w, i) => (
          <DeskWindow key={w.id} win={w} active={w.id === activeId} index={i} ov={layout?.[w.id] ?? null} />
        ))}
        {layout && <OverviewLabels layout={layout} windows={windows} />}
        <DesktopShownPill />
        {/* Pointer shield while dragging or resizing: above windows and pinned notes.
            A real drag holds pointer capture, so a press that reaches the shield means
            the drag already ended: clear it. */}
        {busy && (
          <div
            className="absolute inset-0 z-[7500] cursor-default"
            aria-hidden="true"
            onPointerDown={() => {
              useInteraction.getState().setBusy(null);
              useInteraction.getState().setSnap(null);
            }}
          />
        )}
      </main>

      <Dock />
      <Launcher open={launcherOpen} onOpenChange={setLauncherOpen} />
      <ConfirmClose />
      <IdleLockOverlay />
      <ContextMenuHost />
      <Toaster />
    </TooltipProvider>
  );
}

/** Where a dragged window will land: drawn just under it, gliding between zones. */
function SnapPreview() {
  const snap = useInteraction((s) => s.snap);
  const last = useRef(snap);
  if (snap) last.current = snap;
  const shown = snap ?? last.current;
  return (
    <div
      aria-hidden="true"
      className="desk-snap"
      data-show={snap ? '' : undefined}
      style={
        shown
          ? { left: shown.rect.x, top: shown.rect.y, width: shown.rect.w, height: shown.rect.h, zIndex: shown.z }
          : { display: 'none' }
      }
    />
  );
}

/** Dims the desktop behind the overview; a click on it goes back. */
function OverviewBackdrop({ show }: { show: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="desk-ov-backdrop"
      data-show={show ? '' : undefined}
      onPointerDown={() => useWm.getState().setOverview(false)}
    />
  );
}

function OverviewLabels({ layout, windows }: { layout: Record<string, WinRect>; windows: WinRecord[] }) {
  return (
    <>
      {windows.map((w, i) => {
        const r = layout[w.id];
        const def = appById(w.appId);
        if (!r) return null;
        return (
          <div
            key={w.id}
            aria-hidden="true"
            className="desk-ov-label"
            style={{ left: r.x + r.w / 2, top: r.y + r.h + 12, animationDelay: `${140 + i * 30}ms` }}
          >
            {def && <img src={def.icon} alt="" className="size-4 rounded-[4px]" draggable={false} />}
            <span className="truncate">{w.title}</span>
          </div>
        );
      })}
    </>
  );
}

/** While "show desktop" is on: how many windows are tucked away, and the way back. */
function DesktopShownPill() {
  const shown = useWm((s) => s.desktopShown);
  const count = useWm((s) => Object.values(s.windows).filter((w) => !w.minimized).length);
  return (
    <div className="desk-pill" data-show={shown ? '' : undefined} inert={!shown ? true : undefined} role="status">
      <span>
        {count} {count === 1 ? 'window' : 'windows'} tucked away
      </span>
      <button type="button" onClick={() => useWm.getState().toggleDesktop(false)}>
        Bring back
        <kbd>{alt('D')}</kbd>
      </button>
    </div>
  );
}

function ConfirmClose() {
  const pendingId = useWm((s) => s.pendingCloseId);
  const win = useWm((s) => (s.pendingCloseId ? s.windows[s.pendingCloseId] : undefined));
  const cancel = useWm((s) => s.cancelClose);
  const close = useWm((s) => s.close);
  const name = win ? (appById(win.appId)?.name ?? win.title) : '';
  return (
    <Dialog open={Boolean(pendingId)} onOpenChange={(o) => !o && cancel()}>
      <DialogContent showClose={false}>
        <DialogHeader>
          <DialogTitle>Close {name}?</DialogTitle>
          <DialogDescription>{name} has unsaved changes. If you close it now they will be lost.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={cancel}>
            Keep open
          </Button>
          <Button variant="destructive" onClick={() => pendingId && close(pendingId)}>
            Close anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
