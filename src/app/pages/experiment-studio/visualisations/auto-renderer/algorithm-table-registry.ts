import {
  AnovaResult, AnovaTwoWayResult, TTestResult,
  LinearRegressionResult, LinearRegressionCVResult, LMMResult,
  LogisticRegressionResult, CVLogisticRegressionResult,
  CoxRegressionResult, ClassicalCoxRegressionSummary, StackedCoxRegressionSummary,
  NaiveBayesGaussianResult, NaiveBayesCategoricalResult, NaiveBayesCVResult,
  KMeansResult, PCAResult, PearsonResult,
  HistogramResult, DescriptiveStatsResult,
  VariableStats, NominalDescriptiveStats, NumericalDescriptiveStats,
  QuartilesResult, BinnedMannWhitneyUTestResult
} from '../../../../models/algorithm-results.model';
import { getFeaturewiseDescribeRows } from '../../../../core/describe-result.utils';

export interface TableSpec {
  title?: string;
  columns: string[];
  rows: any[][];
  layout?: 'compact' | 'full';
}

export type TableBuilder = (result: any) => TableSpec[];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDecimal(value: any): string {
  if (typeof value !== 'number' || isNaN(value)) return value ?? '';

  const abs = Math.abs(value);
  if (abs === 0) return '0';

  // Too small or too big numbers -> scientific
  if (abs < 1e-4 || abs >= 1_000_000) {
    return value.toExponential(3);
  }

  const decimals = abs < 1 ? 4 : 3;
  let formatted = value.toFixed(decimals);

  formatted = formatted
    .replace(/(\.\d*?[1-9])0+$/u, '$1')
    .replace(/\.0+$/u, '');

  if (formatted === '-0') formatted = '0';

  return formatted;
}

function formatAnovaMetric(value: any): string {
  if (typeof value !== 'number' || isNaN(value)) return value ?? '';
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(3);
}

function formatFixedMetric(value: any): string {
  if (typeof value !== 'number' || isNaN(value)) return value ?? '';
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(3);
}

function formatNullableOutlierValue(value: any): string {
  if (value === null || value === undefined) return 'Unavailable';
  return formatDecimal(value);
}

function formatAnovaPValue(value: any): string {
  if (typeof value !== 'number' || isNaN(value)) return value ?? '';
  if (!Number.isFinite(value)) return String(value);
  return value.toExponential(3);
}

