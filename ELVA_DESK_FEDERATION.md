# ELVA Desk: Module Federation Guide

**Who this is for:** every frontend developer building the ELVA Desk (the host), or an app that opens as a window inside it (a remote).
**Status:** v1, 2026-11-07. Implemented in this repo: `packages/desk-sdk` (the contract) and `apps/desk` (the host). Items marked **[Decision needed]** are not settled yet. They are collected in [§18](#18-open-decisions). The short path for app teams is [docs/APP_ONBOARDING.md](docs/APP_ONBOARDING.md).

---

## 0. TL;DR: the 12 rules

1. **The Desk owns the frame.** It renders the window, the title bar, the dock and the menu bar. A remote renders **only its content**. It has no header of its own: no logo, no app name, no avatar, no location picker and no close button.
2. **Size to the container, never to the viewport.** Use container queries and `ResizeObserver`. Don't use `100vw`, `100vh`, `window.innerWidth` or `@media (min-width)` for layout.
3. **The Desk owns the session.** A remote never logs in, never refreshes a token, never logs out and never stores a token. It calls `ctx.auth.getAccessToken()` for every request.
4. **The Desk owns the theme.** A remote uses semantic CSS tokens only (`var(--surface)`). It never hard-codes a color, never sets variables on `:root`, and never toggles `.dark`.
5. **The Desk owns the active location.** On `location` change, a remote drops its caches and refetches.
6. **The Desk owns the URL.** A remote uses a memory router, never `BrowserRouter`.
7. **One contract.** A remote exposes exactly one module, `./desk`, that matches `DeskAppModule` from `@elva/desk-sdk`.
8. **Share almost nothing.** The only shared singletons are `react`, `react-dom` and `@elva/desk-sdk`. State is never shared through modules.
9. **CSS must not leak.** No global selectors, no Tailwind preflight in the desk build, and everything scoped: components under `[data-elva-scope="<id>"]` (also on the title bar slot and overlay root), root-only rules under `[data-elva-app="<id>"]`.
10. **Overlays stay in the window.** Modals and popovers portal into `ctx.window.portalRoot`. Toasts go through `ctx.desk.toast()`.
11. **Clean up on unmount.** Close sockets, abort fetches, clear timers and remove listeners. Pause work while the window is minimized.
12. **Apps never import each other.** Cross-app actions go through `ctx.desk.openApp(appId, intent)` or `ctx.events`.
13. **Apps open only in the desk.** `defineDeskApp` refuses any context the desk did not create and any page that is not a desk origin; the app's hosting sends CORS for desk origins only; the standalone entry never imports `./desk`. See [§14.1](#141-desk-only-enforcement).

---

## 1. Terms

| Term | Meaning |
|---|---|
| **Desk / Host** | The ELVA Desk shell: menu bar, desktop, windows, dock. It loads remotes at runtime. |
| **Remote / App** | A product app (SMS, Email, Forms, Pay, Chat, …) built and deployed on its own, then loaded into a Desk window. |
| **Window** | The frame the Desk draws around one running app: title bar, resize handles, minimize/maximize/close. |
| **Registry** | The per-location list of apps that comes from the backend: which are purchased, their entry URLs, dock order and mode. |
| **Context (`ctx`)** | The object the Desk passes to a remote at mount time. It is the **only** channel between them. |
| **Standalone mode** | The same app running on its own domain (e.g. `sms.elva.ai`) with its own shell and login. |
| **Desk mode** | The app mounted inside a Desk window. |

---

## 2. Architecture

```
┌──────────────────────────── ELVA Desk (host) ────────────────────────────┐
│ Menu bar: active app · Window · Help ·········· Location ▾ · clock · user │
│ ┌─ Window (Desk-owned) ──────────────────────────────┐                   │
│ │ ● ● ●   [ title ]   [ titlebarSlot: remote toolbar ]│   owns:          │
│ │────────────────────────────────────────────────────│   • session/JWT   │
│ │                                                    │   • location      │
│ │   Remote content, mounted via mount(container,ctx) │   • theme/tokens  │
│ │   [ portalRoot: the app's modals/popovers ]        │   • URL, shortcuts│
│ │                                                  ◢ │   • registry      │
│ └────────────────────────────────────────────────────┘   • toasts, badges│
│                       Dock:  ⬚ ⬚ ⬚ ⬚ | ⬚ ⬚                                │
└──────────────────────────────────────────────────────────────────────────┘
        ▲ loadRemote('elva_sms/desk')
        │
  https://sms.elva.ai/mf-manifest.json  (or remoteEntry.js)
```

All remotes run in the **same document and the same JS realm** as the Desk. There are no iframes. That is why theme changes reach every app instantly, and why the CSS-isolation and cleanup rules matter.

### 2.1 App modes in the registry

| Mode | When | How it opens |
|---|---|---|
| `federated` (default) | First-party ELVA apps | Module Federation, rendered in a Desk window |
| `external` | Apps that can't be federated yet, or need a full browser window (e.g. RCM, Brain) | `window.open(url, 'elva-<id>', features)`. The app does its own SSO. |
| `iframe` | Third-party or untrusted content only | Sandboxed `<iframe>` in a window. Theme and token passing go over `postMessage`. Avoid this mode. |
| locked (derived) | The person lacks the app's permission at the active location | The **Desk** renders the locked page. The remote is never loaded. |

**The registry lives in the desk build** (`apps/desk/src/registry/apps.ts`), not in a backend response. The token already carries everything that varies per person and location: `access.permissions`. A permission *is* an app, so there is no separate `purchased` flag and no `requiredPermission`; one `permission` field decides. Remote URLs are derived from the environment and the app's host, so they can never come from a response, a query string or storage (the development override in §13 excepted).

Registry entry shape:

```ts
{ id: 'sms', name: '2-Way SMS', permission: 'frontdesk', mode: 'federated', order: 40,
  icon: '/apps/sms.svg', remote: { name: 'elva_sms', host: 'sms.elva.ai', module: './desk' },
  defaultSize: { w: 1400, h: 860 } }
```

The desk resolves `host` to `https://sms.elva.ai`, `https://dev-sms.elva.ai` or `https://sand-sms.elva.ai` by environment and appends `/mf-manifest.json`.

---

## 3. Tooling

- **Plugin:** Module Federation 2.0. Vite apps use `@module-federation/vite`. Rspack/Webpack apps use `@module-federation/enhanced`. They interoperate.
- **Why not `@originjs/vite-plugin-federation`?** It works for static remotes, but the Desk needs **runtime** registration, because the registry differs per location. MF 2.0 also gives us `mf-manifest.json`, typed remotes and a proper shared-scope runtime. Apps on `@originjs` today should migrate when they adopt the Desk contract.
- **Contract package:** `@elva/desk-sdk`. It holds the TypeScript types, `defineDeskApp`, React helpers and a dev harness. It is versioned with semver and is a shared singleton.
- **Token package:** `@elva/tokens`. It holds the token names, theme values, a Tailwind preset and the no-flash boot script.

### 3.1 Remote `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig(({ mode }) => ({
  // REQUIRED: chunks must load from the remote's own origin, not the Desk's.
  base: mode === 'production' ? 'https://sms.elva.ai/' : 'http://localhost:5181/',
  build: { target: 'esnext' },
  plugins: [
    react(),
    federation({
      name: 'elva_sms',
      filename: 'remoteEntry.js',
      manifest: true,
      exposes: { './desk': './src/desk/entry.tsx' },
      shared: {
        react:            { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom':      { singleton: true, requiredVersion: '^19.0.0' },
        '@elva/desk-sdk': { singleton: true, requiredVersion: '^1.0.0' },
      },
    }),
  ],
}));
```

### 3.2 Host loading (runtime)

```ts
import { registerRemotes, loadRemote } from '@module-federation/enhanced/runtime';
import type { DeskAppModule } from '@elva/desk-sdk';

