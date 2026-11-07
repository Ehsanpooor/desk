/**
 * Builds the `DeskContext` one window hands to its app. Everything an app can
 * reach goes through here, scoped to the window's abort signal.
 */
import { toast as sonner } from 'sonner';
import {
  SDK_VERSION,
  type DeskContext,
  type DeskIntent,
  type DeskLocale,
  type DeskSession,
  type DeskWindowStatus,
} from '@elva/desk-sdk';
import { createReadable, finalizeContext, scopedReadable, type Writable } from '@elva/desk-sdk/host';
import { useSession } from '@/auth/session';
import { config } from '@/config';
import { scopedEvents } from '@/events/bus';
import { logger } from '@/lib/logger';
import { themeReadable } from '@/theme/store';
import { useWm } from './store';

const log = logger.child('ctx');

/** The session as apps see it. Set by Desktop whenever the account session changes. */
export const sessionReadable = createReadable<DeskSession | null>(null);
export const localeReadable = createReadable<DeskLocale>({ language: navigator.language || 'en', dir: 'ltr' });

export interface WindowHandles {
  id: string;
  appId: string;
  container: HTMLElement;
  titlebarSlot: HTMLElement;
  portalRoot: HTMLElement;
  status: Writable<DeskWindowStatus>;
  controller: AbortController;
  intent: DeskIntent | null;
}

function requireSession(): DeskSession {
  const s = sessionReadable.get();
  if (!s) throw new Error('No session.');
  return s;
}

export function createWindowContext(h: WindowHandles): DeskContext {
  const wm = useWm.getState;
  const session = useSession.getState;
  const { signal } = h.controller;
  const appLog = log.child(h.appId);

  const ctx: DeskContext = {
    sdkVersion: SDK_VERSION,
    contract: 1,
    mode: 'desk',
    env: config.env,
    app: { id: h.appId, instanceId: h.id },
    signal,
    intent: h.intent,

    auth: {
      getAccessToken: (opts) => session().getAccessToken({ forceRefresh: opts?.forceRefresh }),
      reportUnauthorized: () => session().reportUnauthorized(),
      reauthenticate: async (opts) => {
        await session().beginLogin({ maxAgeSeconds: opts?.maxAgeSeconds ?? 300, force: true });
        return new Promise<never>(() => {});
      },
    },

    session: scopedReadable(
      {
        get: requireSession,
        subscribe: (fn) => sessionReadable.subscribe((v) => v && fn(v)),
      },
      signal,
    ),
    theme: scopedReadable(themeReadable, signal),
    locale: scopedReadable(localeReadable, signal),

    window: {
      titlebarSlot: h.titlebarSlot,
      portalRoot: h.portalRoot,
      status: scopedReadable(h.status, signal),
      setTitle: (title) => wm().setTitle(h.id, title),
      setBadge: (count) => wm().setBadge(h.id, count ?? 0),
      setDirty: (dirty) => wm().setDirty(h.id, dirty),
      state: {
        get: <T,>() => wm().windows[h.id]?.state as T | undefined,
        set: <T,>(value: T) => {
          try {
            JSON.stringify(value);
          } catch {
            appLog.warn('window state must be serializable; ignored');
            return;
          }
          wm().setState(h.id, value);
        },
      },
      close: () => wm().requestClose(h.id),
    },

    desk: {
      origin: window.location.origin,
      openApp: (appId, intent) => {
        wm().open(appId, intent);
      },
      toast: (t) => {
        const opts = {
          description: t.body,
          action: t.action ? { label: t.action.label, onClick: () => t.action?.run() } : undefined,
        };
        if (t.kind === 'success') sonner.success(t.title, opts);
        else if (t.kind === 'warning') sonner.warning(t.title, opts);
        else if (t.kind === 'error') sonner.error(t.title, opts);
        else sonner.info(t.title, opts);
      },
      notify: (n) => {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission === 'granted') {
          new Notification(n.title, { body: n.body, tag: n.tag });
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission().then((p) => {
            if (p === 'granted') new Notification(n.title, { body: n.body, tag: n.tag });
          });
        }
      },
    },

    events: scopedEvents(signal),

    telemetry: {
      reportError: (error, extra) => appLog.error('app error', error, extra),
      track: (name, props) => appLog.debug(`track ${name}`, props),
    },
  };

  return finalizeContext(ctx);
}
