/**
 * The desk's session: the only owner of the PKCE hand-off, the refresh and
 * the logout. Apps never see a refresh token; they call `getAccessToken()`.
 */
import { create } from 'zustand';
import type { DeskSession } from '@elva/desk-sdk';
import { account, type MePayload, type SessionPayload } from '@/api/account';
import { bindAuthHandlers } from '@/api/client';
import { isApiError } from '@/api/errors';
import { tokenStore } from '@/api/tokens';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { canUsePkce, createPkce, storePkce, takePkce } from './pkce';

const log = logger.child('auth');

const REDIRECT_AT_KEY = 'elva:desk:redirect-at';
const REDIRECT_COOLDOWN_MS = 15_000;

/** Codes from refresh or switch-location that mean "this session is over". */
const TERMINAL = new Set(['invalid_refresh_token', 'session_revoked', 'user_unavailable', 'two_factor_required']);

export type SessionStatus =
  | 'booting'
  | 'redirecting'
  | 'signed-out'
  | 'org-account'
  | 'choose-location'
  | 'ready'
  | 'error';

export type EndReason = 'logout' | 'expired' | 'revoked';

interface SessionState {
  status: SessionStatus;
  me: MePayload | null;
  error: string | null;
  /** `access`: signed in, but not allowed to open the desk here. */
  errorKind: 'signin' | 'access' | null;
  endReason: EndReason | null;
  /** Soft idle lock. */
  locked: boolean;
  lastActivityAt: number;

  boot(): Promise<void>;
  beginLogin(opts?: { maxAgeSeconds?: number; force?: boolean }): Promise<void>;
  refresh(force?: boolean): Promise<boolean>;
  getAccessToken(opts?: { forceRefresh?: boolean }): Promise<string>;
  switchLocation(locationId: string): Promise<boolean>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  endSession(reason: EndReason): void;
  reportUnauthorized(): void;
  touch(): void;
  setLocked(locked: boolean): void;
}

function isOrgAccount(me: MePayload): boolean {
  return !me.user && Boolean(me.admin);
}

let refreshInFlight: Promise<boolean> | null = null;