registerRemotes(
  registry.filter(a => a.mode === 'federated' && a.purchased)
          .map(a => ({ name: a.remote.name, entry: a.remote.entry })),
  { force: true } // re-register when the location (and therefore the registry) changes
);

const mod = await withTimeout(loadRemote<{ default: DeskAppModule }>(`${app.remote.name}/desk`), 10_000);
```

### 3.3 What is shared and what is not

| Dependency | Share? | Why |
|---|---|---|
| `react`, `react-dom` | **Yes, singleton** | Hooks break with two copies. React **major** upgrades are a coordinated platform release. |
| `@elva/desk-sdk` | **Yes, singleton** | One copy of the contract and helpers |
| `@elva/tokens` CSS | **No, the Desk loads it once** | Tokens arrive as CSS variables on `<html>`, not as JS |
| Router, state libs (zustand, redux), react-query, UI kits, date libs | **No** (or as a non-singleton for bundle size only) | Each app owns its versions. **Never share state through a module instance.** |
| Fonts | **No, the Desk loads them** | Remotes must not inject `@font-face` or Google Fonts links in desk mode |

Rule: if you are tempted to share a library so two apps can "see the same store", use `ctx.events` or an intent instead.

---

## 4. The contract (`@elva/desk-sdk` v1)

```ts
export interface DeskAppModule {
  manifest: DeskAppManifest;
  mount(container: HTMLElement, ctx: DeskContext): DeskAppInstance | Promise<DeskAppInstance>;
}

export interface DeskAppInstance {
  unmount(): void | Promise<void>;
  /** The app is already open and the Desk asks it to handle a new intent (deep link). */
  handleIntent?(intent: DeskIntent): void;
}

export interface DeskAppManifest {
  id: string;                         // must match the registry id
  contract: 1;                        // SDK major the app was built against
  minSize: { w: number; h: number };  // ≥ platform floor 420×280
  defaultSize?: { w: number; h: number };
  singleInstance?: boolean;           // default true
  intents?: string[];                 // e.g. ['compose', 'open-thread']
}

export interface Readable<T> { get(): T; subscribe(fn: (v: T) => void): () => void; }

export interface DeskContext {
  sdkVersion: string;
  contract: 1;
  mode: 'desk';
  env: 'development' | 'sandbox' | 'production';
  app: { id: string; instanceId: string };
  /** Aborted exactly once, when the window unmounts. Pass it to listeners and fetches. */
  signal: AbortSignal;
  /** The intent the window was opened with, if any. */
  intent: DeskIntent | null;

  auth: {
    /** Always async. Returns a valid token and refreshes first if it is near expiry. */
    getAccessToken(opts?: { forceRefresh?: boolean; audience?: string }): Promise<string>;
    /** Call after a 401 that survived one forced refresh. The Desk decides what to do. */
    reportUnauthorized(): void;
    /** Ask for a recent sign-in before a sensitive action. The page leaves and comes back. */
    reauthenticate(opts?: { maxAgeSeconds?: number }): Promise<never>;
  };

  session: Readable<{
    user: { id: string; name: string; email: string; avatarUrl: string | null };
    organization: { id: string; name: string };
    location: { id: string; pmsId: string | null; name: string; timezone: string };
    locations: { id: string; name: string }[];
    access: { role: string; permissions: string[]; plans: DeskPlan[]; credits: { type: string; balance: number }[]; mfa: boolean };
  }>;

  theme: Readable<{ id: string; mode: 'light' | 'dark'; reducedMotion: boolean; fontScale: number }>;
  locale: Readable<{ language: string; dir: 'ltr' | 'rtl' }>;

