/**
 * Where the session lives.
 *
 * - The access token is in memory only, per tab.
 * - The refresh token is in localStorage, because the account API v2 returns
 *   it in the body and sets no cookie, and a reload must not sign people out.
 *   It is read from storage at refresh time, never from memory, so two tabs
 *   always rotate the newest one.
 * - Tabs share a freshly minted access token over a BroadcastChannel, so one
 *   refresh serves every open desk tab.
 */
import { config } from '@/config';
import { logger } from '@/lib/logger';

const log = logger.child('tokens');

const STORAGE_KEY = 'elva:desk:session';
const CHANNEL = 'elva-desk-session';

export interface StoredSession {
  refreshToken: string;
  locationId: string | null;
  updatedAt: number;
}

interface AccessState {
  token: string;
  expiresAt: number;
}

type ChannelMessage =
  | { type: 'access'; token: string; expiresAt: number }
  | { type: 'ended' };

let access: AccessState | null = null;
let channel: BroadcastChannel | null = null;
const endedListeners = new Set<() => void>();

function openChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (ev: MessageEvent<ChannelMessage>) => {
    const msg = ev.data;
    if (msg.type === 'access') {
      if (!access || msg.expiresAt > access.expiresAt) {
        access = { token: msg.token, expiresAt: msg.expiresAt };
        log.debug('adopted access token from another tab');
      }
    } else if (msg.type === 'ended') {
      access = null;
      for (const fn of [...endedListeners]) fn();
    }
  };
  return channel;
}

export const tokenStore = {
  getAccessToken(): string | null {
    return access?.token ?? null;
  },

  getExpiresAt(): number | null {
    return access?.expiresAt ?? null;
  },

  /** True when there is no token or it expires within the skew. */
  isNearExpiry(skewMs: number = config.refreshSkewMs): boolean {
    if (!access) return true;
    return access.expiresAt - Date.now() < skewMs;
  },

  setAccess(token: string, expiresInSeconds: number): void {
    access = { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
    openChannel()?.postMessage({ type: 'access', token, expiresAt: access.expiresAt } satisfies ChannelMessage);
  },

  readStored(): StoredSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      if (typeof parsed.refreshToken !== 'string' || !parsed.refreshToken) return null;
      return {
        refreshToken: parsed.refreshToken,
        locationId: typeof parsed.locationId === 'string' ? parsed.locationId : null,
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      };
    } catch {
      return null;
    }
  },

  writeStored(patch: Partial<Pick<StoredSession, 'refreshToken' | 'locationId'>>): void {
    const current = tokenStore.readStored();
    const next: StoredSession = {
      refreshToken: patch.refreshToken ?? current?.refreshToken ?? '',
      locationId: patch.locationId !== undefined ? patch.locationId : (current?.locationId ?? null),
      updatedAt: Date.now(),
    };
    if (!next.refreshToken) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      log.error('could not persist session', e);
    }
  },

  getLocationId(): string | null {
    return tokenStore.readStored()?.locationId ?? null;
  },

  /** Drops everything, in this tab and every other desk tab. */
  clear(broadcast = true): void {
    access = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (broadcast) openChannel()?.postMessage({ type: 'ended' } satisfies ChannelMessage);
  },

  /** Fires when another tab ended the session. */
  onEndedElsewhere(fn: () => void): () => void {
    openChannel();
    endedListeners.add(fn);
    return () => {
      endedListeners.delete(fn);
    };
  },
};
