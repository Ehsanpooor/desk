# Deploying the ELVA Desk

The desk is a static Vite build with no backend of its own. It talks to exactly one service, the account service, and loads ELVA apps at runtime from their own origins.

## Environments

| Env | Desk origin | Account API | Account app |
|---|---|---|---|
| production | `https://desk.elva.ai` | `https://account-api-prd.elva.ai/api/v2` | `https://account.elva.ai` |
| sandbox | `https://sand-desk.elva.ai` | `https://sand-account-az.elva.ai/api/v2` | `https://sand-account.elva.ai` |
| development | `https://dev-desk.elva.ai` and `http://localhost:5190` | `https://dev-account-az.elva.ai/api/v2` | `https://account-web-dev.elva.ai` |

The origins above are also baked into `@elva/desk-sdk` (`DESK_ORIGINS`). An app refuses to mount on any other origin, so a new desk origin needs an SDK release.

## Vercel

Project root: `apps/desk`. `vercel.json` is minimal; the backend origin and everything else comes from environment variables set in the dashboard:

| Variable | Required | Example |
|---|---|---|
| `VITE_ENV` | yes | `production` |
| `VITE_ACCOUNT_API_URL` | yes outside development | `https://account-api-prd.elva.ai/api/v2` |
| `VITE_ACCOUNT_APP_URL` | yes outside development | `https://account.elva.ai` |
| `VITE_OAUTH_CLIENT_ID` | no | `desk` |
| `VITE_LOG_LEVEL` | no | `error` |
| `VITE_SOFT_LOCK_MINUTES` | no | `15` |
| `VITE_HARD_LOCK_HOURS` | no | `12` |

A missing required value fails the build with the variable's name. The build command compiles the SDK first (`pnpm --filter @elva/desk-sdk build && vite build`).

## One-time setup in the account admin

Under **Platform → Client apps**, add the desk as a **web** client:

- `client_id`: `desk`
- `permission`: **`desk`** (as registered on dev, 2026-11-07). A person needs the `desk` permission at a location to open the desk there. Inside the desk, each app is still gated by its own permission from `access.permissions`.
- Redirect URIs, one per line: `https://desk.elva.ai/loginok`, `https://dev-desk.elva.ai/loginok`, `https://sand-desk.elva.ai/loginok`, `http://localhost/loginok` (any port; dev and sandbox only).

Because the client has a permission, the account service also refuses the organization account at hand-off, so no desk-side rule is needed for it (the desk still shows a clear page if one ever arrives).

**Granting access:** add `desk` to the person's membership at each location where they should use the desk (account app → People, or `elva-admin`). Without it, sign-in ends on "You don't have Desk here".

The account API's CORS already allows `*.elva.ai` origins in every environment, and localhost on dev and sandbox.

## Where the session lives

The account API v2 returns the refresh token in the response body and sets no cookie. The desk therefore keeps:

- the **access token in memory** only, per tab, shared with other desk tabs over a `BroadcastChannel`;
- the **refresh token in `localStorage`** under `elva:desk:session`, read at refresh time so every tab rotates the newest one, with refreshes serialized through `navigator.locks`.

This is the same arrangement every other ELVA frontend uses with this API. Moving to an HttpOnly cookie would require the account service to set one, or a small desk backend acting as a token holder; neither exists today.

## Headers to set on the desk's hosting

Vercel's defaults are fine for a static build. Recommended additions, configured in the dashboard, not in `vercel.json`:

- `Content-Security-Policy`: `default-src 'self'; script-src 'self' https://*.elva.ai 'sha256-<hash of the inline theme script in index.html>'; connect-src 'self' https://*.elva.ai wss://*.elva.ai; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'`. Loading an app from a non-`elva.ai` origin needs `script-src` widened for that origin; the local override only works in non-production builds.
- `Referrer-Policy: strict-origin-when-cross-origin`.

## Headers apps must set on their hosting

- `Access-Control-Allow-Origin` for the desk origins only, on `mf-manifest.json`, `remoteEntry.js` and every chunk.
- `Cache-Control: no-cache` on `mf-manifest.json` and `remoteEntry.js`; `public, max-age=31536000, immutable` on hashed chunks.
- Keep the previous build online for at least 7 days.

## Local development

```sh
pnpm install
pnpm dev            # builds the SDK, then serves the desk on http://localhost:5190
pnpm dev:example    # the example app on http://localhost:5181
```

Sign-in goes through the real dev account app; there is no mock. The example app appears in the dock as "Hello (example)" only when `VITE_ENV` is `development`. To test any other app from your machine:

```js
localStorage.setItem('elva:desk:override:<app id>', 'http://localhost:<port>/mf-manifest.json');
```

Runtime logging: `localStorage.setItem('elva:log', 'debug')` or `?log=debug`.
