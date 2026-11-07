/**
 * The app registry: what exists, where each environment's build lives, and
 * which permission opens it. Whether a person may open an app comes from
 * `access.permissions` in their token, never from this file.
 *
 * Remote URLs are never read from a response, a query string or storage,
 * except the developer override below, which the production build ignores.
 */
import type { DeskEnv, DeskSize } from '@elva/desk-sdk';
import { config } from '@/config';

export type AppMode = 'federated' | 'external';

export interface DeskAppDef {
  id: string;
  name: string;
  /** The account permission that opens this app. A permission is an app. */
  permission: string;
  mode: AppMode;
  order: number;
  /** Under /public. */
  icon: string;
  /** Federated apps: the module federation name and the host that serves it. */
  remote?: { name: string; host: string; module: string };
  /** External apps: the host that is opened in its own browser window. */
  external?: { host: string; popup?: DeskSize };
  defaultSize?: DeskSize;
  /** Development only: the entry to use when no override is set. */
  devEntry?: string;
}

/** Any signed-in person. Only development entries use it. */
export const ANY_PERMISSION = '*';

const PREFIX: Record<DeskEnv, string> = { production: '', development: 'dev-', sandbox: 'sand-' };

/**
 * The permission names come from the account service's catalog
 * (frontdesk, rcm, chat, aiphone, onlinebooking, recall). Apps mapped to a
 * permission that is not in the catalog show as locked for everyone until
 * product adds the permission. Confirm each mapping with product.
 */
export const APPS: DeskAppDef[] = [
  { id: 'core', name: 'ELVA Core', permission: 'frontdesk', mode: 'federated', order: 10, icon: '/apps/core.svg', remote: { name: 'elva_core', host: 'core.elva.ai', module: './desk' } },
  { id: 'receptionist', name: 'AI Receptionist', permission: 'aiphone', mode: 'federated', order: 20, icon: '/apps/receptionist.svg', remote: { name: 'elva_receptionist', host: 'aiphone.elva.ai', module: './desk' }, defaultSize: { w: 1380, h: 880 } },
  { id: 'chat', name: 'ELVA Chat', permission: 'chat', mode: 'federated', order: 30, icon: '/apps/chat.svg', remote: { name: 'elva_chat', host: 'chat.elva.ai', module: './desk' } },
  { id: 'sms', name: '2-Way SMS', permission: 'frontdesk', mode: 'federated', order: 40, icon: '/apps/sms.svg', remote: { name: 'elva_sms', host: 'sms.elva.ai', module: './desk' }, defaultSize: { w: 1400, h: 860 } },
  { id: 'email', name: 'Email', permission: 'frontdesk', mode: 'federated', order: 50, icon: '/apps/email.svg', remote: { name: 'elva_email', host: 'email.elva.ai', module: './desk' }, defaultSize: { w: 1400, h: 860 } },
  { id: 'forms', name: 'Digital Forms', permission: 'frontdesk', mode: 'federated', order: 60, icon: '/apps/forms.svg', remote: { name: 'elva_forms', host: 'forms.elva.ai', module: './desk' } },
  { id: 'tc', name: 'Treatment Coordinator', permission: 'tc', mode: 'federated', order: 70, icon: '/apps/tc.svg', remote: { name: 'elva_tc', host: 'tc.elva.ai', module: './desk' } },
  { id: 'eligibility', name: 'Eligibility', permission: 'rcm', mode: 'federated', order: 80, icon: '/apps/eligibility.svg', remote: { name: 'elva_eligibility', host: 'eligibility.elva.ai', module: './desk' } },
  { id: 'pay', name: 'ELVA Pay', permission: 'frontdesk', mode: 'federated', order: 90, icon: '/apps/pay.svg', remote: { name: 'elva_pay', host: 'pay.elva.ai', module: './desk' } },
  { id: 'kiosk', name: 'ELVA Kiosk', permission: 'frontdesk', mode: 'federated', order: 100, icon: '/apps/kiosk.svg', remote: { name: 'elva_kiosk', host: 'kiosk.elva.ai', module: './desk' } },
  { id: 'birdeye', name: 'Bird Eye View', permission: 'frontdesk', mode: 'federated', order: 110, icon: '/apps/birdeye.svg', remote: { name: 'elva_birdeye', host: 'birdeye.elva.ai', module: './desk' }, defaultSize: { w: 1280, h: 860 } },
  { id: 'marketing', name: 'ELVA Marketing', permission: 'recall', mode: 'federated', order: 120, icon: '/apps/marketing.svg', remote: { name: 'elva_marketing', host: 'marketing.elva.ai', module: './desk' } },
  { id: 'rcm', name: 'RCM', permission: 'rcm', mode: 'external', order: 200, icon: '/apps/rcm.svg', external: { host: 'rcm.elva.ai' } },
  { id: 'brain', name: 'ELVA Brain', permission: 'chat', mode: 'external', order: 210, icon: '/apps/brain.svg', external: { host: 'brain.elva.ai', popup: { w: 1100, h: 760 } } },
  // Development only: the example remote in examples/hello-app.
  ...(config.env === 'development'
    ? [
        {
          id: 'hello',
          name: 'Hello (example)',
          permission: ANY_PERMISSION,
          mode: 'federated' as const,
          order: 300,
          icon: '/apps/core.svg',
          remote: { name: 'elva_hello', host: 'hello.elva.ai', module: './desk' },
          devEntry: 'http://localhost:5181/mf-manifest.json',
        },
      ]
    : []),
];

export function appById(id: string): DeskAppDef | undefined {
  return APPS.find((a) => a.id === id);
}

function hostFor(host: string): string {
  return `https://${PREFIX[config.env]}${host}`;
}

/** Developer override: point one app at a local build. Ignored in production. */
export function readOverride(id: string): string | null {
  if (config.env === 'production') return null;
  try {
    const v = localStorage.getItem(`elva:desk:override:${id}`);
    if (!v) return null;
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function remoteEntry(def: DeskAppDef): string {
  if (!def.remote) throw new Error(`${def.id} is not a federated app.`);
  const dev = config.env === 'development' ? def.devEntry : undefined;
  return readOverride(def.id) ?? dev ?? `${hostFor(def.remote.host)}/mf-manifest.json`;
}

export function externalUrl(def: DeskAppDef, locationId: string | null): string {
  if (!def.external) throw new Error(`${def.id} is not an external app.`);
  const u = new URL(hostFor(def.external.host));
  if (locationId) u.searchParams.set('location', locationId);
  return u.href;
}

export function canOpen(def: DeskAppDef, permissions: readonly string[]): boolean {
  if (def.permission === ANY_PERMISSION) return config.env === 'development';
  return permissions.includes(def.permission);
}
