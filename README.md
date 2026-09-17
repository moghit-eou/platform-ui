# Medical Informatics Platform (MIP) - Platform UI

The Platform UI for the Medical Informatics Platform (MIP). An Angular 22 standalone frontend application for composing, running, and analyzing data science experiments, featuring algorithmic configurations. It integrates with a backend over `/services` (proxied in dev) and uses Keycloak for robust OAuth2 authentication.

## Highlights
- **Experiment Studio** (`src/app/pages/experiment-studio`): select data models/datasets, pick variables and filters, configure algorithms, run jobs, view charts/tables.
- **Experiments Dashboard** (`src/app/pages/experiments-dashboard`): list/search/paginate, share links, compare results side by side, export to PDF.
- **Auth**: Keycloak-based session via `/services/activeUser`; guard protects routes and redirects to login if unauthenticated.

## Requirements
- Node 22+ and npm 10+
- Backend reachable at `http://localhost:8080/services` (adjustable in proxy/Docker env).
- Keycloak endpoints exposed at `/services/oauth2/authorization/keycloak` and `/services/logout`.

## Quick Start (dev)
1) Install dependencies: `npm ci`
2) Start dev server with proxy: `npm start`
   - Serves at `http://localhost:4200/`
   - Proxies `/services` to `http://localhost:8080` via `src/proxy.conf.json`
3) Ensure backend is running and you can authenticate with Keycloak.

## Scripts
- `npm start` – dev server (`ng serve`) with proxy.
- `npm run build` – production build to `dist/fl-platform`.
- `npm run watch` – development build in watch mode.
- `npm test` – unit tests via Karma.

## Result code → label mappings

See `src/app/core/algorithm-result-enum-mapper.md` for detailed mapping behavior.

## Backend Endpoints (expected)
- `GET /services/activeUser` – current user/session.
- `GET /services/algorithms` – algorithm catalog.
- `GET /services/data-models` – available data models (used to build variable tree and datasets).
- `POST /services/experiments` – run experiment (polls for results).
- `POST /services/experiments/transient` – quick previews (histograms, descriptive stats).
- `GET /services/experiments/:id` – fetch experiment (and results).
- `PATCH /services/experiments/:id` – update name/description/shared flag.
- `DELETE /services/experiments/:id` – delete experiment.

## Auth Flow
- Routes are guarded (`AuthGuard` in `src/app/guards/auth.guard.ts`).
- Login redirects to `/services/oauth2/authorization/keycloak?frontend_redirect=<current or target>`.
- Logout calls `/services/logout` then returns to dashboard.

## Project Structure
- `src/main.ts` – bootstraps app with router, HTTP client, credentials interceptor, ECharts.
- `src/app/app.component.*` – shell with header/footer.
- `src/app/services/` – auth/session/error handling, experiment studio orchestration, dashboard data, PDF export, label resolver, HTTP interceptor.
- `src/app/models/` – experiment, algorithm, data-model, filters, user interfaces.
- `src/app/core/algorithm-mappers.ts` – backend → UI algorithm config and output schemas.
- `src/app/pages/experiment-studio/` – variables panel, filter modal, algorithm panel, visualisations (charts/histograms/bubble).
- `src/app/pages/experiments-dashboard/` – list/search, detail, compare, mapper.
- `src/app/pages/account-page/` – basic profile view.
- `src/app/pages/shared/` – header/footer/spinner utilities.
- `src/styles.css` – global styles; assets in `src/assets/`.
- `Dockerfile` / `nginx.conf.template` – container build and runtime proxy (`PLATFORM_BACKEND_SERVER`, `PLATFORM_BACKEND_CONTEXT` envs).



## Docker
Build and serve with nginx:
```bash
docker build -t fl-platform .
docker run \
  -e PLATFORM_BACKEND_SERVER=platform-backend-service:8080 \
  -e PLATFORM_BACKEND_CONTEXT=services \
  -p 80:80 fl-platform
```
Nginx always proxies `/${PLATFORM_BACKEND_CONTEXT}/` to the backend.

## Testing
- Unit: `npm test` (Karma).
- Manual: run `npm start`, authenticate, and exercise Experiment Studio and Dashboard against a running backend.

## Notes
- Many features require authenticated backend access; unauthenticated calls will trigger login redirect.
- Algorithm availability depends on selected variables/datasets; some algorithms are transient-only (`histogram`, `describe`).
