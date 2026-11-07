import type { ReactNode } from 'react';
import { AlertTriangle, Building2, LogIn, ShieldAlert } from 'lucide-react';
import { ElvaLogo } from '@/components/ElvaLogo';
import { Button } from '@/components/ui/button';
import { useSession } from '@/auth/session';
import { config } from '@/config';
import { Desktop } from '@/desk/Desktop';

export function App() {
  const status = useSession((s) => s.status);
  const error = useSession((s) => s.error);
  const errorKind = useSession((s) => s.errorKind);
  const endReason = useSession((s) => s.endReason);
  const me = useSession((s) => s.me);
  const beginLogin = useSession((s) => s.beginLogin);
  const switchLocation = useSession((s) => s.switchLocation);

  switch (status) {
    case 'ready':
      return <Desktop />;

    case 'booting':
      return (
        <BootCard>
          <Spinner />
          <p className="mt-4 text-sm text-ink-2">Starting ELVA Desk…</p>
        </BootCard>
      );

    case 'redirecting':
      return (
        <BootCard>
          <Spinner />
          <p className="mt-4 text-sm text-ink-2">Taking you to the ELVA account app to sign in…</p>
        </BootCard>
      );

    case 'signed-out':
      return (
        <BootCard>
          <h1 className="text-lg font-semibold">
            {endReason === 'revoked' ? 'Your session was ended' : 'You are signed out'}
          </h1>
          <p className="mt-1 text-sm text-ink-2">Sign in again to open your apps.</p>
          <Button className="mt-5" onClick={() => void beginLogin({ force: true })}>
            <LogIn /> Sign in
          </Button>
        </BootCard>
      );

    case 'org-account':
      return (
        <BootCard>
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-info-ink">
            <Building2 className="size-6" />
          </div>
          <h1 className="mt-3 text-lg font-semibold">This account manages the organization</h1>
          <p className="mt-1 text-sm text-ink-2">
            The organization account sets up people and locations in the account app. It does not open apps. Sign in as a
            person to use the desk.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button asChild>
              <a href={config.accountAppUrl}>Open the account app</a>
            </Button>
            <Button variant="outline" onClick={() => void useSession.getState().logout()}>
              Sign out
            </Button>
          </div>
        </BootCard>
      );

    case 'choose-location':
      return (
        <BootCard>
          <h1 className="text-lg font-semibold">Where are you working today?</h1>
          <p className="mt-1 text-sm text-ink-2">Your apps and permissions depend on the location.</p>
          <ul className="mt-4 grid gap-2 text-left">
            {(me?.locations ?? []).map((l) => (
              <li key={l.id}>
                <Button variant="outline" className="w-full justify-start" onClick={() => void switchLocation(l.id)}>
                  {l.name}
                </Button>
              </li>
            ))}
          </ul>
          {error && <p className="mt-3 text-sm text-danger-ink">{error}</p>}
        </BootCard>
      );

    case 'error':
    default:
      if (errorKind === 'access') {
        return (
          <BootCard>
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft text-warning-ink">
              <ShieldAlert className="size-6" />
            </div>
            <h1 className="mt-3 text-lg font-semibold">You don't have the desk here</h1>
            <p className="mt-1 text-sm text-ink-2">{error}</p>
            <p className="mt-2 text-sm text-ink-2">
              An administrator at that location can add the Desk permission to your account. You can also choose another
              location in the account app.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button asChild>
                <a href={config.accountAppUrl}>Open the account app</a>
              </Button>
              <Button variant="outline" onClick={() => void beginLogin({ force: true })}>
                Try again
              </Button>
            </div>
          </BootCard>
        );
      }
      return (
        <BootCard>
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-danger-ink">
            <AlertTriangle className="size-6" />
          </div>
          <h1 className="mt-3 text-lg font-semibold">Sign-in needed</h1>
          <p className="mt-1 text-sm text-ink-2">{error ?? 'Something went wrong.'}</p>
          <Button className="mt-5" onClick={() => void beginLogin({ force: true })}>
            <LogIn /> Try again
          </Button>
        </BootCard>
      );
  }
}

function BootCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center bg-[image:var(--desk-wallpaper)] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-surface-raised p-7 text-center shadow-3 animate-fade-in">
        <ElvaLogo className="mx-auto mb-4 size-10" />
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="mx-auto size-7 animate-spin rounded-full border-2 border-line-strong border-t-accent"
      role="status"
      aria-label="Loading"
    />
  );
}
