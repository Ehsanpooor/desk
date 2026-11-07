/**
 * What the weather card needs. In production a source reads the practice's
 * own location (for example GET /api/desk/weather every 30 minutes).
 */

export type WeatherKind = 'sun' | 'partly' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog' | 'moon';

export interface WeatherHour {
  /** 0–23, local to the practice. */
  hour: number;
  /** Already night-adjusted: a clear hour after dark is `moon`. */
  kind: WeatherKind;
  temp: number;
}

export interface WeatherReport {
  place: string;
  kind: WeatherKind;
  night: boolean;
  temp: number;
  high: number;
  low: number;
  hourly: WeatherHour[];
  /** True while the card shows sample data rather than a live reading. */
  sample: boolean;
}

export interface WeatherSource {
  current(now: Date): WeatherReport;
  /** The prototype's "preview weather" menu. Optional for a live source. */
  preview?(kind: WeatherKind, now: Date): WeatherReport;
}

export type IconSet = '3d' | 'glass' | 'flat' | 'paper';

export const ICON_SETS: [IconSet, string][] = [
  ['3d', '3D'],
  ['glass', 'Glass'],
  ['flat', 'Flat'],
  ['paper', 'Paper'],
];

export const KINDS: [WeatherKind, string][] = [
  ['sun', 'Sunny'],
  ['partly', 'Partly cloudy'],
  ['cloud', 'Cloudy'],
  ['rain', 'Rain'],
  ['storm', 'Storm'],
  ['snow', 'Snow'],
  ['fog', 'Fog'],
  ['moon', 'Clear night'],
];

export const LABEL: Record<WeatherKind, string> = {
  sun: 'Sunny',
  moon: 'Clear',
  partly: 'Partly cloudy',
  cloud: 'Cloudy',
  rain: 'Rain',
  storm: 'Thunderstorm',
  snow: 'Snow',
  fog: 'Fog',
};

export function iconUrl(set: IconSet, kind: WeatherKind): string {
  return `/widgets/weather/${set}/${kind}.webp`;
}

export function isIconSet(v: unknown): v is IconSet {
  return v === '3d' || v === 'glass' || v === 'flat' || v === 'paper';
}

export function isWeatherKind(v: unknown): v is WeatherKind {
  return typeof v === 'string' && KINDS.some(([k]) => k === v);
}
