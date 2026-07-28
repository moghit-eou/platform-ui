import {
  AlgorithmSpecification,
  AnalysisInputDataSpecification,
  PreprocessingStepSpecification,
  RawAlgorithmDefinition,
  RawInputData,
  RawParameter,
} from '../models/backend-algorithms.model';
import { AlgorithmConfig } from '../models/algorithm-definition.model';
import { applyFallbackInputCounts, readInputCount } from './algorithm-input-counts';

// Lookup for categories
const CATEGORY_MAPPING: Record<string, string> = {
  "pearson_correlation": "Correlation",
  "anova_oneway": "Statistical Tests",
  "binned_mann_whitney_u_test": "Statistical Tests",
  "ttest_independent": "Statistical Tests",
  "ttest_onesample": "Statistical Tests",
  "ttest_paired": "Statistical Tests",
  "linear_regression": "Regression",
  "logistic_regression": "Regression",
  "cox_regression_classical": "Regression",
  "cox_regression_stacked": "Regression",
  "lmm": "Mixed Models",
  "glmm_binary": "Mixed Models",
  "glmm_ordinal": "Mixed Models",
  "naive_bayes_categorical": "Classification",
  "naive_bayes_gaussian": "Classification",
  "kmeans": "Clustering",
  "pca": "Dimensionality Reduction",
  "pca_with_transformation": "Dimensionality Reduction",
  "linear_regression_cv": "Regression",
  "logistic_regression_cv": "Regression",
  "logistic_regression_cv_fedaverage": "Regression",
  "naive_bayes_gaussian_cv": "Classification",
  "naive_bayes_categorical_cv": "Classification",
  "anova_twoway": "Statistical Tests",
  "chi_squared": "Statistical Tests",
  "fisher_exact": "Statistical Tests",
  "describe": "Descriptive Statistics",
  "histogram": "Descriptive Statistics",
  "quartiles": "Descriptive Statistics",
  "outlier_report": "Descriptive Statistics",
  "linear_svm": "Classification",
  "longitudinal_transformer": "Transformers",
};

