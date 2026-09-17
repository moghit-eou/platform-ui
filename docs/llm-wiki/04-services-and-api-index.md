# Services and API Index

Backend calls use relative `/services/...` URLs.

## Lookup Order

1. Check `indexes/backend-endpoints.md` for the endpoint.
2. Search the endpoint string or resource name.
3. Read the owning service.
4. Read request/response models only after the service is identified.
5. Read components only if UI behavior changes.

## Service Ownership

| Concern | Likely service |
|---|---|
| user/session/login/logout | `auth.service.ts` |
| studio data/runs/previews | `experiment-studio.service.ts` |
| dashboard list/detail/update/delete | `experiments-dashboard.service.ts` |
| folders, sets, membership | `experiment-folders.service.ts` |
| algorithm availability/rules | `algorithm-rules.service.ts` |
| PDF/CSV export | export services |
| error display | `error.service.ts` |
| runtime flags | `runtime-env.service.ts` |

## HTTP Rule

`auth.interceptor.ts` adds `withCredentials: true` to relative requests. Prefer
relative `/services/...` paths and avoid duplicating credential handling.

Do not change API shapes from UI assumptions alone; confirm service payload use
and model contracts first.
