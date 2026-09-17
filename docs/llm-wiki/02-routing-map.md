# Routing Map

Routes live in `src/app/app.routes.ts`.

| Route | Guards / matchers | Purpose |
|---|---|---|
| `/` | redirect | `/experiments-dashboard` |
| `/experiments-dashboard` | `AuthGuard`, `TermsGuard` | default app area |
| `/terms` | `AuthGuard` | terms acceptance |
| `/account` | `AuthGuard`, `TermsGuard` | account page |
| `/experiment-studio` | `AuthGuard`, `TermsGuard` | experiment creation/results |
| `/notebook` | `NOTEBOOK_ENABLED` canMatch, `AuthGuard`, `TermsGuard` | optional notebook |
| `**` | redirect | fallback to dashboard |

## Lookup Order

1. Search route path in `src/app/app.routes.ts`.
2. Inspect the target component `.ts`.
3. Inspect only the guards used by that route.
4. Open services only if guard/component state requires it.

## Search Keys

- route path, component class, guard name
- `NOTEBOOK_ENABLED`, `canMatch`, `frontend_redirect`

For auth details read `08-auth-and-terms-flow.md`.
