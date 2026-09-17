# Testing

## Frameworks Detected
- Unit/component tests: Jasmine and Karma through Angular CLI.
- Test configuration: `angular.json` test target and `tsconfig.spec.json`.
- Test setup file: `src/test-console-filter.ts`, which suppresses known noisy console messages during tests.

## Test Structure
- Specs live beside source files as `*.spec.ts`.
- Service specs are under `src/app/services`.
- Component specs are under their feature directories.
- Visualization registry/renderer specs are under `src/app/pages/experiment-studio/visualisations`.

## Test Output Guardrails
Full Karma runs can be noisy or long-running because `npm test` maps to `ng test`. Do not start full interactive/watch test runs unless the user requested them or has confirmed after being told they may consume substantial runtime/tokens. Prefer focused specs or a verified non-watch command when available.

## Unit Test Command
```bash
npm test
```

This is the available unit test command, but agents should not start it autonomously unless the user requested tests or confirmed the token/runtime cost. Angular/Karma normally launches a browser and may watch; prefer a verified non-watch or focused command when available.

## Static Checks (no browser, no backend)
```bash
npm run typecheck       # tsc over the app and spec projects, no emit
npm run check:dead-code # unused exports, orphan CSS/keyframes, unused :root tokens
npm run verify          # typecheck + dead-code + build, in that order
```

## Full Local Validation
```bash
npm run verify
npm test
```

Run the full validation sequence only when warranted by the change and after applying the test output guardrails above.

For authenticated flows, also run manual browser QA against a working backend and Keycloak-compatible auth setup.

## Frontend Manual QA
There is no separate QA checklist file; the list below is it. Walk the affected surface in a browser against a working backend, especially when changing:
- Algorithm result mapping.
- Visualization registries/renderers.
- Histogram and descriptive statistics rendering.
- Dashboard detail or compare views.

## Backend Tests
Not applicable in this frontend repository. Backend behavior must be validated in the backend repository or against a deployed/local backend.

## E2E Tests
Unknown / TODO: verify. No e2e runner is configured in this repository.

## Fixtures and Mocks
- Existing unit tests define local fixtures inside specs.
- Component tests commonly provide service stubs and Angular Signals through `TestBed`.
- No central fixture directory was detected.

## Critical Paths That Need Strong Coverage
- Auth and redirect handling.
- Terms/NDA gating and post-acceptance redirect behavior.
- Experiment creation/run/polling and edit hydration.
- Experiment sharing, rename, and deletion rollback behavior.
- Algorithm availability rules and result mapping.
- Visualization registry compatibility for current and legacy algorithm keys.
- Runtime env and notebook route gating.

## Validation Matrix
| Change type | Required validation |
|---|---|
| UI-only component change | Relevant component spec if available, `npm run build`, and manual browser check for affected route. |
| Styling-only change | `npm run build`, responsive browser check, and `DESIGN.md` review. |
| Service/API integration change | Focused service/component specs, `npm run build`, and backend-backed manual check. |
| Auth/permission/NDA change | Guard/service specs, `npm run build`, manual login/logout/redirect/NDA check, human review. |
| Algorithm availability change | `algorithm-rules.service.spec.ts`, relevant component specs, `npm run build`, manual Studio check. |
| Visualization/result mapping change | Registry/renderer specs, `npm run build`, manual result rendering check using representative payloads. |
| Experiment deletion/sharing change | Service/component specs, rollback/error-path check, manual Dashboard check, human review. |
| Runtime env/nginx/Docker change | `npm run build`, Docker build when practical, runtime env smoke test, human review. |
| Dependency update | `npm ci`, `npm run build`, `npm test`, lockfile review, bundle/runtime smoke check. |
| Refactor without behavior change | Existing relevant specs, `npm run build`, focused manual smoke check for touched feature. |
| Documentation-only change | Path/link sanity check; build is optional unless repo instructions require it. |
