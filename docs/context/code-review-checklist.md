# Code Review Checklist

## Correctness
- [ ] Does the change solve the stated problem?
- [ ] Are affected routes, services, and components updated consistently?
- [ ] Are backend DTOs and frontend models/mappers compatible?
- [ ] Are edge cases and error paths handled?

## Tests
- [ ] Are relevant specs added or updated?
- [ ] Were the correct commands run?
- [ ] Is manual browser QA documented for authenticated or backend-dependent flows?
- [ ] Are skipped checks explained with reason and risk?

## Architecture
- [ ] Does the change respect page/service/model/core boundaries?
- [ ] Is orchestration kept in services rather than scattered across components?
- [ ] Are visualization changes registered through the existing table/chart registries?
- [ ] Are runtime env reads kept in the existing runtime env layer?

## Security and Privacy
- [ ] No secrets, tokens, cookies, credentials, or private env values are committed.
- [ ] Auth, NDA, sharing, deletion, and notebook access behavior is preserved or explicitly reviewed.
- [ ] Sensitive user or experiment data is not logged.
- [ ] Redirect behavior remains same-origin and intentional.

## UI and Accessibility
- [ ] Visible UI changes follow `DESIGN.md`.
- [ ] Text, controls, and layouts work at relevant desktop/mobile sizes.
- [ ] Interactive controls have clear labels/states.
- [ ] Existing keyboard and screen-reader affordances are not degraded.

## Maintainability
- [ ] `npm run verify` passes (typecheck, dead-code scan, build).
- [ ] The change is small enough to review.
- [ ] Naming and structure match the repo.
- [ ] No unrelated refactors or formatting churn were introduced.
- [ ] Documentation/context files are updated if commands, architecture, or conventions changed.

## Release Risk
- [ ] Docker/nginx/runtime env changes are smoke-tested or clearly flagged.
- [ ] Dependency changes include lockfile review and build/test results.
- [ ] Rollback considerations are included for runtime behavior changes.
- [ ] Human review is requested for high-risk areas in `risk-register.md`.
