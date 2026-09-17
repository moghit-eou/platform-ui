# Auth and Terms Flow

Use for login, logout, active user, route protection, terms, and onboarding.

## Main Files

- `src/app/app.routes.ts`
- `src/app/guards/auth.guard.ts`
- `src/app/guards/terms.guard.ts`
- `src/app/services/auth.service.ts`
- `src/app/services/auth.interceptor.ts`

## Endpoints

- `GET /services/activeUser`
- `/services/oauth2/authorization/keycloak?frontend_redirect=<target>`
- `/services/logout`

## Guard Matrix

| Route | Guards |
|---|---|
| dashboard | auth, terms |
| terms | auth |
| account | auth, terms |
| studio | auth, terms |
| notebook | notebook flag, auth, terms |

## Notebook auth (separate from platform session)

Platform UI auth and JupyterHub auth are related but separate:

1. `/notebook` requires platform login (`AuthGuard`) and terms acceptance (`TermsGuard`).
2. Angular does not pass the platform token into the Jupyter iframe.
3. On `/notebook`, Angular probes `/notebook/hub/api/user` with `credentials: 'include'`.
4. If Hub has no session, the top-level browser is redirected to `/notebook/hub/login?next=/notebook/hub/home` (not an in-app router navigation). With `JUPYTERHUB_AUTO_LOGIN` (default true), Hub immediately continues to Keycloak without the orange OAuth button page.
5. JupyterHub authenticates through Keycloak (`GenericOAuthenticator`) when `KEYCLOAK_CLIENT_ID` is set; otherwise Hub can use dummy auth in dev.
6. After OAuth, nginx sends top-level `/notebook/hub/home` and `/notebook/user/...` document navigations back to `/notebook` so Lab stays in the shell iframe.
7. Hub login redirects use a 15s cooldown and `sessionStorage` pending state to avoid redirect loops.
8. Hub sets its own session cookie (SameSite=Lax, Secure by default). Any valid Keycloak user for the Hub client is currently allowed (`allow_all = True`).
9. Before spawn, Hub injects the Keycloak access token into the notebook pod as `MIP_TOKEN`, refreshing via stored refresh tokens when needed.
10. Running notebooks can refresh `MIP_TOKEN` through Hub `/notebook/hub/api/platform-token` via the mip client transport.

Key files: `src/app/pages/notebook/hub-session.ts`, `hub-http.ts`, `jupyterhub-api.ts`, `nginx.conf.template`.

## Lookup Order

1. Confirm affected route in `app.routes.ts`.
2. Read the specific guard.
3. Read `AuthService` only for session/login/logout data.
4. Read UI page only for copy or button behavior.

Avoid duplicating credential handling; relative requests already pass through the
credentials interceptor.
