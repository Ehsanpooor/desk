/**
 * SAMPLE DATA — delete this folder when a real weather source exists.
 *
 * The prototype's weather: a smooth temperature curve over the day, a plausible
 * condition per hour, and a preview of every condition. Requested by the
 * product owner on 2026-11-07 so the desk matches the prototype exactly.
 */
import type { WeatherKind, WeatherReport, WeatherSource } from '../weather/types';

const isNight = (h: number) => h < 6 || h >= 19;
const curve = (h: number) => Math.round(60 + 8 * Math.sin(((h - 9) / 24) * 2 * Math.PI));
const liveKind = (h: number): WeatherKind =>
  isNight(h) ? 'moon' : h < 10 ? 'partly' : h < 15 ? 'sun' : h < 17 ? 'partly' : 'cloud';

const NEXT: Record<WeatherKind, WeatherKind[]> = {
  sun: ['sun', 'sun', 'partly', 'sun', 'sun'],
  partly: ['partly', 'sun', 'partly', 'cloud', 'partly'],
  cloud: ['cloud', 'cloud', 'partly', 'cloud', 'cloud'],
  rain: ['rain', 'rain', 'cloud', 'rain', 'cloud'],
  storm: ['storm', 'storm', 'rain', 'rain', 'cloud'],
  snow: ['snow', 'snow', 'cloud', 'snow', 'cloud'],
  fog: ['fog', 'fog', 'cloud', 'partly', 'partly'],
  moon: ['moon', 'moon', 'moon', 'moon', 'moon'],
};

const TEMP: Partial<Record<WeatherKind, number>> = { snow: -28, storm: -6, rain: -5, fog: -4, cloud: -2 };

const nightAdjusted = (k: WeatherKind, h: number): WeatherKind =>
  isNight(h) && (k === 'sun' || k === 'partly') ? 'moon' : k;

function report(kind: WeatherKind, live: boolean, now: Date): WeatherReport {
  const hr = now.getHours();
  const off = TEMP[kind] ?? 0;
  const t = (h: number) => curve(h) + off;
  const night = kind === 'moon' || (live ? isNight(hr) : isNight(hr) && kind !== 'sun' && kind !== 'partly');
  const hourly = Array.from({ length: 5 }, (_, i) => {
    const h = (hr + i + 1) % 24;
    const k = live ? liveKind(h) : nightAdjusted(NEXT[kind][i] ?? kind, h);
    return { hour: h, kind: k, temp: t(h) };
  });
  return { place: 'Bay Area', kind, night, temp: t(hr), high: 68 + off, low: 54 + off, hourly, sample: true };
}

export const sampleWeather: WeatherSource = {
  current: (now) => report(liveKind(now.getHours()), true, now),
  preview: (kind, now) => report(kind, false, now),
};
