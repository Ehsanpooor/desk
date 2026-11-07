/**
 * Every environment variable, read once, validated at startup.
 * Nothing else in the tree reads `import.meta.env`.
 */
import type { DeskEnv } from '@elva/desk-sdk';

declare const __APP_VERSION__: string;

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const raw = import.meta.env;

function env(): DeskEnv {
  const v = raw.VITE_ENV as string | undefined;
  if (v === 'development' || v === 'sandbox' || v === 'production') return v;
  if (v) throw new Error(`VITE_ENV must be development, sandbox or production; got "${v}".`);
  return raw.DEV ? 'development' : 'production';
}

const deskEnv = env();

function url(name: string, devDefault: string): string {
  const v = (raw[name] as string | undefined)?.trim();
  if (v) {
    try {
      new URL(v);
    } catch {
      throw new Error(`${name} is not a valid URL: "${v}".`);
    }
    return v.replace(/\/$/, '');
  }
  if (deskEnv === 'development') return devDefault;
  throw new Error(`${name} is required when VITE_ENV is ${deskEnv}.`);
}

function number(name: string, fallback: number): number {
  const v = raw[name] as string | undefined;
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number; got "${v}".`);
  return n;
}

function logLevel(): LogLevel {
  const v = raw.VITE_LOG_LEVEL as string | undefined;
  if (v === 'silent' || v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v;
  if (v) throw new Error(`VITE_LOG_LEVEL must be silent, error, warn, info or debug; got "${v}".`);
  return deskEnv === 'development' ? 'debug' : deskEnv === 'sandbox' ? 'warn' : 'error';
}

export const config = {
  env: deskEnv,
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  accountApiUrl: url('VITE_ACCOUNT_API_URL', 'https://dev-account-az.elva.ai/api/v2'),
  accountAppUrl: url('VITE_ACCOUNT_APP_URL', 'https://account-web-dev.elva.ai'),
  clientId: ((raw.VITE_OAUTH_CLIENT_ID as string | undefined) || 'desk').trim(),
  /** Registered for the desk client in the account admin. */
  redirectUri: `${window.location.origin}/loginok`,
  logLevel: logLevel(),
  requestTimeoutMs: 15_000,
  /** A remote that has not resolved its module within this time shows the failure page. */
  remoteLoadTimeoutMs: 10_000,
  /** Refresh the access token this long before it expires. */
  refreshSkewMs: 5 * 60_000,
  softLockMinutes: number('VITE_SOFT_LOCK_MINUTES', 15),
  hardLockHours: number('VITE_HARD_LOCK_HOURS', 12),
  /** Windows mounted at once. Beyond this, the least recently used minimized window goes dormant. */
  maxMountedWindows: 4,
  /** A minimized window older than this is unmounted and restored from its saved state. */
  dormantAfterMinutes: 20,
  /** The desk never draws a window smaller than this. */
  minWindow: { w: 420, h: 280 },
} as const;

export type Config = typeof config;
