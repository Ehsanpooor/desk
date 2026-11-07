/**
 * The dock. Matches the prototype's macOS-style magnification: icons near the
 * pointer grow on a cosine falloff and their neighbours spread, eased per frame.
 * Sizes are written straight to the DOM in a rAF loop, never through React state.
 */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ExternalLink, Lock, SquareArrowOutUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { cn } from '@/lib/utils';
import { APPS, canOpen, externalUrl, type DeskAppDef } from '@/registry/apps';
import { useTheme } from '@/theme/store';
import { MenuItem, MenuLabel, MenuSeparator, openContextMenu } from './menu';
import { WindowMenuItems } from './wm/WindowMenu';
import { useWm } from './wm/store';

const BASE = 54;
const MAX = 92;
const SPREAD = 150;
const EASE = 0.35;

interface Tip {
  id: string;
  name: string;
  ext: string | null;
}

export function Dock() {
  const permissions = useWm((s) => s.permissions);
  const windows = useWm((s) => s.windows);
  const open = useWm((s) => s.open);
  const me = useSession((s) => s.me);
  const reduced = useTheme((s) => s.reducedMotion);
  const locationId = me?.access?.location ?? null;
  const locationName = me?.locations.find((l) => l.id === locationId)?.name ?? 'this location';

  const navRef = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const tipFor = useRef<string | null>(null);
  const [risen, setRisen] = useState(false);
  const [bouncing, setBouncing] = useState<Record<string, number>>({});

  const sorted = [...APPS].sort((a, b) => a.order - b.order);
  const federated = sorted.filter((a) => a.mode === 'federated');
  const external = sorted.filter((a) => a.mode === 'external');

  // The dock rises on first paint, as in the prototype.
  useEffect(() => {
    const r = requestAnimationFrame(() => setRisen(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const placeTip = (el: Element | null) => {
    const t = tipRef.current;
    if (!el || !t) return;
    const r = el.getBoundingClientRect();
    t.style.left = `${r.left + r.width / 2}px`;
    t.style.top = `${r.top - 12}px`;
  };

  // Magnification loop.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let mouseX: number | null = null;
    let raf = 0;
    const sizes = new WeakMap<HTMLElement, number>();
    const items = () => [...nav.querySelectorAll<HTMLElement>('[data-dock-item]')];

    const target = (el: HTMLElement) => {
      if (mouseX === null || reduced) return BASE;
      const r = el.getBoundingClientRect();
      const d = Math.abs(mouseX - (r.left + r.width / 2));
      if (d > SPREAD) return BASE;
      const t = Math.cos((d / SPREAD) * (Math.PI / 2));
      return BASE + (MAX - BASE) * t * t;
    };

    const frame = () => {
      let moving = false;
      for (const el of items()) {
        const tgt = target(el);
        const cur = sizes.get(el) ?? BASE;
        const s = cur + (tgt - cur) * EASE;
        if (Math.abs(s - tgt) > 0.2) moving = true;
        const next = Math.abs(s - tgt) < 0.2 ? tgt : s;
        sizes.set(el, next);
        el.style.width = `${next}px`;
        el.style.height = `${next}px`;
      }
      if (tipFor.current) placeTip(nav.querySelector(`[data-dock-item="${tipFor.current}"]`));
      raf = moving || mouseX !== null ? requestAnimationFrame(frame) : 0;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      mouseX = e.clientX;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = () => {
      mouseX = null;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    nav.addEventListener('pointermove', onMove);
    nav.addEventListener('pointerleave', onLeave);
    return () => {
      nav.removeEventListener('pointermove', onMove);
      nav.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const showTip = (def: DeskAppDef, el: HTMLElement) => {
    tipFor.current = def.id;
    setTip({ id: def.id, name: def.name, ext: def.mode === 'external' && def.external ? def.external.host : null });
    placeTip(el);
  };
  const hideTip = () => {
    tipFor.current = null;
    setTip(null);
  };

  const bounce = (id: string) => {
    if (reduced) return;
    setBouncing((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 }));
    window.setTimeout(() => setBouncing((b) => ({ ...b, [id]: 0 })), 1300);
  };

  const launch = (def: DeskAppDef) => {
    hideTip();
    if (def.mode === 'federated') {
      const running = Object.values(windows).some((w) => w.appId === def.id);
      if (!running) bounce(def.id);
      open(def.id);
      return;
    }
    if (!def.external) return;
    if (!canOpen(def, permissions)) {
      toast.info(`${def.name} isn't turned on for you`, { description: `Ask an administrator at ${locationName} to add it.` });
      return;
    }
    bounce(def.id);
    const url = externalUrl(def, locationId);
    if (def.external.popup) {
      const { w, h } = def.external.popup;
      const left = Math.max(0, (screen.availWidth - w) / 2);
      const top = Math.max(0, (screen.availHeight - h) / 2);
      window.open(url, `elva-${def.id}`, `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
    } else {
      window.open(url, `elva-${def.id}`, 'noopener');
    }
  };

  const item = (def: DeskAppDef) => {
    const win = Object.values(windows).find((w) => w.appId === def.id);
    return (
      <DockItem
        key={def.id}
        def={def}
        running={Boolean(win)}
        badge={win?.badge ?? 0}
        bouncing={(bouncing[def.id] ?? 0) > 0}
        onLaunch={() => launch(def)}
        onShowTip={(el) => showTip(def, el)}
        onHideTip={hideTip}
        onMenu={(e) => {
          hideTip();
          const r = e.currentTarget.getBoundingClientRect();
          openContextMenu(
            e,
            <DockMenuItems def={def} allowed={canOpen(def, permissions)} onLaunch={() => launch(def)} />,
            { label: `${def.name} in the dock`, at: { x: r.left + r.width / 2, y: r.top }, side: 'top', align: 'center' },
          );
        }}
      />
    );
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-2.5 z-[8000] flex justify-center">
        <nav
          ref={navRef}
          aria-label="ELVA apps"
          data-hidden={risen ? undefined : ''}
          className="desk-dock pointer-events-auto flex items-end gap-1.5 rounded-[22px] bg-(--desk-dock-glass) px-2.5 pb-2 shadow-(--desk-dock-shadow) backdrop-blur-[26px] backdrop-saturate-[1.7]"
        >
          {federated.map(item)}
          {external.length > 0 && (
            <div aria-hidden="true" className="mx-1.5 mb-[3px] h-[calc(var(--desk-dock-size)-6px)] w-px self-end bg-(--desk-dock-sep)" />
          )}
          {external.map(item)}
        </nav>
      </div>
      <div
        ref={tipRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed z-[9500] -translate-x-1/2 -translate-y-full rounded-[8px] bg-(--desk-tip-bg) px-2.5 py-[5px] text-[13px] font-medium whitespace-nowrap text-(--desk-tip-ink) shadow-(--desk-tip-shadow)',
          tip ? 'opacity-100' : 'opacity-0',
        )}
      >
        {tip?.name}
        {tip?.ext && <span className="ml-1.5 font-normal text-(--desk-tip-ink-2)">{tip.ext} ↗</span>}
      </div>
    </>
  );
}

function DockItem({
  def,
  running,
  badge,
  bouncing,
  onLaunch,
  onShowTip,
  onHideTip,
  onMenu,
}: {
  def: DeskAppDef;
  running: boolean;
  badge: number;
  bouncing: boolean;
  onLaunch: () => void;
  onShowTip: (el: HTMLElement) => void;
  onHideTip: () => void;
  onMenu: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const prevBadge = useRef(badge);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (badge > prevBadge.current && prevBadge.current > 0) setBump((n) => n + 1);
    prevBadge.current = badge;
  }, [badge]);

  const label = def.name + (badge ? `, ${badge} new` : '') + (def.mode === 'external' ? ' (opens in a new window)' : '');

  return (
    <button
      type="button"
      data-dock-item={def.id}
      aria-label={label}
      onClick={onLaunch}
      onContextMenu={onMenu}
      onMouseEnter={(e) => onShowTip(e.currentTarget)}
      onMouseLeave={onHideTip}
      onFocus={(e) => onShowTip(e.currentTarget)}
      onBlur={onHideTip}
      className={cn(
        'desk-dock-item group relative flex size-(--desk-dock-size) flex-col items-center p-0 outline-none',
        bouncing && 'is-bouncing',
      )}
    >
      <img
        src={def.icon}
        alt=""
        draggable={false}
        className="desk-dock-icon block size-full group-focus-visible:rounded-[14px] group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-focus-ring"
      />
      <span
        key={bump}
        aria-hidden="true"
        data-show={badge > 0 ? '' : undefined}
        data-bump={bump > 0 ? '' : undefined}
        className="desk-dock-badge pointer-events-none absolute -top-[5px] -right-[5px] grid h-5 min-w-5 place-items-center rounded-[10px] bg-desk-badge px-1.5 text-xs leading-none font-semibold tracking-normal text-white tabular-nums shadow-(--desk-badge-ring)"
      >
        {badge > 99 ? '99+' : badge || ''}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute -bottom-1.5 size-1 rounded-full bg-(--desk-dock-dot) transition-opacity duration-200',
          running ? 'opacity-80' : 'opacity-0',
        )}
      />
    </button>
  );
}

/** Right-click on a dock icon: the app's window actions, or how to open it. */
function DockMenuItems({ def, allowed, onLaunch }: { def: DeskAppDef; allowed: boolean; onLaunch: () => void }) {
  const winId = useWm((s) => Object.values(s.windows).find((w) => w.appId === def.id)?.id ?? null);
  if (def.mode === 'external') {
    return (
      <>
        <MenuLabel>{def.name}</MenuLabel>
        <MenuItem icon={<ExternalLink />} disabled={!allowed} onSelect={onLaunch}>
          Open in a new window
        </MenuItem>
        {!allowed && <NotOnForYou />}
      </>
    );
  }
  if (!winId) {
    return (
      <>
        <MenuLabel>{def.name}</MenuLabel>
        <MenuItem icon={<SquareArrowOutUpRight />} onSelect={onLaunch}>
          Open
        </MenuItem>
        {!allowed && <NotOnForYou />}
      </>
    );
  }
  return (
    <>
      <MenuLabel>{def.name}</MenuLabel>
      <MenuItem icon={<SquareArrowOutUpRight />} onSelect={() => useWm.getState().open(def.id)}>
        Show window
      </MenuItem>
      <MenuSeparator />
      <WindowMenuItems id={winId} compact />
    </>
  );
}

function NotOnForYou() {
  return (
    <>
      <MenuSeparator />
      <MenuLabel className="flex items-center gap-1.5 font-normal">
        <Lock className="size-3" /> Not turned on for you here
      </MenuLabel>
    </>
  );
}
