/**
 * Desk-owned pages shown over a window's content: skeleton while loading,
 * the failure page, and the locked page for an app not permitted here.
 */
import { AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/auth/session';
import { config } from '@/config';
import type { DeskAppDef } from '@/registry/apps';
import { useWm, type WinRecord, type WinStatus } from './wm/store';

export function WindowOverlay({ status, win, def }: { status: Exclude<WinStatus, 'ready'>; win: WinRecord; def: DeskAppDef }) {
  if (status === 'locked') return <LockedPage def={def} />;
  if (status === 'failed') return <FailurePage win={win} def={def} />;
  return <Skeleton />;
}

function Skeleton() {
  return (
    <div className="animate-fade-in max-w-[1100px] p-7" aria-busy="true" aria-label="Loading">
      <div className="desk-skeleton h-6 w-44 rounded-md" />
      <div className="desk-skeleton mt-2.5 mb-5 h-3 w-72 rounded-md" />
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg bg-surface p-4 shadow-1">
            <div className="desk-skeleton h-2.5 w-24 rounded-md" />
            <div className="desk-skeleton mt-2.5 h-6 w-16 rounded-md" />
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-surface p-4 shadow-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="desk-skeleton my-3 h-3.5 rounded-md" />
        ))}
      </div>
    </div>
  );
}

function FailurePage({ win, def }: { win: WinRecord; def: DeskAppDef }) {
  const retry = useWm((s) => s.retry);
  const close = useWm((s) => s.close);
  return (
    <div className="grid h-full place-items-center p-10">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger-ink">
          <AlertTriangle className="size-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{def.name} couldn't load</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{win.error ?? 'Something went wrong while starting the app.'}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => retry(win.id)}>
            <RefreshCw /> Retry
          </Button>
          <Button variant="outline" onClick={() => close(win.id)}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function LockedPage({ def }: { def: DeskAppDef }) {
  const me = useSession((s) => s.me);
  const location = me?.locations.find((l) => l.id === me.access?.location)?.name ?? 'this location';
  return (
    <div className="grid h-full place-items-center p-10">
      <div className="max-w-md text-center">
        <img src={def.icon} alt="" className="mx-auto size-24 drop-shadow-[0_10px_18px_rgb(60_40_120/0.18)]" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{def.name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          {def.name} isn't turned on for you at {location}. An administrator can add it to your account in the ELVA
          account app, or the ELVA team can set it up for your practice.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button asChild>
            <a href={config.accountAppUrl} target="_blank" rel="noopener">
              <Lock /> Open the account app
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="https://cal.com/elva-ai/discovery" target="_blank" rel="noopener">
              Talk to the ELVA team
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
