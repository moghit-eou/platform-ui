# Build and Test Runbook

Use for dependency, build, test, proxy, Docker, nginx, and runtime env tasks.

## Requirements

- Node 22 (`.nvmrc`; `package.json` engines `^22.22.3 || ^24.15.0 || >=26.0.0`)
- npm `>=10.0.0`

`start`, `build`, `watch`, `test` and `typecheck` each carry a pre-hook running
`scripts/check-node-version.mjs`, so an unsupported Node fails immediately rather
than mid-build.

## Commands

| Command | Purpose |
|---|---|
| `npm start` | dev server with proxy |
| `npm run verify` | typecheck + dead-code scan + build, in order |
| `npm run typecheck` | `tsc --noEmit` over the app and spec projects |
| `npm run check:dead-code` | unused exports, orphan CSS/keyframes, unused `:root` tokens |
| `npm run build` | production build to `dist/fl-platform` |
| `npm run watch` | development build watch |
| `npm test` | Karma unit tests (needs a browser; ask before running) |

## Key Files

- build: `angular.json`, `tsconfig*.json`, `package.json`
- proxy: `src/proxy.conf.json`
- Docker/nginx: `Dockerfile`, `docker-entrypoint.sh`, `nginx.conf.template`
- runtime env: `src/assets/env.js`, runtime env service

## Proxy

- `/services` -> `http://localhost:8080`
- `/notebook/` -> `http://localhost:8000` with websockets

## Validation

- TypeScript/app change: `npm run verify`
- Unused code, orphan CSS, or a stale design token: `npm run check:dead-code`
- Tested utility/service change: focused spec if available, otherwise
  `npm test`
- Dependency change: `npm ci`, `npm run verify`, tests
- Docker/nginx change: build app, then Docker/manual runtime validation

Avoid `package-lock.json`, Docker, nginx, and broad test output unless the task
requires them.
