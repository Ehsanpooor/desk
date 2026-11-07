# ELVA Desk — rules for this repo

Follow `../FRONTEND_STANDARDS.md` in full. This file only adds what is specific to the desk.

- This is a pnpm workspace: `packages/desk-sdk` (the contract every app builds against),
  `apps/desk` (the host), `examples/*` (throwaway remotes used to test the host).
- The desk has **no backend of its own**. The only server it talks to is the account
  service (`VITE_ACCOUNT_API_URL`). Every other network call belongs to the app that
  runs inside a window, through `ctx.auth.getAccessToken()`.
- The refresh token is stored in `localStorage` under `elva:desk:session` because the
  account API v2 returns it in the response body and sets no cookie. The access token
  lives in memory only. See `docs/DEPLOYMENT.md`.
- Window chrome tokens (`--desk-*`) are private to the desk. Apps use only the semantic
  tokens listed in `ELVA_DESK_FEDERATION.md` §6.3.
- `docs/design/` holds the HTML prototype. It is a reference, never imported or served.
- The architecture and the app contract are in `ELVA_DESK_FEDERATION.md`. The guide for
  app teams is `docs/APP_ONBOARDING.md`. Keep both in sync with the SDK types.
