/**
 * Loads an app's `./desk` module over Module Federation at runtime.
 */
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';
import { DESK_CONTRACT, type DeskAppModule } from '@elva/desk-sdk';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { remoteEntry, type DeskAppDef } from '@/registry/apps';

const log = logger.child('remote');

export type RemoteFailure = 'timeout' | 'network' | 'invalid-module' | 'contract' | 'id-mismatch';

export class RemoteLoadError extends Error {
  override readonly name = 'RemoteLoadError';
  readonly reason: RemoteFailure;
  constructor(reason: RemoteFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

const entries = new Map<string, string>();

/** (Re)registers the remote when its entry URL is not the one we registered last. */
function ensureRegistered(def: DeskAppDef): void {
  if (!def.remote) throw new RemoteLoadError('invalid-module', `${def.id} is not federated.`);
  const entry = remoteEntry(def);
  if (entries.get(def.remote.name) === entry) return;
  registerRemotes([{ name: def.remote.name, entry }], { force: true });
  entries.set(def.remote.name, entry);
  log.info('registered', { name: def.remote.name, entry });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new RemoteLoadError('timeout', 'The app took too long to load.')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /ChunkLoadError|Failed to fetch dynamically imported module|Loading chunk|importing a module script failed/i.test(msg);
}

export async function loadDeskModule(def: DeskAppDef): Promise<DeskAppModule> {
  ensureRegistered(def);
  const remote = def.remote!;
  let mod: { default?: DeskAppModule } | null;
  try {
    mod = await withTimeout(
      loadRemote<{ default?: DeskAppModule }>(`${remote.name}/${remote.module.replace(/^\.\//, '')}`),
      config.remoteLoadTimeoutMs,
    );
  } catch (e) {
    if (e instanceof RemoteLoadError) throw e;
    log.error('load failed', { app: def.id, error: e instanceof Error ? e.message : String(e) });
    throw new RemoteLoadError('network', isChunkLoadError(e) ? 'A new version of the app is available.' : 'The app could not be loaded.');
  }
  const m = mod?.default;
  if (!m || typeof m.mount !== 'function' || !m.manifest) {
    throw new RemoteLoadError('invalid-module', 'The app did not export a desk module.');
  }
  if (m.manifest.id !== def.id) {
    throw new RemoteLoadError('id-mismatch', `The app identifies as "${m.manifest.id}", expected "${def.id}".`);
  }
  if (m.manifest.contract !== DESK_CONTRACT && m.manifest.contract !== ((DESK_CONTRACT - 1) as number)) {
    throw new RemoteLoadError('contract', 'This app needs a newer desk. Ask the app team to update it.');
  }
  return m;
}
