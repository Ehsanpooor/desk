import { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { ElvaLogo } from '@/components/ElvaLogo';
import { Button } from '@/components/ui/button';
import { useSession } from '@/auth/session';
import { config } from '@/config';

/**
 * Two-tier idle lock. The soft lock hides every window behind a blur and
 * asks for a click; it protects a screen left unattended without asking for
 * a password. The hard lock ends the session and restarts the hand-off with a
 * `max_age`, so the account app asks for the password again.
 */
export function useIdleLock(): void {
  const touch = useSession((s) => s.touch);
  const setLocked = useSession((s) => s.setLocked);

  useEffect(() => {
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last > 5_000) {
        last = now;
        touch();
      }
    };
    for (const e of events) document.addEventListener(e, onActivity, { passive: true, capture: true });

    const check = () => {
      const s = useSession.getState();
      if (s.status !== 'ready') return;
      const idleMs = Date.now() - s.lastActivityAt;
      if (config.hardLockHours > 0 && idleMs > config.hardLockHours * 3_600_000) {
        void s.beginLogin({ maxAgeSeconds: 60, force: true });
        return;
      }
      if (config.softLockMinutes > 0 && !s.locked && idleMs > config.softLockMinutes * 60_000) setLocked(true);
    };
    const t = setInterval(check, 15_000);
    return () => {
      clearInterval(t);
      for (const e of events) document.removeEventListener(e, onActivity, { capture: true });
    };
  }, [touch, setLocked]);
}

export function IdleLockOverlay() {
  const locked = useSession((s) => s.locked);
  const me = useSession((s) => s.me);
  const setLocked = useSession((s) => s.setLocked);
  const touch = useSession((s) => s.touch);
  if (!locked) return null;
  const unlock = () => {
    touch();
    setLocked(false);
  };
  const name = me?.user ? [me.user.name, me.user.last_name].filter(Boolean).join(' ') : '';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Locked"
      className="fixed inset-0 z-[9700] grid place-items-center bg-overlay backdrop-blur-xl animate-fade-in"
      onPointerDown={unlock}
      onKeyDown={unlock}
    >
      <div className="w-80 rounded-2xl bg-surface-raised p-6 text-center shadow-3">
        <ElvaLogo className="mx-auto size-10" />
        <div className="mx-auto mt-4 grid size-10 place-items-center rounded-full bg-surface-mute text-ink-2">
          <Lock className="size-5" />
        </div>
        <h2 className="mt-3 text-lg font-semibold">{name || 'ELVA Desk'}</h2>
        <p className="mt-1 text-sm text-ink-2">The desk locked after {config.softLockMinutes} minutes without activity.</p>
        <Button className="mt-5 w-full" autoFocus onClick={unlock}>
          Continue
        </Button>
      </div>
    </div>
  );
}
