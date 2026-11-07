import type { DeskContext, DeskEnv } from './types';

/**
 * Where a genuine ELVA Desk runs. An app refuses to mount on any other origin.
 * In development and sandbox a loopback origin is also accepted, so a team can
 * run the desk (or the simulator) locally. In production only these three.
 *
 * This is the client-side half of "apps open only in the desk". The other half
 * is the app's own hosting: its remote entry and chunks must send
 * `Access-Control-Allow-Origin` for these origins only, so a page elsewhere
 * cannot even fetch the module.
 */
export const DESK_ORIGINS: readonly string[] = [
  'https://desk.elva.ai',
  'https://dev-desk.elva.ai',
  'https://sand-desk.elva.ai',
];

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function isAllowedDeskOrigin(origin: string, env: DeskEnv): boolean {
  if (DESK_ORIGINS.includes(origin)) return true;
  if (env !== 'production' && LOOPBACK.test(origin)) return true;
  return false;
}

/**
 * Contexts the desk created. The set lives in this module, and this module is a
 * shared singleton, so a context built anywhere else is not in it. If an app
 * bundles its own copy of the SDK instead of sharing it, the check fails too,
 * which is the correct outcome, because two SDK copies also break the React
 * helpers.
 */
const branded = new WeakSet<object>();

/** @internal Host only. */
export function brandContext<T extends object>(ctx: T): T {
  branded.add(ctx);
  return ctx;
}

export function isDeskContext(value: unknown): value is DeskContext {
  return typeof value === 'object' && value !== null && branded.has(value);
}

export type DeskRefusalReason =
  | 'not-a-desk-context'
  | 'origin-not-allowed'
  | 'origin-mismatch'
  | 'contract-mismatch';

export class DeskRefusedError extends Error {
  override readonly name = 'DeskRefusedError';
  readonly reason: DeskRefusalReason;
  constructor(reason: DeskRefusalReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Throws unless `ctx` was created by a genuine desk running on an allowed
 * origin, in the same document as the app.
 */
export function assertDeskContext(ctx: unknown): asserts ctx is DeskContext {
  if (!isDeskContext(ctx)) {
    throw new DeskRefusedError(
      'not-a-desk-context',
      'This app opens only inside the ELVA Desk. The context passed to mount() was not created by the desk, or @elva/desk-sdk is not a shared singleton in this build.',
    );
  }
  const here = typeof window !== 'undefined' ? window.location.origin : '';
  if (!isAllowedDeskOrigin(here, ctx.env)) {
    throw new DeskRefusedError(
      'origin-not-allowed',
      `This app opens only inside the ELVA Desk. ${here || 'This page'} is not a desk origin.`,
    );
  }
  if (ctx.desk.origin !== here) {
    throw new DeskRefusedError(
      'origin-mismatch',
      'This app opens only inside the ELVA Desk. The desk origin in the context does not match the page.',
    );
  }
}
