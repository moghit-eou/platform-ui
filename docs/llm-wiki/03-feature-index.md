# Feature Index

Use this page to choose the smallest feature context.

## Experiment Studio

Path: `src/app/pages/experiment-studio/`

One step view at a time behind a sticky stepper (`activeSection`); the views stay
mounted and are hidden with CSS, so open editors and in-flight runs survive a step
change.

Owns data model/dataset selection, the variable pool and its outcome/predictor
roles, filters, the Data review pipeline, algorithm config, runs, transient
previews, charts, tables, histograms, and metadata views.

Start with:

- `ExperimentStudioComponent` (step shell) and `StudioStepperComponent` (step rail)
- `ExperimentStudioService` (selection, algorithm roles, run state)
- `execution-panel/` for run status/results and
  `algorithm-panel/algorithm-role-assignment/` for the y/x slots
- `shared/station-card`, `shared/station-action-bar`, `shared/station-list-row` for
  the cards and footers every Data review step reuses
- relevant model under `src/app/models/`
- `06-algorithm-mapping-index.md` for algorithm output/config tasks

Search keys: `activeSection`, `selectedDataModel`, `dataset`, `variable`,
`algorithmY`, `algorithmX`, `algorithmAssignableVariables`, `filter`, `transient`,
`histogram`, `describe`, `runResult`, algorithm name.

## Experiments Dashboard

Path: `src/app/pages/experiments-dashboard/`

Owns experiment list/search/pagination, detail view, compare, metadata updates,
sharing, delete, and exports.

Start with:

- `ExperimentsDashboardComponent`
- `ExperimentsDashboardService`
- dashboard model/mapper

Search keys: `compare`, `export`, `shared`, `description`, `delete`, `PATCH`,
experiment id, result key.

## Smaller Pages

| Area | Path | Start with |
|---|---|---|
| account | `src/app/pages/account-page/` | component + `AuthService` |
| terms | `src/app/pages/terms-page/` | component + `TermsGuard` |
| notebook | `src/app/pages/notebook/` | route + component + runtime env |
| shared layout | `src/app/pages/shared/` | specific component |

Use `indexes/files-by-feature.md` for exact paths and avoid opening sibling
folders until a search points there.
