# Decision Log

Use this file for durable architectural decisions.

## Template

### Decision: <title>

Status: Proposed / Accepted / Deprecated

Context:

Decision:

Consequences:

Files affected:

Date:

## Inferred / Verify Decisions

### Decision: Use Angular standalone application structure

Status: Inferred / verify

Context: `angular.json`, `app.config.ts`, and routes use standalone Angular entrypoints and lazy `loadComponent`.

Decision: Keep new UI code in standalone components and configure app-wide providers in `app.config.ts`.

Consequences: Avoid introducing NgModules unless there is a clear compatibility reason.

Files affected: `src/main.ts`, `src/app/app.config.ts`, `src/app/app.routes.ts`.

Date: Unknown / TODO: verify.

### Decision: Use zoneless change detection

Status: Inferred / verify

Context: `app.config.ts` calls `provideZonelessChangeDetection()`.

Decision: Prefer Signal-driven and explicit reactive patterns that work under zoneless change detection.

Consequences: Be careful with code that assumes Zone.js-triggered view updates.

Files affected: `src/app/app.config.ts`, component/service state code.

Date: Unknown / TODO: verify.

### Decision: Keep backend API under same-origin `/services`

Status: Inferred / verify

Context: Services call `/services/...`; local proxy and nginx route this path to the backend.

Decision: Keep frontend API calls relative to `/services` instead of hard-coding backend hosts.

Consequences: Local dev, nginx deployment, credentials, and XSRF behavior stay aligned.

Files affected: `src/proxy.conf.json`, `nginx.conf.template`, `src/app/services/*`.

Date: Unknown / TODO: verify.

### Decision: Inject runtime config through `assets/env.js`

Status: Inferred / verify

Context: `docker-entrypoint.sh` writes `assets/env.js`; `RuntimeEnvService` reads `window.__env`.

Decision: Keep deployment-specific values out of the compiled Angular bundle when possible.

Consequences: Container runtime can change backend/notebook/version settings without rebuilding the app.

Files affected: `docker-entrypoint.sh`, `src/assets/env.js`, `src/app/services/runtime-env.service.ts`.

Date: Unknown / TODO: verify.

### Decision: Step 0 of the Data Handling Pipeline is a read-only source snapshot

Status: Accepted

Context: The pipeline canvas started at `1. Cohort Filtering`, so the earliest preview a user could reach (`Raw Summary`) was already the filtered cohort. Nothing showed the selection before any rule was applied.

Decision: Add pipeline node `0. Source Data` to the statistic analysis panel: a permanent read-only node that describes the selected variables with no filter payload and no preprocessing steps. It renders the shared summary workspace - the `#summaryWorkspace` template the Raw and Processed previews use (variable browser, statistics, charts, histograms, PDF/CSV) - fed by its own `SummaryView`, with the exit copy and the empty-state line passed through the outlet context. It is deliberately not a stage: it never enters `addedSteps`, the stage counter, or the experiment request, and it exposes no rule editor.

Consequences: Step 0 costs no new presentation code and the Processed summary now renders through the same outlet, so a summary change lands once for all three surfaces; each surface keeps its own `data-guide` anchors through `SUMMARY_GUIDE_ANCHORS`. Both `loadDescriptiveOverview` and `getAlgorithmResults` / `buildRequestBody` gained a trailing `includeFilters` flag (default `true`) so the numeric histogram tab cannot show the filtered cohort under a read-only "filters are not applied" heading. One extra on-demand `/services/experiments/transient` describe per opened snapshot, fetched on open and refetched when the selected variables or datasets change while it is open; the cohort filter and the applied preprocessing are deliberately outside that cache key because the request omits both. Payload shapes are unchanged; the flag only omits `inputdata.filters`, so Raw and Processed keep their filtered behaviour. Because two live instances would double every count-based DOM query and hand the User Guide anchors to a hidden surface, the step-0 instance renders only while open and keeps no `data-guide` anchors.

Files affected: `src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.component.*`, `src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.pipeline.spec.ts`, `src/app/services/experiment-studio.service.ts`.

Date: 2026-09-08.

### Decision: The dashed pipeline card means "contributes nothing", not "not customised"

Status: Accepted

