/**
 * One desk window: the frame the desk draws and the lifecycle of the app
 * mounted inside it. The app only ever sees the content element and a
 * `DeskContext`; everything else here is desk-owned.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { DeskAppInstance, DeskWindowStatus } from '@elva/desk-sdk';
import { createReadable } from '@elva/desk-sdk/host';
import { useSession } from '@/auth/session';
import { config } from '@/config';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { appById } from '@/registry/apps';
import { useTheme } from '@/theme/store';
import { openContextMenu } from '../menu';
import { WindowOverlay } from '../WindowOverlay';
import { closeWindow } from './actions';
import { animateAway, animateFromDock, glideRect } from './animate';
import { createWindowContext } from './context';
import { dropRect, zoneAt, type DropZone } from './geometry';
import { dispatchIntent, liveWindows, useInteraction } from './interaction';
import { loadDeskModule, RemoteLoadError } from './remote';
import { effectiveZ, useWm, type WinRecord, type WinRect } from './store';
import { WindowMenuItems } from './WindowMenu';

const log = logger.child('window');

const TITLEBAR_H = 40;

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const EDGES: { edge: Edge; className: string }[] = [
  { edge: 'n', className: '-top-0.5 right-3 left-3 h-1.5 cursor-ns-resize' },
  { edge: 's', className: 'right-3 -bottom-0.5 left-3 h-1.5 cursor-ns-resize' },
  { edge: 'e', className: 'top-3 -right-0.5 bottom-3 w-1.5 cursor-ew-resize' },
  { edge: 'w', className: 'top-3 bottom-3 -left-0.5 w-1.5 cursor-ew-resize' },
  { edge: 'ne', className: '-top-0.5 -right-0.5 size-4 cursor-nesw-resize' },
  { edge: 'nw', className: '-top-0.5 -left-0.5 size-4 cursor-nwse-resize' },
  { edge: 'se', className: '-right-0.5 -bottom-0.5 size-4 cursor-nwse-resize' },
  { edge: 'sw', className: '-bottom-0.5 -left-0.5 size-4 cursor-nesw-resize' },
];

interface Props {
  win: WinRecord;
  active: boolean;
  /** Position in the stacking order, for staggered group motion. */
  index: number;
  /** Where the window sits in "show all windows", or null. */
  ov: WinRect | null;
}

