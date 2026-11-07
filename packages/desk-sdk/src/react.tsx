import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  DeskContext,
  DeskEventMap,
  DeskSession,
  DeskTheme,
  DeskWindowStatus,
  Readable,
} from './types';

const Ctx = createContext<DeskContext | null>(null);

export function DeskProvider({ ctx, children }: { ctx: DeskContext; children: ReactNode }) {
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

/** The desk context. Throws outside a `DeskProvider`. */
export function useDesk(): DeskContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDesk() must be used inside <DeskProvider>.');
  return ctx;
}

/** Subscribe a component to any desk `Readable`. */
export function useReadable<T>(readable: Readable<T>): T {
  return useSyncExternalStore(readable.subscribe, readable.get, readable.get);
}

export function useDeskSession(): DeskSession {
  return useReadable(useDesk().session);
}

export function useDeskTheme(): DeskTheme {
  return useReadable(useDesk().theme);
}

export function useWindowStatus(): DeskWindowStatus {
  return useReadable(useDesk().window.status);
}

/** Set the window title while the component is mounted. */
export function useWindowTitle(title: string): void {
  const { window: win } = useDesk();
  useEffect(() => {
    win.setTitle(title);
  }, [win, title]);
}

/** Render children into the window's title bar slot. */
export function TitlebarPortal({ children }: { children: ReactNode }) {
  const { window: win } = useDesk();
  return createPortal(children, win.titlebarSlot);
}

/** Render children into the window's overlay root. Use for every modal and popover. */
export function WindowPortal({ children }: { children: ReactNode }) {
  const { window: win } = useDesk();
  return createPortal(children, win.portalRoot);
}

/** Subscribe to a desk event for the life of the component. */
export function useDeskEvent<K extends keyof DeskEventMap>(
  type: K,
  fn: (payload: DeskEventMap[K]) => void,
): void {
  const { events } = useDesk();
  useEffect(() => events.on(type, fn), [events, type, fn]);
}

/** True when the user holds a permission at the active location. */
export function useHasPermission(name: string): boolean {
  const session = useDeskSession();
  return useMemo(() => session.access.permissions.includes(name), [session, name]);
}
