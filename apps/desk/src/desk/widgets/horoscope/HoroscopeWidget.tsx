import { useCallback, useEffect, useState } from 'react';
import { Image, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub } from '../../menu';
import { useWidgetPrefs, type HoroscopeArt } from '../prefs';
import { WidgetShell } from '../WidgetShell';
import { ARTS, SIGNS, artUrl, isSignId, reading, sunSign, ymd, type Sign } from './data';

const StarIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l2.4 5.6 6.1.5-4.6 4 1.4 5.9L12 16l-5.3 3 1.4-5.9-4.6-4 6.1-.5Z" />
  </svg>
);

/** Today's date key, refreshed shortly after midnight. */
function useToday(): string {
  const [day, setDay] = useState(() => ymd(new Date()));
  useEffect(() => {
    const t = window.setInterval(() => setDay(ymd(new Date())), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return day;
}

export function HoroscopeWidget() {
  const prefs = useWidgetPrefs((s) => s.prefs);
  const update = useWidgetPrefs((s) => s.update);
  const [offset, setOffset] = useState<0 | 1>(0);
  useToday(); // re-renders after midnight

  const chosen = isSignId(prefs.sign) ? prefs.sign : null;
  const art = prefs.hsArt === 'origami' ? 'origami' : 'portraits';
  const signId = chosen ?? sunSign(new Date());
  const sign = SIGNS.find((s) => s.id === signId) ?? (SIGNS[0] as Sign);
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const r = reading(sign.id, date);

  const focusSign = useCallback((root: HTMLElement) => {
    root.querySelector<HTMLElement>('.hs-opt[aria-pressed="true"], .hs-opt')?.focus({ preventScroll: true });
  }, []);

  return (
    <WidgetShell
      id="horoscope"
      label="Daily horoscope"
      className="dw-hs"
      attrs={{ 'data-sign': sign.id }}
      sizeHints={{ small: 'picture only' }}
      buttonLabel="Choose your sign"
      buttonIcon={StarIcon}
      popLabel="Horoscope settings"
      onOpened={focusSign}
      menu={
        <>
          <MenuSub icon={<Sparkles />} label="Sign">
            <MenuRadioGroup
              value={chosen ?? 'auto'}
              onChange={(v) => update({ sign: v === 'auto' ? undefined : v })}
            >
              <MenuRadioItem value="auto">Today's sign</MenuRadioItem>
              <MenuSeparator />
              {SIGNS.map((s) => (
                <MenuRadioItem key={s.id} value={s.id} hint={s.glyph}>
                  {s.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSub>
          <MenuSub icon={<Image />} label="Art style">
            <MenuRadioGroup value={art} onChange={(v) => update({ hsArt: v as HoroscopeArt })}>
              {ARTS.map(([a, l]) => (
                <MenuRadioItem key={a} value={a}>
                  {l}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSub>
        </>
      }
      pop={({ close }) => (
        <>
          <h4>Art style</h4>
          <div className="hs-arts">
            {ARTS.map(([a, l]) => (
              <button key={a} type="button" className="hs-artopt" aria-pressed={a === art} onClick={() => update({ hsArt: a })}>
                <img alt="" src={artUrl(a, 'pisces')} />
                {l}
              </button>
            ))}
          </div>
          <h4 className="hs-h">Your sign</h4>
          <div className="hs-grid">
            {SIGNS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="hs-opt"
                aria-pressed={s.id === chosen}
                title={s.range}
                onClick={() => {
                  update({ sign: s.id });
                  close();
                }}
              >
                <span className="g">{s.glyph}</span>
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}
    >
      {({ open }) => (
        <div className="hs-card">
          <div className={cn('hs-art', art)}>
            <img alt="" src={artUrl(art, sign.id)} />
            <div className="hs-id">
              <span className="g" aria-hidden="true">
                {sign.glyph}
              </span>
              <b>{sign.name}</b>
              <small>
                {sign.range} · {sign.element}
              </small>
              {!chosen && (
                <button type="button" className="hs-pick" onClick={open}>
                  Choose your sign
                </button>
              )}
            </div>
          </div>
          <div className="hs-body">
            <div className="hs-top">
              <div className="hs-tabs" role="tablist" aria-label="Day">
                <button type="button" role="tab" aria-selected={offset === 0} onClick={() => setOffset(0)}>
                  Today
                </button>
                <button type="button" role="tab" aria-selected={offset === 1} onClick={() => setOffset(1)}>
                  Tomorrow
                </button>
              </div>
              <span className="hs-date">
                {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <p className="hs-text">{r.text}</p>
            <p className="hs-tip">
              <span>Tip</span>
              {r.tip}
            </p>
            <div className="hs-meta">
              <span>
                <small>Mood</small>
                {r.mood}
              </span>
              <span>
                <small>Lucky number</small>
                {r.num}
              </span>
              <span>
                <small>Lucky color</small>
                <i style={{ background: r.color.swatch }} />
                {r.color.name}
              </span>
            </div>
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
