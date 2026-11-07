# ELVA Desk

One page, one login, every ELVA app as a window.

```
packages/desk-sdk   @elva/desk-sdk — the contract every app builds against
apps/desk           the desk itself (host): session, windows, dock, theme
examples/hello-app  a minimal app that opens inside the desk; copy it to start yours
docs/               APP_ONBOARDING.md (for app teams) · DEPLOYMENT.md · design/ (references)
ELVA_DESK_FEDERATION.md   the architecture and the full rules
```

## Run it

```sh
pnpm install
pnpm dev            # http://localhost:5190 — signs in through the dev account app
pnpm dev:example    # http://localhost:5181 — the example app, shown in the dock in development
pnpm build          # SDK, then the desk
pnpm typecheck && pnpm lint
```

The desk needs its client registered in the account admin before anyone can sign in. See `docs/DEPLOYMENT.md`.

## Building an app for it

Read `docs/APP_ONBOARDING.md`. Eleven steps, one example to copy, and the rules that make an app open only inside the desk.

## Sample data

On 2026-11-07 the product owner asked for the desk to match the prototype in `docs/design/` exactly, including its desktop widgets. There is no weather source yet, so the weather widget reads the prototype's sample conditions from `apps/desk/src/desk/widgets/sample/`. That folder is deletable: replace it with a real `WeatherSource` when one is chosen.
