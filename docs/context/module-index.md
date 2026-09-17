# Module Index

## `src/app`
Purpose: Main Angular application source.
Key files: `app.routes.ts`, `app.config.ts`, `app.component.*`.
Used by: Angular bootstrap from `src/main.ts`.
Rules: Keep app-wide providers, route definitions, and shell wiring here; avoid feature logic in the root shell.
Tests: Root component and route behavior are covered indirectly by page/service specs.
Notes: Uses standalone Angular and zoneless change detection.

## `src/app/guards`
Purpose: Route access control for authentication and terms/NDA.
Key files: `auth.guard.ts`, `terms.guard.ts`.
Used by: `app.routes.ts`.
Rules: Preserve auth and NDA boundaries; do not duplicate guard decisions in unrelated UI code.
Tests: Add focused guard tests when route access behavior changes.
Notes: `/terms` intentionally skips `TermsGuard`; `/notebook` also uses `TermsGuard` and runtime `NOTEBOOK_ENABLED` canMatch.

## `src/app/services`
Purpose: Cross-feature state, backend calls, auth/session, exports, runtime env, rules, and errors.
Key files: `auth.service.ts`, `experiment-studio.service.ts`, `experiments-dashboard.service.ts`, `experiment-folders.service.ts`, `algorithm-rules.service.ts`, `runtime-env.service.ts`.
Used by: Pages, guards, shared components, and visualization/export flows.
Rules: Keep orchestration and API access here; prefer existing services before adding new shared state.
Tests: Service specs live beside services as `*.spec.ts`.
Notes: `ExperimentStudioService` is high-risk because it coordinates selection state, transient calls, run/edit flows, and sessionStorage persistence. `ExperimentFoldersService` owns analysis sets and nothing else: PostgreSQL is the store and `/services/experiment-folders` is the only door — nothing is kept in the browser. `setActiveUser(user)` points the `folders` signal at the signed-in user (username is only the cache key; the session cookie picks the rows server-side), and every mutation is an `Observable` that writes back the folder the server returned, never a locally edited copy. Routes and bodies are tabulated in `models/backend-experiment-folder.model.ts`; the service maps a `409` to the `null`/`false` the inline "that name is taken" messages speak and rethrows everything else. Folders hold member ids only, with each folder's members partitioned across its `sets` (`ExperimentSet = { id, name, experimentIds[] }`) and Ungrouped meaning simply "a member no set has taken". The partition is strict — `moveToSet` repoints the membership row so the set that had it gives the run up — because a run in two sections has no honest count; deleting a set returns its runs instead of deleting them. `pruneExperiment` is the one local-only mutation, and only because the experiment delete behind it has already cascade-dropped the membership rows.

## `src/app/models`
Purpose: Backend DTOs, frontend models, and shared interfaces.
Key files: `backend-experiment.model.ts`, `backend-algorithms.model.ts`, `algorithm-definition.model.ts`, `data-model.interface.ts`, `filters.model.ts`, `experiment-folder.model.ts`.
Used by: Services, mappers, page components, and visualization logic.
Rules: Keep API shape changes explicit and compatibility-aware.
Tests: Model changes are usually validated through service/mapper/component tests.
Notes: Prefer extending existing interfaces over ad hoc `any` where practical.

## `src/app/core`
Purpose: Algorithm/result mapping, constants, and utility logic.
Key files: `algorithm-mappers.ts`, `algorithm-result-enum-mapper.ts`, `algorithm-parameter.utils.ts`, `filter-display.utils.ts`, `constants/algorithm.constants.ts`, `outlier-rules.ts`, `share.utils.ts`, `route-path.utils.ts`, `experiment-drag.utils.ts`.
Used by: Experiment Studio, result rendering, services, and tests.
Rules: Treat algorithm key aliases and result schema mappings as compatibility-sensitive.
Tests: `algorithm-mappers.spec.ts`, `algorithm-result-enum-mapper.spec.ts`.
Notes: Stored historical experiment payloads may depend on legacy algorithm keys.

## `src/app/pages/experiment-studio`
Purpose: Experiment composition workflow.
Key files: `experiment-studio.component.*`, `variables-panel/*`, `statistic-analysis-panel/*`, `algorithm-panel/*`, `execution-panel/*` (result view + docked setup summary), `stepper/*`, `shared/*`, `guide/*`.
Used by: `/experiment-studio` route and dashboard edit flows.
Rules: Keep page-specific UI here; use `ExperimentStudioService` for shared selection/run state.
Tests: Component specs live near components.
Notes: Browser validation often requires a backend with data models, algorithms, and authenticated user state.

## `src/app/pages/experiment-studio/visualisations`
Purpose: Chart/table rendering for algorithm outputs, histograms, metadata browsers, and auto-rendered results.
Key files: `charts/chart-registry.ts`, `charts/chart-builder.service.ts`, `auto-renderer/algorithm-table-registry.ts`, renderer files under `charts/renderers`.
Used by: Algorithm result panels, dashboard detail/compare, and statistics views.
Rules: Register new algorithm outputs in the existing registries; preserve legacy aliases when changing algorithm keys.
Tests: Registry and renderer specs live in this subtree.
Notes: Registry keys and legacy aliases are compatibility-sensitive; check stored experiment data before removing an alias.

