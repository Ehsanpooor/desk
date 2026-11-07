import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, LayoutGrid, Monitor, Moon, Sun } from 'lucide-react';
import { ElvaLogo } from '@/components/ElvaLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/auth/session';
import { config } from '@/config';
import { cn, initials } from '@/lib/utils';
import { appById } from '@/registry/apps';
import { useTheme } from '@/theme/store';
import { AppearancePanel } from './AppearanceMenu';
import { alt } from './menu';
import { closeAllWindows } from './wm/actions';
import { AllWindowsItems, WindowMenuItems } from './wm/WindowMenu';
import { useWm } from './wm/store';

/** The prototype's `.mb-btn`: 22 px, radius 6, subtle hover, darker while open. */
export const menuButton =
  "inline-flex h-[22px] items-center gap-[5px] rounded-[6px] px-[7px] text-[13px] font-medium text-(--desk-menu-ink) outline-none hover:bg-(--desk-mb-hover) focus-visible:outline-2 focus-visible:outline-focus-ring aria-expanded:bg-(--desk-mb-active) data-[state=open]:bg-(--desk-mb-active) [&_svg:not([class*='size-'])]:size-[15px]";

export function MenuBar({ onOpenLauncher, rightSlot }: { onOpenLauncher: () => void; rightSlot?: ReactNode }) {
  const me = useSession((s) => s.me);
  const activeId = useWm((s) => s.activeId);
  const windows = useWm((s) => s.windows);
  const active = activeId ? windows[activeId] : null;
  const activeName = active ? (appById(active.appId)?.name ?? 'ELVA') : 'ELVA';
  const locationName = me?.locations.find((l) => l.id === me.access?.location)?.name ?? '';

  return (
    <header
      role="menubar"
      className="fixed inset-x-0 top-0 z-[9000] flex h-(--desk-menubar-h) items-center border-b border-desk-glass-line bg-desk-glass px-3.5 text-[13px] text-desk-glass-ink shadow-(--desk-glass-shadow) backdrop-blur-[24px] backdrop-saturate-[1.6]"
    >
      <ElvaLogo className="block size-[17px] flex-none" />
      <div className="ml-[11px] flex items-center gap-1">
        <span className="px-[7px] font-bold">{activeName}</span>
        <WindowMenu />
        <HelpMenu />
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-0.5">
        {rightSlot}
        <button type="button" className={menuButton} onClick={onOpenLauncher} aria-label="Open the app launcher (Ctrl K)" title="Apps">
          <LayoutGrid />
        </button>
        <ThemeMenu />
        <LocationMenu locationName={locationName} />
        <Clock />
        <UserMenu />
      </div>
    </header>
  );
}

function WindowMenu() {
  const activeId = useWm((s) => s.activeId);
  const count = useWm((s) => Object.keys(s.windows).length);
  const wm = useWm.getState;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={menuButton}>Window</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        {activeId ? (
          <WindowMenuItems id={activeId} compact />
        ) : (
          <DropdownMenuLabel className="font-normal">No window is active</DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <AllWindowsItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={count < 2} onSelect={() => wm().cycle(1)}>
          Next window <DropdownMenuShortcut>{alt('`')}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={count === 0} onSelect={closeAllWindows}>
          Close all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HelpMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={menuButton}>Help</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>ELVA Desk {config.version}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={config.accountAppUrl} target="_blank" rel="noopener">
            Account settings
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="https://cal.com/elva-ai/discovery" target="_blank" rel="noopener">
            Talk to the ELVA team
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LocationMenu({ locationName }: { locationName: string }) {
  const me = useSession((s) => s.me);
  const switchLocation = useSession((s) => s.switchLocation);
  const [busy, setBusy] = useState(false);
  const current = me?.access?.location ?? null;
  const locations = me?.locations ?? [];
  if (!locations.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(menuButton, 'ml-2.5 max-w-64 gap-1.5 px-2')} disabled={busy} aria-label="Switch location">
        <span className="truncate">{locationName || 'Choose a location'}</span>
        <ChevronDown className="size-2.5 flex-none stroke-[2.5]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Location</DropdownMenuLabel>
        {locations.map((l) => (
          <DropdownMenuItem
            key={l.id}
            onSelect={async () => {
              if (l.id === current) return;
              setBusy(true);
              await switchLocation(l.id);
              setBusy(false);
            }}
          >
            <span className="flex-1 truncate">{l.name}</span>
            {l.id === current && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeMenu() {
  const mode = useTheme((s) => s.mode);
  const resolved = useTheme((s) => s.resolved);
  const Icon = mode === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={menuButton} aria-label="Appearance and theme" title="Appearance">
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[312px]">
        <AppearancePanel />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Clock() {
  const me = useSession((s) => s.me);
  const tz = me?.locations.find((l) => l.id === me.access?.location)?.timezone ?? undefined;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  // The prototype's format: "Sat, Nov 7  12:51 PM", in the clinic's timezone.
  const zone = tz || undefined;
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: zone });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone });
  return (
    <span className="ml-3.5 font-medium whitespace-pre tabular-nums">
      {date}
      {'  '}
      {time}
    </span>
  );
}

function UserMenu() {
  const me = useSession((s) => s.me);
  const logout = useSession((s) => s.logout);
  const logoutAll = useSession((s) => s.logoutAll);
  const user = me?.user;
  const name = user ? [user.name, user.last_name].filter(Boolean).join(' ') : '';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="ml-4 grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-ink-on-accent outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        aria-label="Account"
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="size-full rounded-full object-cover" />
        ) : (
          initials(name || user?.email || '?')
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="truncate text-[13px] font-semibold text-ink-0">{name}</div>
          <div className="truncate font-normal">{user?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={config.accountAppUrl} target="_blank" rel="noopener">
            Account settings
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>Sign out</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => void logoutAll()}>
          Sign out everywhere
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
