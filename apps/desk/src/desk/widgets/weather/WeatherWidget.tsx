import { useEffect, useRef, useState } from 'react';
import { CloudSun, Shapes } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub } from '../../menu';
import { sizeOf, useWidgetPrefs } from '../prefs';
import { WidgetShell } from '../WidgetShell';
import { attachWeatherFx, type WeatherFx } from './fx';
import {
  ICON_SETS,
  KINDS,
  LABEL,
  iconUrl,
  isIconSet,
  isWeatherKind,
  type WeatherKind,
  type WeatherSource,
} from './types';

const CloudIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z" />
  </svg>
);

const Pin = (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M6 1 11 11 6 8.5 1 11Z" />
  </svg>
);

const hourLabel = (h: number) =>
  new Date(2000, 0, 1, h).toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '');

/** The current time, refreshed every 30 minutes so the source is re-read. */
function useHalfHourNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30 * 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function WeatherWidget({ source }: { source: WeatherSource }) {
  const prefs = useWidgetPrefs((s) => s.prefs);
  const update = useWidgetPrefs((s) => s.update);
  const set = isIconSet(prefs.wxIcons) ? prefs.wxIcons : '3d';
  const preview = source.preview && isWeatherKind(prefs.wxPreview) ? prefs.wxPreview : null;
  const size = sizeOf(prefs, 'weather');
  const now = useHalfHourNow();
  const report = preview && source.preview ? source.preview(preview, now) : source.current(now);
  const { kind, night } = report;
  const heroKind: WeatherKind = night && (kind === 'sun' || kind === 'partly') ? 'moon' : kind;
  const fxKind: WeatherKind = night && kind === 'sun' ? 'moon' : kind;
  const label = night && kind === 'sun' ? 'Clear' : LABEL[kind];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLImageElement>(null);
  const fxRef = useRef<WeatherFx | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fx = attachWeatherFx(canvas);
    fxRef.current = fx;
    return () => {
      fx.dispose();
      fxRef.current = null;
    };
  }, []);

  // The sky is drawn for the card's size, so a new size redraws it.
  useEffect(() => {
    fxRef.current?.set(fxKind, night, () => {
      const hero = heroRef.current;
      if (!hero) return;
      hero.classList.remove('zap');
      void hero.offsetWidth;
      hero.classList.add('zap');
    });
  }, [fxKind, night, size]);

  const pickPreview = (k: WeatherKind) => update({ wxPreview: k });

  return (
    <WidgetShell
      id="weather"
      label="Weather"
      className={cn('dw-wx', `c-${kind}`, night && 'night')}
      sizeHints={{ large: 'with picture' }}
      buttonLabel="Weather settings"
      buttonIcon={CloudIcon}
      popLabel="Weather settings"
      menu={
        <>
          <MenuSub icon={<Shapes />} label="Icon style">
            <MenuRadioGroup value={set} onChange={(v) => update({ wxIcons: v })}>
              {ICON_SETS.map(([s, l]) => (
                <MenuRadioItem key={s} value={s}>
                  {l}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSub>
          {source.preview && (
            <MenuSub icon={<CloudSun />} label="Preview weather">
              <MenuRadioGroup
                value={preview ?? 'live'}
                onChange={(v) => update({ wxPreview: v === 'live' ? undefined : (v as WeatherKind) })}
              >
                <MenuRadioItem value="live">Live</MenuRadioItem>
                <MenuSeparator />
                {KINDS.map(([k, l]) => (
                  <MenuRadioItem key={k} value={k}>
                    {l}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuSub>
          )}
        </>
      }
      pop={({ close }) => (
        <>
          <h4>Icon style</h4>
          <div className="wx-grid">
            {ICON_SETS.map(([s, l]) => (
              <button
                key={s}
                type="button"
                className="wx-opt"
                aria-pressed={s === set}
                onClick={() => update({ wxIcons: s })}
              >
                <img alt="" src={iconUrl(s, 'partly')} />
                {l}
              </button>
            ))}
          </div>
          {source.preview && (
            <>
              <h4 className="wx-h">Preview weather</h4>
              <div className="wx-grid">
                {KINDS.map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    className="wx-opt"
                    aria-pressed={preview === k}
                    onClick={() => pickPreview(k)}
                  >
                    <img alt="" src={iconUrl(set, k)} />
                    {l}
                  </button>
                ))}
              </div>
              <div className="wx-row">
                <span>{report.sample ? 'Now: sample data' : 'Now: live'}</span>
                <button
                  type="button"
                  onClick={() => {
                    update({ wxPreview: undefined });
                    close();
                  }}
                >
                  Back to live
                </button>
              </div>
              <p className="wx-note">
                Preview is for the prototype. In the product the widget follows real weather for the practice; the
                icon style is saved per person.
              </p>
            </>
          )}
        </>
      )}
    >
      <div className="wx-card">
        <canvas ref={canvasRef} className="wx-fx" aria-hidden="true" />
        <img ref={heroRef} className="hero" alt="" data-k={heroKind} src={iconUrl(set, heroKind)} />
        <div className="city">
          {report.place} {Pin}
        </div>
        <div className="now">
          <div className="temp">{report.temp}°</div>
          <div className="cond">
            {label}
            <small>
              H:{report.high}° L:{report.low}°
            </small>
          </div>
        </div>
        <div className="hours">
          {report.hourly.map((h, i) => (
            <span key={h.hour}>
              <small>{hourLabel(h.hour)}</small>
              <img alt="" data-k={h.kind} style={{ animationDelay: `${-i * 0.7}s` }} src={iconUrl(set, h.kind)} />
              {h.temp}°
            </span>
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}
