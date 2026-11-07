/**
 * The typed desk-wide event bus. Apps reach it through `ctx.events`, scoped
 * to their window's abort signal so listeners die with the window.
 */
import type { DeskEventMap, DeskEventsApi } from '@elva/desk-sdk';
import { logger } from '@/lib/logger';

const log = logger.child('events');

type Listener = (payload: unknown) => void;
const listeners = new Map<string, Set<Listener>>();

export const bus: DeskEventsApi = {
  emit(type, payload) {
    log.debug(`emit ${type}`, payload);
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        log.error(`listener for ${type} threw`, e);
      }
    }
  },
  on(type, fn) {
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    const l = fn as Listener;
    set.add(l);
    return () => {
      set?.delete(l);
    };
  },
};

/** An events API bound to a signal: every listener is removed on abort. */
export function scopedEvents(signal: AbortSignal): DeskEventsApi {
  return {
    emit: bus.emit,
    on<K extends keyof DeskEventMap>(type: K, fn: (p: DeskEventMap[K]) => void) {
      if (signal.aborted) return () => {};
      const off = bus.on(type, fn);
      signal.addEventListener('abort', off, { once: true });
      return () => {
        signal.removeEventListener('abort', off);
        off();
      };
    },
  };
}
