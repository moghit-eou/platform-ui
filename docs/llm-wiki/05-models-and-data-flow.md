# Models and Data Flow

Use before changing request/response shapes, feature state, algorithm payloads,
or result rendering.

## Model Areas

| Concern | Likely files |
|---|---|
| algorithm definitions | `algorithm-definition.model.ts`, `backend-algorithms.model.ts` |
| algorithm results | `algorithm-results.model.ts` |
| backend experiments | `backend-experiment.model.ts` |
| dashboard | `experiments-dashboard.model.ts` |
| filters | `filters.model.ts` |

## Flows

```text
/services/data-models -> ExperimentStudioService -> data model/dataset/variable UI
/services/specifications/algorithms -> algorithm mapper -> algorithm panel config
/services/experiments -> result model -> visualisations/tables/exports
/services/experiments/:id -> dashboard service -> detail/compare/export UI
backend result keys -> output schema -> renderer/registry
```

## Rules

- Inspect the owning service before changing a model.
- Search model usage before renaming fields.
- Prefer additive optional fields if backend compatibility is uncertain.
- Update mappers when backend names differ from UI names.
- Update focused tests for mapper/model utilities where present.

Search by endpoint, DTO/interface, backend field, UI label, algorithm name, or
result key before opening broad folders.
