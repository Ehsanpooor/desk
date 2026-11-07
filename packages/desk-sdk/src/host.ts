/**
 * Host-side helpers. Only the ELVA Desk imports this entry; an app never does.
 */
import { brandContext } from './guards';
import type { DeskContext, Readable } from './types';

export { brandContext };

/** A tiny observable the desk uses for every `Readable` it hands to apps. */
export interface Writable<T> extends Readable<T> {
  set(value: T): void;
}

export function createReadable<T>(initial: T): Writable<T> {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const fn of [...listeners]) fn(value);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/**
 * Bind every `subscribe` on a readable to a signal, so an app that forgets to
 * unsubscribe still stops receiving updates after unmount.
 */
export function scopedReadable<T>(source: Readable<T>, signal: AbortSignal): Readable<T> {
  return {
    get: () => source.get(),
    subscribe(fn) {
      if (signal.aborted) return () => {};
      const off = source.subscribe(fn);
      const onAbort = () => off();
      signal.addEventListener('abort', onAbort, { once: true });
      return () => {
        signal.removeEventListener('abort', onAbort);
        off();
      };
    },
  };
}

/** Marks a context as desk-made. Call once, after the object is complete. */
export function finalizeContext(ctx: DeskContext): DeskContext {
  return brandContext(Object.freeze(ctx));
}
