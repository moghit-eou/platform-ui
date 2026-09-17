# Algorithm Result Code → Label Mappings

This documents how the frontend maps categorical **codes → labels** for algorithm results using
metadata enumerations and variable labels. The implementation lives in:

- `src/app/core/algorithm-result-enum-mapper.ts`
- Applied by `src/app/pages/experiment-studio/algorithm-panel/algorithm-result/algorithm-result.component.ts`

## Data sources

- **Enum maps** (category codes → labels) come from data model enumerations.
- **Label maps** (variable codes → labels) come from data model variable labels.
- **Y/X variables** are derived from:
  - Studio: algorithm y / x roles and the assignable pool.
  - Dashboard detail: experiment algorithm input `y` / `x`.
  - Compare view: experiment variables / covariates.

## Implemented mappings

### naive_bayes_categorical_cv / naive_bayes_gaussian_cv
- `confusion_matrix.labels`: map using **Y** variable enums.
- `classification_summary`: map class keys using the same enum map as the confusion matrix.

### anova_oneway
- `tuckey_test[].groupA` / `groupB`: map using **X** variable enums.
- `min_max_per_group.categories`: map using **X** variable enums.
- `ci_info` keys (`means`, `m-s`, `m+s`, `sample_stds`): map using **X** variable enums.
- `anova_table.x_label` / `anova_table.y_label`: map variable codes → labels when label map exists.

### anova (two-way)
- `terms[]`: map variable codes → labels.
- `sum_sq`, `df`, `ms`, `f_stat`, `f_value`, `p_value`, `pvalue`, `f_pvalue` keys: map variable codes → labels
  **when these fields are object maps**.
- Interaction terms (`var1:var2`) are mapped per-part and re-joined with `:`.

### histogram
- `histogram[].bins`: map using **Y** variable enums.
- `histogram[].grouping_enum`: map using **Y** variable enums (when present).

### pearson_correlation
- `correlations`: map variable codes → labels.
  - Matrix shape: remap `variables[]` and row keys.
  - Table shape: remap the first two columns (Variable 1 / Variable 2).
- `p-values`, `p_values`, `ci_lo`, `ci_hi`, `low_confidence_intervals`, `high_confidence_intervals`:
  remap matrix variables and row keys.

### linear_regression / linear_regression_cv / logistic_regression / logistic_regression_cv
- `dependent_var`: map variable code → label.
- `indep_vars`: map dummy-category labels:
  - `var[level]` → `Var Label[Enum Label]`
  - `var=level` → `Var Label=Enum Label`
  - plain variable codes are mapped to labels when present.
