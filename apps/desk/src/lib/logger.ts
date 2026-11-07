/**
 * The only module that writes to the console.
 *
 * Level comes from `config.logLevel`, overridable at runtime without a rebuild
 * by `localStorage.setItem('elva:log', 'debug')` or `?log=debug`.
 * Every payload passes through `redact()` first.
 */
import { config } from '@/config';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const ORDER: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const LEVELS = new Set<string>(Object.keys(ORDER));

const DENY = [
  'authorization',
  'password',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'connect_code',
  'code',
  'code_verifier',
  'api_key',
  'secret',
  'card',
  'cvv',
  'pan',
];

function readOverride(): LogLevel | null {
  try {
    const q = new URLSearchParams(window.location.search).get('log');
    if (q && LEVELS.has(q)) return q as LogLevel;
    const s = localStorage.getItem('elva:log');
    if (s && LEVELS.has(s)) return s as LogLevel;
  } catch {
    /* storage unavailable */
  }
  return null;
}

let level: LogLevel = readOverride() ?? config.logLevel;

export function setLogLevel(next: LogLevel): void {
  level = next;
}

export function getLogLevel(): LogLevel {
  return level;
}

function enabled(l: LogLevel): boolean {
  return ORDER[l] <= ORDER[level];
}

export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.toLowerCase();
    out[k] = DENY.some((d) => key === d || key.endsWith(`_${d}`) || key.endsWith(d))
      ? '«redacted»'
      : redact(v, depth + 1);
  }
  return out as T;
}

export interface Logger {
  debug(msg: string, ...data: unknown[]): void;
  info(msg: string, ...data: unknown[]): void;
  warn(msg: string, ...data: unknown[]): void;
  error(msg: string, ...data: unknown[]): void;
  /** A collapsed console group, only at debug. */
  group(label: string, body: () => void): void;
  child(namespace: string): Logger;
}

function make(ns: string): Logger {
  const prefix = ns ? `[${ns}]` : '[desk]';
  const emit = (l: Exclude<LogLevel, 'silent'>, msg: string, data: unknown[]) => {
    if (!enabled(l)) return;
    const args = data.map((d) => redact(d));
    // eslint-disable-next-line no-console
    console[l](`${prefix} ${msg}`, ...args);
  };
  return {
    debug: (m, ...d) => emit('debug', m, d),
    info: (m, ...d) => emit('info', m, d),
    warn: (m, ...d) => emit('warn', m, d),
    error: (m, ...d) => emit('error', m, d),
    group(label, body) {
      if (!enabled('debug')) return;
      // eslint-disable-next-line no-console
      console.groupCollapsed(`${prefix} ${label}`);
      try {
        body();
      } finally {
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
    },
    child: (sub) => make(ns ? `${ns}:${sub}` : sub),
  };
}

export const logger = make('');