  window: {
    titlebarSlot: HTMLElement;      // the app's toolbar goes here (§5.2)
    portalRoot: HTMLElement;        // modals/popovers/menus go here (§5.6)
    status: Readable<{ active: boolean; minimized: boolean; maximized: boolean;
                       resizing: boolean; size: { w: number; h: number } }>;
    setTitle(title: string): void;
    setBadge(count: number | null): void;          // dock badge
    setDirty(dirty: boolean): void;                // Desk confirms before close
    state: { get<T>(): T | undefined; set<T>(v: T): void }; // serializable; restored after reload
    close(): void;
  };

  desk: {
    /** The desk's origin. Must equal `location.origin` of the page the app runs in. */
    origin: string;
    openApp(appId: string, intent?: DeskIntent): void;
    toast(t: { kind: 'info' | 'success' | 'warning' | 'error'; title: string; body?: string;
               action?: { label: string; run(): void } }): void;
    notify(n: { title: string; body?: string; tag?: string }): void; // OS notification via Desk
  };

  events: {
    emit<K extends keyof DeskEventMap>(type: K, payload: DeskEventMap[K]): void;
    on<K extends keyof DeskEventMap>(type: K, fn: (p: DeskEventMap[K]) => void): () => void;
  };

  telemetry: { reportError(err: unknown, extra?: Record<string, unknown>): void;
               track(name: string, props?: Record<string, unknown>): void };
}

export interface DeskIntent { name: string; params?: Record<string, string | number | boolean> }
```

**Why `mount()` and not "export a React component"?** It keeps the boundary framework-neutral. The Desk can upgrade React, or host a non-React app, without breaking remotes. It also makes the lifecycle (mount and unmount) explicit. The SDK ships a React helper, so a React app's entry stays tiny:

```tsx
// src/desk/entry.tsx (remote)
import { createRoot } from 'react-dom/client';
import { defineDeskApp } from '@elva/desk-sdk';
import { DeskProvider } from '@elva/desk-sdk/react';
import { AppRoot } from '../AppRoot';      // same component tree as standalone
import './desk.css';                         // scoped CSS, no preflight

export default defineDeskApp({
  manifest: { id: 'sms', contract: 1, minSize: { w: 560, h: 420 }, intents: ['compose', 'open-thread'] },
  mount(container, ctx) {
    container.dataset.elvaApp = 'sms';
    const root = createRoot(container);
    root.render(<DeskProvider ctx={ctx}><AppRoot /></DeskProvider>);
    return { unmount: () => root.unmount() };
  },
});
```

### 4.1 One codebase, two shells

Every app ships both modes from the same code. Only the adapters differ:

```
src/
  AppRoot.tsx          ← the product; reads everything through usePlatform()
  platform/
    PlatformContext.ts ← interface: auth, session, theme, navigate, toast, openApp
    standalone.tsx     ← own login (PKCE), own header, BrowserRouter, theme from cookie
    desk.tsx           ← wraps ctx; no header, MemoryRouter, theme from Desk
  main.tsx             ← standalone entry (index.html)
  desk/entry.tsx       ← federated entry (./desk)