Context: Preprocessing rendered as a dashed dormant card until the user opened it, carrying a `Default: Missing NaN removal` pill and a `Default Active` badge. That was visually indistinguishable from Filtering and Transformation, which really do nothing until added, even though MIP drops rows with missing values on every run whether or not anyone opens the stage. Growing a stage also required expanding it first to reach the dashed add button inside the station.

Decision: Make the card frame describe the request rather than the effort. A node wears the dashed card only when it will contribute nothing to the next run (Filtering, Transformations). Preprocessing always renders as an added node and its collapsed sub-node rail tags the untouched handler `Default` (`PipelineSubNode.statusTone: 'default'`) instead of `Applied`. The same rail gains dashed rows (`addablePreprocessingSlots`, the transformation `Add derived column` row) that add and open their sub-step in one click. The editor body stays gated on `isStepAdded('setup')`, so the untouched state costs no station DOM, and the canvas counter reads `of 3 stages configured` because a default is not user work.

Consequences: `is-dormant` no longer applies to `setup`, so anything that identified that stage by dormancy has to target `.pipeline-subnode-item` instead; the rail's `default` tone is now the only "untouched" marker and `.pipeline-default-pill` / `.pipeline-node-title-row` are gone. The counter can legitimately read `0 of 3 stages configured` under a solid Preprocessing card. No request payload, endpoint, or guard changes; authenticated pipeline behaviour still needs manual browser QA.

Files affected: `src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.component.*`, `src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.pipeline.spec.ts`, `src/app/pages/experiment-studio/guide/experiment-studio-guide.content.ts`.

Date: 2026-09-08.

### Decision: The Execution step describes the run from a snapshot, not from live state

Status: Accepted

Context: The result view sat in the left column of `.experiment-panel-workspace--result`, whose second column (`minmax(260px, 320px)`) has been reserved since the docked-summary commit but never filled, so the right-hand third of the step showed nothing. Nothing on the step said which dataset, roles, filters, preprocessing, or parameters produced the chart. Live studio state cannot answer that: changing the algorithm or the y/x roles clears `runResult`, but changing a **parameter**, a **cohort filter**, or the **preprocessing** of a step does not, so a summary read from live signals would describe a run that never happened.

