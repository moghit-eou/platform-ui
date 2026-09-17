# Algorithm Mapping Index

Primary file: `src/app/core/algorithm-mappers.ts`.

Supporting files: input counts, parameter utilities, result enum mapper,
algorithm constants, and algorithm/result models.

## Responsibilities

- key configs by the backend algorithm name as delivered (no alias rewriting)
- assign categories
- build parameter/config schemas
- normalize enum/dictionary fields
- sanitize labels/docs
- apply fallback input counts
- attach output schemas for result rendering

## Lookup Rules

- For one algorithm, search by backend name or output key first.
- For output schema work, search `getOutputSchema` and edit only the matching
  case.
- For category work, search `CATEGORY_MAPPING`.
- For input counts, inspect `algorithm-input-counts.ts`.
- Open renderer/registry files only when schema type/rendering behavior changes.

## Search Keys

Algorithm backend name, output key, `mapSpecificationsToAlgorithmConfigs`,
`getOutputSchema`, `prettifyLabel`, `buildConfigSchema`, `CATEGORY_MAPPING`,
`dynamic-table`, `section`, `number`, `table`.

Do not read all of `algorithm-mappers.ts` unless the task crosses many
algorithms or the targeted search is inconclusive.

Names are now used exactly as the backend sends them: the `anova` ->
`anova_twoway` rewrite and the `histogram_sql` /
`logistic_regression_cv_fedaverage` entries are gone, so check stored experiment
compatibility before removing or adding an alias.
