# Building an app for the ELVA Desk

**Who this is for:** the team of any ELVA product that should open as a window inside the ELVA Desk (SMS, Email, Forms, Pay, Chat, Bird Eye View, …).
**Read next:** [ELVA_DESK_FEDERATION.md](../ELVA_DESK_FEDERATION.md) for the full rules. This page is the short path from zero to a window.

---

## 1. What the desk is

The desk is one page, `desk.elva.ai`, that signs the person in once through the account app and then opens ELVA apps as windows on a shared desktop, with one menu bar, one dock, one theme and one session. Your app is loaded into that page at runtime with Module Federation. It runs in the same document and the same JavaScript realm as the desk and as every other open app.

That buys instant theme changes, one login, and no iframes. It also means the desk has to own a few things that a standalone app normally owns itself. Inside the desk your app:

- renders **only its content**: no header, no logo, no avatar, no location picker, no login, no window controls;
- gets the **session, token, theme, location and window** from the `DeskContext` it receives at mount time, and nowhere else;
- sizes itself to its **container**, never to the viewport;
- cleans up **everything** when the desk unmounts it.

## 2. Desk-only: your app must not open anywhere else

An app built for the desk is loaded only by the desk. Four things enforce that, and you own three of them.

| Lock | Who | What it does |
|---|---|---|
| **Context brand** | SDK | `defineDeskApp` refuses to mount unless the context was created by the desk. A context built by any other page is rejected before your code runs. |
| **Origin allowlist** | SDK | Mounting is refused unless the page is `https://desk.elva.ai`, `https://dev-desk.elva.ai` or `https://sand-desk.elva.ai`. Loopback origins are also accepted outside production, so you can develop locally. |
| **CORS on your hosting** | You | Your `mf-manifest.json`, `remoteEntry.js` and chunks are loaded as ES modules, which need CORS. Send `Access-Control-Allow-Origin` **only** for the desk origins above. A page elsewhere then cannot even fetch your module. |
| **No standalone entry** | You | Your `index.html` and `main.tsx` must not import `./desk`. If your product also ships a standalone site, it is a separate entry with its own login; the `./desk` module is never part of it. |

The SDK throws `DeskRefusedError` with a `reason` (`not-a-desk-context`, `origin-not-allowed`, `origin-mismatch`, `contract-mismatch`). You do not need to handle it; the desk does.

## 3. Eleven steps to a window

### 3.1 Install the SDK

```sh
pnpm add @elva/desk-sdk
```

`@elva/desk-sdk` is a shared singleton: there is exactly one copy in the page, provided by the desk. If your build bundles its own copy, the context brand check fails and your app shows "couldn't load". The `shared` block in the next step prevents that.