```

Product code must never check `isDesk` in fifty places. It calls `usePlatform()`, and the adapter decides.

---

## 5. Windows, layout and resizing

### 5.1 Who draws what

| Desk draws | Remote draws |
|---|---|
| Window frame, shadow, radius, resize handles | Everything inside the content area |
| Title bar (40 px): traffic lights, app icon + title, drag area | Optional toolbar *inside* `titlebarSlot` |
| Menu bar: active app name, location switcher, user, clock | Nothing in the menu bar |
| Dock: icon, running dot, badge, bounce | `setBadge(n)` only |
| Locked/upsell page, load-failure page, sign-in/lock screen | Its own empty, error and loading states |

### 5.2 No header: use the title bar slot

A remote-owned header usually wastes 56–72 px of every window, and it repeats what the title bar already says. In desk mode a remote must **not** render a top app bar. Instead:

- **Window title:** `ctx.window.setTitle('Thread · (415) 555-0134')`. Keep it short. The Desk truncates it.
- **Primary controls** (search, a segmented control, 1–3 icon buttons): render them into `ctx.window.titlebarSlot` with a portal. This is the "unified toolbar" pattern, the same as Finder or Mail.

```tsx
import { createPortal } from 'react-dom';
const { window: win } = useDesk();
return createPortal(<Toolbar />, win.titlebarSlot);
```

Title bar slot rules:
- Fixed height: content is at most **28 px** tall and vertically centered. Do not change the title bar height.
- Anything interactive in the slot must be a real `button`, `input` or `a`, or carry `data-no-drag`. The Desk treats every other pixel of the title bar as the drag handle, and treats double-click as maximize.
- Space is limited. Below the `compact` breakpoint, collapse the controls into one `⋯` menu button.
- No app logo, no user avatar, no location name and no close/minimize buttons in the slot.
- Section headings inside the content ("Today", "Conversations") are fine. A *page-level* header bar is not.

**Space-saving layouts** that fit Desk windows best:

| Pattern | Use for | Behavior as the window shrinks |
|---|---|---|
| **Sidebar + content** | Multi-section apps (Core, Marketing) | expanded: full sidebar 220–260 px → medium: icon rail 56 px → compact: drawer behind a `☰` in the title bar slot |
| **List / detail** (two or three panes) | Inbox-style apps (SMS, Email, Chat) | expanded: list + detail (+ inspector) → medium: list + detail, inspector becomes a sheet → compact: a single pane with push/back navigation |
| **Single canvas** | Boards, dashboards (Bird Eye View) | The grid reflows with `auto-fit` / `minmax()`. Text never shrinks below 12 px. |

### 5.3 Responsive: container-first

The Desk sets `container-type: size; container-name: elva-window;` on the content element. The remote must:

- **Lay out with container queries**, never viewport media queries:
  ```css
  [data-elva-scope="sms"] .layout { display: grid; grid-template-columns: 1fr; }
  @container elva-window (min-width: 640px)  { [data-elva-scope="sms"] .layout { grid-template-columns: 300px 1fr; } }
  @container elva-window (min-width: 1024px) { [data-elva-scope="sms"] .layout { grid-template-columns: 300px 1fr 320px; } }
  ```
  With Tailwind v4, use the built-in `@container` variants (`@md:`, `@lg:`) or custom ones mapped to the platform breakpoints.
- **Fill the container:** the root is `height: 100%; width: 100%; overflow: hidden`. Inner panes scroll (`overflow: auto; min-height: 0`). **Never** use `100vh`, `100vw`, `dvh` or `window.innerHeight`.
- **Use JS sizes only via** `ctx.window.status` or a `ResizeObserver` on your own element. This is for charts, virtualized lists and canvases.

**Platform breakpoints (container width):**

| Name | Width | Typical window |
|---|---|---|
| `compact` | < 640 px | Phone (Desk goes full-screen), narrow side-by-side |
| `medium` | 640 – 1023 px | Default small window |
| `expanded` | 1024 – 1439 px | Default large window |
| `wide` | ≥ 1440 px | Maximized on a big monitor |

Mirror these in the standalone build with media queries **only in the standalone shell**. Product components still use container queries, so the same component works in both modes. Standalone sets `container-type` on its own main area.

### 5.4 Size limits

- **Platform floor:** 420 × 280. The Desk never makes a window smaller.
- **App minimum:** `manifest.minSize`. Raise it only if the app is truly unusable below that size. Design `compact` well instead.
- **Default size:** registry `defaultSize` beats `manifest.defaultSize`, which beats the Desk default. The Desk clamps it to the screen.
- **Maximize** fills the desk area above the dock. On screens **< 768 px wide** the Desk opens every window maximized, one at a time. The app simply sees `compact`.

### 5.5 Resizing performance

- While the user drags, `status.resizing === true`. Debounce expensive work until it is `false`: chart redraws, map re-fits, measuring layouts.
- The Desk puts a transparent pointer shield over window contents while dragging or resizing. Do not fight it, and do not attach global `pointermove` listeners that assume you own the screen.
- Avoid layout thrash: no `getBoundingClientRect` loops on every resize frame. Virtualize long lists.
- Respect `theme.reducedMotion` (and `prefers-reduced-motion`) for in-app animation.

### 5.6 Overlays, z-index and stacking

- Each window is its own stacking context (`isolation: isolate`, and it is transformed while animating). A remote's `z-index` only matters **inside its window**. Never use huge values (`z-index: 99999`) to escape it.
- `position: fixed` inside a transformed window behaves like `absolute` relative to the window. Do not use `fixed` to mean "the screen".
- **Modals, dialogs, sheets:** window-scoped. Portal into `ctx.window.portalRoot`, which covers the window content (not the whole desk). Other apps stay usable.
- **Popovers, menus, tooltips, selects** (Radix, Headless UI, MUI): set the portal container to `ctx.window.portalRoot`. The default `document.body` breaks z-order between windows, and the overlay outlives the window on unmount.
- **Toasts:** never render your own toaster in desk mode. Use `ctx.desk.toast()`. The Desk keeps one stack for all apps.
- **System-level confirms** (unsaved changes on close): call `ctx.window.setDirty(true)` and the Desk asks the user.

### 5.7 Lifecycle

| Event | What the remote must do |
|---|---|
| `mount` | Render fast. Show a skeleton within 100 ms and fetch after first paint. |
| `active → false` | Disable app-level keyboard shortcuts |
| `minimized → true` | Pause polling, animations, video and audio. Keep sockets that drive the dock badge. Keep state. |
| `minimized → false` | Resume and refetch stale data |
| `unmount` | Close sockets, abort fetches (`AbortController`), clear timers, remove listeners and portals, and `queryClient.clear()` |
| Desk reload | The Desk re-mounts open windows and passes back `ctx.window.state`. Save the view state you need (selected thread, tab, filters) with `state.set()`. It must be **serializable and PHI-free**: IDs, not names. |

The Desk may unmount a minimized window under memory pressure and re-mount it later, so `state` must be good enough to restore the view.

### 5.8 Keyboard and focus

- **Reserved for the Desk:** `⌘/Ctrl+K` (launcher), and with `Alt` (`⌥` on a Mac): `W` close, `M` minimize, `C` center, `←`/`→` snap to a half, `↑` fill the screen, `↓` previous size or minimize, `A` show all windows, `D` show desktop, `N` new sticky note, `` ` `` cycle windows. Remotes must not bind these. The browser owns `⌘/Ctrl+W` and `⌘/Ctrl+M`, so the desk cannot use them. Keys are matched by `KeyboardEvent.code`, so `⌥` letters work on a Mac; on a Mac the desk ignores them while focus is in a text field, where `⌥` types characters and `⌥←/→` move by word.
- **Right-click:** the desk owns right-click on the title bar (outside the toolbar slot), the dock, widgets, sticky notes and the bare desktop. Inside the app's content and its toolbar, right-click belongs to the app: the browser's menu, or the app's own menu rendered through `portalRoot`. Shift+right-click always gives the browser's menu.
- **Window management:** windows snap to halves and quarters (drag to an edge or corner, or the title bar menu), fill the screen (drag to the top), center, cascade, tile, sit side by side, stay on top, and can be swept off screen ("show desktop") or laid out together ("show all windows"). Apps see all of this only through `status.size`, `status.maximized` and `status.active`; none of it needs app code.
- App shortcuts fire **only while `status.active`**. Bind them on your container, not `window`, where you can.
- `Esc` closes the app's own topmost overlay. It never closes the window.
- Focus moves into the window on activation. Return focus sensibly when overlays close. All controls must be reachable by keyboard.

---

## 6. Theme, color schema and dark mode

### 6.1 Model