function normalizeBool(value: boolean | string | undefined | null): boolean {
  if (typeof value === 'boolean') return value;
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function enumSourceToArray(source: string[] | string | undefined): string[] {
  if (Array.isArray(source)) return source;
  if (source === undefined || source === null) return [];
  return [source];
}

function normalizeCount(value: number | string | undefined | null): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeInputField(field: any): any {
  if (!field) return field;
  const minCount = readInputCount(field, 'min_count');
  const maxCount = readInputCount(field, 'max_count');

  return {
    ...field,
    ...(minCount !== null ? { min_count: minCount } : {}),
    ...(maxCount !== null ? { max_count: maxCount } : {}),
  };
}

function normalizeInputData(inputdata: any): any {
  if (!inputdata) return {};
  return Object.fromEntries(
    Object.entries(inputdata).map(([key, field]) => [key, normalizeInputField(field)])
  );
}

function buildConfigSchema(parameters?: Record<string, RawParameter> | null): Array<any> {
  const schema: any[] = [];
  if (!parameters) return schema;

  for (const [key, param] of Object.entries(parameters)) {
    const enumType = param.enums?.type;
    const enumSource = enumSourceToArray(param.enums?.source);
    const dictKeyEnumType = param.dict_keys_enums?.type;
    const dictKeyEnumSource = enumSourceToArray(param.dict_keys_enums?.source);
    const dictValueEnumType = param.dict_values_enums?.type;
    const dictValueOptions = enumSourceToArray(param.dict_values_enums?.source);
    const isMultiple = normalizeBool(param.multiple);
    const min = normalizeCount(param.min);
    const max = normalizeCount(param.max);
    const baseField: any = {
      key,
      label: param.label ?? key,
      desc: param.desc ?? '',
      required: normalizeBool(param.required),
      multiple: isMultiple,
      types: param.types ?? [],
      stattypes: param.stattypes ?? [],
      ...(enumType ? { enumType } : {}),
      ...(enumSource.length ? { enumSource } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(param.default !== undefined ? { default: param.default } : {}),
      ...(param.default === undefined && param.default_value !== undefined ? { default: param.default_value } : {}),
    };

    // --- Dictionary fields ---
    if (param.types?.includes('dict')) {
      schema.push({
        ...baseField,
        type: 'dict',
        ...(dictKeyEnumType ? { dictKeyEnumType } : {}),
        ...(dictKeyEnumSource.length ? { dictKeyEnumSource } : {}),
        ...(dictValueEnumType ? { dictValueEnumType } : {}),
        ...(dictValueOptions.length ? { dictValueOptions } : {}),
        ...(param.dict_values_type ? { dictValueType: param.dict_values_type } : {}),
      });
      continue;
    }

    // --- Select fields ---
    if (param.enums) {
      schema.push({
        ...baseField,
        type: isMultiple ? 'multi-select' : 'select',
        options: enumType === 'list' ? enumSource : [],
      });
      continue;
    }

    if (isMultiple && (param.types?.includes('text') || param.types?.includes('int'))) {
      schema.push({
        ...baseField,
        type: 'multi-select',
        options: [],
      });
      continue;
    }

    // --- Numeric fields ---
    if (param.types?.includes('int') || param.types?.includes('real')) {
      schema.push({
        ...baseField,
        type: 'number',
      });
      continue;
    }

    // --- Text fields ---
    if (param.types?.includes('text')) {
      schema.push({
        ...baseField,
        type: 'text',
      });
      continue;
    }

    // --- Fallback: keep unknown types as text ---
    schema.push({
      ...baseField,
      type: 'text',
    });
  }

  return schema;
}


type DocumentationParameter = Pick<RawParameter, 'dict_values_enums' | 'enums' | 'label'>;

const quotedCodeTokenPattern = /(['"`])([^'"`\n]+)\1/g;

const specialDocumentationLabels: Record<string, string> = {
  aic: 'AIC',
  bic: 'BIC',
  glmm: 'GLMM',
  iqr: 'IQR',
  mad: 'MAD',
  ols: 'OLS',
  pca: 'PCA',
  svm: 'SVM',
};

function normalizeDocumentationToken(token: string): string {
  return token.trim();
}

function humanizeDocumentationToken(token: string): string {
  const normalized = normalizeDocumentationToken(token);
  const lower = normalized.toLowerCase();
  const specialLabel = specialDocumentationLabels[lower];

  if (specialLabel) {
    return specialLabel;
  }

  const spaced = normalized.replace(/_+/g, ' ').toLowerCase();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isFallbackCodeToken(token: string): boolean {
  const normalized = normalizeDocumentationToken(token);

  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(normalized)
    && (
      normalized.includes('_')
      || normalized.includes('-')
      || /\d/.test(normalized)
      || /[a-z][A-Z]/.test(normalized)
    );
}

function addDocumentationEnumLabels(labelMap: Record<string, string>, enumDefinition?: DocumentationParameter['enums']): void {
  if (!enumDefinition || enumDefinition.type !== 'list') {
    return;
  }

  enumSourceToArray(enumDefinition.source).forEach((value) => {
    const token = normalizeDocumentationToken(value);

    if (token) {
      labelMap[token] = humanizeDocumentationToken(token);
    }
  });
}

function buildDocumentationLabelMap(
  parameters?: Record<string, DocumentationParameter | null | undefined> | null,
): Record<string, string> {
  const labelMap: Record<string, string> = {};

  Object.entries(parameters ?? {}).forEach(([key, parameter]) => {
    const token = normalizeDocumentationToken(key);

    if (token) {
      labelMap[token] = parameter?.label?.trim() || humanizeDocumentationToken(token);
    }

    addDocumentationEnumLabels(labelMap, parameter?.enums);
    addDocumentationEnumLabels(labelMap, parameter?.dict_values_enums);
  });

  return labelMap;
}

function sanitizeDocumentation(documentation: string, labelMap: Record<string, string>): string {
  return documentation.replace(quotedCodeTokenPattern, (_match, quote: string, rawToken: string) => {
    const token = normalizeDocumentationToken(rawToken);
    const mappedLabel = labelMap[token];

    if (mappedLabel) {
      return mappedLabel;
    }

    if (isFallbackCodeToken(token)) {
      return humanizeDocumentationToken(token);
    }

    return `${quote}${rawToken}${quote}`;
  });
}

export function mapSpecificationsToAlgorithmConfigs(
  inputdataSpec: AnalysisInputDataSpecification,
  preprocessingSpecs: PreprocessingStepSpecification[],
  algorithmSpecs: AlgorithmSpecification[],
): Record<string, AlgorithmConfig> {
  const preprocessing = preprocessingSpecs.map((step) => ({
    name: step.name,
    label: step.label,
    desc: step.desc,
    documentation: sanitizeDocumentation(
      step.documentation ?? '',
      buildDocumentationLabelMap(step.parameters ?? {}),
    ),
    parameters: step.parameters ?? {},
    output: step.output ?? null,
  }));

  const sharedInputdata = normalizeInputData({
    data_model: inputdataSpec.data_model,
    datasets: inputdataSpec.datasets,
    filters: inputdataSpec.filters,
    variables: inputdataSpec.variables,
    ...(inputdataSpec.validation_datasets
      ? { validation_datasets: inputdataSpec.validation_datasets }
      : {}),
  });

  const mapped: Record<string, AlgorithmConfig> = {};
  for (const raw of algorithmSpecs) {
    const normalizedName = raw.name === 'anova' ? 'anova_twoway' : raw.name;
    const algorithmDocumentationLabels = buildDocumentationLabelMap(raw.parameters ?? {});
    const inputdata = applyFallbackInputCounts(
      {
        ...sharedInputdata,
        ...(raw.y ? { y: normalizeInputField(raw.y) } : {}),
        ...(raw.x ? { x: normalizeInputField(raw.x) } : {}),
      },
      normalizedName,
    ) as RawInputData;

    mapped[normalizedName] = {
      name: normalizedName,
      label: raw.label,
      description: raw.desc ?? '',
      documentation: sanitizeDocumentation(raw.documentation ?? '', algorithmDocumentationLabels),
      type: raw.type,
      flags: raw.flags ?? [],
      inputdata,
      requiredVariable: inputdata?.y?.types || [],
      covariate: inputdata?.x?.types || [],
      category: CATEGORY_MAPPING[normalizedName] ?? 'Uncategorized',
      configSchema: buildConfigSchema(raw.parameters ?? {}),
      preprocessing,
      requires_validation_datasets: raw.requires_validation_datasets,
      required_preprocessing: raw.required_preprocessing ?? [],
      isDisabled: false,
      ...(getOutputSchema(normalizedName) ? { outputSchema: getOutputSchema(normalizedName) } : {}),
    };
  }

  return mapped;
}

export function mapRawAlgorithmToAlgorithmConfig(raw: RawAlgorithmDefinition): AlgorithmConfig {
  const normalizedName = raw.name === 'anova' ? 'anova_twoway' : raw.name;
  const algorithmDocumentationLabels = buildDocumentationLabelMap(raw.parameters ?? {});
  const preprocessing = [...(raw.preprocessing ?? [])]
    .map((step) => ({
      ...step,
      documentation: sanitizeDocumentation(
        step.documentation ?? '',
        buildDocumentationLabelMap(step.parameters ?? {}),
      ),
    }))
    .sort(
      (left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
    );

  const inputdata = applyFallbackInputCounts(
    normalizeInputData(raw.inputdata),
    normalizedName
  ) as unknown as RawAlgorithmDefinition['inputdata'];

  return {
    name: normalizedName,
    label: raw.label,
    description: raw.desc ?? '',
    documentation: sanitizeDocumentation(raw.documentation ?? '', algorithmDocumentationLabels),
    type: raw.type,
    flags: raw.flags ?? [],
    inputdata,
    requiredVariable: inputdata?.y?.types || [],
    covariate: inputdata?.x?.types || [],
    category: CATEGORY_MAPPING[normalizedName] ?? 'Uncategorized',
    configSchema: buildConfigSchema(raw.parameters ?? {}),
    preprocessing,
    isDisabled: false,
    ...(getOutputSchema(normalizedName) ? { outputSchema: getOutputSchema(normalizedName) } : {}),
  };
}


export function getOutputSchema(algorithmName: string): any[] | undefined {
  switch (algorithmName) {
    case 'anova_twoway':
      return [
        {
          key: 'sum_sq',
          label: 'Sum of Squares',
          type: 'table',
          columns: [
            { key: 'term', label: 'Term' },
            { key: 'value', label: 'Sum of Squares', format: 'float' }
          ]
        },
        {
          key: 'df',
          label: 'Degrees of Freedom',
          type: 'table',
          columns: [
            { key: 'term', label: 'Term' },
            { key: 'value', label: 'DF' }
          ]
        },
        {
          key: 'f_stat',
          label: 'F-statistic',
          type: 'table',
          columns: [
            { key: 'term', label: 'Term' },
            { key: 'value', label: 'F-statistic', format: 'float' }
          ]
        },
        {
          key: 'f_pvalue',
          label: 'p-value',
          type: 'table',
          columns: [
            { key: 'term', label: 'Term' },
            { key: 'value', label: 'p-value', format: 'pval' }
          ]
        }
      ];
    case 'anova_oneway':
      return [
        { key: 'n_obs', label: 'Observations', type: 'number' },
        { key: 'df_residual', label: 'Degrees of Freedom (Residual)', type: 'number' },
        { key: 'df_explained', label: 'Degrees of Freedom (Explained)', type: 'number' },
        { key: 'ss_residual', label: 'Sum of Squares (Residual)', type: 'number' },
        { key: 'ss_explained', label: 'Sum of Squares (Explained)', type: 'number' },
        { key: 'ms_residual', label: 'Mean Squares (Residual)', type: 'number' },
        { key: 'ms_explained', label: 'Mean Squares (Explained)', type: 'number' },
        { key: 'p_value', label: 'p-Value', type: 'number' },
        { key: 'f_stat', label: 'F-statistic', type: 'number' },
        {
          key: 'tuckey_test',
          label: 'Tukey Post-Hoc Test',
          type: 'table',
          columns: [
            { key: 'groupA', label: 'Group A' },
            { key: 'groupB', label: 'Group B' },
            { key: 'meanA', label: 'Mean A' },
            { key: 'meanB', label: 'Mean B' },
            { key: 'diff', label: 'Difference' },
            { key: 'se', label: 'Standard Error' },
            { key: 't_stat', label: 't-stat' },
            { key: 'p_tuckey', label: 'p (Tukey)' }
          ]
        }
      ];
    case 'kmeans':
      return [
        {
          key: 'centers',
          label: 'Cluster Centers',
          type: 'dynamic-table',
          getColumnsFrom: 'y',
          rowLabelPrefix: 'Cluster'
        }
      ];
    case 'quartiles':
      return [
        {
          key: 'quantiles',
          label: 'Quartiles',
          type: 'table',
          columns: [
            { key: 'q', label: 'Quantile', format: 'float' },
            { key: 'value', label: 'Value', format: 'float' },
            { key: 'actual_q', label: 'Actual quantile', format: 'float' },
          ]
        }
      ];
    case 'binned_mann_whitney_u_test':
      return [
        { key: 'u_stat', label: 'U statistic', type: 'number', format: 'float' },
        { key: 'p_value', label: 'p-value', type: 'number', format: 'pval' },
        { key: 'z_score', label: 'z-score', type: 'number', format: 'float' },
        { key: 'n1', label: 'Group A sample size', type: 'number' },
        { key: 'n2', label: 'Group B sample size', type: 'number' },
      ];
    case 'linear_regression_cv':
      return [
        {
          type: 'table',
          label: 'Cross-Validation Metrics',
          key: 'cv_metrics',
          constructFrom: ['mean_sq_error', 'r_squared', 'mean_abs_error'],
          columns: [
            { key: 'fold', label: 'Fold' },
            { key: 'mean_sq_error', label: 'MSE' },
            { key: 'r_squared', label: 'R²' },
            { key: 'mean_abs_error', label: 'MAE' }
          ]
        }
      ];
    case 'linear_regression':
      return [
        {
          type: 'section',
          label: 'Model Summary',
          fields: [
            { key: 'n_obs', label: 'Observations', type: 'number' },
            { key: 'df_model', label: 'Degrees of Freedom (Model)', type: 'number' },
            { key: 'df_resid', label: 'Degrees of Freedom (Residual)', type: 'number' },
            { key: 'r_squared', label: 'R² Score', type: 'number' },
            { key: 'r_squared_adjusted', label: 'Adjusted R²', type: 'number' },
            { key: 'f_stat', label: 'F-statistic', type: 'number' },
            { key: 'f_pvalue', label: 'p-value (F-stat)', type: 'number' },
            { key: 'rse', label: 'Residual Std. Error', type: 'number' },
          ]
        },
        {
          type: 'table',
          key: 'coefficients_table',
          label: 'Coefficients',
          constructFrom: ['indep_vars', 'coefficients', 'std_err', 't_stats', 'pvalues', 'lower_ci', 'upper_ci'],
          columns: [
            { key: 'variable', label: 'Variable' },
            { key: 'coefficient', label: 'Coef.' },
            { key: 'std_err', label: 'Std. Error' },
            { key: 't_stat', label: 't-Stat' },
            { key: 'pvalue', label: 'p-value' },
            { key: 'ci', label: '95% CI' }
          ]
        }
      ];
    case 'lmm':
      return [
        { key: 'dependent_var', label: 'Dependent Variable', type: 'string' },
        { key: 'grouping_var', label: 'Grouping Variable', type: 'string' },
        { key: 'n_obs', label: 'Observations', type: 'number' },
        { key: 'n_groups', label: 'Groups', type: 'number' },
        { key: 'df_model', label: 'Degrees of Freedom (Model)', type: 'number' },
        { key: 'df_resid', label: 'Degrees of Freedom (Residual)', type: 'number' },
        { key: 'sigma2', label: 'Residual Variance', type: 'number' },
        { key: 'sigma_u2', label: 'Random Intercept Variance', type: 'number' },
        { key: 'll_reml', label: 'REML Log-Likelihood', type: 'number' },
        { key: 'aic', label: 'AIC', type: 'number' },
        { key: 'bic', label: 'BIC', type: 'number' },
        { key: 'converged', label: 'Converged', type: 'boolean' },
        { key: 'n_iter', label: 'Iterations', type: 'number' },
        {
          key: 'coefficients',
          label: 'Fixed Effects',
          type: 'table',
          constructFrom: [
            'indep_vars',
            'coefficients',
            'std_err',
            't_stats',
            'pvalues',
            'pvalues_display',
            'lower_ci',
            'upper_ci',
          ],
          columns: [
            { key: 'variable', label: 'Variable' },
            { key: 'coefficient', label: 'Coefficient', format: 'float' },
            { key: 'std_err', label: 'Std. Error', format: 'float' },
            { key: 't_stat', label: 't-statistic', format: 'float' },
            { key: 'pvalue', label: 'P(>|t|)', format: 'string' },
            { key: 'lower_ci', label: 'Lower 95% CI', format: 'float' },
            { key: 'upper_ci', label: 'Upper 95% CI', format: 'float' },
          ]
        }
      ];
    case 'glmm_binary':
      return [
        { key: 'dependent_var', label: 'Dependent Variable', type: 'string' },
        { key: 'grouping_var', label: 'Grouping Variable', type: 'string' },
        { key: 'n_obs', label: 'Observations', type: 'number' },
        { key: 'n_groups', label: 'Groups', type: 'number' },
        { key: 'sigma_u2', label: 'Random Intercept Variance', type: 'number' },
        { key: 'converged', label: 'Converged', type: 'boolean' },
        { key: 'n_iter', label: 'Iterations', type: 'number' },
        {
          key: 'coefficients',
          label: 'Fixed Effects',
          type: 'table',
          constructFrom: ['indep_vars', 'coefficients'],
          columns: [
            { key: 'variable', label: 'Variable' },
            { key: 'coefficient', label: 'Coefficient', format: 'float' },
          ]
        }
      ];
    case 'glmm_ordinal':
      return [
        { key: 'dependent_var', label: 'Dependent Variable', type: 'string' },
        { key: 'grouping_var', label: 'Grouping Variable', type: 'string' },
        { key: 'category_order', label: 'Category Order', type: 'array', elementType: 'string' },
        { key: 'n_obs', label: 'Observations', type: 'number' },
        { key: 'n_groups', label: 'Groups', type: 'number' },
        { key: 'sigma_u2', label: 'Random Intercept Variance', type: 'number' },
        { key: 'converged', label: 'Converged', type: 'boolean' },
        { key: 'n_iter', label: 'Iterations', type: 'number' },
        {
          key: 'coefficients',
          label: 'Fixed Effects',
          type: 'table',
          constructFrom: ['indep_vars', 'coefficients'],
          columns: [
            { key: 'variable', label: 'Variable' },
            { key: 'coefficient', label: 'Coefficient', format: 'float' },
          ]
        },
        {
          key: 'cutpoints',
          label: 'Cutpoints',
          type: 'array',
          elementType: 'number'
        }
      ];
    case 'logistic_regression_cv_fedaverage':
      return [
        {
          key: 'accuracy',
          label: 'Accuracy (per fold)',
          type: 'array',
        },
        {
          key: 'recall',
          label: 'Recall (per fold)',
          type: 'array',
        },
        {
          key: 'precision',
          label: 'Precision (per fold)',
          type: 'array',
        },
        {
          key: 'fscore',
          label: 'F1 Score (per fold)',
          type: 'array',
        },
        {
          key: 'auc',
          label: 'AUC (per fold)',
          type: 'array',
        }
      ];
    case 'logistic_regression_cv':
      return [
        {
          key: 'accuracy',
          label: 'Accuracy (per fold)',
          type: 'array',
        },
        {
          key: 'recall',
          label: 'Recall (per fold)',
          type: 'array',
        },
        {
          key: 'precision',
          label: 'Precision (per fold)',
          type: 'array',
        },
        {
          key: 'fscore',
          label: 'F1 Score (per fold)',
          type: 'array',
        },
        {
          key: 'auc',
          label: 'AUC (per fold)',
          type: 'array',
        }
      ];
    case 'logistic_regression':
      return [
        { key: 'n_obs', label: 'Observations', type: 'number' },
        { key: 'df_model', label: 'Degrees of Freedom (Model)', type: 'number' },
        { key: 'df_resid', label: 'Degrees of Freedom (Residual)', type: 'number' },
        { key: 'r_squared_cs', label: 'Cox-Snell R²', type: 'number' },
        { key: 'r_squared_mcf', label: 'McFadden R²', type: 'number' },
        { key: 'll0', label: 'Log-Likelihood (null model)', type: 'number' },
        { key: 'll', label: 'Log-Likelihood (fitted model)', type: 'number' },
        { key: 'aic', label: 'AIC', type: 'number' },
        { key: 'bic', label: 'BIC', type: 'number' },
        {
          key: 'coefficients',
          label: 'Coefficients',
          type: 'array'
        },
        {
          key: 'stderr',
          label: 'Standard Error',
          type: 'array'
        },
        {
          key: 'z_scores',
          label: 'Z-scores',
          type: 'array'
        },
        {
          key: 'pvalues',
          label: 'P-values',
          type: 'array'
        },
        {
          key: 'lower_ci',
          label: 'Lower CI',
          type: 'array'
        },
        {
          key: 'upper_ci',
          label: 'Upper CI',
          type: 'array'
        }
      ];
    case 'pca':
    case 'pca_with_transformation':
      return [
        { key: 'n_obs', label: 'Observations', type: 'number' },
        {
          key: 'eigenvalues',
          label: 'Eigenvalues',
          type: 'list',
          elementType: 'number'
        },
        {
          key: 'eigenvectors',
          label: 'Eigenvectors',
          type: 'matrix',
          elementType: 'number'
        }
      ];
    case 'pearson_correlation':
      return [
        { key: 'n_obs', label: 'Observations', type: 'number' },
        {
          key: 'correlations',
          label: 'Correlation Matrix',
          type: 'matrix',
          elementType: 'float',
          variablesKey: 'variables'
        },
        {
          key: 'p-values',
          label: 'p-values Matrix',
          type: 'matrix',
          elementType: 'pval',
          variablesKey: 'variables'
        },
        {
          key: 'low_confidence_intervals',
          label: 'Lower 95% CI',
          type: 'matrix',
          elementType: 'float',
          variablesKey: 'variables'
        },
        {
          key: 'high_confidence_intervals',
          label: 'Upper 95% CI',
          type: 'matrix',
          elementType: 'float',
          variablesKey: 'variables'
        }
      ];
    case 'linear_svm':
      return [
        { key: 'n_obs', label: 'Observations', type: 'number' },
        {
          key: 'weights',
          label: 'Weights',
          type: 'array',
          elementType: 'number'
        },
        { key: 'intercept', label: 'Intercept', type: 'number' }
      ];
    case 'chi_squared':
      return [
        { key: 'chi2', label: 'Chi-Squared Statistic', type: 'number', format: 'float' },
        { key: 'p_value', label: 'p-value', type: 'number', format: 'pval' },
        { key: 'dof', label: 'Degrees of Freedom', type: 'number' },
        { key: 'x_labels', label: 'Factor Categories', type: 'array', elementType: 'string' },
        { key: 'y_labels', label: 'Outcome Categories', type: 'array', elementType: 'string' },
        {
          key: 'expected',
          label: 'Expected Frequencies',
          type: 'matrix',
          elementType: 'number',
          rowLabelsKey: 'x_labels',
          columnLabelsKey: 'y_labels'
        }
      ];
    case 'fisher_exact':
      return [
        { key: 'odds_ratio', label: 'Odds Ratio', type: 'number', format: 'float' },
        { key: 'p_value', label: 'p-value', type: 'number', format: 'pval' },
        { key: 'x_labels', label: 'Factor Categories', type: 'array', elementType: 'string' },
        { key: 'y_labels', label: 'Outcome Categories', type: 'array', elementType: 'string' }
      ];
    case 'outlier_report':
      return [
        {
          key: 'featurewise',
          label: 'Outlier Report',
          type: 'table',
          columns: [
            { key: 'variable', label: 'Variable' },
            { key: 'dataset', label: 'Dataset' },
            { key: 'data.strategy', label: 'Strategy' },
            { key: 'data.tail', label: 'Tail' },
            { key: 'data.fold', label: 'Fold', format: 'float' },
            { key: 'data.lower_bound', label: 'Lower bound', format: 'float' },
            { key: 'data.upper_bound', label: 'Upper bound', format: 'float' },
            { key: 'data.lower_outlier_count', label: 'Lower outliers' },
            { key: 'data.upper_outlier_count', label: 'Upper outliers' },
            { key: 'data.total_outlier_count', label: 'Total outliers' },
            { key: 'data.total_outlier_percentage', label: 'Outlier %', format: 'percent' },
          ]
        }
      ];
    case 'ttest_independent':
      return [
        { key: 'statistic', label: 'Test Statistic (t)', type: 'number' },
        { key: 'p_value', label: 'p-value', type: 'number', format: 'pval' },
        { key: 'df', label: 'Degrees of Freedom', type: 'number' },
        { key: 'mean_diff', label: 'Mean Difference', type: 'number' },
        { key: 'se_difference', label: 'Std. Error of Difference', type: 'number' },
        { key: 'ci_lower', label: 'CI Lower', type: 'string' },
        { key: 'ci_upper', label: 'CI Upper', type: 'string' },
        { key: 'cohens_d', label: 'Cohen\'s d', type: 'number' }
      ];
    case 'ttest_onesample':
      return [
        { key: 'n_obs', label: 'Observations', type: 'number' },
        { key: 't_value', label: 'Test Statistic (t)', type: 'number' },
        { key: 'p_value', label: 'p-value', type: 'number', format: 'pval' },
        { key: 'df', label: 'Degrees of Freedom', type: 'number' },
        { key: 'mean_diff', label: 'Mean Difference', type: 'number' },
        { key: 'se_diff', label: 'Std. Error', type: 'array' },
        { key: 'ci_lower', label: 'CI Lower', type: 'string' },
        { key: 'ci_upper', label: 'CI Upper', type: 'string' },
        { key: 'cohens_d', label: 'Cohen\'s d', type: 'number' }
      ];
    case 'naive_bayes_categorical':
      return [
        {
          type: 'section',
          label: 'Model Info',
          fields: [
            { key: 'classes', label: 'Classes', type: 'array', elementType: 'string' },
            { key: 'class_count', label: 'Class Counts', type: 'array', elementType: 'number' },
            { key: 'class_log_prior', label: 'Class Log Prior', type: 'array', elementType: 'number' },
            { key: 'feature_names', label: 'Feature Names', type: 'array', elementType: 'string' },
            { key: 'categories', label: 'Categories per Feature', type: 'dictionary' },
            { key: 'category_count', label: 'Category Counts', type: 'dictionary' },
            { key: 'category_log_prob', label: 'Category Log Probabilities', type: 'dictionary' }
          ]
        }
      ];
    case 'naive_bayes_categorical_cv':
      return [
        {
          type: 'section',
          label: 'Model Info',
          fields: [
            { key: 'class_count', label: 'Class Counts', type: 'array', elementType: 'number' },
            {
              key: 'category_count',
              label: 'Category Counts',
              type: 'nested-table',
              description: 'Per-class counts per category',
              columns: [
                { key: 'categoryIndex', label: 'Category' },
                { key: 'value0', label: 'Count A' },
                { key: 'value1', label: 'Count B' }
              ]
            }
          ]
        },
        {
          key: 'predictions',
          label: 'Predictions',
          type: 'dictionary',
          description: 'Predicted class distribution'
        }
      ];
    case 'naive_bayes_gaussian':
      return [
        {
          type: 'section',
          label: 'Model Parameters',
          fields: [
            { key: 'classes', label: 'Classes', type: 'array', elementType: 'string' },
            { key: 'class_count', label: 'Class Counts', type: 'array', elementType: 'number' },
            { key: 'class_prior', label: 'Class Prior', type: 'array', elementType: 'number' },
            { key: 'feature_names', label: 'Feature Names', type: 'array', elementType: 'string' },
            { key: 'theta', label: 'Feature Means per Class', type: 'matrix', elementType: 'number' },
            { key: 'var', label: 'Feature Variances per Class', type: 'matrix', elementType: 'number' }
          ]
        }
      ];
    case 'naive_bayes_gaussian_cv':
      return [
        {
          type: 'section',
          label: 'Model Parameters',
          fields: [
            {
              key: 'class_count',
              label: 'Class Counts',
              type: 'array',
              elementType: 'number'
            },
            {
              key: 'theta',
              label: 'Feature Means per Class',
              type: 'matrix',
              elementType: 'number'
            },
            {
              key: 'var',
              label: 'Feature Variances per Class',
              type: 'matrix',
              elementType: 'number'
            }
          ]
        },
        {
          key: 'predictions',
          label: 'Predictions',
          type: 'dictionary',
          description: 'Predicted class distribution'
        }
      ];

    default:
      return undefined;
  }
}
