/**
 * @elva/desk-sdk — the contract between the ELVA Desk (host) and an app
 * (remote) that opens inside one of its windows.
 *
 * The desk owns the frame, the session, the theme, the active location and
 * the URL. An app renders only its content, and the `DeskContext` it receives
 * at mount time is the only channel between the two.
 */

/** Contract major. A desk supports N and N-1. Bump on a breaking change. */
export const DESK_CONTRACT = 1 as const;
export type DeskContractVersion = typeof DESK_CONTRACT;

export type DeskEnv = 'development' | 'sandbox' | 'production';

/** A value the desk owns and the app may read and subscribe to. */
export interface Readable<T> {
  get(): T;
  /** Returns an unsubscribe function. Also detached automatically on unmount. */
  subscribe(fn: (value: T) => void): () => void;
}

export interface DeskSize {
  w: number;
  h: number;
}

export interface DeskIntent {
  name: string;
  params?: Record<string, string | number | boolean>;
}

export interface DeskAppManifest {
  /** Must match the id in the desk registry. Also the app's permission name. */
  id: string;
  contract: DeskContractVersion;
  /** The desk never resizes the window below this. Platform floor is 420 by 280. */
  minSize: DeskSize;
  defaultSize?: DeskSize;
  /** Default true. */
  singleInstance?: boolean;
  /** Intents this app handles, e.g. `['compose', 'open-thread']`. */
  intents?: string[];
}

export interface DeskAppInstance {
  unmount(): void | Promise<void>;
  /** Called when the window is already open and the desk receives a new intent. */
  handleIntent?(intent: DeskIntent): void;
}

export interface DeskAppModule {
  manifest: DeskAppManifest;
  mount(container: HTMLElement, ctx: DeskContext): DeskAppInstance | Promise<DeskAppInstance>;
}

// ── Session ──────────────────────────────────────────────────────────────────

export type DeskRole = 'admin' | 'staff' | 'provider';

export interface DeskPlan {
  product_name: string;
  name: string;
  billing_cycle: string;
  status: string;
}

export interface DeskSession {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  organization: { id: string; name: string };
  /** The active location. `pmsId` is the practice-management tenant key. */
  location: { id: string; pmsId: string | null; name: string; timezone: string };
  /** Every live location the person may switch to. Identity only. */
  locations: { id: string; name: string }[];
  access: {
    role: DeskRole;
    permissions: string[];
    plans: DeskPlan[];
    credits: { type: string; balance: number }[];
    /** Multi-factor sign-in was used for this session. */
    mfa: boolean;
  };
}

export interface DeskTheme {
  id: string;
  mode: 'light' | 'dark';
  reducedMotion: boolean;
  fontScale: number;
}

export interface DeskLocale {
  language: string;
  dir: 'ltr' | 'rtl';
}

// ── Window ───────────────────────────────────────────────────────────────────

export interface DeskWindowStatus {
  active: boolean;
  minimized: boolean;
  maximized: boolean;
  resizing: boolean;
  size: DeskSize;
}

export interface DeskWindowApi {
  /** The app's toolbar goes here, portalled. At most 28 px tall. */
  titlebarSlot: HTMLElement;
  /** Modals, popovers, menus and tooltips portal here. Covers the window only. */
  portalRoot: HTMLElement;
  status: Readable<DeskWindowStatus>;
  setTitle(title: string): void;
  /** Dock badge. `null` or 0 hides it. */
  setBadge(count: number | null): void;
  /** When true the desk asks before closing the window. */
  setDirty(dirty: boolean): void;
  /** Serializable, PHI-free view state. Restored after a reload or a remount. */
  state: { get<T>(): T | undefined; set<T>(value: T): void };
  close(): void;
}

export interface DeskToast {
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body?: string;
  action?: { label: string; run(): void };
}

export interface DeskNotification {
  title: string;
  body?: string;
  tag?: string;
}

export interface DeskAuthApi {
  /** Always async. Refreshes first when the token is near expiry. */
  getAccessToken(opts?: { forceRefresh?: boolean; audience?: string }): Promise<string>;
  /** Call after a 401 that survived one forced refresh. The desk decides what to do. */
  reportUnauthorized(): void;
  /**
   * Ask for a recent interactive sign-in before a sensitive action. The desk
   * restarts the hand-off with `max_age`; the page navigates away and comes
   * back with the window state restored. The promise never resolves in this page.
   */
  reauthenticate(opts?: { maxAgeSeconds?: number }): Promise<never>;
}

export interface DeskEventMap {
  'location:changed': { locationId: string };
  'session:ended': { reason: 'logout' | 'expired' | 'revoked' };
  'theme:changed': DeskTheme;
  'desk:visibility': { hidden: boolean };
  'patient:updated': { patientId: string };
}

export interface DeskEventsApi {
  emit<K extends keyof DeskEventMap>(type: K, payload: DeskEventMap[K]): void;
  on<K extends keyof DeskEventMap>(type: K, fn: (payload: DeskEventMap[K]) => void): () => void;
}

export interface DeskContext {
  sdkVersion: string;
  contract: DeskContractVersion;
  mode: 'desk';
  env: DeskEnv;
  app: { id: string; instanceId: string };
  /** Aborted exactly once, when the window unmounts. Pass it to listeners and fetches. */
  signal: AbortSignal;
  /** The intent the window was opened with, if any. */
  intent: DeskIntent | null;
  auth: DeskAuthApi;
  session: Readable<DeskSession>;
  theme: Readable<DeskTheme>;
  locale: Readable<DeskLocale>;
  window: DeskWindowApi;
  desk: {
    /** The desk's origin. Must equal `location.origin` of the page the app runs in. */
    origin: string;
    openApp(appId: string, intent?: DeskIntent): void;
    toast(toast: DeskToast): void;
    notify(notification: DeskNotification): void;
  };
  events: DeskEventsApi;
  telemetry: {
    reportError(error: unknown, extra?: Record<string, unknown>): void;
    track(name: string, props?: Record<string, unknown>): void;
  };
}