- **Theme** = a named palette family (e.g. Sandstone, Daybreak). Each theme defines **both** a light and a dark variant.
- **Themes in the Desk today:** `elva` (default, teal), `ocean`, `iris`, `rose`, `sunset`, `forest`, `sandstone`, `graphite`. A theme sets `--accent*`, `--focus-ring`, `--chart-1`, `--page` and `--surface-mute`; its dark variant also tints `--surface` and `--surface-raised`. Ink, status and line tokens never change with the theme, so contrast pairs stay as checked. The accent can be any hue, including the near-neutral Graphite: never use the accent alone to signal a status. Switching plays a circular reveal from the click (View Transitions; instant with reduced motion).
- **Mode** = `light | dark | system`. `system` follows `prefers-color-scheme` live.
- **Source of truth:** the **user's preference on their account**, so it is the same across the Desk, standalone apps and devices. The Desk reads it, applies it and writes it back. **[Decision needed: the account service needs a `preferences` field or endpoint. Until then the Desk stores it in the `.elva.ai` cookie (§6.5).]**
- **Optional:** an organization or location **brand accent** that overrides `--accent*` only. Every other token stays theme-controlled for contrast. **[Decision needed]**

### 6.2 Mechanism: CSS variables on `<html>`

The Desk applies the theme once, on the document root:

```html
<html data-theme="sandstone" data-mode="dark" class="dark" style="color-scheme: dark">
```

…plus `:root` CSS variables generated by `@elva/tokens`. Remotes live in the same document, so **every app re-themes at the same instant, with zero JavaScript**. That is the whole reason to keep tokens as CSS and not as JS props.

### 6.3 Token contract (semantic tier)

Remotes may use **only** these names (the final list lives in `@elva/tokens`):

| Group | Tokens |
|---|---|
| Surfaces | `--page`, `--surface`, `--surface-mute`, `--surface-raised`, `--overlay` |
| Text | `--ink-0` (strongest) … `--ink-4` (faintest), `--ink-on-accent` |
| Lines | `--line`, `--line-strong`, `--focus-ring` |
| Brand | `--accent`, `--accent-hover`, `--accent-soft`, `--accent-ink` |
| Status | `--success`, `--warning`, `--danger`, `--info`, each with `-soft` and `-ink` |
| Data viz | `--chart-1` … `--chart-8`, `--chart-grid`, `--chart-axis` |
| Shape | `--radius-sm/md/lg/xl`, `--shadow-1/2/3` |
| Type | `--font-sans`, `--font-mono`, `--font-scale` |
| Motion | `--ease-out`, `--ease-in-out`, `--dur-fast/med/slow` |

Tiers: **primitive** (raw palette, private to `@elva/tokens`) → **semantic** (the contract above) → **component** (optional, defined *inside* a remote, derived only from semantic tokens).

### 6.4 Rules for remotes

- ✅ `background: var(--surface)`, Tailwind `bg-surface text-ink-1` via the `@elva/tokens` Tailwind preset.
- ❌ Hex/rgb literals, `bg-white`, `text-gray-500`, `dark:bg-zinc-900` with raw palette values.
- ❌ Setting any variable on `:root`/`html`/`body`, toggling `.dark`, or writing `color-scheme`. Only the Desk does this.
- ✅ Dark-specific tweaks with the platform variant: `@custom-variant dark (&:where([data-mode="dark"], [data-mode="dark"] *));`
- ✅ Need the colors in JS (charts, canvas, maps)? Read them with `getComputedStyle(container).getPropertyValue('--chart-1')`, and **re-read on `ctx.theme.subscribe`**. A chart drawn once keeps the old theme otherwise.
- ✅ Images and illustrations: provide dark variants or use `currentColor` SVGs.
- ✅ Every theme ships with WCAG AA contrast for `ink-0..2` on `page`/`surface`, checked in CI in `@elva/tokens`. Remotes must not invent new text/background pairs that skip this check.

### 6.5 Keeping every app in sync (including outside the Desk)

| Where | How it syncs |
|---|---|
| All windows inside the Desk | Automatic, through the shared CSS variables |
| Desk ↔ standalone tabs on *.elva.ai | The Desk writes cookie `elva_theme=<theme>.<mode>` (Domain=`.elva.ai`, not HttpOnly, SameSite=Lax) and the account preference. Standalone apps re-read on `visibilitychange`/`focus`. |
| Same-origin tabs | `BroadcastChannel('elva-theme')` for an instant update |
| `external` apps / `iframe` apps | The cookie for external apps. A `postMessage({type:'elva:theme', …})` for iframes, after an origin check. |
| First paint (no flash) | Standalone `index.html` inlines the `@elva/tokens/boot.js` snippet. It reads the cookie and sets `data-theme`/`data-mode` before CSS loads. |

---

## 7. Authentication, JWT and the Account app

### 7.1 Ownership

- **The Desk is an OAuth client** (`client_id: desk`) of the Account app. It runs the PKCE hand-off (`/login` → `?code=` → `POST /auth/handoff/redeem`). It holds the access token and the refresh token.
- **Remotes hold no credentials.** In desk mode a remote must never:
  - redirect to the account login,
  - call `/auth/refresh`, `/auth/switch-location` or `/auth/logout`,
  - read or write tokens in `localStorage`, `sessionStorage` or cookies,
  - read another app's persisted auth store.

**Why this is non-negotiable:** refresh tokens are **single-use**. If two apps on the same page both rotate the same refresh token, the second call fails and revokes the session, and the user gets kicked out. Exactly one owner (the Desk) serializes refreshes.

### 7.2 Using the token

```ts
// remote: one HTTP client, one interceptor
http.interceptors.request.use(async (config) => {
  config.headers.Authorization = `Bearer ${await ctx.auth.getAccessToken()}`;
  config.headers['X-Location-Id'] = ctx.session.get().location.uuid; // UUID, not ascend id
  return config;
});
http.interceptors.response.use(undefined, async (error) => {
  const cfg = error.config;
  if (error.response?.status === 401 && !cfg._retried) {
    cfg._retried = true;
    cfg.headers.Authorization = `Bearer ${await ctx.auth.getAccessToken({ forceRefresh: true })}`;
    return http(cfg);
  }
  if (error.response?.status === 401) ctx.auth.reportUnauthorized();
  throw error;
});
```

