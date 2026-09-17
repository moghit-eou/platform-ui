# LLM Wiki Entrypoint

Read this file first. Goal: spend the smallest useful context budget before
opening source files.

## Load Protocol

1. Read only this page.
2. Pick one topic page from the table below.
3. Use `indexes/files-by-feature.md` or `indexes/symbols-by-feature.md` to find
   the exact path or symbol.
4. Use CodeGraph for structural questions when available; use `rg` for literal
   text, labels, endpoints, selectors, and result keys.
5. Read source in a small range around the matched symbol or string.
6. Open whole files or folders only when the task is complex, cross-feature, or
   the targeted lookup does not explain the behavior.

## Topic Map

| Task | Read next |
|---|---|
| bootstrap, providers, architecture | `01-architecture-map.md` |
| route, redirect, guard, notebook flag | `02-routing-map.md` |
| user-facing feature ownership | `03-feature-index.md` |
| backend call, service, endpoint | `04-services-and-api-index.md` |
| DTO, state, payload, data flow | `05-models-and-data-flow.md` |
| algorithm config, result schema, mapper | `06-algorithm-mapping-index.md` |
| component, template, CSS, chart, export | `07-ui-components-index.md` |
| login, logout, active user, terms | `08-auth-and-terms-flow.md` |
| build, tests, proxy, Docker, nginx | `09-build-test-runbook.md` |
| unsure or mixed task | `10-task-context-recipes.md` |

## Repo Snapshot

- App: Angular standalone frontend, package `fl-platform`.
- Backend boundary: relative `/services` requests.
- Bootstrap: `src/main.ts` -> `src/app/app.config.ts`.
- Routes: `src/app/app.routes.ts`.
- Main areas: Experiment Studio, Experiments Dashboard, Account, Terms,
  optional Notebook.
- UI decisions: `DESIGN.md`, then the live tokens in `src/styles.css` `:root`.

## Expensive Context

Open only after a targeted lookup:

- `src/app/core/algorithm-mappers.ts`
- `src/app/pages/experiment-studio/**`
- `src/app/pages/experiments-dashboard/**`
- component templates/styles unrelated to UI work
- `src/assets/**`, `public/**`, `package-lock.json`, generated output

## Validation Defaults

- Static gate: `npm run verify` (typecheck + dead-code scan + build)
- Narrowest static check: `npm run typecheck`, or `npm run check:dead-code`
- Unit tests: `npm test` (Karma, needs a browser)
- Dev server: `npm start`

Run the narrowest check that proves the change.
