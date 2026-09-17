# Algorithm Visualization Guide (Frontend Implementation Status)

This document describes what the frontend currently renders for each algorithm and highlights known visualization gaps.

## Scope

- Charts are configured in `src/app/pages/experiment-studio/visualisations/charts/chart-registry.ts`.
- Tabular rendering is configured in `src/app/pages/experiment-studio/visualisations/auto-renderer/algorithm-table-registry.ts`.
- Result enum/label mapping is handled in `src/app/core/algorithm-result-enum-mapper.ts`.

## Implemented Coverage

### ANOVA One-Way (`anova_oneway`)

- Charts:
  - Mean plot with confidence intervals.
- Tables:
  - ANOVA summary table.
  - Tukey post-hoc table (when present).

### ANOVA Two-Way (`anova_twoway`)

- Charts:
  - None (table only).
- Tables:
  - Two-way ANOVA table (term, sum sq, df, F, p-value).


### T-Tests (`ttest_independent`, `ttest_paired`, `ttest_onesample`)

- Charts:
  - Mean difference with 95% CI error-bar style chart.
- Tables:
  - Compact test summary table with t, df, p, mean difference, CI, Cohen's d.

### Cox Regression Classical (`cox_regression_classical`)

- Charts:
  - Hazard ratio plot with 95% CI on a log scale (reference line at HR = 1).
  - Intercept is omitted; factors use display labels when available.
- Tables:
  - Clinician coefficients table (factor, hazard ratio, 95% CI, p-value).
  - Study and model summary (participants, events, convergence, etc.).

### Cox Regression Stacked (`cox_regression_stacked`)

- Charts:
  - Same hazard ratio plot as classical Cox.
- Tables:
  - Clinician coefficients table.
  - Study and model summary (includes pseudo R², AIC/BIC where applicable).

### Linear Regression (`linear_regression`)

- Charts:
  - Regression line chart (single-predictor models only).
- Tables:
  - Coefficients table.
  - Model summary table (R², adjusted R², AIC/BIC, etc.).

### Linear Regression CV (`linear_regression_cv`)

- Charts:
  - CV metrics chart.
  - Supports both per-fold arrays and summary `{ mean, std }` objects.
- Tables:
  - Training set sample sizes.
  - Error metrics mean/std table.

### Logistic Regression (`logistic_regression`)

- Charts:
  - Logistic regression curve (single-predictor models only).
- Tables:
  - Coefficients table.
  - Model summary table.

### Logistic Regression CV (`logistic_regression_cv`)

- Charts:
  - Confusion matrix heatmap.
  - ROC curve.
- Tables:
  - Fold-level metrics table.

### Naive Bayes (non-CV)

- Algorithms:
  - `naive_bayes_gaussian`
  - `naive_bayes_categorical`
- Charts:
  - Class prior probabilities bar chart.
  - Uses enum labels for class names when available.
- Tables:
  - Gaussian: class summary, theta, variance tables.
  - Categorical: class summary, category counts, category log-probability tables.

### Naive Bayes CV (`naive_bayes_gaussian_cv`, `naive_bayes_categorical_cv`)

- Charts:
  - Confusion matrix heatmap.
- Tables:
  - Classification metrics per fold.
  - Combined confusion matrix table.

### K-Means (`kmeans`)

- Charts:
  - 2D scatter for 2-dimensional centers.
  - 3D scatter for 3-dimensional centers.
  - Parallel coordinates fallback for dimensions greater than 3.
- Tables:
  - Cluster centers table.

### PCA (`pca`, `pca_with_transformation`)

- Charts:
  - Eigenvector heatmap.
  - Scree plot.
- Tables:
  - Eigenvalues table.

### Pearson Correlation (`pearson_correlation`)

- Charts:
  - Correlation matrix heatmap.
  - P-values heatmap.
  - Lower CI heatmap.
  - Upper CI heatmap.
- Tables:
  - Number of observations.

### Descriptive Statistics (`describe`)

- Charts:
  - Box plot for numeric variable distributions.
  - Grouped bar charts for nominal distributions (from statistics panel flow).
- Tables:
  - Variable-based and model-based numeric/nominal summary tables.

### Histogram (`histogram`)

- Charts:
  - Histogram bar chart (supports interval bins and categorical bins).
- Tables:
  - Bin/count table.

### Linear SVM (`linear_svm`)

- Charts:
  - SVM distribution chart from model weights and intercept.
- Tables:
  - Linear SVM summary (observations, intercept, weight values).

Notes:
- `svm_scikit` is no longer supported.

## Known Gaps / Missing Enhancements

1. Naive Bayes CV ROC is not rendered.
- Current `NaiveBayesCVResult` payload does not provide ROC curve arrays, so only confusion matrix and metrics table are available.

2. Two-way ANOVA chart currently visualizes Sum of Squares only.
- Additional chart variants (for F-statistics or p-values) could be added if needed.

3. Linear Regression CV table builder expects metric objects for all configured rows.
- If backend omits some metric objects entirely, table rendering can fail. This is a known robustness gap.

## Summary

The frontend now covers all primary algorithm families with chart and/or table rendering in the canonical algorithm namespace. Remaining gaps are mostly payload-driven (e.g., missing ROC data for Naive Bayes CV) or robustness improvements.
