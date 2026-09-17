# Commands

## Package Manager
Detected: npm.

Evidence:
- `package-lock.json` exists.
- `package.json` defines npm scripts.
- Dockerfile uses `npm ci` when a lockfile exists.

## Install
```bash
npm ci
```

Use Node 22+ and npm 10+.

## Run Locally
```bash
npm start
```

Runs `ng serve`. `angular.json` configures `src/proxy.conf.json` for the dev server:
- `/services` -> `http://localhost:8080`
- `/notebook/` -> `http://localhost:8000`

## Build
```bash
npm run build
```

Runs `ng build` with production as the default configuration. Build output is `dist/fl-platform`.

Development watch build:
```bash
npm run watch
```

## Test
```bash
npm test
```

Runs Angular CLI Karma tests with Jasmine.

## Typecheck / Static Checks
No lint or format script is defined in `package.json`. `npm run verify` runs the typecheck, the dead-code scan and a production build; `docs/context/testing.md` says what each one covers.

## Database / Migrations
Not applicable in this frontend repository.

## Docker
Build:
```bash
docker build -t fl-platform .
```

Run:
```bash
docker run -e PLATFORM_BACKEND_SERVER=platform-backend-service:8080 -e PLATFORM_BACKEND_CONTEXT=services -p 80:80 fl-platform
```

Runtime env values are written to `assets/env.js` by `docker-entrypoint.sh`.

## Output and Runtime Budget Guardrails

Do not run these without explicit user confirmation unless the user directly requested them and the cost is stated first:
- `npm start`, `npm run watch`, `ng serve`, `ng build --watch`: long-running server/watch commands.
- `npm test` / `ng test`: Karma may launch a browser and watch indefinitely; prefer a verified non-watch focused command when available.
- `docker build`, `docker run`, `docker compose ...`, unbounded `docker logs`: heavy or noisy container operations.
- `npm ci`, `npm install`, `npm audit`, `npm audit --json`, `npm outdated`: network/dependency operations that can be slow or noisy.
- Broad repository output: `find .`, `ls -R`, `tree`, recursive `grep`, unrestricted `rg`, `cat package-lock.json`, `cat dist/*`, `cat coverage/*`, full `git diff`, `git log -p`, or large `git show`.

Preferred bounded alternatives:
```bash
git status --short
git diff --stat
git diff --name-only
rg "pattern" src docs -g "!node_modules" -g "!dist" -g "!coverage"
sed -n "1,160p" path/to/file
```

If a high-output command is necessary, first tell the user why, state that it may consume substantial tokens/runtime, and use output caps or path filters.

## CI
Detected workflows:
- `.github/workflows/publish_images.yml`: on published releases, builds and pushes Docker images to Docker Hub and EBRAINS Harbor.
- `.github/workflows/ebrains.yml`: mirrors `master` and tags to EBRAINS GitLab.

- `.github/workflows/checks.yml`: on pull requests, runs `npm run verify` (typecheck, dead-code scan, build).