- Call `getAccessToken()` **per request**. Do not cache the token in module state. It changes on refresh and on location switch.
- **Never** put a JWT in a URL, a query string, `window.open` arguments or logs.
- WebSockets: authenticate with a short-lived token fetched from `getAccessToken()` when connecting. Reconnect after `session` changes (location switch → new token).

### 7.3 Audience / one token for all backends?

**[Decision needed: backend team.]** Today each app has its own `client_id`. Pick one of these:
- **A. Platform audience:** a Desk-issued token is accepted by every ELVA backend (simplest).
- **B. Per-app tokens:** the Desk exchanges its session for an app-scoped token: `getAccessToken({ audience: 'sms' })`. The SDK signature already allows adding this without breaking changes.

Until this is decided, every backend that a federated app calls must accept the Desk's token, and its CORS allowlist and account "allowed origins/client apps" must include the Desk origin(s) for dev, sandbox and prod.

### 7.4 Location (practice) switching

- The location switcher lives **only** in the Desk menu bar.
- On switch the Desk calls `/auth/switch-location`. That issues a new access token whose `access` (role, permissions, plans) belongs to the new location. The Desk then reloads the registry (purchased apps can differ), updates `ctx.session` and emits `location:changed`.
- Remotes must then:
  1. drop all location-scoped caches (`queryClient.clear()`, in-memory stores),
  2. close and reopen location-scoped sockets,
  3. re-check permissions,
  4. reset in-window navigation to a safe route. A thread ID from location A is meaningless in location B.
- If the app is not purchased or permitted at the new location, the **Desk** closes the window or swaps it for the locked page.
- Note the IDs: account-service headers use the location **UUID**. Some legacy backends use the **ascend ID** in URL paths. Both are on `ctx.session.location`, so use the right one per service.

### 7.5 Permissions and plans

- The Desk decides whether an app is shown or locked (registry `purchased` + `requiredPermission`).
- The remote handles **fine-grained** permissions (`access.permissions.includes('sms.send')`) to hide or disable actions.
- The backend **always** enforces. UI checks are for UX only.
- The organization-admin account (`admin` instead of `user`) opens no apps. The Desk handles that case.

### 7.6 Logout, session expiry, idle lock

- Only the Desk logs out. It calls `/auth/logout` **with** the refresh token (otherwise the session stays alive for 7 days), emits `session:ended`, unmounts every window and clears desk storage.
- Remotes listen for `session:ended` as a last chance to wipe anything they cached.
- **Idle lock (PHI):** after N minutes idle the Desk shows a lock overlay over all windows and pauses them. The remote sees `minimized`-like pausing. **[Decision needed: timeout value per clinic policy.]**
- **Storage rule:** remotes do not persist PHI in `localStorage` or IndexedDB in desk mode. Draft text, if persisted, is keyed by app + location + user and cleared on `session:ended`.

### 7.7 Standalone and external apps

- In standalone mode the app does its own PKCE login with its own `client_id`. The Account app reuses its session, so users don't type a password again.
- `external` apps opened from the Desk get SSO the same way. The Desk passes **only** a non-secret hint in the URL (e.g. `?location=<uuid>`), never a token.

---

## 8. Routing and deep links