Decision: `ExperimentStudioService.captureRunSetup(finalAlgorithmName)` freezes `{ data model, datasets, y/x codes, filterLogic, effective preprocessing rows, configured parameters }` the moment the algorithm panel has stored the final parameter values and is about to dispatch the run; `runSetup` holds it beside `runResult`, and both are cleared together and neither is persisted. The new `app-experiment-setup-summary` (a `<aside>` in the reserved column, sticky under the header + sub-header pair, scrolling inside its own card) renders only that snapshot, labels codes at render time through the existing label maps, and reuses the existing truth sources: `getEffectivePreprocessingEntries` for preprocessing (the request's own resolution, so the default missing-value removal appears and is labelled `Missing values` rather than implied), `withLabels` for variables, and the algorithm `configSchema` for parameter labels and option labels. The first row is labelled **Pathology**, not "Data model": the Data Exploration chip says `Select pathology`, the tour step is "Pathology & Datasets", and `Pathology / Stroke 3.7` reads as one name. The snapshot keeps the record-level `dataModelLabel` / `dataModelCode` because that is the record it copies, and the dashboard card keeps its own older word, "Domain". `formatAlgorithmParameterValue` (display) sits next to `serializeAlgorithmParameterValue` (request) in `core/algorithm-parameter.utils.ts`; the rule sentence comes from the new `core/filter-display.utils.ts`. Every block links to the step that owns it (`variables-top`, `filters`, `setup`, `algorithm-section`) through `ExperimentStudioNavigationService`. The dashboard's Configuration card keeps its private filter formatter for now — adopting the core util changes its card and PDF text, which is a separate review.

Consequences: A result's summary cannot drift from the result, and `getEffectivePreprocessingSummary` is now a string wrapper over the same rows, so both read one resolution path. The aside is outside `#resultSection`, so **Export PDF** is byte-identical; `Export CSV`, run payloads, API shapes, and guards are untouched. `data-guide="experiment-setup-summary"` is inert until the studio tour gains a step for it. Below the 1100px workspace breakpoint the column drops under the result and unsticks. Needs authenticated browser QA: a run, then an edit-and-return, to confirm the rail still names the values that produced the chart.

Files affected: `src/app/models/experiment-run-setup.model.ts`, `src/app/core/filter-display.utils.ts`, `src/app/core/algorithm-parameter.utils.ts`, `src/app/services/experiment-studio.service.ts`, `src/app/pages/experiment-studio/algorithm-panel/algorithm-panel.component.ts`, `src/app/pages/experiment-studio/execution-panel/**`.

Date: 2026-09-08.

### Decision: Studio charts must survive renders while their step is hidden

Status: Accepted

Context: The four Studio steps stay mounted and are switched with `display: none` (`.studio-section`), so a D3 chart can be asked to draw while it measures 0x0. Two things made that routine rather than rare: `[config]="{ color: ... }"` literals hand `app-histogram` a fresh object on every change-detection pass, which re-runs its render effect, and any signal written while a step is hidden (closing the pathology popover through the `document:click` listener, changing the variable pool from the Algorithm step, a histogram response arriving after the user moved on) causes such a pass. Drawing into an unlaid-out container is not neutral: `getBBox()` reports an empty rect, so the height fit collapsed the histogram to a few pixels, and the ResizeObserver pattern used by the metadata browsers compared against a size recorded *before* the draw, so the redraw on return was skipped. The result was a Data Exploration step that looked closed and showed nothing until the variable was reselected.

Decision: Treat a zero-size box as "not renderable", never as a render target, and make every draw idempotent. `HistogramComponent` skips the draw when the container measures no width, remembers what the drawing in the DOM was built from (`data` reference, config values) and the width it measured, and only redraws when one of those changes; a draw request it cannot honour is remembered by forgetting the rendered width. A `ResizeObserver` on the same container, outside the zone and debounced like the sibling charts, is the redraw path for the step becoming visible, for a first render behind a hidden deep link, and for window resizes; it compares the width only, because the draw writes an inline height. Call sites pass stable config objects (`chartConfig()` / `histogramChartConfig`) instead of template literals, and `createHistogram` guards every `getBBox()`-derived measurement so an unlaid-out container degrades to the computed height rather than to nothing. The metadata browsers keep their observers but compare against the size of the last actual draw. Charts are re-drawn from cached data only: returning to a step never re-requests from `/services`, so a chart stays the snapshot of the moment its variable was selected.

Consequences: Chart renders are cheap enough to leave on a plain change-detection pass, so config objects must keep a stable identity — a new object literal in a template reintroduces the per-pass rebuild. Each chart now owns one piece of state describing the drawing it currently holds, which is the thing to update whenever a draw path is added. Charts drawn before their data is measurable wait for the observer, so tests need to outlast the 150ms debounce. No route, service, storage, API or payload change.

Files affected: `src/app/pages/experiment-studio/visualisations/histogram/**`, `src/app/pages/experiment-studio/variables-panel/histogram-graph/histogram-graph.component.*`, `src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.component.*`, `src/app/pages/experiment-studio/visualisations/bubble-chart/bubble-chart.component.ts`, `src/app/pages/experiment-studio/visualisations/metadata-browser/collapsible-tree-browser/collapsible-tree-browser.component.ts`.

Date: 2026-09-09.

### Decision: The derived-column gate blocks what the user can fix, and only that

Status: Deprecated — superseded by "The derived-column stage has no Preview/Apply gate at all".

Context: The Transformation stage used to refuse Preview/Apply while any started card was unfinished. That is right for a card the user is typing into and wrong for a card the app merely *loaded*: a stored experiment can carry a category rule this builder cannot author, and under the old gate such a rule disabled both buttons over a card whose message told the user to fix something they had already written. The two were indistinguishable because the stage only had one kind of message. Day one of the filter round-trip work (shared operator table, bare-condition hydration, unary `value: null`) removed the shapes the builder could not read; the gate itself was taken out as a temporary unblock and left `Preview`/`Apply` permanently live, which traded a stuck stage for a half-typed column reaching exaflow and failing there.

Decision: One list, two classes of entry. `transformationBlockingIssues()` reports each card's problems and marks each `blocking` or not. A blocking entry always names a fix that exists on that card — a missing column name, a name two cards share, a named category with no filter, a condition the builder itself rejects — and drives `previewDisabled`/`applyDisabled`, the stage-level `role="alert"` list, and `holdTransformationOnCreate()`, which keeps the stage on Create and expands the blocked cards so a folded card cannot hide its own fix. A non-blocking entry is a rule the builder could not read (`exportFilterLogic()` empty while `unloadedInput()` reports stored rules): the commit keeps the stored filter, the card says so, and the stage still applies. The entry the old gate had beside these — category filters must reference a *selected* variable — is gone for good: a stored rule may point at a CDE outside the pool, which cannot be selected from this card.

Consequences: Apply is destructive for neither kind of rule, and Preview cannot describe a column the cards cannot name. A builder error blocks, which means an off-pool variable renders its free-text value box and the user can still satisfy the condition — verified by the specs, not yet in a browser against a stored experiment. `transformationBlockingIssues()` gained a `blocking` field; the `transformationApplyError` field is gone and the stage list is the single place a refused Apply speaks. `docs/context/risk-register.md` names the two ways to reintroduce the old failure.

Files affected: `src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.component.*`, `docs/context/risk-register.md`, `docs/context/module-index.md`.

Date: 2026-09-14.

### Decision: The derived-column stage has no Preview/Apply gate at all

Status: Accepted

Context: Browser feedback on a stored experiment. A card the app had merely loaded — a derived `Pro` column whose `old`/`yound` categories carry no filter this UI can show — was answered with a stage-level `Fix before Preview or Apply` alert, a red row on the card, and both actions dimmed. Nothing on that card could clear it: the card was authored elsewhere, and the user cannot tell a fact about stored data apart from a mistake they are mid-way through typing. The superseded decision narrowed the gate to "what the user can still fix"; the field report is that the distinction does not survive a real experiment, because an unfinished loaded card is not a fix in progress.

Decision: Remove the gate and every reference to it. `commitTransformationRuleFilters()` returns `void` and keeps the one rule-safety invariant that mattered — a rule is rewritten only when its builder can speak for it, so a builder that rejects its own condition, or that could not read what the store holds, leaves that rule untouched instead of exporting an empty filter. Preview commits and describes; Apply commits and folds the stage. Deleted: `transformationBlockingIssues()`, `transformationHasBlockingIssues`, `transformationBlockingMessages()`, `transformationDraftIssues()`, `holdTransformationOnCreate()`, `expandInvalidTransformationDrafts()`, `transformationRuleFilterErrors`, the orphan `transformationIsValid`, the `role="alert"` list, the per-card `row-error`s under the category rules, and the `[previewDisabled]`/`[applyDisabled]` bindings on the Transformation station — the shared bar lost its `previewDisabled` input with them, since no station passes it. What replaces the gate is three facts, each stated where it is knowable. A rule row whose builder reports `unloadedInput()` carries its own note ("A saved filter on this category could not be opened in this builder. It is applied exactly as stored; rebuild the rule only to replace it."): the builder owns that fact, so the note is there before the first Preview and asks for no fix. Apply dims on `transformationCanApply` alone — true when at least one card forms a config — which is a statement about having nothing to write and never about what a loaded rule says. And the stage folds after Apply only when `transformationHasPendingChange` is false, so a fold cannot hide the chip that is still reporting unfinished work.

Consequences: An unfinished card now behaves like every other optional station: `buildTransformationConfigForDraft()` drops an unfiltered category, so the describe and the persisted payload cover the complete cards only, while the card keeps its `Pending` chip and the stage keeps `Pending` — with the stage kept open, those chips are the whole warning. A duplicate column name no longer refuses Apply; only the first occurrence is persisted, as before, and the second card is named by its `Duplicate name` chip. Statistics names what is missing whenever a named card has no config to describe: `transformationStatsGapNotice()` phrases one line for every gap the cards actually hold (a named category, a filter on each one), because the alternative was a column heading over a dash-only table under "Category counts from a describe run" — a describe that never ran. Re-adding a gate needs a shape that separates stored data from an in-progress edit, not a flag on one message list; `transformationCanApply` is the only hold left and it must stay a statement about an empty payload, not about loaded rules.

Files affected: `src/app/pages/experiment-studio/statistic-analysis-panel/statistic-analysis-panel.component.*`, `src/app/pages/experiment-studio/shared/station-action-bar/station-action-bar.component.*`, `docs/context/decision-log.md`, `docs/context/risk-register.md`.

Date: 2026-09-14.