export function DeskWindow({ win, active, index, ov }: Props) {
  const def = appById(win.appId);
  const frameRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(
    createReadable<DeskWindowStatus>({
      active,
      minimized: win.minimized,
      maximized: win.maximized,
      resizing: false,
      size: { w: win.rect.w, h: win.rect.h - TITLEBAR_H },
    }),
  );
  const [resizing, setResizing] = useState(false);
  const [hidden, setHidden] = useState(win.minimized);
  const [awayHidden, setAwayHidden] = useState(false);
  const mountedIntent = useRef(win.intent);
  const desktopShown = useWm((s) => s.desktopShown);
  const away = desktopShown && !win.minimized;

  const reduced = useTheme((s) => s.reducedMotion);
  const paused = useSession((s) => s.locked);
  const busy = useInteraction((s) => s.busy);
  const wm = useWm.getState;

  // ── status readable ───────────────────────────────────────────────────────
  useEffect(() => {
    statusRef.current.set({
      active: active && !paused,
      minimized: win.minimized || paused,
      maximized: win.maximized,
      resizing,
      size: { w: win.rect.w, h: win.rect.h - TITLEBAR_H },
    });
  }, [active, paused, win.minimized, win.maximized, resizing, win.rect.w, win.rect.h]);

  // ── mount / unmount the app ───────────────────────────────────────────────
  useEffect(() => {
    if (!win.mounted || !def) return;
    const container = contentRef.current;
    const slot = slotRef.current;
    const portal = portalRef.current;
    if (!container || !slot || !portal) return;

    const controller = new AbortController();
    const inner = document.createElement('div');
    container.replaceChildren(inner);
    let instance: DeskAppInstance | null = null;
    let cancelled = false;
    const id = win.id;

    void (async () => {
      try {
        const mod = await loadDeskModule(def);
        if (cancelled) return;
        const ctx = createWindowContext({
          id,
          appId: def.id,
          container: inner,
          titlebarSlot: slot,
          portalRoot: portal,
          status: statusRef.current,
          controller,
          intent: mountedIntent.current,
        });
        const inst = await mod.mount(inner, ctx);
        if (cancelled) {
          await inst.unmount();
          return;
        }
        instance = inst;
        liveWindows.set(id, { instance: inst, manifest: mod.manifest });
        wm().setStatus(id, 'ready');
        log.info('mounted', { app: def.id, id });
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof RemoteLoadError
            ? e.message
            : e instanceof Error && e.name === 'DeskRefusedError'
              ? e.message
              : 'The app failed while starting.';
        log.error('mount failed', { app: def.id, error: e instanceof Error ? e.message : String(e) });
        wm().setStatus(id, 'failed', message);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      liveWindows.delete(id);
      const inst = instance;
      instance = null;
      inner.remove();
      // The app renders into the title bar slot and the portal root too. Let it
      // unmount first (React removes its own nodes there), then sweep whatever it
      // left. Only this mount's nodes: a remount may already be rendering here.
      const stale = [...slot.childNodes, ...portal.childNodes];
      const sweep = () => {
        for (const n of stale) n.parentNode?.removeChild(n);
      };
      if (inst) {
        Promise.resolve()
          .then(() => inst.unmount())
          .catch((e) => log.error('unmount threw', e))
          .finally(sweep);
      } else sweep();
    };
    // generation forces a remount after a failure or a dormant restore.
  }, [win.mounted, win.generation, win.id, def, wm]);

  // ── later intents ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (win.intent && win.intent !== mountedIntent.current && win.status === 'ready') {
      dispatchIntent(win.id, win.intent);
      mountedIntent.current = win.intent;
    }
  }, [win.intent, win.status, win.id]);

  // ── open / minimize / restore motion ──────────────────────────────────────
  const first = useRef(true);
  const minAnim = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    if (first.current) {
      first.current = false;
      if (!win.minimized) animateFromDock(el, win.appId, false, reduced);
      return;
    }
    minAnim.current?.cancel();
    minAnim.current = null;
    if (win.minimized) {
      const a = animateFromDock(el, win.appId, true, reduced);
      minAnim.current = a;
      a.addEventListener('finish', () => {
        setHidden(true);
        a.cancel();
      });
    } else {
      setHidden(false);
      requestAnimationFrame(() => animateFromDock(el, win.appId, false, reduced));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.minimized]);

  // ── show desktop: sweep off the nearest edge, and back ────────────────────
  const awayFirst = useRef(true);
  const awayAnim = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    if (awayFirst.current) {
      awayFirst.current = false;
      return;
    }
    awayAnim.current?.cancel();
    awayAnim.current = null;
    const el = frameRef.current;
    if (!el) return;
    const desk = useWm.getState().deskSize;
    if (away) {
      const a = animateAway(el, win.rect, desk, index, false, reduced);
      awayAnim.current = a;
      a.addEventListener('finish', () => {
        setAwayHidden(true);
        a.cancel();
      });
    } else {
      setAwayHidden(false);
      if (!win.minimized) awayAnim.current = animateAway(el, win.rect, desk, index, true, reduced);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [away]);

  // ── glide between rects when an action asks for it (snap, center, arrange) ─
  const prevRect = useRef(win.rect);
  const prevAnim = useRef(win.anim);
  useLayoutEffect(() => {
    const from = prevRect.current;
    prevRect.current = win.rect;
    if (win.anim === prevAnim.current) return;
    prevAnim.current = win.anim;
    const el = frameRef.current;
    if (el && !hidden && !awayHidden) glideRect(el, from, win.rect, win.animDelay, reduced);
  }, [win.rect, win.anim, win.animDelay, hidden, awayHidden, reduced]);

  if (!def) return null;

  // ── handlers ──────────────────────────────────────────────────────────────
  const close = () => closeWindow(win.id);
  const toggleMax = () => (win.maximized ? wm().restoreSize(win.id) : wm().toggleMaximize(win.id));

  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, a, select, textarea, [data-no-drag]')) return;
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const startRect = win.rect;
    const wasSized = win.maximized || win.snap !== null;
    const deskBox = (frameRef.current?.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? null;
    let origin: WinRect = startRect;
    let moved = false;
    let raf = 0;
    let pending: Partial<WinRect> | null = null;
    let zone: DropZone | null = null;

    const flush = () => {
      raf = 0;
      if (pending) wm().setRect(win.id, pending);
      pending = null;
    };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved) {
        moved = true;
        useInteraction.getState().setBusy('drag');
        if (wasSized) {
          const r = win.restoreRect ?? startRect;
          const rel = (start.x - startRect.x) / startRect.w;
          origin = { x: Math.round(start.x - r.w * rel), y: startRect.y, w: r.w, h: r.h };
          wm().setRect(win.id, origin);
        }
      }
      pending = { x: origin.x + dx, y: origin.y + dy };
      if (!raf) raf = requestAnimationFrame(flush);
      // Snap zones: the side edges (halves), their ends (quarters), the top (full screen).
      if (deskBox) {
        const desk = wm().deskSize;
        const z = zoneAt(ev.clientX - deskBox.left, ev.clientY - deskBox.top, desk);
        if (z !== zone) {
          zone = z;
          const cur = wm().windows[win.id];
          useInteraction.getState().setSnap(z && cur ? { rect: dropRect(z, desk), z: effectiveZ(cur) } : null);
        }
      }
    };
    const onUp = (ev: PointerEvent) => {
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', onUp);
      bar.removeEventListener('pointercancel', onUp);
    bar.removeEventListener('lostpointercapture', onUp);
      if (raf) cancelAnimationFrame(raf);
      flush();
      useInteraction.getState().setBusy(null);
      useInteraction.getState().setSnap(null);
      if (moved && zone && ev.type === 'pointerup') {
        if (zone === 'max') wm().toggleMaximize(win.id);
        else wm().snapTo(win.id, zone);
      }
    };
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', onUp);
    bar.addEventListener('pointercancel', onUp);
    bar.addEventListener('lostpointercapture', onUp);
  };

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>, edge: Edge) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    wm().focus(win.id);
    const h = e.currentTarget;
    h.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const r0 = win.rect;
    const manifestMin = liveWindows.get(win.id)?.manifest.minSize;
    const minW = Math.max(config.minWindow.w, manifestMin?.w ?? 0);
    const minH = Math.max(config.minWindow.h, manifestMin?.h ?? 0);
    useInteraction.getState().setBusy('resize');
    setResizing(true);
    let raf = 0;
    let pending: WinRect | null = null;

    const flush = () => {
      raf = 0;
      if (pending) wm().setRect(win.id, pending);
      pending = null;
    };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      let { x, y, w, h: hh } = r0;
      if (edge.includes('e')) w = r0.w + dx;
      if (edge.includes('s')) hh = r0.h + dy;
      if (edge.includes('w')) {
        w = r0.w - dx;
        x = r0.x + dx;
      }
      if (edge.includes('n')) {
        hh = r0.h - dy;
        y = r0.y + dy;
      }
      if (w < minW) {
        if (edge.includes('w')) x = r0.x + r0.w - minW;
        w = minW;
      }
      if (hh < minH) {
        if (edge.includes('n')) y = r0.y + r0.h - minH;
        hh = minH;
      }
      pending = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onUp = () => {
      h.removeEventListener('pointermove', onMove);
      h.removeEventListener('pointerup', onUp);
      h.removeEventListener('pointercancel', onUp);
    h.removeEventListener('lostpointercapture', onUp);
      if (raf) cancelAnimationFrame(raf);
      flush();
      useInteraction.getState().setBusy(null);
      setResizing(false);
    };
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
    h.addEventListener('lostpointercapture', onUp);
  };

  const overlay = win.status === 'ready' ? null : win.status;

  return (
    <section
      ref={frameRef}
      data-window={win.id}
      data-app={win.appId}
      aria-label={win.title}
      inert={win.minimized || paused || away ? true : undefined}
      data-overview={ov ? '' : undefined}
      className={cn(
        'desk-window absolute isolate flex flex-col overflow-hidden rounded-window bg-surface',
        active || ov ? 'shadow-desk-window' : 'shadow-desk-window-inactive',
        (hidden || awayHidden) && 'invisible',
        busy && 'will-change-transform',
      )}
      style={
        {
          left: win.rect.x,
          top: win.rect.y,
          width: win.rect.w,
          height: win.rect.h,
          zIndex: effectiveZ(win),
          transformOrigin: '0 0',
          transform: ov
            ? `translate(${ov.x - win.rect.x}px, ${ov.y - win.rect.y}px) scale(${ov.w / win.rect.w})`
            : undefined,
          '--ov-s': ov ? ov.w / win.rect.w : 1,
        } as CSSProperties
      }
      onPointerDownCapture={() => {
        if (!active && !ov) wm().focus(win.id);
      }}
    >
      <div
        className="desk-titlebar relative flex h-10 flex-none items-center gap-3 border-b border-line bg-[image:var(--desk-titlebar)] px-3.5 select-none"
        onPointerDown={onTitlePointerDown}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, input, a, [data-no-drag]')) toggleMax();
        }}
        onContextMenu={(e) => {
          // The app's own toolbar keeps its own right-click.
          if ((e.target as HTMLElement).closest('.desk-titlebar-slot')) return;
          openContextMenu(e, <WindowMenuItems id={win.id} />, { label: `${win.title} window` });
        }}
      >
        <div className="group/lights z-10 flex gap-2" data-no-drag>
          <Light kind="close" active={active} label="Close" onClick={close} />
          <Light kind="min" active={active} label="Minimize" onClick={() => wm().minimize(win.id)} />
          <Light kind="max" active={active} label="Zoom" onClick={toggleMax} />
        </div>
        <div
          className={cn(
            'desk-wtitle flex min-w-0 items-center gap-[7px] text-[13px] font-semibold',
            active ? 'text-desk-titlebar-ink' : 'text-desk-titlebar-ink-inactive',
          )}
        >
          <img src={def.icon} alt="" className="size-4 flex-none rounded-[4px]" draggable={false} />
          <span className="truncate">{win.title}</span>
        </div>
        <div
          ref={slotRef}
          data-elva-scope={win.appId}
          className="desk-titlebar-slot z-10 ml-auto flex h-7 max-w-[60%] flex-none items-center gap-1.5 empty:hidden"
          data-no-drag
        />
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={contentRef}
          data-elva-scope={win.appId}
          className="desk-app-container absolute inset-0 overflow-hidden bg-surface-mute"
        />
        <div
          ref={portalRef}
          data-elva-scope={win.appId}
          className="pointer-events-none absolute inset-0 z-20 [&>*]:pointer-events-auto"
        />
        {overlay && (
          <div className="absolute inset-0 z-30 bg-surface-mute">
            <WindowOverlay status={overlay} win={win} def={def} />
          </div>
        )}
      </div>

      {ov && (
        <button
          type="button"
          className="desk-ov-hit absolute inset-0 z-50 cursor-pointer rounded-window outline-none"
          aria-label={`Show ${win.title}`}
          onClick={() => wm().focus(win.id)}
        />
      )}

      {!win.maximized &&
        !ov &&
        EDGES.map(({ edge, className }) => (
          <div
            key={edge}
            className={cn('absolute z-40', className)}
            onPointerDown={(e) => onResizePointerDown(e, edge)}
          />
        ))}
    </section>
  );
}

function Light({
  kind,
  active,
  label,
  onClick,
}: {
  kind: 'close' | 'min' | 'max';
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  const color =
    kind === 'close'
      ? 'bg-desk-light-close group-hover/lights:bg-desk-light-close'
      : kind === 'min'
        ? 'bg-desk-light-min group-hover/lights:bg-desk-light-min'
        : 'bg-desk-light-max group-hover/lights:bg-desk-light-max';
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'grid size-3 place-items-center rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.18)] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1',
        active ? color : cn('bg-desk-light-idle', color.split(' ')[1]),
      )}
    >
      <svg viewBox="0 0 8 8" className="size-2 opacity-0 transition-opacity group-hover/lights:opacity-75" aria-hidden="true">
        {kind === 'close' && <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" className="text-[#4d0000]" />}
        {kind === 'min' && <path d="M1.2 4h5.6" stroke="currentColor" strokeWidth="1.3" className="text-[#5a3c00]" />}
        {kind === 'max' && <path d="M1.6 4.8V1.6h3.2zM6.4 3.2v3.2H3.2z" fill="currentColor" className="text-[#0a4d00]" />}
      </svg>
    </button>
  );
}