- **Desk mode:** `MemoryRouter` (or your router's memory history). Initial route = `ctx.window.state.get()?.route ?? '/'`. Save the route with `state.set()` on change.
- **The Desk owns the browser URL.** It may reflect open windows for reload/restore, e.g. `desk.elva.ai/?open=sms:/threads/123`. Remotes do not touch `history` or `location`.
- **Deep links / intents:** another app (or a notification) calls `ctx.desk.openApp('sms', { name: 'compose', params: { patientId: 'p_91' } })`. If the window is open, the Desk calls `instance.handleIntent()`. If not, it mounts the app and passes the intent through `ctx`. List the intents you handle in `manifest.intents`. Unknown intents are ignored, not errors.
- Links to *outside* resources open in a new tab (`target="_blank" rel="noopener"`).

---

## 9. App-to-app communication

| Need | Use |
|---|---|
| "Open app X showing Y" | `ctx.desk.openApp(appId, intent)` |
| Broadcast a fact ("patient updated") | `ctx.events.emit('patient:updated', { patientId })` |
| Ask another app for data | **Don't.** Call the backend. Apps are not each other's APIs. |
| Share a component | Publish it in a normal npm package (design system). Do not expose it through federation. |

The **event map is typed in `@elva/desk-sdk`**. Adding an event means a PR there, so every team sees it. Payloads carry **IDs only**, never PHI blobs or tokens.

Platform events (emitted by the Desk): `location:changed`, `session:ended`, `theme:changed` (also via `ctx.theme`), `desk:visibility` (tab hidden or shown).

---

## 10. Data and state inside a remote

- Each app instance creates its **own** `QueryClient` and stores inside `mount()`, **not at module top level**. A module-level singleton leaks between instances and survives unmount.
- Query keys include the location UUID.
- Storage keys are namespaced: `elva:<appId>:<locationUuid>:<key>`. Never write unprefixed keys. Never write cookies on `.elva.ai` except the platform cookies the SDK writes.
- Realtime: each app may hold its own socket for now. It must close it on unmount and on location change. **[Decision needed: a Desk-level shared realtime channel to avoid N sockets.]**
- Badges: keep the badge count in sync with `ctx.window.setBadge()` even while minimized. That is how users notice new SMS or email.

---

## 11. CSS isolation

All remotes share one document, so one careless selector can restyle the whole Desk.

- **No global selectors** in the desk build: no `html`, `body`, `*`, `h1`, `button` and no `:root`. Scope component rules under `[data-elva-scope="<id>"]`, which the desk puts on the window content, the title bar slot and the overlay root, so toolbars and modals are covered. Root-only rules go under `[data-elva-app="<id>"]`. Use a PostCSS prefix step or CSS `@scope ([data-elva-scope="sms"]) { … }`.
- **No CSS reset in the desk build.** The Desk loads one base reset (`@elva/tokens/base.css`). With Tailwind v4, import `theme` and `utilities` only, without `preflight`.
- **Tailwind across apps:** all apps use the `@elva/tokens` Tailwind preset, so utility names map to the same token variables. Different Tailwind versions can still collide on utility definitions. If an app can't stay on the platform Tailwind version, it must use a class prefix (`@import "tailwindcss" prefix(sms);`).
- **CSS loading:** use `cssCodeSplit` and let the federation plugin inject the CSS for the exposed module. CSS stays in the document after unmount, which is one more reason everything must be scoped.
- **No `!important`** to beat the Desk or other apps.
- **Fonts:** the Desk loads them. Use `var(--font-sans)`.

---

## 12. Errors, loading and resilience

- The Desk wraps every window in an **error boundary** and a **load timeout** (10 s). On failure the window shows "SMS couldn't load · Retry" and the rest of the Desk keeps working. One broken remote must never take down the Desk.
- The remote has its own inner error boundary for partial failures, so it doesn't crash the whole window.
- Show a skeleton immediately and avoid blank windows. Use `--surface-mute` shimmer, not a spinner over white.
- **ChunkLoadError** (a deploy happened while the window was open): the SDK catches it and offers "A new version is available · Reload app". That re-mounts only that window.
- Report errors with `ctx.telemetry.reportError()`. **Do not call `Sentry.init()` in desk mode.** The Desk owns one Sentry client and tags events with `app.id`, the version and the window instance. Two `init` calls overwrite each other.

---

## 13. Deployment, versioning and caching

- **Independent deploys:** each remote deploys on its own schedule to its own origin (`<app>.elva.ai`, plus `dev-`/`sand-` per env).
- **Cache headers:**
  - `remoteEntry.js`, `mf-manifest.json`: `Cache-Control: no-cache` (they are the pointer to the current version).
  - Hashed chunks/CSS: `Cache-Control: public, max-age=31536000, immutable`.
  - **Keep the previous build's chunks online for at least 7 days.** Users with an open window lazy-load old chunks. Deleting them right away causes ChunkLoadErrors after every deploy.
- **CORS on assets:** remote origins must send `Access-Control-Allow-Origin` for the Desk origins (federated chunks load as ES modules, which need CORS).
- **Contract versioning:** `@elva/desk-sdk` follows semver. The Desk supports contract **N and N-1**. A breaking contract change gives remotes a migration window. A remote whose `manifest.contract` is not supported shows "Update required" instead of mounting.
- **Shared version policy:** the Desk pins the React major. Remotes declare `requiredVersion` ranges. `singleton: true` with a mismatched major logs a warning in dev and **fails CI** (see §15).
- **Environments:** the Desk in env X loads only env-X remotes, through the registry. There is no hard-coded production URL in any dev build.
- **Local development:** in non-production Desk builds, a developer can point one app at localhost:
  `localStorage.setItem('elva:desk:override:sms', 'http://localhost:5181/mf-manifest.json')`. The production Desk ignores overrides. The desk itself runs on `http://localhost:5190` (`pnpm dev`).

---

## 14. Security

- A federated remote runs **with the Desk's full privileges** (same realm, same DOM). Therefore:
  - Only **first-party** apps from the **backend registry** load as federated. URLs never come from query strings, user input or `localStorage` (except the dev override above, which is off in prod).
  - Third-party content uses `iframe` mode with `sandbox` and a strict `postMessage` origin check.
- **CSP on the Desk:** `script-src 'self' https://*.elva.ai` (per env), `connect-src` limited to the ELVA API and WebSocket origins. Remotes must not need `unsafe-eval`.
- No `dangerouslySetInnerHTML` with server or user text unless it is sanitized (DOMPurify).
- No PHI in window titles shown in OS notifications, in `console.log` in production, in telemetry or in `events` payloads.
- `postMessage` (iframe and external apps): always check `event.origin` against the allowlist and validate the message shape.

### 14.1 Desk-only enforcement

An app built for the desk cannot be opened on any other page. Four locks, two in the SDK and two the app team owns:

| Lock | Where | Mechanism |
|---|---|---|
| Context brand | SDK | The desk creates every `DeskContext` through `@elva/desk-sdk/host`, which records it in a private `WeakSet`. `defineDeskApp` refuses a context that is not in the set. Because the SDK is a shared singleton, a page that bundles its own copy fails the check too. |
| Origin allowlist | SDK | `defineDeskApp` refuses unless `location.origin` is one of `DESK_ORIGINS` (`desk.elva.ai`, `dev-desk.elva.ai`, `sand-desk.elva.ai`). Loopback origins are also accepted when `ctx.env` is not `production`, for local development. It also checks `ctx.desk.origin === location.origin`. |
| CORS | App hosting | `mf-manifest.json`, `remoteEntry.js` and chunks send `Access-Control-Allow-Origin` for desk origins only. Federated chunks load as ES modules, so a page on another origin cannot fetch them at all. This is the lock that holds against a copied SDK. |
| No standalone entry | App build | `index.html` and `main.tsx` never import `./desk`. |

The SDK throws `DeskRefusedError` with a `reason`; the desk shows it on the window's failure page.

---

## 15. Testing and the dev harness

- `@elva/desk-sdk/dev` provides **`<DeskSimulator>`**, a fake Desk window you run in the remote's own dev server. It has resize handles, a theme and mode switcher, a location switcher, minimize/active toggles and an event log. Use it to develop desk mode without running the real Desk.
- Required checks before an app is added to the registry:
  - [ ] Visual check at 420×280, 640, 1024 and 1440 widths, in light and dark, in at least two themes.
  - [ ] Live theme switch while open: nothing stays in the old colors (check charts!).
  - [ ] Location switch while open: data refetches and no data from the old location remains.
  - [ ] Minimize/restore, close/reopen: no leaked sockets, timers or listeners (check DevTools → Performance monitor).
  - [ ] Two different apps open side by side: no style bleed in either direction.
  - [ ] Every overlay (dialog, menu, select, tooltip) stays inside its window.
  - [ ] Forced 401: one refresh, one retry, then `reportUnauthorized`. No login redirect from the remote.
  - [ ] Keyboard only: you can reach and leave every control. Desk shortcuts still work.
  - [ ] CI: `mf-manifest.json` shared versions are within the platform policy.

---

## 16. Accessibility, locale and time

- **Timezone:** clinic times use `ctx.session.location.timezone`, **not** the browser's timezone. A manager at home in another timezone must see clinic time.
- **Language and direction:** read `ctx.locale` and respect `dir`. Use logical CSS properties (`margin-inline-start`).
- **Text size:** honor `--font-scale` (a Desk accessibility setting). Use `rem`/tokens, not fixed `px` for text.
- **Reduced motion:** honor `theme.reducedMotion`.
- Contrast is guaranteed only for token pairs (§6.4).

---

## 17. Checklists

### Remote: definition of done for desk mode

- [ ] Exposes `./desk` with `defineDeskApp`, a manifest with `id`, `contract`, `minSize` and `intents`
- [ ] No header, logo, avatar, location picker or own window controls. Title via `setTitle`, toolbar in `titlebarSlot`.
- [ ] Container queries only. No `vh`/`vw`. Root fills 100% and inner panes scroll.
- [ ] Tokens only. No `:root` writes, no `.dark` toggling. JS colors re-read on theme change.
- [ ] Auth only through `ctx.auth`. No storage of tokens. 401 handled once, then reported.
- [ ] Reacts to `location:changed` and `session:ended`
- [ ] Memory router. View state saved with `ctx.window.state` (serializable, PHI-free).
- [ ] Overlays in `portalRoot`, toasts through `ctx.desk.toast`
- [ ] CSS scoped, no preflight, no fonts injected
- [ ] Full cleanup on unmount. Pauses while minimized.
- [ ] Errors through `ctx.telemetry`. No own Sentry init.
- [ ] `base` set to the absolute remote origin. CORS and cache headers configured.
- [ ] Passes the §15 checks in `DeskSimulator`

### Desk (host)

- [ ] Registry fetched per location and refetched on switch. Locked/external/iframe modes handled.
- [ ] Single owner of the PKCE session and the serialized refresh. `getAccessToken` with a near-expiry refresh.
- [ ] Theme applied on `<html>`, synced to the cookie and the account preference, plus a no-flash boot script
- [ ] Window frame: drag (respects `data-no-drag`), resize with a pointer shield, min-size clamp, maximize, phone full-screen
- [ ] Per-window error boundary, load timeout, ChunkLoadError recovery
- [ ] Global shortcuts, toasts, notifications, dock badges, idle lock
- [ ] One Sentry client. CSP. Dev override disabled in prod.

---

## 18. Open decisions

| # | Decision | Owner | Recommendation |
|---|---|---|---|
| 1 | Token audience: one platform token vs per-app exchange (§7.3) | Backend / Account | **Settled by the current backends:** every service verifies `aud=elva-platform` and ignores `client_id`, so the desk token works everywhere (A). The SDK signature stays B-ready. |
| 0 | The desk client in the account admin | Account | **Done on dev:** `client_id: desk`, type web, permission `desk`, localhost redirect. People need `desk` at a location to open the desk there. Register sandbox and production the same way. |
| 2 | Where the theme preference lives (§6.1) | Account | A `preferences` JSON on the user, returned in `/me` |
| 3 | Org/location brand accent override (§6.1) | Design | Allow `--accent*` only, with a contrast check |
| 4 | Idle-lock timeout (§7.6) | Product / Compliance | Configurable per organization, default 15 min |
| 5 | Shared realtime channel (§10) | Platform | Start per-app. Move to a Desk-multiplexed socket when there are more than 3 apps with sockets. |
| 6 | Multi-instance windows (e.g. two Email windows) | Product | Single instance in v1. The contract already carries `instanceId`. |
| 7 | Migrating apps on `@originjs/vite-plugin-federation` and their existing floating widgets | Each app team | Add `./desk` alongside the old expose. Remove the old one once the Desk is live. |
| 8 | Where desk sticky notes live | Platform / Compliance | Today: `localStorage`, keyed per user and location, so another person on the same machine never sees them. Notes can hold patient details, so move them to a notes API (per user and location) before production. |
| 9 | Weather source for the desk widget | Product | Today: the prototype's sample conditions (`apps/desk/src/desk/widgets/sample/`). Pick a provider and give locations coordinates (or a city) in the account service. |

---

## 19. Migrating an existing app (common gaps)

Most current ELVA frontends were built as standalone sites or as floating widgets. Typical changes:

1. **Own auth store persisted to `localStorage` with its own refresh logic.** In desk mode, swap it for the Desk adapter. Don't just "skip the redirect": a persisted store that still refreshes will collide with the Desk (§7.1).
2. **Own header and app bar.** Hide it in desk mode and move the actions into `titlebarSlot`.
3. **Own launcher, FAB, minimize/expand states.** The Desk window replaces all of these. Delete them in desk mode.
4. **Theme code that writes `:root` variables or toggles `.dark`.** Keep it in the standalone adapter only.
5. **`position: fixed` panels and `100vh` layouts.** Convert them to container-filling layouts.
6. **Own `<Toaster/>`, Radix portals to `body`, global CSS reset.** Route them to the Desk toast, `portalRoot` and the scoped CSS.
7. **Module-level `QueryClient` and stores.** Create them inside `mount()`.
8. **Relative asset `base`.** Set the absolute origin.
