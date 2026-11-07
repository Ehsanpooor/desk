/**
 * The desktop widgets: clock, weather and daily horoscope. Each sits on the
 * desk under the windows, can be dragged anywhere, and remembers its place,
 * size, style and whether it is shown, per person. Hidden when the desk is
 * narrower than 1100 px.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff, Move } from 'lucide-react';
import { useSession } from '@/auth/session';
import { useTheme } from '@/theme/store';
import { MenuCheckItem, MenuItem, MenuLabel, MenuSeparator } from '../menu';
import { useWm } from '../wm/store';
import { ClockWidget } from './clock/ClockWidget';
import { HoroscopeWidget } from './horoscope/HoroscopeWidget';
import { widgetEnter, widgetExit } from './motion';
import { MIN_DESK_WIDTH, useWidgetPrefs, WIDGETS, type WidgetId } from './prefs';
import { sampleWeather } from './sample/weather';
import { WeatherWidget } from './weather/WeatherWidget';

export function DesktopWidgets() {
  const userId = useSession((s) => s.me?.user?.id ?? null);
  const deskWidth = useWm((s) => s.deskSize.w);
  const loadedFor = useWidgetPrefs((s) => s.userId);
  const load = useWidgetPrefs((s) => s.load);
  const hidden = useWidgetPrefs((s) => s.prefs.hidden);

  useEffect(() => {
    if (userId) load(userId);
  }, [userId, load]);

  if (!userId || loadedFor !== userId || deskWidth < MIN_DESK_WIDTH) return null;

  // Document order is paint order: the clock's popover opens over the weather,
  // the weather's over the horoscope, as in the prototype. The entrance runs
  // top to bottom: clock, weather, horoscope.
  return (
    <>
      <Presence show={!hidden?.horoscope} index={2}>
        <HoroscopeWidget />
      </Presence>
      <Presence show={!hidden?.weather} index={1}>
        <WeatherWidget source={sampleWeather} />
      </Presence>
      <Presence show={!hidden?.clock} index={0}>
        <ClockWidget />
      </Presence>
    </>
  );
}

/**
 * Keeps a widget mounted while it animates out, and plays its entrance when it
 * comes back (and once when the desk first appears).
 */
function Presence({ show, index, children }: { show: boolean; index: number; children: ReactNode }) {
  const [present, setPresent] = useState(show);
  const hostRef = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const first = useRef(true);
  if (show && !present) setPresent(true);

  useLayoutEffect(() => {
    const el = hostRef.current?.firstElementChild as HTMLElement | null | undefined;
    const reduced = useTheme.getState().reducedMotion;
    if (first.current) {
      first.current = false;
      if (el && show) anim.current = widgetEnter(el, index, reduced, 260);
      return;
    }
    anim.current?.cancel();
    anim.current = null;
    if (!el) return;
    if (show) {
      anim.current = widgetEnter(el, index, reduced);
    } else {
      const a = widgetExit(el, index, reduced);
      anim.current = a;
      a.finished.then(() => setPresent(false)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!present) return null;
  return (
    <div ref={hostRef} className="contents">
      {children}
    </div>
  );
}

/** The desktop menu's Widgets submenu. Ticking a widget keeps the menu open. */
export function WidgetsMenuItems() {
  const hidden = useWidgetPrefs((s) => s.prefs.hidden);
  const anyMoved = useWidgetPrefs((s) => Object.keys(s.prefs.pos ?? {}).length > 0);
  const wide = useWm((s) => s.deskSize.w >= MIN_DESK_WIDTH);
  const { setHidden, setAllHidden, resetPositions } = useWidgetPrefs.getState();
  const shown = (id: WidgetId) => !hidden?.[id];
  const allShown = WIDGETS.every((w) => shown(w.id));
  const noneShown = WIDGETS.every((w) => !shown(w.id));
  return (
    <>
      {!wide && <MenuLabel className="font-normal">Widgets appear on screens 1100 px wide or more.</MenuLabel>}
      {WIDGETS.map((w) => (
        <MenuCheckItem
          key={w.id}
          checked={shown(w.id)}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={(on) => setHidden(w.id, !on)}
        >
          {w.name}
        </MenuCheckItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<Eye />} disabled={allShown} onSelect={() => setAllHidden(false)}>
        Show all widgets
      </MenuItem>
      <MenuItem icon={<EyeOff />} disabled={noneShown} onSelect={() => setAllHidden(true)}>
        Hide all widgets
      </MenuItem>
      <MenuItem icon={<Move />} disabled={!anyMoved} onSelect={resetPositions}>
        Reset positions
      </MenuItem>
    </>
  );
}
