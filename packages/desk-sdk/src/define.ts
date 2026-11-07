import { assertDeskContext, DeskRefusedError } from './guards';
import { DESK_CONTRACT, type DeskAppInstance, type DeskAppModule, type DeskContext } from './types';

/**
 * Wrap an app's `./desk` export so it can only mount inside a genuine desk.
 *
 * - Refuses a context the desk did not create.
 * - Refuses a page that is not a desk origin.
 * - Refuses a contract the desk does not speak.
 * - Guarantees `unmount()` runs at most once.
 */
export function defineDeskApp(module: DeskAppModule): DeskAppModule {
  if (module.manifest.contract !== DESK_CONTRACT) {
    throw new DeskRefusedError(
      'contract-mismatch',
      `manifest.contract must be ${DESK_CONTRACT}; got ${String(module.manifest.contract)}.`,
    );
  }
  return {
    manifest: Object.freeze({ ...module.manifest }),
    async mount(container: HTMLElement, ctx: DeskContext): Promise<DeskAppInstance> {
      assertDeskContext(ctx);
      container.dataset.elvaApp = module.manifest.id;
      const instance = await module.mount(container, ctx);
      let done = false;
      return {
        ...instance,
        async unmount() {
          if (done) return;
          done = true;
          await instance.unmount();
        },
      };
    },
  };
}