function formatTTestKey(key: string): string {
  const map: Record<string, string> = {
    mean_diff: 'Mean Difference',
    se_diff: 'Std. Error of Difference',
    se_difference: 'Std. Error of Difference',
    std_err_diff: 'Std. Error of Difference',
    ci_upper: '95% CI Upper',
    ci_lower: '95% CI Lower',
    t_stat: 'T-statistic',
    p: 'p-value',
    p_value: 'p-value',
    df: 'Degrees of Freedom',
    dof: 'Degrees of Freedom',
    cohens_d: "Cohen's d",
    cohen_d: "Cohen's d",
  };
  if (map[key]) return map[key];

  // Fallback for unknown keys
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildTTestRows(
  result: Record<string, any>,
  valueFormatter: (value: any) => string = formatDecimal
): any[][] {
  const ignoredKeys = new Set([
    'title',
    'labelMap',
    'enumMaps',
    'yVar',
    'xVar',
    '__labelMap__',
    '__enumMaps__',
    '__yVar__',
    '__xVar__',
  ]);

  return Object.entries(result)
    .filter(([key, value]) => {
      if (ignoredKeys.has(key) || key.startsWith('__')) return false;
      if (Array.isArray(value)) return false;
      if (value !== null && typeof value === 'object') return false;
      return true;
    })
    .map(([k, v]) => [formatTTestKey(k), valueFormatter(v)]);
}

function buildMetricRows(result: Record<string, any>, labels: Record<string, string>, keys: string[]): any[][] {
  return keys
    .filter((key) => result?.[key] !== undefined && result?.[key] !== null)
    .map((key) => [labels[key] ?? key, formatDecimal(result[key])]);
}

interface ContingencyContext {
  __labelMap__?: Record<string, string>;
  __xVar__?: string | null;
  __yVar__?: string | null;
}

function resolveVariableDisplayLabel(
  code: string | null | undefined,
  labelMap?: Record<string, string> | null,
): string {
  if (!code) return '';
  const trimmed = String(code).trim();
  if (!trimmed) return '';
  return labelMap?.[trimmed] ?? trimmed;
}

function buildContingencyCategoryTable(
  xLabels: string[],
  yLabels: string[],
  ctx: ContingencyContext,
): TableSpec | null {
  if (!xLabels.length && !yLabels.length) return null;

  const factorVariable = resolveVariableDisplayLabel(ctx.__xVar__, ctx.__labelMap__) || '—';
  const outcomeVariable = resolveVariableDisplayLabel(ctx.__yVar__, ctx.__labelMap__) || '—';

  return {
    title: 'Contingency Table Categories',
    columns: ['Role', 'Variable', 'Categories'],
    rows: [
      ['Factor', factorVariable, xLabels.join(', ')],
      ['Outcome', outcomeVariable, yLabels.join(', ')],
    ],
    layout: 'full',
  };
}

function buildContingencyCornerLabel(ctx: ContingencyContext): string {
  const factor = resolveVariableDisplayLabel(ctx.__xVar__, ctx.__labelMap__);
  const outcome = resolveVariableDisplayLabel(ctx.__yVar__, ctx.__labelMap__);
  if (factor && outcome) {
    return `${factor} \\ ${outcome}`;
  }
  return 'Factor \\ Outcome';
}

interface CoefficientColumnSpec {
  key: string;
  label: string;
  displayKey?: string;
  format?: 'decimal' | 'text';
}

function formatCoefficientCell(
  result: Record<string, unknown>,
  column: CoefficientColumnSpec,
  index: number
): string {
  const displayKey = column.displayKey;
  if (displayKey) {
    const displaySource = Array.isArray(result[displayKey]) ? result[displayKey] : [];
    const display = displaySource[index];
    if (display !== null && display !== undefined && String(display).trim() !== '') {
      return String(display);
    }
  }

  const source: unknown[] = Array.isArray(result[column.key])
    ? (result[column.key] as unknown[])
    : [];
  const value = source[index];
  if (column.format === 'text') {
    return value === null || value === undefined ? '' : String(value);
  }
  return formatDecimal(value);
}

function buildCoefficientRows(
  result: Record<string, unknown>,
  values: CoefficientColumnSpec[]
): unknown[][] {
  const variables = Array.isArray(result['indep_vars']) ? result['indep_vars'] : [];
  if (!variables.length) return [];

  return variables.map((variable, index) => [
    variable,
    ...values.map((column) => formatCoefficientCell(result, column, index)),
  ]);
}

function formatLinearRegressionSummaryMetric(key: string, result: LinearRegressionResult): string {
  if (key === 'f_stat') {
    const display = result.f_stat_display;
    if (typeof display === 'string' && display.trim()) return display;
  }
  if (key === 'f_pvalue') {
    const display = result.f_pvalue_display;
    if (typeof display === 'string' && display.trim()) return display;
  }
  return formatDecimal(result[key as keyof LinearRegressionResult]);
}

function isClassicalCoxSummary(
  summary: ClassicalCoxRegressionSummary | StackedCoxRegressionSummary
): summary is ClassicalCoxRegressionSummary {
  return typeof (summary as ClassicalCoxRegressionSummary).n_unique_event_times === 'number';
}

function isCoxInterceptTerm(name: string): boolean {
  return String(name).trim().toLowerCase() === 'intercept';
}

function formatCoxHazardRatio(value: number | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (numeric >= 100) return numeric.toFixed(1);
  if (numeric >= 10) return numeric.toFixed(2);
  return numeric.toFixed(3);
}

function formatCoxPValue(value: number | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (numeric < 0.001) return '<0.001';
  return numeric.toFixed(3);
}

function formatCoxHazardRatioCi(lower: number | undefined, upper: number | undefined): string {
  const low = Number(lower);
  const high = Number(upper);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return '—';
  return `${formatCoxHazardRatio(low)} – ${formatCoxHazardRatio(high)}`;
}

function buildCoxRegressionTables(
  result: CoxRegressionResult,
  options: { coefficientsTitle: string; variant: 'classical' | 'stacked' }
): TableSpec[] {
  const summary = result?.summary;
  if (!summary) return [];

  const indepVars = result.indep_vars ?? [];
  const coefficients = summary.coefficients ?? [];
  if (!indepVars.length || !coefficients.length) return [];

  const coefRows = indepVars
    .map((variable, index) => {
      if (isCoxInterceptTerm(variable)) return null;
      return [
        variable,
        formatCoxHazardRatio(summary.hazard_ratios?.[index]),
        formatCoxHazardRatioCi(summary.hr_lower_ci?.[index], summary.hr_upper_ci?.[index]),
        formatCoxPValue(summary.pvalues?.[index]),
      ];
    })
    .filter((row): row is string[] => !!row);

  const tables: TableSpec[] = [{
    title: options.coefficientsTitle,
    columns: [
      'Factor',
      'Hazard ratio',
      '95% CI',
      'p-value',
    ],
    rows: coefRows,
    layout: 'full',
  }];

  const summaryRows: any[][] = [
    ['Follow-up time', result.event_var],
    ['Event indicator', result.dependent_var],
    ['Participants', formatDecimal(summary.n_obs)],
    ['Events', formatDecimal(summary.n_events)],
    ['Covariates in model', formatDecimal(summary.n_covariates)],
  ];

  if (options.variant === 'classical' && isClassicalCoxSummary(summary)) {
    summaryRows.push(
      ['Model converged', summary.converged ? 'Yes' : 'No'],
      ['Distinct event times', formatDecimal(summary.n_unique_event_times)],
      ['Tied events handling', summary.ties ?? ''],
    );
  } else if (options.variant === 'stacked') {
    const stacked = summary as StackedCoxRegressionSummary;
    summaryRows.push(
      ['Analysis rows', formatDecimal(stacked.n_stacked_rows)],
      ['Pseudo R² (CS)', formatDecimal(stacked.r_squared_cs)],
      ['Pseudo R² (McF)', formatDecimal(stacked.r_squared_mcf)],
      ['AIC', formatDecimal(stacked.aic)],
      ['BIC', formatDecimal(stacked.bic)],
    );
  }

  tables.push({
    title: 'Study and model summary',
    columns: ['Item', 'Value'],
    rows: summaryRows,
    layout: 'full',
  });

  return tables;
}

function buildMixedEffectsSummary(result: Record<string, any>, extraKeys: string[] = []): TableSpec {
  const labels: Record<string, string> = {
    dependent_var: 'Dependent variable',
    grouping_var: 'Grouping variable',
    n_obs: 'Observations',
    n_groups: 'Groups',
    df_model: 'DF Model',
    df_resid: 'DF Residual',
    sigma2: 'Residual variance',
    sigma_u2: 'Random intercept variance',
    ll_reml: 'REML log-likelihood',
    aic: 'AIC',
    bic: 'BIC',
    converged: 'Converged',
    n_iter: 'Iterations',
  };
  const keys = [
    'dependent_var',
    'grouping_var',
    'n_obs',
    'n_groups',
    ...extraKeys,
    'sigma2',
    'sigma_u2',
    'll_reml',
    'aic',
    'bic',
    'converged',
    'n_iter',
  ];
  return {
    title: 'Model Summary',
    columns: ['Metric', 'Value'],
    rows: buildMetricRows(result, labels, keys),
    layout: 'full',
  };
}

function buildHistogramTables(result: HistogramResult): TableSpec[] {
  const tables: TableSpec[] = [];
  for (const item of result.histogram) {
    const rows = [];
    for (let i = 0; i < item.counts.length; i++) {
      if (item.counts[i] === null) continue;
      rows.push([item.bins[i], item.counts[i]]);
    }
    tables.push({
      title: `Histogram Data: ${item.var}` + (item.grouping_var ? ` (${item.grouping_enum})` : ''),
      columns: ['Bin', 'Count'],
      rows,
    });
  }
  return tables;
}

export const AlgorithmTableRegistry: Record<string, TableBuilder> = {
  kmeans: (result: KMeansResult) => {
    const centers = result?.centers;
    if (!Array.isArray(centers) || centers.length === 0) return [];
    const dims = centers[0]?.length || 0;
    const columns = [...Array(dims)].map((_, i) => ['x', 'y', 'z'][i] || `dim${i + 1}`);
    const rows = centers.map((row: number[]) => row.map(v => Number(v.toFixed(3))));
    return [{ title: 'K-Means Centers', columns, rows }];
  },

  linear_regression: (result: LinearRegressionResult) => {
    if (!result) return [];

    const indepVars = result.indep_vars || [];
    const coefficients = result.coefficients || [];
    const stdErr = result.std_err || [];
    const tStats = result.t_stats || [];
    const pValues = result.pvalues || [];
    const lowerCi = result.lower_ci || [];
    const upperCi = result.upper_ci || [];

    if (indepVars.length && coefficients.length) {
      const coefRows = indepVars.map((variable, idx) => [
        variable,
        formatDecimal(coefficients[idx]),
        formatDecimal(stdErr[idx]),
        formatDecimal(tStats[idx]),
        formatDecimal(pValues[idx]),
        formatDecimal(lowerCi[idx]),
        formatDecimal(upperCi[idx]),
      ]);

      const infoKeys: Array<keyof LinearRegressionResult> = [
        'dependent_var',
        'n_obs',
        'df_model',
        'df_resid',
        'r_squared',
        'r_squared_adjusted',
        'f_stat',
        'f_pvalue',
        'rse',
        'll',
        'aic',
        'bic',
      ];

      const labelMap: Record<string, string> = {
        dependent_var: 'Dependent variable',
        n_obs: 'Observations',
        df_model: 'Degrees of Freedom (Model)',
        df_resid: 'Degrees of Freedom (Residual)',
        r_squared: 'R² Score',
        r_squared_adjusted: 'Adjusted R²',
        f_stat: 'F-statistic',
        f_pvalue: 'p-value (F-stat)',
        rse: 'Residual Std. Error',
        ll: 'Log-likelihood',
        aic: 'AIC',
        bic: 'BIC'
      };

      const infoRows = infoKeys
        .filter((key) => result[key] !== undefined && result[key] !== null)
        .map((key) => [labelMap[key] || key, formatLinearRegressionSummaryMetric(key, result)]);

      if (typeof result.f_stat_note === 'string' && result.f_stat_note.trim()) {
        infoRows.push(['F-statistic note', result.f_stat_note.trim()]);
      }

      return [
        {
          title: 'Coefficients',
          columns: ['Independent variables', 'Coefficients', 'Std.Err.', 't-stats', 'P(>|t|)', 'Lower 95% c.i.', 'Upper 95% c.i.'],
          rows: coefRows,
        },
        {
          title: 'Model Summary',
          columns: ['Name', 'Value'],
          rows: infoRows,
          layout: 'full',
        },
      ];
    }
    return [];
  },

  lmm: (result: LMMResult | null | undefined) => {
    if (!result) return [];

    const pvalueLabel =
      typeof result.pvalue_label === 'string' && result.pvalue_label.trim()
        ? result.pvalue_label.trim()
        : 'P(>|t|)';
    const coefficientColumns: CoefficientColumnSpec[] = [
      { key: 'coefficients', label: 'Coefficient' },
      { key: 'std_err', label: 'Std.Err.' },
      { key: 't_stats', label: 't-statistic' },
      {
        key: 'pvalues',
        label: pvalueLabel,
        displayKey: 'pvalues_display',
        format: 'text',
      },
      { key: 'lower_ci', label: 'Lower 95% CI' },
      { key: 'upper_ci', label: 'Upper 95% CI' },
    ];
    const coefRows = buildCoefficientRows(
      result as unknown as Record<string, unknown>,
      coefficientColumns
    );

    const tables: TableSpec[] = [];
    if (coefRows.length) {
      tables.push({
        title: 'Fixed Effects',
        columns: ['Variable', ...coefficientColumns.map(({ label }) => label)],
        rows: coefRows,
        layout: 'full',
      });
    }

    const summary = buildMixedEffectsSummary(result, ['df_model', 'df_resid']);
    if (summary.rows.length) tables.push(summary);

    return tables;
  },

  glmm_binary: (result: any) => {
    if (!result) return [];

    const coefficientColumns = [{ key: 'coefficients', label: 'Coefficient' }];
    const coefRows = buildCoefficientRows(result, coefficientColumns);
    const tables: TableSpec[] = [];

    if (coefRows.length) {
      tables.push({
        title: 'Fixed Effects',
        columns: ['Variable', ...coefficientColumns.map(({ label }) => label)],
        rows: coefRows,
        layout: 'full',
      });
    }

    const summary = buildMixedEffectsSummary(result);
    if (summary.rows.length) tables.push(summary);

    return tables;
  },

  glmm_ordinal: (result: any) => {
    if (!result) return [];

    const coefficientColumns = [{ key: 'coefficients', label: 'Coefficient' }];
    const coefRows = buildCoefficientRows(result, coefficientColumns);
    const tables: TableSpec[] = [];

    if (coefRows.length) {
      tables.push({
        title: 'Fixed Effects',
        columns: ['Variable', ...coefficientColumns.map(({ label }) => label)],
        rows: coefRows,
        layout: 'full',
      });
    }

    if (Array.isArray(result.cutpoints) && result.cutpoints.length) {
      tables.push({
        title: 'Cutpoints',
        columns: ['Boundary', 'Cutpoint'],
        rows: result.cutpoints.map((value: any, index: number) => [
          `Cutpoint ${index + 1}`,
          formatDecimal(value),
        ]),
      });
    }

    if (Array.isArray(result.category_order) && result.category_order.length) {
      tables.push({
        title: 'Ordinal Category Order',
        columns: ['Level', 'Category'],
        rows: result.category_order.map((category: any, index: number) => [
          index + 1,
          category,
        ]),
      });
    }

    const summary = buildMixedEffectsSummary(result);
    if (summary.rows.length) tables.push(summary);

    return tables;
  },

  linear_regression_cv: (result: LinearRegressionCVResult) => {
    if (!result) return [];

    // Training set sample sizes
    const nObs = result.n_obs;
    const sampleSizeRows = Array.isArray(nObs)
      ? nObs.map((val: number, i: number) => [`Fold ${i + 1}`, val])
      : [];

    const normalizeStat = (value: any): { mean: number | null; std: number | null } => {
      if (!value) return { mean: null, std: null };
      if (Array.isArray(value)) {
        return {
          mean: typeof value[0] === 'number' && !isNaN(value[0]) ? value[0] : null,
          std: typeof value[1] === 'number' && !isNaN(value[1]) ? value[1] : null
        };
      }
      if (typeof value === 'object') {
        const mean = typeof value.mean === 'number' && !isNaN(value.mean) ? value.mean : null;
        const std = typeof value.std === 'number' && !isNaN(value.std) ? value.std : null;
        return { mean, std };
      }
      return { mean: null, std: null };
    };

    const candidates: Array<{ label: string; stat: { mean: number | null; std: number | null } }> = [
      { label: 'Root mean squared error', stat: normalizeStat((result as any).mean_sq_error) },
      { label: 'R-squared', stat: normalizeStat((result as any).r_squared) },
      { label: 'Mean absolute error', stat: normalizeStat((result as any).mean_abs_error) },
      { label: 'F-statistic', stat: normalizeStat((result as any).f_stat) },
    ];

    const statsRows = candidates
      .filter(({ stat }) => stat.mean !== null || stat.std !== null)
      .map(({ label, stat }) => [label, stat.mean ?? '', stat.std ?? '']);

    return [
      {
        title: 'Training set sample sizes',
        columns: ['Fold', 'Training Set Sample Sizes'],
        rows: sampleSizeRows,
      },
      {
        title: 'Error metrics',
        columns: ['Metric', 'Mean', 'Standard Deviation'],
        rows: statsRows,
      }
    ];
  },

  naive_bayes_gaussian: (result: NaiveBayesGaussianResult & { __labelMap__?: Record<string, string>, __enumMaps__?: any, __yVar__?: string }) => {
    if (!result) return [];

    // Extract metadata
    const labelMap = result.__labelMap__ || {};
    const enumMaps = result.__enumMaps__ || {};
    const yVar = result.__yVar__;

    // Helpers
    const getLabel = (code: string) => labelMap[code] || code;
    const getEnumLabel = (varCode: string, val: string) => enumMaps[varCode]?.[val] ?? val;

    const tables: TableSpec[] = [];

    const rawClasses = result.classes || [];
    const rawFeatureNames = result.feature_names || [];

    // Map labels
    const classLabels = rawClasses.map(c => yVar ? getEnumLabel(yVar, String(c)) : String(c));
    const featureLabels = rawFeatureNames.map(f => getLabel(f));

    // Class summary
    if (rawClasses.length > 0) {
      tables.push({
        title: 'Class Summary',
        columns: ['Class', 'Count', 'Prior'],
        rows: rawClasses.map((_cls, i) => [
          classLabels[i],
          formatDecimal(result.class_count?.[i]),
          formatDecimal(result.class_prior?.[i]),
        ]),
        layout: 'full',
      });
    }

    // Theta (Means)
    if (result.theta && result.theta.length > 0) {
      const columns = ['Class', ...featureLabels];
      const rows = result.theta.map((row, i) => [
        classLabels[i] ?? `Class ${i}`,
        ...row.map((v) => formatDecimal(v)),
      ]);
      tables.push({ title: 'Feature Means per Class (θ)', columns, rows, layout: 'full' });
    }

    // Variance
    if (result.var && result.var.length > 0) {
      const columns = ['Class', ...featureLabels];
      const rows = result.var.map((row, i) => [
        classLabels[i] ?? `Class ${i}`,
        ...row.map((v) => formatDecimal(v)),
      ]);
      tables.push({ title: 'Feature Variances per Class (σ²)', columns, rows, layout: 'full' });
    }

    return tables;
  },

  naive_bayes_gaussian_cv: (result: NaiveBayesCVResult) => {
    const summary = result?.classification_summary;
    if (!summary) return [];

    const metrics = ['accuracy', 'precision', 'recall', 'fscore'] as const;
    if (!summary.accuracy) return [];

    const classes = Object.keys(summary.accuracy);
    if (!classes.length) return [];

    const folds = Object.keys(summary.accuracy[classes[0]]).filter(k => k !== 'average' && k !== 'stdev');

    const rows = [...folds, 'average', 'stdev'].map(fold => {
      const row: any[] = [fold];
      for (const metric of metrics) {
        for (const cls of classes) {
          row.push(formatDecimal(summary[metric][cls]?.[fold]));
        }
      }
      const nObsVal = summary.n_obs?.[fold] ?? 0;
      row.push(formatDecimal(nObsVal));
      return row;
    });

    const columns = ['Fold'];
    for (const metric of metrics) {
      for (const cls of classes) {
        const name = `${capitalize(metric)} (${cls})`;
        columns.push(name);
      }
    }
    columns.push('Number of observations');

    const tables: TableSpec[] = [
      {
        title: 'Classification Metrics per Fold',
        columns,
        rows,
        layout: 'full'
      }
    ];

    if (result.confusion_matrix) {
      tables.push({
        title: 'Confusion Matrix (Combined)',
        columns: ['Actual \\ Predicted', ...result.confusion_matrix.labels],
        rows: result.confusion_matrix.data.map((row, i) => [
          result.confusion_matrix.labels[i],
          ...row.map(v => formatDecimal(v))
        ])
      });
    }

    return tables;
  },

  cox_regression_classical: (result: CoxRegressionResult) =>
    buildCoxRegressionTables(result, {
      coefficientsTitle: 'Factor estimates (table)',
      variant: 'classical',
    }),

  cox_regression_stacked: (result: CoxRegressionResult) =>
    buildCoxRegressionTables(result, {
      coefficientsTitle: 'Factor estimates (table)',
      variant: 'stacked',
    }),

  logistic_regression: (result: LogisticRegressionResult) => {
    if (!result) return [];

    const s = result.summary;
    const coefRows = result.indep_vars.map((v, i) => [
      v,
      formatDecimal(s.coefficients[i]),
      formatDecimal(s.stderr[i]),
      formatDecimal(s.z_scores[i]),
      formatDecimal(s.pvalues[i]),
      formatDecimal(s.lower_ci[i]),
      formatDecimal(s.upper_ci[i]),
    ]);

    const modelInfoRows = [
      ['Dependent Variable', result.dependent_var],
      ['Observations', formatDecimal(s.n_obs)],
      ['DF Model', formatDecimal(s.df_model)],
      ['DF Residual', formatDecimal(s.df_resid)],
      ['AIC', formatDecimal(s.aic)],
      ['BIC', formatDecimal(s.bic)],
      ['Log Likelihood', formatDecimal(s.ll)],
      ['Pseudo R-squared (CS)', formatDecimal(s.r_squared_cs)],
      ['Pseudo R-squared (McF)', formatDecimal(s.r_squared_mcf)],
    ];

    return [
      {
        title: 'Logistic Regression Coefficients',
        columns: ['Variable', 'Coefficient', 'Std.Err.', 'z', 'P(>|z|)', 'Lower 95% CI', 'Upper 95% CI'],
        rows: coefRows,
      },
      {
        title: 'Model Summary',
        columns: ['Metric', 'Value'],
        rows: modelInfoRows,
        layout: 'full',
      },
    ];
  },

  logistic_regression_cv: (result: CVLogisticRegressionResult) => {
    if (!result) return [];
    const s = result.summary;

    const n = s.n_obs.length;
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push([
        s.row_names[i],
        formatDecimal(s.n_obs[i]),
        formatDecimal(s.accuracy[i]),
        formatDecimal(s.precision[i]),
        formatDecimal(s.recall[i]),
        formatDecimal(s.fscore[i])
      ]);
    }

    return [{
      title: 'Logistic Regression CV Summary',
      columns: ['Fold', 'Observations', 'Accuracy', 'Precision', 'Recall', 'F-Score'],
      rows
    }];
  },

  naive_bayes_categorical: (result: NaiveBayesCategoricalResult & { __labelMap__?: Record<string, string>, __enumMaps__?: any, __yVar__?: string }) => {
    if (!result) return [];
    const tables: TableSpec[] = [];

    // Extract metadata injected by AutoRenderer
    const labelMap = result.__labelMap__ || {};
    const enumMaps = result.__enumMaps__ || {};
    const yVar = result.__yVar__;

    // Helpers
    const getLabel = (code: string) => labelMap[code] || code;
    const getEnumLabel = (varCode: string, val: string) => enumMaps[varCode]?.[val] ?? val;

    const rawClasses = result.classes;
    // Map class codes to labels
    const classLabels = rawClasses.map(c => yVar ? getEnumLabel(yVar, String(c)) : String(c));

    // Class summary
    if (rawClasses.length > 0) {
      tables.push({
        title: 'Class Summary',
        columns: ['Class', 'Count', 'Log Prior'],
        rows: rawClasses.map((_cls, i) => [
          classLabels[i],
          formatDecimal(result.class_count[i]),
          formatDecimal(result.class_log_prior[i]),
        ]),
        layout: 'full',
      });
    }

    // Category tables
    for (const feature of result.feature_names) {
      const counts = result.category_count[feature];
      const logProbs = result.category_log_prob[feature];
      const categories = result.categories[feature];

      const featureLabel = getLabel(feature);

      if (!counts || !categories) continue;

      const numCats = categories.length;
      const countRows = [];
      const logProbRows = [];

      for (let c = 0; c < numCats; c++) {
        const catVal = String(categories[c]);
        const catLabel = getEnumLabel(feature, catVal);

        const countRow = [catLabel];
        const logRow = [catLabel];

        for (let i = 0; i < rawClasses.length; i++) {
          countRow.push(formatDecimal(counts[i][c]));
          if (logProbs) logRow.push(formatDecimal(logProbs[i][c]));
        }
        countRows.push(countRow);
        logProbRows.push(logRow);
      }

      const colHeaders = ['Category', ...classLabels];

      tables.push({
        title: `Category Counts: ${featureLabel}`,
        columns: colHeaders,
        rows: countRows,
        layout: 'full'
      });

      if (logProbs) {
        tables.push({
          title: `Category Log Probabilities: ${featureLabel}`,
          columns: colHeaders,
          rows: logProbRows,
          layout: 'full'
        });
      }
    }

    return tables;
  },

  naive_bayes_categorical_cv: (result: NaiveBayesCVResult) => {
    // Same as Gaussian CV
    return AlgorithmTableRegistry['naive_bayes_gaussian_cv'](result);
  },

  pca: (result: PCAResult) => {
    if (!result) return [];
    const tables: TableSpec[] = [];

    // Eigenvalues
    if (result.eigenvalues && result.eigenvalues.length) {
      tables.push({
        title: 'PCA Summary',
        columns: ['Component', 'Eigenvalue'],
        rows: result.eigenvalues.map((v, i) => [`PC${i + 1}`, formatDecimal(v)])
      });
    }

    return tables;
  },

  pca_with_transformation: (result: PCAResult) => {
    return AlgorithmTableRegistry['pca'](result);
  },

  quartiles: (result: QuartilesResult) => {
    if (!Array.isArray(result?.quantiles)) return [];
    return [{
      title: 'Quartiles',
      columns: ['Quantile', 'Value', 'Actual quantile'],
      rows: result.quantiles.map((item) => [
        formatDecimal(item.q),
        formatDecimal(item.value),
        formatDecimal(item.actual_q),
      ]),
    }];
  },

  describe: (result: DescriptiveStatsResult) => {
    if (!result) return [];
    const tables: TableSpec[] = [];

    const buildTables = (stats: VariableStats[], titleProp: string) => {
      const numRows: any[][] = [];
      const nomRows: any[][] = [];

      for (const stat of stats) {
        if (!stat.data) continue;
        // Check if nominal
        if ('counts' in stat.data) {
          const d = stat.data as NominalDescriptiveStats;
          const countsStr = Object.entries(d.counts).map(([k, v]) => `${k}: ${v}`).join(', ');
          nomRows.push([
            stat.variable,
            stat.dataset,
            formatDecimal(d.num_dtps),
            formatDecimal(d.num_na),
            formatDecimal(d.num_total),
            countsStr
          ]);
        } else {
          const d = stat.data as NumericalDescriptiveStats;
          numRows.push([
            stat.variable,
            stat.dataset,
            formatDecimal(d.num_dtps),
            formatDecimal(d.num_na),
            formatDecimal(d.num_total),
            formatDecimal(d.mean),
            formatDecimal(d.std),
            formatDecimal(d.min),
            formatDecimal(d.q1),
            formatDecimal(d.median ?? d.q2),
            formatDecimal(d.q3),
            formatDecimal(d.max)
          ]);
        }
      }

      if (numRows.length) {
        tables.push({
          title: `${titleProp} Summary — Numeric`,
          columns: ['Variable', 'Dataset', 'N', 'Missing', 'Total', 'Mean', 'Std', 'Min', 'Q1', 'Median', 'Q3', 'Max'],
          rows: numRows,
          layout: 'full'
        });
      }
      if (nomRows.length) {
        tables.push({
          title: `${titleProp} Summary — Nominal`,
          columns: ['Variable', 'Dataset', 'N', 'Missing', 'Total', 'Counts'],
          rows: nomRows,
          layout: 'full'
        });
      }
    };

    buildTables(getFeaturewiseDescribeRows(result), 'Featurewise');

    return tables;
  },

  anova_oneway: (result: AnovaResult) => {
    // Two tables: ANOVA Table and Tukey Test
    const t1: TableSpec = {
      title: 'ANOVA Summary',
      columns: ['Source', 'df', 'Sum Sq', 'Mean Sq', 'F', 'Prob>F'],
      rows: [
        ['Explained', formatAnovaMetric(result.anova_table.df_explained), formatAnovaMetric(result.anova_table.ss_explained), formatAnovaMetric(result.anova_table.ms_explained), formatAnovaMetric(result.anova_table.f_stat), formatAnovaPValue(result.anova_table.p_value)],
        ['Residual', formatAnovaMetric(result.anova_table.df_residual), formatAnovaMetric(result.anova_table.ss_residual), formatAnovaMetric(result.anova_table.ms_residual), '', '']
      ]
    };

    const tables = [t1];

    if (result.tuckey_test && result.tuckey_test.length) {
      tables.push({
        title: 'Tukey Post-hoc Test',
        columns: ['Group A', 'Group B', 'Mean A', 'Mean B', 'Diff', 'SE', 't-stat', 'p-value'],
        rows: result.tuckey_test.map(r => [
          r.groupA, r.groupB,
          formatAnovaMetric(r.meanA), formatAnovaMetric(r.meanB),
          formatAnovaMetric(r.diff), formatAnovaMetric(r.se),
          formatAnovaMetric(r.t_stat), formatAnovaPValue(r.p_tuckey)
        ])
      });
    }

    if (result.min_max_per_group && Array.isArray(result.min_max_per_group.categories)) {
      const categories = result.min_max_per_group.categories;
      const minValues = Array.isArray(result.min_max_per_group.min) ? result.min_max_per_group.min : [];
      const maxValues = Array.isArray(result.min_max_per_group.max) ? result.min_max_per_group.max : [];
      const rows = categories.map((category, index) => [
        category,
        formatAnovaMetric(minValues[index]),
        formatAnovaMetric(maxValues[index])
      ]);
      tables.push({
        title: 'Group Min/Max',
        columns: ['Group', 'Min', 'Max'],
        rows
      });
    }

    return tables;
  },

  anova_twoway: (result: AnovaTwoWayResult) => {
    const rows = result.terms.map((term, i) => [
      term,
      formatDecimal(result.sum_sq[i]),
      formatDecimal(result.df[i]),
      formatDecimal(result.f_stat[i]),
      formatDecimal(result.f_pvalue[i])
    ]);

    return [{
      title: 'Two-Way ANOVA',
      columns: ['Term', 'Sum Sq', 'df', 'F', 'Prob>F'],
      rows
    }];
  },

  pearson_correlation: (result: PearsonResult) => {
    // Guide says "Correlation Heatmap" is primary.
    // We can return a small summary if needed, e.g. number of observations?
    const tables: TableSpec[] = [];
    if (typeof result.n_obs === 'number') {
      tables.push({
        title: 'Number of Observations',
        columns: ['Metric', 'Value'],
        rows: [['Number of Observations', formatDecimal(result.n_obs)]],
        layout: 'compact'
      });
    }
    return tables;
  },

  chi_squared: (result: any) => {
    if (!result) return [];
    const tables: TableSpec[] = [];
    const ctx: ContingencyContext = {
      __labelMap__: result.__labelMap__,
      __xVar__: result.__xVar__,
      __yVar__: result.__yVar__,
    };

    const summaryRows = buildMetricRows(result, {
      chi2: 'Chi-Squared statistic',
      p_value: 'p-value',
      dof: 'Degrees of freedom',
    }, ['chi2', 'p_value', 'dof']);

    if (summaryRows.length) {
      tables.push({
        title: 'Chi-Squared Test Summary',
        columns: ['Metric', 'Value'],
        rows: summaryRows,
        layout: 'compact',
      });
    }

    const xLabels = Array.isArray(result.x_labels) ? result.x_labels : [];
    const yLabels = Array.isArray(result.y_labels) ? result.y_labels : [];
    const categoryTable = buildContingencyCategoryTable(xLabels, yLabels, ctx);
    if (categoryTable) {
      tables.push(categoryTable);
    }

    if (Array.isArray(result.expected) && result.expected.length) {
      tables.push({
        title: 'Expected Frequencies',
        columns: [buildContingencyCornerLabel(ctx), ...yLabels.map(String)],
        rows: result.expected.map((row: any[], index: number) => [
          xLabels[index] ?? `Row ${index + 1}`,
          ...(Array.isArray(row) ? row.map(value => formatDecimal(value)) : []),
        ]),
        layout: 'full',
      });
    }

    return tables;
  },

  fisher_exact: (result: any) => {
    if (!result) return [];
    const tables: TableSpec[] = [];
    const ctx: ContingencyContext = {
      __labelMap__: result.__labelMap__,
      __xVar__: result.__xVar__,
      __yVar__: result.__yVar__,
    };

    const summaryRows = buildMetricRows(result, {
      odds_ratio: 'Odds ratio',
      p_value: 'p-value',
    }, ['odds_ratio', 'p_value']);

    if (summaryRows.length) {
      tables.push({
        title: "Fisher's Exact Test Summary",
        columns: ['Metric', 'Value'],
        rows: summaryRows,
        layout: 'compact',
      });
    }

    const xLabels = Array.isArray(result.x_labels) ? result.x_labels : [];
    const yLabels = Array.isArray(result.y_labels) ? result.y_labels : [];
    const categoryTable = buildContingencyCategoryTable(xLabels, yLabels, ctx);
    if (categoryTable) {
      tables.push(categoryTable);
    }

    return tables;
  },

  outlier_report: (result: any) => {
    const featurewise = Array.isArray(result?.featurewise)
      ? result.featurewise
      : Array.isArray(result?.result?.featurewise)
        ? result.result.featurewise
        : [];
    if (!featurewise.length) return [];

    return [{
      title: 'Outlier Report',
      columns: [
        'Variable',
        'Dataset',
        'Strategy',
        'Tail',
        'Fold',
        'Lower bound',
        'Upper bound',
        'Lower outliers',
        'Upper outliers',
        'Total outliers',
        'Outlier %',
      ],
      rows: featurewise
        .filter((row: any) => String(row?.dataset ?? '').trim().toLowerCase() !== 'all datasets')
        .map((row: any) => {
        const data = row?.data ?? {};
        return [
          row?.variable ?? '',
          row?.dataset ?? '',
          data.strategy ?? 'Unavailable',
          data.tail ?? 'Unavailable',
          formatNullableOutlierValue(data.fold),
          formatNullableOutlierValue(data.lower_bound),
          formatNullableOutlierValue(data.upper_bound),
          formatNullableOutlierValue(data.lower_outlier_count),
          formatNullableOutlierValue(data.upper_outlier_count),
          formatNullableOutlierValue(data.total_outlier_count),
          formatNullableOutlierValue(data.total_outlier_percentage),
        ];
      }),
      layout: 'full',
    }];
  },

  histogram: buildHistogramTables,
  histogram_sql: buildHistogramTables,

  binned_mann_whitney_u_test: (result: BinnedMannWhitneyUTestResult) => {
    if (!result) return [];
    return [{
      title: 'Binned Mann-Whitney U Test',
      columns: ['Metric', 'Value'],
      rows: [
        ['U statistic', formatDecimal(result.u_stat)],
        ['p-value', formatDecimal(result.p_value)],
        ['z-score', formatDecimal(result.z_score)],
        ['Group A sample size', formatDecimal(result.n1)],
        ['Group B sample size', formatDecimal(result.n2)],
      ],
      layout: 'compact',
    }];
  },

  ttest_independent: (result: TTestResult) => {
    return [{
      title: 'Independent T-Test',
      columns: ['Metric', 'Value'],
      rows: buildTTestRows(result as Record<string, any>)
    }];
  },

  ttest_paired: (result: TTestResult) => {
    return [{
      title: 'Paired T-Test',
      columns: ['Metric', 'Value'],
      rows: buildTTestRows(result as Record<string, any>, formatFixedMetric)
    }];
  },

  ttest_onesample: (result: TTestResult) => {
    return [{
      title: 'One-Sample T-Test',
      columns: ['Metric', 'Value'],
      rows: buildTTestRows(result as Record<string, any>)
    }];
  },

  // Legacy/Aliases
  logistic_regression_cv_fedaverage: (result) => AlgorithmTableRegistry['logistic_regression_cv'](result),
  linear_svm: (result) => {
    if (!result) return [];

    const rows: any[][] = [];
    if (result.n_obs !== undefined && result.n_obs !== null) {
      rows.push(['Observations', formatDecimal(result.n_obs)]);
    }
    if (result.intercept !== undefined && result.intercept !== null) {
      rows.push(['Intercept', formatDecimal(result.intercept)]);
    }

    if (Array.isArray(result.weights) && result.weights.length) {
      result.weights.forEach((w: any, i: number) => {
        rows.push([`Weight ${i + 1}`, formatDecimal(w)]);
      });
    }

    if (!rows.length) return [];

    return [{
      title: 'Linear SVM Summary',
      columns: ['Metric', 'Value'],
      rows,
    }];
  },

  // Default fallback
  default: () => []
};