export const useSession = create<SessionState>()((set, get) => {
  const applyPayload = (payload: MePayload | SessionPayload) => {
    const s = payload as Partial<SessionPayload>;
    if (s.accessToken && s.expiresIn !== undefined) tokenStore.setAccess(s.accessToken, s.expiresIn);
    const locationId = payload.access?.location ?? null;
    if (s.refreshToken) tokenStore.writeStored({ refreshToken: s.refreshToken, locationId });
    else if (locationId) tokenStore.writeStored({ locationId });

    const org = isOrgAccount(payload);
    const status: SessionStatus = org ? 'org-account' : payload.access ? 'ready' : 'choose-location';
    set({ me: payload, status, error: null, endReason: null });
    try {
      sessionStorage.removeItem(REDIRECT_AT_KEY);
    } catch {
      /* ignore */
    }
  };

  const doRefresh = async (force: boolean): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      // Another tab may have rotated while we waited for the lock.
      if (!force && !tokenStore.isNearExpiry()) return true;
      const stored = tokenStore.readStored();
      if (!stored) return false;
      try {
        const data = await account.refresh(stored.refreshToken, stored.locationId);
        applyPayload(data);
        log.info('session refreshed');
        return true;
      } catch (e) {
        const code = isApiError(e) ? e.code : 'unknown';
        if (TERMINAL.has(code)) {
          log.warn('refresh refused', code);
          get().endSession(code === 'session_revoked' ? 'revoked' : 'expired');
        } else {
          log.error('refresh failed', code);
        }
        return false;
      }
    };
    const locks = navigator.locks;
    return locks ? locks.request('elva-desk-refresh', run) : run();
  };

  return {
    status: 'booting',
    me: null,
    error: null,
    errorKind: null,
    endReason: null,
    locked: false,
    lastActivityAt: Date.now(),

    async boot() {
      bindAuthHandlers({
        refresh: () => get().refresh(true),
        onAuthLost: () => get().reportUnauthorized(),
      });
      tokenStore.onEndedElsewhere(() => {
        if (get().status === 'ready' || get().status === 'choose-location') {
          set({ status: 'signed-out', me: null, endReason: 'logout' });
        }
      });

      const url = new URL(window.location.href);
      if (url.pathname === '/loginok') {
        await completeHandoff(url.searchParams);
        return;
      }

      if (tokenStore.readStored()) {
        const ok = await get().refresh(true);
        if (ok) return;
        if (get().status === 'booting') {
          set({ status: 'error', error: 'Could not reach the account service. Check your connection and retry.' });
        }
        return;
      }
      await get().beginLogin();
    },

    async beginLogin(opts) {
      if (!canUsePkce()) {
        set({
          status: 'error',
          error: 'Sign-in needs a secure context. Open the desk on https or on localhost.',
        });
        return;
      }
      if (!opts?.force) {
        try {
          const last = Number(sessionStorage.getItem(REDIRECT_AT_KEY) || 0);
          if (last && Date.now() - last < REDIRECT_COOLDOWN_MS) {
            set({ status: 'error', error: 'Sign-in did not complete. Use the button to try again.' });
            return;
          }
        } catch {
          /* ignore */
        }
      }
      const pkce = await createPkce();
      storePkce(pkce);
      try {
        sessionStorage.setItem(REDIRECT_AT_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        state: pkce.state,
      });
      if (opts?.maxAgeSeconds !== undefined) params.set('max_age', String(opts.maxAgeSeconds));
      set({ status: 'redirecting' });
      log.info('redirecting to the account app');
      window.location.assign(`${config.accountAppUrl}/login?${params.toString()}`);
    },

    refresh(force = false) {
      if (refreshInFlight) return refreshInFlight;
      refreshInFlight = doRefresh(force).finally(() => {
        refreshInFlight = null;
      });
      return refreshInFlight;
    },

    async getAccessToken(opts) {
      const current = tokenStore.getAccessToken();
      if (!opts?.forceRefresh && current && !tokenStore.isNearExpiry()) return current;
      const ok = await get().refresh(Boolean(opts?.forceRefresh));
      const token = tokenStore.getAccessToken();
      if (!ok || !token) throw new Error('No session.');
      return token;
    },

    async switchLocation(locationId) {
      try {
        const data = await account.switchLocation(locationId);
        applyPayload(data);
        log.info('location switched');
        return true;
      } catch (e) {
        const code = isApiError(e) ? e.code : 'unknown';
        if (code === 'two_factor_required') {
          await get().beginLogin({ force: true });
          return false;
        }
        set({ error: isApiError(e) ? e.message : 'Could not switch location.' });
        return false;
      }
    },

    async logout() {
      const stored = tokenStore.readStored();
      try {
        await account.logout(stored?.refreshToken ?? null);
      } catch {
        /* already dead is fine */
      }
      get().endSession('logout');
    },

    async logoutAll() {
      try {
        await account.logoutAll();
      } catch {
        /* ignore */
      }
      get().endSession('logout');
    },

    endSession(reason) {
      tokenStore.clear();
      set({ status: 'signed-out', me: null, endReason: reason, locked: false });
      if (reason !== 'logout') void get().beginLogin();
    },

    reportUnauthorized() {
      if (get().status !== 'ready') return;
      log.warn('an app reported an unauthorized response after a forced refresh');
      get().endSession('expired');
    },

    touch() {
      set({ lastActivityAt: Date.now() });
    },

    setLocked(locked) {
      set({ locked });
    },
  };

  async function completeHandoff(params: URLSearchParams): Promise<void> {
    const { verifier, state } = takePkce();
    const error = params.get('error');
    if (error) {
      set({
        status: 'error',
        errorKind: error === 'access_denied' ? 'access' : 'signin',
        error: params.get('error_description') || 'Sign-in was not completed.',
      });
      window.history.replaceState(null, '', '/');
      return;
    }
    const code = params.get('code');
    if (!code || !verifier || !state || state !== params.get('state')) {
      set({ status: 'error', error: 'Sign-in could not be verified. Please try again.' });
      window.history.replaceState(null, '', '/');
      return;
    }
    try {
      const data = await account.redeemHandoff({
        code,
        code_verifier: verifier,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
      });
      applyPayload(data);
      log.info('sign-in complete');
    } catch (e) {
      const code = isApiError(e) ? e.code : 'unknown';
      const message =
        code === 'invalid_code'
          ? 'That sign-in link has expired. Please sign in again.'
          : isApiError(e)
            ? e.message
            : 'Sign-in failed. Please try again.';
      const access = code === 'app_not_permitted' || code === 'location_not_in_scope';
      set({ status: 'error', errorKind: access ? 'access' : 'signin', error: message });
    } finally {
      window.history.replaceState(null, '', '/');
    }
  }
});

/** The view of the session an app receives. Null until ready. */
export function toDeskSession(me: MePayload | null): DeskSession | null {
  if (!me || !me.user || !me.access) return null;
  const active = me.locations.find((l) => l.id === me.access?.location);
  const name = [me.user.name, me.user.last_name].filter(Boolean).join(' ');
  return {
    user: { id: me.user.id, name, email: me.user.email, avatarUrl: me.user.avatar_url },
    organization: { id: me.organization.id, name: me.organization.name },
    location: {
      id: me.access.location,
      pmsId: active?.pms_id ?? active?.ascend_id ?? null,
      name: active?.name ?? '',
      timezone: active?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    locations: me.locations.map((l) => ({ id: l.id, name: l.name })),
    access: {
      role: me.access.role,
      permissions: [...me.access.permissions],
      plans: me.access.plans.map((p) => ({
        product_name: p.product_name,
        name: p.name,
        billing_cycle: p.billing_cycle,
        status: p.status,
      })),
      credits: me.access.credits.map((c) => ({ type: c.type, balance: c.balance })),
      mfa: Boolean(me.amr?.includes('mfa')),
    },
  };
}