### 3.2 Vite config

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig(({ mode }) => ({
  // Chunks load from YOUR origin, never relative to the desk.
  base: mode === 'production' ? 'https://sms.elva.ai/' : 'http://localhost:5181/',
  build: { target: 'esnext' },
  plugins: [
    react(),
    federation({
      name: 'elva_sms',                 // the remote name in the desk registry
      filename: 'remoteEntry.js',
      manifest: true,                   // the desk loads mf-manifest.json
      publicPath: 'auto',               // REQUIRED: resolve files from the manifest URL, not the desk's origin
      exposes: { './desk': './src/desk/entry.tsx' },
      shared: {
        react:            { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom':      { singleton: true, requiredVersion: '^19.0.0' },
        '@elva/desk-sdk': { singleton: true, requiredVersion: '^1.0.0' },
      },
    }),
  ],
  server: {
    port: 5181,
    cors: { origin: [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'https://dev-desk.elva.ai'] },
  },
}));
```

Rspack or webpack apps use `@module-federation/enhanced` with the same options. The two interoperate.

### 3.3 The `./desk` entry

```tsx
// src/desk/entry.tsx — the only thing the desk loads from you
import { createRoot } from 'react-dom/client';
import { defineDeskApp } from '@elva/desk-sdk';
import { DeskProvider } from '@elva/desk-sdk/react';
import { AppRoot } from '../AppRoot';
import './desk.css';

export default defineDeskApp({
  manifest: { id: 'sms', contract: 1, minSize: { w: 560, h: 420 }, intents: ['compose', 'open-thread'] },
  mount(container, ctx) {
    // Everything this instance owns is created HERE, not at module level:
    // the React root, the QueryClient, stores, sockets.
    const root = createRoot(container);
    root.render(<DeskProvider ctx={ctx}><AppRoot /></DeskProvider>);
    return {
      unmount: () => root.unmount(),
      handleIntent: (intent) => { /* the window is already open; navigate */ },
    };
  },
});
```

`manifest.id` must equal your id in the desk registry **and** your permission name in the account service. The desk refuses a module whose id does not match.

### 3.4 Auth: one interceptor, no storage

Your app never logs in, never refreshes, never stores a token. One axios interceptor:

```ts
http.interceptors.request.use(async (cfg) => {
  cfg.headers.Authorization = `Bearer ${await ctx.auth.getAccessToken()}`;
  cfg.headers['X-Location-Id'] = ctx.session.get().location.id;   // UUID
  return cfg;
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

The token the desk hands you is a normal account-service token with `aud=elva-platform`. Every ELVA backend accepts it today. Call `getAccessToken()` per request; it is cheap, and the token changes on refresh and on location switch.

If an existing app has its own persisted auth store (chat does), the desk adapter must replace it in desk mode. A store that still refreshes on its own will race the desk's refresh and sign the user out, because refresh tokens are single use.

### 3.5 Theme: tokens only

Use the semantic tokens and nothing else: `var(--surface)`, `var(--ink-1)`, `var(--accent)`, `var(--danger-soft)`… The full list is in the federation guide, §6.3. Never write to `:root`, never toggle `.dark`, never load a font. With Tailwind v4, import `theme` and `utilities` only (no preflight) and use the platform dark variant:

```css
@custom-variant dark (&:where([data-mode="dark"], [data-mode="dark"] *));
```

Colors you need in JavaScript (charts, canvas): read them with `getComputedStyle(container).getPropertyValue('--chart-1')` and re-read on `ctx.theme.subscribe`.

People pick one of eight themes (`ctx.theme` gives its `id`: `elva`, `ocean`, `iris`, `rose`, `sunset`, `forest`, `sandstone`, `graphite`), each in light and dark. A theme changes the accent, the page tint and, in dark, the surfaces. Never assume the accent is teal, and never use it alone to mean "success" or "selected": Graphite's accent is grey. Check your app in at least two themes.

### 3.6 Scoping your CSS

The desk marks three elements with `data-elva-scope="<your id>"`: the window content, the title bar slot, and the overlay root. Your app root additionally carries `data-elva-app="<your id>"`.

- Put **component** rules under `[data-elva-scope="sms"]`, so they also style your toolbar and your modals, which render outside your root.
- Put **root-only** rules (height, background, font) under `[data-elva-app="sms"]`. Under the scope attribute they would also paint the toolbar and overlay elements.

### 3.7 Layout: fill the container, query the container

The element you receive has `container-type: size` and `container-name: elva-window`. Your root fills it (`width: 100%; height: 100%`), inner panes scroll, and breakpoints are container queries:

```css
[data-elva-scope="sms"] .layout { display: grid; grid-template-columns: 1fr; }
@container elva-window (min-width: 640px)  { [data-elva-scope="sms"] .layout { grid-template-columns: 300px 1fr; } }
@container elva-window (min-width: 1024px) { [data-elva-scope="sms"] .layout { grid-template-columns: 300px 1fr 320px; } }
```

Never `100vh`, `100vw`, `window.innerWidth` or `@media (min-width)`. For JS sizes use `ctx.window.status` or a `ResizeObserver` on your own element. While `status.resizing` is true, defer expensive redraws.

### 3.8 Window chrome you may use

- **Title:** `ctx.window.setTitle('Thread · (415) 555-0134')`. Short, no PHI you would not want in an OS notification.
- **Toolbar:** render 1 to 3 controls into the title bar with `<TitlebarPortal>`. Max 28 px tall. Interactive elements must be real `button`, `input` or `a`, or carry `data-no-drag`.
- **Badge:** `ctx.window.setBadge(n)` for the dock. Keep it current while minimized.
- **Unsaved changes:** `ctx.window.setDirty(true)`; the desk confirms before closing.
- **Overlays:** every modal, popover, menu, select and tooltip goes through `<WindowPortal>` (or `ctx.window.portalRoot` as the portal container of Radix, Headless UI, MUI). Nothing portals to `document.body`.
- **Toasts:** `ctx.desk.toast({ kind: 'success', title: 'Sent' })`. No toaster of your own.
- **Right-click:** the title bar's right-click menu (minimize, snap, center, keep on top, reload, close) belongs to the desk. Right-click inside your content and your toolbar is yours: leave the browser's menu or render your own menu through `<WindowPortal>`.
- **Keyboard:** don't bind `Ctrl/⌘+K`, or `Alt` (`⌥`) with `W`, `M`, `C`, `A`, `D`, `N`, `` ` `` or the arrow keys. The desk uses them for window management.

### 3.9 Lifecycle

| Signal | What to do |
|---|---|
| `mount` | Paint a skeleton within 100 ms. Fetch after first paint. |
| `ctx.signal` | Pass it to `addEventListener(…, { signal })` and `fetch(…, { signal })`. It aborts once, on unmount. |
| `status.active === false` | Disable your keyboard shortcuts. |
| `status.minimized === true` | Pause polling, animation, audio. Keep the socket that drives the badge. |
| `events.on('location:changed')` | Drop every cache (`queryClient.clear()`), reopen sockets, re-check `access.permissions`, reset to a safe route. |
| `events.on('session:ended')` | Wipe anything you cached. |
| `unmount` | Close sockets, clear timers, remove listeners, unmount the root. The desk calls it exactly once. |

The desk may unmount a minimized window after a while and remount it later. Save what you need to come back with `ctx.window.state.set({ route, threadId })`. It must be JSON-serializable and PHI-free: IDs, not names.

### 3.10 Routing and intents

Use a memory router. Initial route = `ctx.window.state.get()?.route ?? '/'`. Never touch `history` or `location`.

Another app opens you with `ctx.desk.openApp('sms', { name: 'compose', params: { patientId: 'p_91' } })`. If your window is open, the desk calls your `handleIntent`. If not, the intent arrives as `ctx.intent` at mount. List your intents in the manifest. Ignore unknown ones.

### 3.11 Hosting

- `base` is your absolute origin. Deploy to `<app>.elva.ai`, `dev-<app>.elva.ai`, `sand-<app>.elva.ai`.
- `mf-manifest.json` and `remoteEntry.js`: `Cache-Control: no-cache`. Hashed chunks: `public, max-age=31536000, immutable`.
- Keep the previous build's chunks online for at least 7 days. Open windows lazy-load old chunks.
- CORS: `Access-Control-Allow-Origin` for the desk origins only (see §2).

## 4. Developing against the desk locally

1. Clone the desk repo, `pnpm install`, `pnpm dev`. The desk runs on `http://localhost:5190` and signs in through the dev account app.
2. Run your app's dev server, e.g. on port 5181, with CORS for localhost (see §3.2).
3. In the desk tab, point your app at your machine:
   ```js
   localStorage.setItem('elva:desk:override:sms', 'http://localhost:5181/mf-manifest.json');
   ```
   then reload. The override is ignored by production builds of the desk.
4. Launch your app from the dock. A failed load shows the reason on the window's failure page; the desk console (`localStorage.setItem('elva:log','debug')`) has the detail.

`examples/hello-app` in the desk repo is a complete minimal app. Copy it.

## 5. Getting into the registry

The registry lives in the desk at `apps/desk/src/registry/apps.ts`. Open a PR adding one entry:

```ts
{ id: 'sms', name: '2-Way SMS', permission: 'frontdesk', mode: 'federated', order: 40,
  icon: '/apps/sms.svg', remote: { name: 'elva_sms', host: 'sms.elva.ai', module: './desk' },
  defaultSize: { w: 1400, h: 860 } }
```

- `permission` is the account-service permission that opens your app. A permission is an app. If your product needs a new one, product adds it to the account catalog first.
- The dock shows your app to everyone; it is locked for people who lack the permission at the active location. The desk draws the locked page; you are never loaded.
- Icon: an SVG in `apps/desk/public/apps/`.

Nothing has to be registered in the account admin for a federated app. The desk's own client id covers the session.

## 6. Definition of done

- [ ] Exposes `./desk` with `defineDeskApp`; manifest `id`, `contract`, `minSize`, `intents`.
- [ ] `./desk` is not imported by the standalone entry. Hosting sends CORS for desk origins only.
- [ ] No header, logo, avatar, location picker or window controls. Title via `setTitle`, toolbar in the slot.
- [ ] Container queries only. Root fills 100%. No `vh`/`vw`.
- [ ] Tokens only. No `:root` writes, no `.dark` toggling, no fonts. JS colors re-read on theme change.
- [ ] Auth only through `ctx.auth`. No token in storage. One retry on 401, then `reportUnauthorized`.
- [ ] Reacts to `location:changed` and `session:ended`.
- [ ] Memory router. View state saved with `ctx.window.state`, serializable and PHI-free.
- [ ] Overlays in `WindowPortal`, toasts through `ctx.desk.toast`.
- [ ] CSS scoped under `[data-elva-scope="<id>"]` (components) and `[data-elva-app="<id>"]` (root only), no preflight, no global selectors.
- [ ] Full cleanup on unmount. Pauses while minimized. Listeners use `ctx.signal`.
- [ ] Errors through `ctx.telemetry`. No `Sentry.init()` in desk mode.
- [ ] Tested in the desk at 420×280, 640, 1024 and 1440 widths, light and dark, with a location switch while open.

## 7. `DeskContext` at a glance

| Member | Purpose |
|---|---|
| `app.id`, `app.instanceId` | Who you are in this desk |
| `env` | `development` · `sandbox` · `production` |
| `signal` | Aborts on unmount |
| `intent` | The intent you were opened with, or `null` |
| `auth.getAccessToken({ forceRefresh? })` | A valid bearer token |
| `auth.reportUnauthorized()` | After a 401 that survived a forced refresh |
| `auth.reauthenticate({ maxAgeSeconds })` | Ask for a fresh sign-in before a sensitive action. The page leaves and comes back. |
| `session.get()` / `.subscribe()` | user, organization, location (id, pmsId, name, timezone), locations, access (role, permissions, plans, credits, mfa) |
| `theme.get()` / `.subscribe()` | id, mode, reducedMotion, fontScale |
| `locale.get()` | language, dir |
| `window.titlebarSlot`, `window.portalRoot` | Where toolbars and overlays go |
| `window.status.get()` | active, minimized, maximized, resizing, size |
| `window.setTitle`, `setBadge`, `setDirty`, `state`, `close` | Window services |
| `desk.openApp(id, intent?)`, `desk.toast(t)`, `desk.notify(n)` | Desk services |
| `events.emit` / `events.on` | Typed platform events |
| `telemetry.reportError`, `telemetry.track` | Through the desk's logger |

React helpers in `@elva/desk-sdk/react`: `DeskProvider`, `useDesk`, `useReadable`, `useDeskSession`, `useDeskTheme`, `useWindowStatus`, `useWindowTitle`, `useDeskEvent`, `useHasPermission`, `TitlebarPortal`, `WindowPortal`.
