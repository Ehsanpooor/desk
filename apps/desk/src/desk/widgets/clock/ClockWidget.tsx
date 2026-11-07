import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { MenuRadioGroup, MenuRadioItem, MenuSub } from '../../menu';
import { useWidgetPrefs, type ClockStyle } from '../prefs';
import { WidgetShell } from '../WidgetShell';
import { CLOCK_STYLES, ClockFace, isClockStyle } from './faces';

/** The moment every style preview shows: 10:09:32, the watchmaker's pose. */
const SAMPLE = new Date(2026, 10, 5, 10, 9, 32);

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t = 0;
    const tick = () => {
      setNow(new Date());
      t = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    t = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(t);
  }, []);
  return now;
}

const PaletteIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="13.5" cy="6.5" r=".5" />
    <circle cx="17.5" cy="10.5" r=".5" />
    <circle cx="8.5" cy="7.5" r=".5" />
    <circle cx="6.5" cy="12.5" r=".5" />
    <path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-.5a2 2 0 0 1 2-2h1.5A4.5 4.5 0 0 0 22 13a10 10 0 0 0-10-11Z" />
  </svg>
);

export function ClockWidget() {
  const now = useNow();
  const saved = useWidgetPrefs((s) => s.prefs.clockStyle);
  const update = useWidgetPrefs((s) => s.update);
  const style = isClockStyle(saved) ? saved : 'classic';

  return (
    <WidgetShell
      id="clock"
      label="Clock"
      className="dw-clock"
      buttonLabel="Change clock style"
      buttonIcon={PaletteIcon}
      popLabel="Clock style"
      menu={<ClockMenu style={style} />}
      pop={({ close }) => (
        <>
          <h4>Clock style</h4>
          <div className="style-grid">
            {CLOCK_STYLES.map(([k, name]) => (
              <button
                key={k}
                type="button"
                className="style-opt"
                aria-pressed={k === style}
                onClick={() => {
                  update({ clockStyle: k });
                  close();
                }}
              >
                <span className="mini">
                  <span>
                    <ClockFace style={k} date={SAMPLE} />
                  </span>
                </span>
                {name}
              </button>
            ))}
          </div>
        </>
      )}
    >
      <div className="face-host">
        <ClockFace style={style} date={now} />
      </div>
    </WidgetShell>
  );
}

function ClockMenu({ style }: { style: ClockStyle }) {
  return (
    <MenuSub icon={<Palette />} label="Style">
      <MenuRadioGroup value={style} onChange={(v) => useWidgetPrefs.getState().update({ clockStyle: v })}>
        {CLOCK_STYLES.map(([k, name]) => (
          <MenuRadioItem key={k} value={k}>
            {name}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </MenuSub>
  );
}
