/**
 * The one axios instance. The desk talks to exactly one service: accounts.
 *
 * Tokens are attached here and nowhere else. A 401 runs one single-flight
 * refresh (owned by the session store, registered through `bindAuthHandlers`)
 * and replays the request once.
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { config } from '@/config';
import { logger, redact } from '@/lib/logger';
import { normalizeError } from './errors';
import { tokenStore } from './tokens';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Public endpoints: no bearer, and a 401 is final. */
    skipAuth?: boolean;
    _retried?: boolean;
    _requestId?: string;
    _startedAt?: number;
  }
}

const log = logger.child('api');

export const api = axios.create({
  baseURL: config.accountApiUrl,
  timeout: config.requestTimeoutMs,
  headers: { 'Content-Type': 'application/json' },
});

interface AuthHandlers {
  /** Returns true when a new access token is in the store. */
  refresh(): Promise<boolean>;
  /** The refresh failed for good. */
  onAuthLost(): void;
}

let handlers: AuthHandlers | null = null;

export function bindAuthHandlers(h: AuthHandlers): void {
  handlers = h;
}

let seq = 0;

api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  cfg._requestId = `r${++seq}`;
  cfg._startedAt = performance.now();
  if (!cfg.skipAuth) {
    const token = tokenStore.getAccessToken();
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
  }
  const locationId = tokenStore.getLocationId();
  if (locationId && !cfg.headers['X-Location-Id']) cfg.headers['X-Location-Id'] = locationId;

  log.group(`→ ${cfg.method?.toUpperCase()} ${cfg.url} (${cfg._requestId})`, () => {
    log.debug('params', redact(cfg.params));
    log.debug('body', redact(cfg.data));
  });
  return cfg;
});

api.interceptors.response.use(
  (res) => {
    const ms = Math.round(performance.now() - (res.config._startedAt ?? performance.now()));
    log.group(`← ${res.status} ${res.config.method?.toUpperCase()} ${res.config.url} ${ms}ms (${res.config._requestId})`, () => {
      log.debug('body', redact(res.data));
    });
    return res;
  },
  async (error: AxiosError) => {
    const cfg = error.config;
    const normalized = normalizeError(error);
    const ms = cfg?._startedAt ? Math.round(performance.now() - cfg._startedAt) : 0;
    log.error(
      `✕ ${normalized.status ?? normalized.kind} ${cfg?.method?.toUpperCase()} ${cfg?.url} ${ms}ms (${cfg?._requestId}) ${normalized.code}`,
    );

    if (
      cfg &&
      normalized.status === 401 &&
      !cfg.skipAuth &&
      !cfg._retried &&
      (normalized.code === 'authentication_failed' || normalized.code === 'not_authenticated') &&
      handlers
    ) {
      cfg._retried = true;
      const ok = await handlers.refresh();
      if (ok) {
        const token = tokenStore.getAccessToken();
        if (token) cfg.headers.Authorization = `Bearer ${token}`;
        return api(cfg);
      }
      handlers.onAuthLost();
    }
    throw normalized;
  },
);