## `src/app/pages/experiments-dashboard`
Purpose: Experiment listing, filtering, detail, compare, sharing, rename, deletion UI, plus user-curated folders ("analysis sets").
Key files: `experiments-dashboard.component.*`, `experiments-dashboard.mapper.ts`, `experiment-list/*`, `experiment-detail/*`, `experiments-compare/*`, `experiment-folder/*`, `experiment-search/*`.
Used by: `/experiments-dashboard` route; folders are read and written through `ExperimentFoldersService` (`/services/experiment-folders`, scoped to the signed-in user by session).
Rules: Keep backend-to-frontend mapping in the mapper; preserve rollback behavior for optimistic deletion. Folders hold member ids only, and membership is pruned on a delete event or a 404 — never against the visible page, which is server-paginated. Compare handoff resolves members through `hydrateExperiments` so off-page runs are fetched before `compareIds` is set, and `experimentsForCompare` follows `compareIds` so the workspace shows the canvas' 1-2-3 order. The workspace records its origin in `compareOriginFolderId` to offer a way back to the canvas; turning compare on from the list clears the canvas and the origin. Members join from the row menu, by dropping a row onto the open canvas, or by dropping it on a chip; the payload is `EXPERIMENT_DRAG_MIME` from `core/experiment-drag.utils.ts`, targets gate on `dataTransfer.types` (the payload stays unreadable until the drop lands), and a drop adds rather than toggling. Drag is an affordance only — the row menu remains the keyboard path. Sets are a grouping *over* `folder.experimentIds`, never a second copy of membership: the canvas lists members grouped by set (folder order, Ungrouped last) with one number line across the canvas, and each row's `fa-object-group` menu is the only place a run changes set. The compare workspace reads that partition and never writes to it — it renders one section per set in folder order, then one section per algorithm label for everything ungrouped, each run a compact row that expands its result in place; with no origin folder (a hand-built selection) it groups by algorithm alone. A filter the backend contract cannot express (substring, author, variable, status, date) is answered from one capped snapshot of the ownership-scoped history: `historyTruncated` says the cap cut it short and the list summary names how many runs were searched, so a miss is never silent.
Tests: Add component/mapper tests when list, filter, compare, or detail rendering changes; folder specs cover the service, the chip strip, the canvas, the drag-to-add path, and the off-page handoff, and set specs cover move semantics, prune-on-delete/404, canvas grouping, and compare sections.
Notes: Sharing and deletion are human-review areas. Folders are per-owner server rows — no sharing of a folder, no deep link to one, and a failed write is shown rather than cached locally.

## `src/app/pages/terms-page`
Purpose: Terms/NDA gate.
Key files: `terms-page.component.*`.
Used by: `/terms` route and `TermsGuard`.
Rules: Preserve acceptance flow and intended redirect behavior.
Tests: Add tests for markdown load, acceptance, and redirect changes.
Notes: Loads `src/assets/tos.md`.

## `src/app/pages/account-page`
Purpose: User account/profile view.
Key files: `account-page.component.*`.
Used by: `/account` route.
Rules: Avoid logging or exposing sensitive user/session data.
Tests: Add component tests for profile/logout behavior changes.
Notes: Logout is implemented in `AuthService`.

## `src/app/pages/notebook`
Purpose: Optional JupyterHub entry route with separate Hub OAuth session.
Key files: `notebook.component.*`, `hub-session.ts`, `hub-http.ts`, `jupyterhub-api.ts`.
Used by: `/notebook` route when runtime env enables it.
Rules: Respect `NOTEBOOK_ENABLED`, `JUPYTER_CONTEXT_PATH`; keep Hub login as top-level navigation; do not pass platform tokens into the iframe.
Tests: `notebook.component.spec.ts`, `hub-session.spec.ts`, `hub-http.spec.ts`, `jupyterhub-api.spec.ts`.
Notes: Platform auth/terms gate entry; Hub session is probed separately. Nginx returns top-level Hub/Lab URLs to `/notebook`. Footer sits below a full-viewport notebook area; scroll to reach it.

## `src/app/pages/shared`
Purpose: Shared shell components and generic helpers.
Key files: `header/*`, `footer/*`, `spinner/*`, `utils/form-control.factory.ts`.
Used by: Root shell and feature pages.
Rules: Keep shared components generic; avoid feature-specific behavior here unless already established.
Tests: Footer has a spec; add focused tests for shared behavior changes.
Notes: Footer displays runtime MIP version. Notebook pill uses `NotebookNavService` (`mip.notebook.nav.seen`) for first-visit glow.

## `src/assets` and `public`
Purpose: Runtime env, brand assets, icons, markdown, and static public files.
Key files: `env.js`, `tos.md`, logos/footer assets.
Used by: App runtime, Angular build assets, nginx container output.
Rules: Do not commit secrets into `env.js`; it is runtime-populated in containers.
Tests: Build verifies asset paths.
Notes: Brand/logo usage should follow `DESIGN.md`.

## `Dockerfile`, `docker-entrypoint.sh`, `nginx.conf.template`
Purpose: Build and serve the Angular app in nginx with runtime environment injection.
Key files: all three root files.
Used by: Docker builds and release image publishing workflow.
Rules: Treat proxy, notebook, and env injection changes as deployment-sensitive.
Tests: Validate with `npm run build`; Docker image build is recommended for container changes.
Notes: Dockerfile uses `npm ci` when `package-lock.json` exists.

## `.github/workflows`
Purpose: Release image publishing and EBRAINS mirroring.
Key files: `publish_images.yml`, `ebrains.yml`.
Used by: GitHub Actions on release, master pushes, and tags.
Rules: Never expose workflow secrets; avoid changing registry/mirror behavior without human review.
Tests: Use workflow syntax review and, if available, CI dry runs.
Notes: No pull-request test/build workflow is currently present.
