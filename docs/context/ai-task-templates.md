# AI Task Templates

## Bug Investigation Template

Goal:
Investigate and propose a minimal fix for the bug below.

Before editing, read:
- `AGENTS.md`
- `docs/context/architecture.md`
- `docs/context/module-index.md`
- `docs/context/testing.md`
- Relevant source files and tests

Bug:
...

Constraints:
- Keep the fix minimal.
- Preserve public API behavior unless explicitly requested.
- Add a regression test when possible.
- Do not touch unrelated dirty worktree files.

Return:
1. Root cause
2. Evidence
3. Proposed fix
4. Files to change
5. Tests to run
6. Risk assessment

## Refactor Plan Template

Goal:
Plan a behavior-preserving refactor for the area below.

Read:
- `AGENTS.md`
- `docs/context/architecture.md`
- `docs/context/module-index.md`
- `docs/context/risk-register.md`
- Current implementation and nearby specs

Area:
...

Constraints:
- Preserve route/API/runtime behavior.
- Keep changes incremental and reviewable.
- Avoid new abstractions unless they remove real duplication or risk.

Return:
1. Current structure
2. Proposed target structure
3. Step-by-step implementation
4. Tests and manual QA
5. Rollback/risk notes

## Test Generation Template

Goal:
Add focused tests for the behavior below.

Read:
- `docs/context/testing.md`
- Existing specs near the target file
- Source under test

Behavior:
...

Constraints:
- Match existing Jasmine/Karma style.
- Prefer local fixtures and service stubs used by nearby tests.
- Avoid brittle DOM assertions unless UI output is the behavior.

Return:
1. Test cases added
2. Files changed
3. Commands run
4. Any remaining coverage gaps

## Code Review Template

Goal:
Review the current diff for bugs, regressions, and missing tests.

Read:
- `AGENTS.md`
- `docs/context/code-review-checklist.md`
- `docs/context/risk-register.md`
- The full diff and touched source/tests

Focus:
- Correctness
- Security/privacy
- Architecture boundaries
- Test adequacy
- Runtime/deployment risk

Return findings first, ordered by severity, with file/line references.

## Dependency Update Template

Goal:
Evaluate and implement the dependency update below only if justified.

Read:
- `package.json`
- `package-lock.json`
- `docs/context/commands.md`
- `docs/context/risk-register.md`

Dependency/update:
...

Constraints:
- Do not add or update dependencies without explaining why.
- Preserve lockfile integrity.
- Run build and tests after update.

Return:
1. Rationale
2. Updated packages
3. Compatibility notes
4. Commands run
5. Rollback notes

## Frontend Feature Template

Goal:
Implement the frontend behavior below.

Read:
- `AGENTS.md`
- `DESIGN.md`
- `docs/context/architecture.md`
- `docs/context/module-index.md`
- Existing page/service/component patterns for the target feature

Feature:
...

Constraints:
- Use standalone Angular patterns.
- Keep feature UI in the owning page subtree.
- Use existing services, mappers, registries, and shared components where appropriate.
- Add/update specs when behavior changes.
- Validate responsive behavior manually when visible UI changes.

Return:
1. What changed
2. Files changed
3. Tests/checks run
4. Manual QA notes
5. Risks

## Backend/API Integration Template

Goal:
Integrate the frontend with the backend API behavior below.

Read:
- `docs/context/architecture.md`
- `src/proxy.conf.json`
- Relevant services and models
- Existing API call patterns

API behavior:
...

Constraints:
- Use relative `/services/...` URLs.
- Preserve credentials/XSRF behavior.
- Keep DTO definitions in `src/app/models`.
- Map backend payloads before rendering when needed.

Return:
1. API contract assumed
2. Frontend model/service changes
3. Error handling
4. Tests/manual backend validation
5. Compatibility risks

## Security-Sensitive Change Template

Goal:
Plan or implement the security-sensitive change below.

Read:
- `docs/context/risk-register.md`
- Auth/guard/service files for the affected flow
- Relevant backend/API contract docs if available

Change:
...

Constraints:
- Do not weaken auth, terms/NDA, XSRF, redirect, sharing, deletion, or notebook boundaries.
- Do not log sensitive data.
- Require human review for behavior changes.

Return:
1. Security boundary affected
2. Proposed minimal change
3. Tests and manual checks
4. Human review points
5. Rollback plan

## Documentation Update Template

Goal:
Update repository documentation for the change below.

Read:
- `AGENTS.md`
- `docs/context/README.md`
- Relevant source/config files

Change:
...

Constraints:
- Document repo facts from evidence.
- Mark uncertain items `Unknown / TODO: verify`.
- Avoid generic boilerplate.

Return:
1. Files updated
2. Evidence used
3. Unknowns/TODOs
4. Validation performed

## Architecture Review Template

Goal:
Review the architecture of the area below and identify practical improvements.

Read:
- `docs/context/architecture.md`
- `docs/context/module-index.md`
- `docs/context/risk-register.md`
- Source and tests for the area

Area:
...

Constraints:
- Prioritize correctness, maintainability, and risk reduction.
- Avoid recommending broad rewrites without incremental path.

Return:
1. Current architecture summary
2. Strengths
3. Risks/gaps
4. Recommended changes by priority
5. Validation strategy
