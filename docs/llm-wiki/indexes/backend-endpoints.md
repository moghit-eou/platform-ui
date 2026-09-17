# Backend Endpoints Index

Two relative upstreams: `/services` (platform backend; dev proxy -> `:8080`,
nginx -> `PLATFORM_BACKEND_SERVER`) and `/notebook` (JupyterHub; dev proxy ->
`:8000`). Both are same-origin, so `auth.interceptor.ts` covers the `/services`
side and `hub-http.ts` carries the Hub XSRF header.

## Platform backend - base path `/services`

| Area | Method | Endpoint | Notes |
|---|---|---|---|
| auth | GET | `/services/activeUser` | session check behind `AuthGuard` |
| auth | GET | `/services/oauth2/authorization/keycloak` | full-page login redirect, `frontend_redirect` |
| auth | GET | `/services/logout` | full-page logout redirect |
| terms | POST | `/services/activeUser/agreeNDA` | acceptance from `/terms`; the text itself is the static `assets/tos.md` |
| catalog | GET | `/services/data-models` | models, datasets, variables |
| specifications | GET | `/services/specifications/inputdata` | input DTO |
| specifications | GET | `/services/specifications/preprocessing` | preprocessing step DTOs |
| specifications | GET | `/services/specifications/algorithms` | algorithm catalog and config schema |
| experiments | GET | `/services/experiments` | server page; `page,size,mine,notMine,includeShared,orderBy,descending[,algorithm,shared]` |
| experiments | POST | `/services/experiments` | run; the returned uuid is polled |
| experiments | POST | `/services/experiments/transient` | preview without storing |
| experiments | GET | `/services/experiments/:uuid` | detail/compare, and result polling |
| experiments | PATCH | `/services/experiments/:uuid` | `{ name }` rename, `{ shared }` share |
| experiments | DELETE | `/services/experiments/:uuid` | delete; folder membership prunes on 404 |
| folders | GET, POST | `/services/experiment-folders` | list folders / create |
| folders | PATCH, DELETE | `/services/experiment-folders/:folderId` | rename / delete |
| folders | POST, DELETE | `/services/experiment-folders/:folderId/members[/:uuid]` | add / remove a run |
| folders | PATCH | `/services/experiment-folders/:folderId/members/:uuid/set` | `{ setId }`, or `null` to unassign |
| folders | POST | `/services/experiment-folders/:folderId/sets` | create a set |
| folders | PATCH, DELETE | `/services/experiment-folders/:folderId/sets/:setId` | rename / delete a set |

No `/services/algorithms` exists: the catalog is read from
`/services/specifications/algorithms`.

## JupyterHub - base path from `JUPYTER_CONTEXT_PATH`, default `/notebook`

| Area | Method | Endpoint | Notes |
|---|---|---|---|
| hub | GET | `/notebook/hub/home` | XSRF prime, `pages/notebook/hub-http.ts` |
| hub | GET | `/notebook/hub/api/user` | session and server state |
| hub | POST | `/notebook/hub/api/users/:username/server` | start the server, retried once after an XSRF prime |
| hub | GET | `/notebook/hub/login?next=...` | full-page login redirect |
| lab | GET | `/notebook/user/:username/lab` | iframe target |

Only `auth.service.ts`, `experiment-studio.service.ts`,
`experiments-dashboard.service.ts`, `experiment-folders.service.ts`,
`terms-page.component.ts` and `src/app/pages/notebook/hub-*.ts` hit the network.

Search exact endpoint strings before opening services.
