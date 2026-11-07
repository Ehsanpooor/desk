/**
 * The two sticky-note layers inside the desk area: `base` (z 5, on the
 * desktop behind windows) and `top` (z 7000, above windows). Also owns the
 * ⌥N shortcut and the hide/show motion: hidden notes fly into the menu bar's
 * notes button and fly back out of it.
 *
 * Mount it inside the desk area element (the `main` that holds the windows).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSession } from '@/auth/session';
import { cn } from '@/lib/utils';
import { useTheme } from '@/theme/store';
import { useWm } from '../wm/store';
import { StickyNote } from './StickyNote';
import { useNotes } from './store';

/** The point notes fly to when hidden: the menu bar's notes button. */
function homePoint(): { x: number; y: number } | null {
  const r = document.querySelector('[data-notes-button]')?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

function fly(els: HTMLElement[], out: boolean, reduced: boolean): Animation[] {
  const home = homePoint();
  return els.map((el, i) => {
    if (reduced || !home) {
      const frames = [{ opacity: 1 }, { opacity: 0 }];
      return el.animate(out ? frames : frames.reverse(), { duration: 160, fill: out ? 'forwards' : 'backwards' });
    }
    const r = el.getBoundingClientRect();
    const s = 0.06;
    // A note scales from its top-left corner: land its centre on the button.
    const dx = home.x - r.left - (r.width * s) / 2;
    const dy = home.y - r.top - (r.height * s) / 2;
    const tilt = (i % 2 ? 1 : -1) * (5 + (i % 3) * 3);
    const far: Keyframe = { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(${tilt}deg)`, opacity: 0, filter: 'blur(3px)' };
    const rest: Keyframe = { transform: 'none', opacity: 1, filter: 'blur(0px)' };
    if (out) {
      return el.animate([rest, { transform: 'translateY(-6px) scale(1.035)', opacity: 1, filter: 'blur(0px)', offset: 0.2 }, far], {
        duration: 560,
        delay: i * 40,
        easing: 'cubic-bezier(0.55, 0, 0.8, 0.25)',
        fill: 'forwards',
      });
    }
    return el.animate([far, { transform: 'translateY(-5px) scale(1.03)', opacity: 1, filter: 'blur(0px)', offset: 0.78 }, rest], {
      duration: 700,
      delay: i * 45,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'backwards',
    });
  });
}

export function StickyNotesLayer() {
  const userId = useSession((s) => s.me?.user?.id ?? null);
  const locationId = useSession((s) => s.me?.access?.location ?? null);
  const desk = useWm((s) => s.deskSize);
  const notes = useNotes((s) => s.notes);
  const key = useNotes((s) => s.key);
  const hidden = useNotes((s) => s.hidden);
  const arranging = useNotes((s) => s.arranging);
  const entering = useNotes((s) => s.entering);
  const leaving = useNotes((s) => s.leaving);
  const focusId = useNotes((s) => s.focusId);
  const baseRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // One store of notes per person and location.
  useEffect(() => {
    useNotes.getState().load(userId && locationId ? `elva:desk:notes:${userId}:${locationId}` : null);
  }, [userId, locationId]);

  // Never lose the last keystrokes when the tab closes.
  useEffect(() => {
    const flush = () => useNotes.getState().flush();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  // ⌥N anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyN') {
        e.preventDefault();
        useNotes.getState().add(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── hide / show motion ────────────────────────────────────────────────────
  const [layerHidden, setLayerHidden] = useState(hidden);
  const prev = useRef({ hidden, key });
  const running = useRef<Animation[]>([]);
  const pendingShow = useRef(false);
  const noteEls = () =>
    [...(baseRef.current?.children ?? []), ...(topRef.current?.children ?? [])].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );

  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = { hidden, key };
    if (was.hidden === hidden && was.key === key) return;
    for (const a of running.current) a.cancel();
    running.current = [];
    // A different person or location: no motion, just the saved state.
    if (was.key !== key) {
      setLayerHidden(hidden);
      return;
    }
    const reduced = useTheme.getState().reducedMotion;
    if (hidden) {
      const anims = fly(noteEls(), true, reduced);
      running.current = anims;
      if (!anims.length) return setLayerHidden(true);
      Promise.all(anims.map((a) => a.finished))
        .then(() => {
          setLayerHidden(true);
          for (const a of anims) a.cancel();
          running.current = [];
        })
        .catch(() => {});
    } else if (layerHidden) {
      pendingShow.current = true;
      setLayerHidden(false);
    } else {
      running.current = fly(noteEls(), false, reduced);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, key]);

  useLayoutEffect(() => {
    if (layerHidden || !pendingShow.current) return;
    pendingShow.current = false;
    running.current = fly(noteEls(), false, useTheme.getState().reducedMotion);
  }, [layerHidden]);

  const all = notes.map((n, i) => ({ n, i }));
  const render = (top: boolean) =>
    all
      .filter(({ n }) => n.top === top)
      .map(({ n, i }) => (
        <StickyNote
          key={n.id}
          note={n}
          desk={desk}
          index={i}
          entering={entering.includes(n.id)}
          leaving={leaving.includes(n.id)}
          focus={focusId === n.id}
        />
      ));

  return (
    <>
      <div ref={baseRef} className={cn('sn-layer base', layerHidden && 'hidden', arranging && 'arranging')}>
        {render(false)}
      </div>
      <div ref={topRef} className={cn('sn-layer top', layerHidden && 'hidden', arranging && 'arranging')}>
        {render(true)}
      </div>
    </>
  );
}
