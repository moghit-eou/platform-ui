import { AlgorithmTableRegistry } from './algorithm-table-registry';

describe('AlgorithmTableRegistry', () => {
  it('supports linear_regression_cv metrics provided as mean/std objects', () => {
    const tables = AlgorithmTableRegistry['linear_regression_cv']({
      dependent_var: 'y',
      indep_vars: ['x1', 'x2'],
      n_obs: [100, 101, 99],
      mean_sq_error: { mean: 1.25, std: 0.2 },
      r_squared: { mean: 0.91, std: 0.03 },
      mean_abs_error: { mean: 0.72, std: 0.11 },
      f_stat: { mean: 12.3, std: 1.1 },
    });

    expect(tables.length).toBe(2);
    expect(tables[0].title).toBe('Training set sample sizes');
    expect(tables[1].title).toBe('Error metrics');
    expect(tables[1].rows[0][1]).toBe(1.25);
    expect(tables[1].rows[0][2]).toBe(0.2);
  });

  it('supports logistic_regression stderr field mapping', () => {
    const tables = AlgorithmTableRegistry['logistic_regression']({
      dependent_var: 'outcome',
      indep_vars: ['Intercept', 'x1'],
      summary: {
        coefficients: [0.5, -1.2],
        stderr: [0.05, 0.2],
        z_scores: [10, -6],
        pvalues: [0.0001, 0.0002],
        lower_ci: [0.4, -1.6],
        upper_ci: [0.6, -0.8],
        n_obs: 500,
      },
    });

    expect(tables.length).toBe(2);
    expect(tables[0].title).toBe('Logistic Regression Coefficients');
    // Std.Err. column for first row should be populated from "stderr"
    expect(tables[0].rows[0][2]).toBe('0.05');
  });

  it('uses Exaflow F-stat display fields in linear_regression summary', () => {
    const tables = AlgorithmTableRegistry['linear_regression']({
      dependent_var: 'target',
      indep_vars: ['Intercept', 'x1'],
      coefficients: [1.5, -0.2],
      std_err: [0.1, 0.04],
      t_stats: [15, -5],
      pvalues: [0.0001, 0.0002],
      lower_ci: [1.2, -0.28],
      upper_ci: [1.8, -0.12],
      f_stat: Number.POSITIVE_INFINITY,
      f_pvalue: 0,
      f_stat_display: 'Perfect fit',
      f_pvalue_display: '<0.001',
      f_stat_note: 'Residual sum of squares is zero.',
    } as any);

    const summary = tables[1].rows;
    expect(summary).toContain(['F-statistic', 'Perfect fit']);
    expect(summary).toContain(['p-value (F-stat)', '<0.001']);
    expect(summary).toContain(['F-statistic note', 'Residual sum of squares is zero.']);
  });

  it('includes ll/aic/bic and dependent variable in linear_regression summary', () => {
    const tables = AlgorithmTableRegistry['linear_regression']({
      dependent_var: 'target',
      indep_vars: ['Intercept', 'x1'],
      coefficients: [1.5, -0.2],
      std_err: [0.1, 0.04],
      t_stats: [15, -5],
      pvalues: [0.0001, 0.0002],
      lower_ci: [1.2, -0.28],
      upper_ci: [1.8, -0.12],
      ll: -123.45,
      aic: 260.1,
      bic: 275.3,
    });

    expect(tables.length).toBe(2);
    const summaryRows = tables[1].rows.map((row) => row[0]);
    expect(summaryRows).toContain('Dependent variable');
    expect(summaryRows).toContain('Log-likelihood');
    expect(summaryRows).toContain('AIC');
    expect(summaryRows).toContain('BIC');
  });

  it('renders anova_twoway table', () => {
    const payload = {
      terms: ['A', 'B', 'A:B', 'Residual'],
      df: [1, 1, 1, 96],
      sum_sq: [10.5, 8.2, 1.1, 40.0],
      f_stat: [25.2, 19.7, 2.6, null],
      f_pvalue: [0.0001, 0.0002, 0.11, null],
    };

    const canonical = AlgorithmTableRegistry['anova_twoway'](payload);
    expect(canonical.length).toBe(1);
    expect(canonical[0].rows.length).toBe(4);
  });

  it('renders anova_oneway min/max per group table when provided', () => {
    const tables = AlgorithmTableRegistry['anova_oneway']({
      anova_table: {
        x_label: 'group',
        df_explained: 2,
        ss_explained: 12.4,
        ms_explained: 6.2,
        f_stat: 3.8,
        p_value: 0.02,
        df_residual: 100,
        ss_residual: 50.1,
        ms_residual: 0.501,
      },
      tuckey_test: [{ groupA: 'A', groupB: 'B', diff: 0.2 }],
      min_max_per_group: {
        categories: ['A', 'B'],
        min: [1.1, 1.4],
        max: [4.5, 5.2],
      },
    });

    expect(tables.some((t) => t.title === 'Group Min/Max')).toBeTrue();
  });

  it('renders linear_svm via canonical key', () => {
    const payload = {
      title: 'Federated Linear SVM (Averaged Parameters)',
      n_obs: 240,
      weights: [0.12, -0.48, 0.09],
      intercept: 0.31,
    };

    const canonical = AlgorithmTableRegistry['linear_svm'](payload);
    expect(canonical.length).toBeGreaterThan(0);
    expect(canonical[0].rows.some((row) => row[0] === 'Intercept')).toBeTrue();
  });

  it('renders category_log_prob tables for naive_bayes_categorical', () => {
    const tables = AlgorithmTableRegistry['naive_bayes_categorical']({
      classes: ['0', '1'],
      class_count: [50, 60],
      class_log_prior: [-0.7, -0.6],
      feature_names: ['sex'],
      categories: { sex: ['0', '1'] },
      category_count: { sex: [[25, 25], [30, 30]] },
      category_log_prob: { sex: [[-0.69, -0.69], [-0.65, -0.65]] },
    });

    expect(tables.some((t) => t.title?.startsWith('Category Log Probabilities'))).toBeTrue();
  });

  it('renders pca summary and keeps pca_with_transformation alias', () => {
    const payload = {
      title: 'Eigenvalues and Eigenvectors',
      n_obs: 120,
      eigenvalues: [3.1, 1.2, 0.7],
    };
    const base = AlgorithmTableRegistry['pca'](payload);
    const transformed = AlgorithmTableRegistry['pca_with_transformation'](payload);

    expect(base.length).toBe(1);
    expect(base[0].title).toBe('PCA Summary');
    expect(transformed).toEqual(base);
  });

  it('renders quartiles tables and preserves unavailable quantile values', () => {
    const tables = AlgorithmTableRegistry['quartiles']({
      quantiles: [
        { q: 0.25, value: 2.8124, actual_q: 0.2535211267605634 },
        { q: 0.5, value: null, actual_q: null },
        { q: 0.75, value: 3.3067, actual_q: 0.7549295774647887 },
      ],
    });

    expect(tables.length).toBe(1);
    expect(tables[0].columns).toEqual(['Quantile', 'Value', 'Actual quantile']);
    expect(tables[0].rows.length).toBe(3);
    expect(tables[0].rows[1]).toEqual(['0.5', '', '']);
  });

  it('renders binned Mann-Whitney U test metrics', () => {
    const tables = AlgorithmTableRegistry['binned_mann_whitney_u_test']({
      u_stat: 163.5,
      p_value: 8.436804884099734e-6,
      z_score: 4.4537889144455,
      n1: 15,
      n2: 80,
    });

    expect(tables.length).toBe(1);
    expect(tables[0].rows).toContain(['U statistic', '163.5']);
    expect(tables[0].rows).toContain(['p-value', '8.437e-6']);
    expect(tables[0].rows).toContain(['z-score', '4.454']);
    expect(tables[0].rows).toContain(['Group A sample size', '15']);
    expect(tables[0].rows).toContain(['Group B sample size', '80']);
  });

  it('renders describe tables for both numeric and nominal entries', () => {
    const tables = AlgorithmTableRegistry['describe']({
      featurewise: [
        {
          variable: 'age',
          dataset: 'all datasets',
          data: { num_dtps: 10, num_na: 1, num_total: 11, mean: 52.1, std: 4.2, min: 40, q1: 49, q2: 52, q3: 55, median: 52.5, max: 60 },
        },
        {
          variable: 'height',
          dataset: 'ds1',
          data: { num_dtps: 8, num_na: 0, num_total: 8, mean: 170, std: 5, min: 160, q1: 166, q2: 171, q3: 174, max: 180 },
        },
        {
          variable: 'sex',
          dataset: 'ds1',
          data: { num_dtps: 10, num_na: 1, num_total: 11, counts: { M: 6, F: 4 } },
        },
      ],
    });

    expect(tables.some((t) => t.title === 'Featurewise Summary — Numeric')).toBeTrue();
    expect(tables.some((t) => t.title === 'Featurewise Summary — Nominal')).toBeTrue();
    expect(tables.some((t) => t.title?.includes('Model-based'))).toBeFalse();
    const numericRows = tables.find((t) => t.title === 'Featurewise Summary — Numeric')?.rows ?? [];
    expect(numericRows[0][9]).toBe('52.5');
    expect(numericRows[1][9]).toBe('171');
  });

  it('renders outlier_report and preserves zero counts separately from null values', () => {
    const tables = AlgorithmTableRegistry['outlier_report']({
      featurewise: [
        {
          variable: 'age',
          dataset: 'ds1',
          data: {
            strategy: 'iqr',
            tail: 'both',
            fold: 1.5,
            lower_bound: null,
            upper_bound: 90,
            lower_outlier_count: 0,
            upper_outlier_count: null,
            total_outlier_count: 0,
            total_outlier_percentage: 0,
          },
        },
      ],
    });

    expect(tables.length).toBe(1);
    expect(tables[0].columns).toContain('Outlier %');
    expect(tables[0].rows[0][5]).toBe('Unavailable');
    expect(tables[0].rows[0][7]).toBe('0');
    expect(tables[0].rows[0][9]).toBe('0');
  });

  it('filters frontend metadata keys from ttest results', () => {
    const tables = AlgorithmTableRegistry['ttest_independent']({
      t_stat: 3.888283695725533,
      df: 7739,
      p: 1.017999869046271e-4,
      mean_diff: 0.06754973386270802,
      se_diff: 0.01737263511326778,
      ci_upper: 0.10160479913374154,
      ci_lower: 0.033494668591674485,
      cohens_d: 0.09578463577457333,
      labelMap: { a: 'A' },
      enumMaps: { a: { '1': 'Yes' } },
      yVar: 'blood_cholest_ldl',
    });

    expect(tables.length).toBe(1);
    expect(tables[0].columns).toEqual(['Metric', 'Value']);
    const rowNames = tables[0].rows.map((row) => row[0]);
    expect(rowNames).toContain('T-statistic');
    expect(rowNames).toContain('Degrees of Freedom');
    expect(rowNames).toContain('p-value');
    expect(rowNames).toContain('Std. Error of Difference');
    expect(rowNames).toContain("Cohen's d");
    expect(rowNames).not.toContain('labelMap');
    expect(rowNames).not.toContain('enumMaps');
    expect(rowNames).not.toContain('yVar');
  });

  it('formats paired t-test metrics with three digits', () => {
    const tables = AlgorithmTableRegistry['ttest_paired']({
      t_stat: 3.888283695725533,
      df: 12,
      p: 1.017999869046271e-4,
      mean_diff: 0.06754973386270802,
      se_diff: 0.01737263511326778,
      ci_upper: 0.10160479913374154,
      ci_lower: 0.033494668591674485,
    });

    expect(tables[0].rows).toContain(['T-statistic', '3.888']);
    expect(tables[0].rows).toContain(['Degrees of Freedom', '12.000']);
    expect(tables[0].rows).toContain(['p-value', '0.000']);
    expect(tables[0].rows).toContain(['Mean Difference', '0.068']);
  });

  it('renders classical Cox regression coefficients and summary', () => {
    const tables = AlgorithmTableRegistry['cox_regression_classical']({
      dependent_var: 'Age',
      event_var: 'Sex',
      indep_vars: ['Intercept', 'Age'],
      summary: {
        n_obs: 200,
        n_events: 80,
        n_covariates: 1,
        n_unique_event_times: 45,
        coefficients: [0.1, -0.3],
        hazard_ratios: [1.105, 0.741],
        std_err: [0.05, 0.1],
        lower_ci: [0.002, -0.496],
        upper_ci: [0.198, -0.104],
        hr_lower_ci: [1.002, 0.609],
        hr_upper_ci: [1.219, 0.901],
        z_scores: [2, -3],
        pvalues: [0.045, 0.002],
        df_model: 1,
        df_resid: 198,
        ll: -120.5,
        ties: 'breslow',
        n_iter: 6,
        converged: true,
        score_norm: 0.001,
        step_norm: 0.02,
        method: 'classical_cox_partial_likelihood',
      },
    });

    expect(tables.length).toBe(2);
    expect(tables[0].title).toBe('Factor estimates (table)');
    expect(tables[0].columns).toEqual(['Factor', 'Hazard ratio', '95% CI', 'p-value']);
    expect(tables[0].rows.length).toBe(1);
    expect(tables[0].rows[0][0]).toBe('Age');
    expect(tables[0].rows[0][1]).toBe('0.741');
    expect(tables[0].rows[0][3]).toBe('0.002');
    expect(tables[1].rows).toContain(['Follow-up time', 'Sex']);
    expect(tables[1].rows).toContain(['Event indicator', 'Age']);
    expect(tables[1].rows).toContain(['Tied events handling', 'breslow']);
    expect(tables[1].rows).toContain(['Model converged', 'Yes']);
  });

  it('renders stacked Cox regression summary metrics', () => {
    const tables = AlgorithmTableRegistry['cox_regression_stacked']({
      dependent_var: 'Follow-up time',
      event_var: 'Diagnosis',
      indep_vars: ['Intercept', 'Gender[Male]'],
      summary: {
        n_obs: 150,
        n_events: 60,
        n_stacked_rows: 900,
        n_covariates: 1,
        coefficients: [0.2, 0.4],
        hazard_ratios: [1.221, 1.492],
        std_err: [0.08, 0.12],
        lower_ci: [0.04, 0.16],
        upper_ci: [0.36, 0.64],
        hr_lower_ci: [1.041, 1.174],
        hr_upper_ci: [1.433, 1.896],
        z_scores: [2.5, 3.3],
        pvalues: [0.01, 0.001],
        df_model: 1,
        df_resid: 148,
        ll: -95,
        ll0: -110,
        r_squared_cs: 0.12,
        r_squared_mcf: 0.09,
        aic: 194,
        bic: 205,
        time_grid_strategy: 'distinct_event_times',
        n_time_bins_used: 40,
        method: 'stacked_cox',
      },
    });

    expect(tables.length).toBe(2);
    expect(tables[0].rows.length).toBe(1);
    expect(tables[0].rows[0][0]).toBe('Gender[Male]');
    expect(tables[1].rows).toContain(['Analysis rows', '900']);
    expect(tables[1].rows).toContain(['AIC', '194']);
  });

  it('renders LMM fixed effects and model summary', () => {
    const tables = AlgorithmTableRegistry['lmm']({
      dependent_var: 'Right hippocampus',
      grouping_var: 'Dataset',
      indep_vars: ['Intercept', 'Age'],
      coefficients: [1.2, -0.4],
      std_err: [0.1, 0.05],
      t_stats: [12, -8],
      pvalue_label: 'P(>|t|)',
      pvalues: [0.0001, 0.002],
      pvalues_display: ['<0.001', '0.002'],
      lower_ci: [1.0, -0.5],
      upper_ci: [1.4, -0.3],
      n_obs: 100,
      n_groups: 3,
      df_model: 2,
      df_resid: 97,
      sigma2: 0.8,
      sigma_u2: 0.2,
      ll_reml: -120,
      aic: 250,
      bic: 260,
      converged: true,
      n_iter: 8,
    });

    expect(tables.length).toBeGreaterThan(1);
    expect(tables[0].title).toBe('Fixed Effects');
    expect(tables[0].columns).toContain('P(>|t|)');
    expect(tables[0].rows[0][0]).toBe('Intercept');
    expect(tables[0].rows[0][4]).toBe('<0.001');
    expect(tables[0].rows[1][4]).toBe('0.002');
    expect(tables.some(table => table.title === 'Model Summary')).toBeTrue();
  });

  it('falls back to formatted LMM p-values when display values are absent', () => {
    const tables = AlgorithmTableRegistry['lmm']({
      dependent_var: 'age',
      grouping_var: 'dataset',
      indep_vars: ['Intercept'],
      coefficients: [1],
      std_err: [0.1],
      t_stats: [10],
      pvalues: [0.045],
      lower_ci: [0.8],
      upper_ci: [1.2],
      n_obs: 50,
      n_groups: 2,
      df_model: 1,
      df_resid: 48,
      sigma2: 1,
      sigma_u2: 0.1,
      ll_reml: -60,
      aic: 120,
      bic: 125,
      converged: true,
      n_iter: 5,
    } as any);

    expect(tables[0].rows[0][4]).toBe('0.045');
  });

  it('renders binary and ordinal GLMM result contracts', () => {
    const binary = AlgorithmTableRegistry['glmm_binary']({
      dependent_var: 'Gender',
      grouping_var: 'Dataset',
      indep_vars: ['Intercept', 'Age'],
      coefficients: [0.3, -0.2],
      n_obs: 100,
      n_groups: 3,
      sigma_u2: 0.4,
      converged: true,
    });

    const ordinal = AlgorithmTableRegistry['glmm_ordinal']({
      dependent_var: 'Age group',
      grouping_var: 'Dataset',
      indep_vars: ['Intercept', 'Gender[Male]'],
      coefficients: [0.5, 0.1],
      category_order: ['Under 50', '50-59', '60-69'],
      cutpoints: [-1.2, 0.8],
      n_obs: 90,
      n_groups: 3,
      sigma_u2: 0.3,
      converged: true,
    });

    expect(binary.some(table => table.title === 'Fixed Effects')).toBeTrue();
    expect(ordinal.some(table => table.title === 'Ordinal Category Order')).toBeTrue();
    expect(ordinal.some(table => table.title === 'Cutpoints')).toBeTrue();
  });

  it('renders chi-squared and fisher exact tables', () => {
    const chiSquared = AlgorithmTableRegistry['chi_squared']({
      chi2: 3.14,
      p_value: 0.04,
      dof: 1,
      expected: [[5.5, 4.5], [3.5, 6.5]],
      x_labels: ['AD', 'Other'],
      y_labels: ['Female', 'Male'],
    });

    const fisher = AlgorithmTableRegistry['fisher_exact']({
      odds_ratio: 1.48,
      p_value: 0.56,
      x_labels: ['no', 'yes'],
      y_labels: ['no', 'yes'],
      __xVar__: 'intra_arterial_urokinase',
      __yVar__: 'aspiration',
      __labelMap__: {
        intra_arterial_urokinase: 'Intra-arterial urokinase',
        aspiration: 'Aspiration',
      },
    });

    expect(chiSquared.some(table => table.title === 'Expected Frequencies')).toBeTrue();
    expect(chiSquared.some(table => table.title === 'Contingency Table Categories')).toBeTrue();
    expect(fisher.some(table => table.title === "Fisher's Exact Test Summary")).toBeTrue();

    const fisherCategories = fisher.find(table => table.title === 'Contingency Table Categories');
    expect(fisherCategories?.columns).toEqual(['Role', 'Variable', 'Categories']);
    expect(fisherCategories?.rows).toEqual([
      ['Factor', 'Intra-arterial urokinase', 'no, yes'],
      ['Outcome', 'Aspiration', 'no, yes'],
    ]);
  });
});
