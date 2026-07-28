import { getOutputSchema, mapRawAlgorithmToAlgorithmConfig } from './algorithm-mappers';
import { RawAlgorithmDefinition } from '../models/backend-algorithms.model';

function rawAlgorithm(overrides: Partial<RawAlgorithmDefinition>): RawAlgorithmDefinition {
  return {
    name: 'mock',
    label: 'Mock',
    desc: 'Mock algorithm',
    enabled: true,
    inputdata: {
      data_model: { label: 'Data model', desc: '', types: ['text'], required: true, max_count: 1 },
      datasets: { label: 'Datasets', desc: '', types: ['text'], required: true },
      y: { label: 'Y', desc: '', types: ['real'], required: true, max_count: 1 },
      x: { label: 'X', desc: '', types: ['text'], required: true },
    },
    parameters: {},
    ...overrides,
  };
}

describe('algorithm mappers', () => {
  it('categorizes mixed-effects algorithms and preserves input-var enum metadata', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'lmm',
      label: 'Linear Mixed Model',
      parameters: {
        grouping_var: {
          label: 'Grouping variable',
          desc: 'Variable from x to use as grouping factor.',
          types: ['text'],
          required: true,
          multiple: false,
          enums: { type: 'input_var_names', source: ['x'] },
        },
      },
    }));

    expect(config.category).toBe('Mixed Models');
    expect(config.inputdata?.y?.max_count).toBe(1);
    expect(config.inputdata?.x?.min_count).toBe(2);
    expect(config.configSchema[0]).toEqual(jasmine.objectContaining({
      key: 'grouping_var',
      type: 'select',
      enumType: 'input_var_names',
      enumSource: ['x'],
      options: [],
      required: true,
    }));
  });

  it('applies Binary GLMM count bounds when the catalog omits min_count and max_count', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'glmm_binary',
      label: 'Binary GLMM',
      inputdata: {
        data_model: { label: 'Data model', desc: '', types: ['text'], required: true, max_count: 1 },
        datasets: { label: 'Datasets', desc: '', types: ['text'], required: true },
        y: { label: 'Y', desc: '', types: ['int', 'text'], stattypes: ['nominal'], required: true },
        x: { label: 'X', desc: '', types: ['real', 'int', 'text'], stattypes: ['numerical', 'nominal'], required: true },
      },
      parameters: {},
    }));

    expect(config.inputdata?.y?.max_count).toBe(1);
    expect(config.inputdata?.x?.min_count).toBe(2);
  });

  it('maps enum-driven GLMM parameters and ordinal category order', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'glmm_ordinal',
      label: 'Ordinal GLMM',
      parameters: {
        grouping_var: {
          label: 'Grouping variable',
          desc: '',
          types: ['text'],
          required: true,
          multiple: false,
          enums: { type: 'input_var_names', source: ['x'] },
        },
        category_order: {
          label: 'Ordinal category order',
          desc: '',
          types: ['text', 'int'],
          required: true,
          multiple: true,
        },
      },
    }));

    expect(config.category).toBe('Mixed Models');
    expect(config.configSchema.find(field => field.key === 'grouping_var')?.type).toBe('select');
    expect(config.configSchema.find(field => field.key === 'category_order')).toEqual(jasmine.objectContaining({
      type: 'multi-select',
      required: true,
      multiple: true,
    }));
  });

  it('maps null parameter definitions to an empty config schema', () => {
    const chiSquared = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'chi_squared',
      label: 'Chi-Squared Test',
      parameters: null,
    }));

    expect(chiSquared.category).toBe('Statistical Tests');
    expect(chiSquared.configSchema).toEqual([]);
  });

  it('maps dictionary parameter metadata for outlier contracts', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'outlier_report',
      label: 'Outlier Report',
      documentation: 'Long algorithm documentation.',
      parameters: {
        folds: {
          label: 'Folds',
          desc: '',
          types: ['dict'],
          required: false,
          multiple: false,
          dict_keys_enums: { type: 'input_var_names', source: ['x', 'y'] },
          dict_values_type: 'real',
        },
        strategies: {
          label: 'Strategies',
          desc: '',
          types: ['dict'],
          required: true,
          multiple: false,
          dict_keys_enums: { type: 'input_var_names', source: ['x', 'y'] },
          dict_values_enums: { type: 'list', source: ['gaussian', 'iqr', 'mad', 'quantile'] },
        },
      },
      preprocessing: [
        { name: 'longitudinal_transformer', label: 'Longitudinal', desc: '', documentation: 'Longitudinal docs.', order: 3, parameters: {} },
        { name: 'outlier_winsorizer', label: 'Outlier Winsorizer', desc: '', documentation: 'Outlier docs.', order: 2, parameters: {} },
      ],
    }));

    expect(config.category).toBe('Descriptive Statistics');
    expect(config.documentation).toBe('Long algorithm documentation.');
    expect(config.configSchema.find(field => field.key === 'folds')).toEqual(jasmine.objectContaining({
      type: 'dict',
      dictKeyEnumType: 'input_var_names',
      dictKeyEnumSource: ['x', 'y'],
      dictValueType: 'real',
    }));
    expect(config.configSchema.find(field => field.key === 'strategies')).toEqual(jasmine.objectContaining({
      type: 'dict',
      dictValueEnumType: 'list',
      dictValueOptions: ['gaussian', 'iqr', 'mad', 'quantile'],
    }));
    expect(config.preprocessing?.map((step) => step.name)).toEqual(['outlier_winsorizer', 'longitudinal_transformer']);
    expect(config.preprocessing?.find((step) => step.name === 'outlier_winsorizer')?.documentation).toBe('Outlier docs.');
  });

  it('sanitizes algorithm documentation code names using parameter and enum labels', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      documentation: "Use 'positive_class', \"n_splits\", and `grouping_var`. Choose 'two-sided' or 'less'. Preserve 'plain words'.",
      parameters: {
        positive_class: {
          label: 'Positive class (y=1)',
          desc: '',
          types: ['text'],
          required: true,
        },
        n_splits: {
          label: 'Number of folds',
          desc: '',
          types: ['int'],
          required: false,
        },
        grouping_var: {
          label: 'Grouping variable',
          desc: '',
          types: ['text'],
          required: true,
        },
        alt_hypothesis: {
          label: 'Alternative hypothesis',
          desc: '',
          types: ['text'],
          required: false,
          enums: { type: 'list', source: ['two-sided', 'less', 'greater'] },
        },
      },
    }));

    expect(config.documentation).toBe("Use Positive class (y=1), Number of folds, and Grouping variable. Choose Two-sided or Less. Preserve 'plain words'.");
  });

  it('sanitizes preprocessing documentation code names and unknown code-like tokens', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      preprocessing: [
        {
          name: 'missing_values_handler',
          label: 'Missing Values',
          desc: '',
          documentation: "Configure 'strategies' and \"fill_values\". Use 'most_frequent', 'iqr', 'mad', and 'backend_code_name'.",
          parameters: {
            strategies: {
              label: 'Strategies',
              desc: '',
              types: ['dict'],
              required: true,
              dict_values_enums: { type: 'list', source: ['drop', 'most_frequent', 'constant'] },
            },
            fill_values: {
              label: 'Fill Values',
              desc: '',
              types: ['dict'],
              required: false,
            },
            tails: {
              label: 'Tails',
              desc: '',
              types: ['dict'],
              required: false,
              dict_values_enums: { type: 'list', source: ['iqr', 'mad'] },
            },
          },
        },
      ],
    }));

    expect(config.preprocessing?.[0].documentation).toBe('Configure Strategies and Fill Values. Use Most frequent, IQR, MAD, and Backend code name.');
  });

  it('maps missing documentation to empty strings', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      documentation: undefined,
      preprocessing: [
        { name: 'missing_values_handler', label: 'Missing Values', desc: '', parameters: {} },
      ],
    }));

    expect(config.documentation).toBe('');
    expect(config.preprocessing?.[0].documentation).toBe('');
  });

  it('maps canonical contract fields and parameter bounds', () => {
    const config = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      type: 'stats',
      flags: ['beta'],
      inputdata: {
        data_model: { label: 'Data model', desc: '', types: ['text'], required: true },
        datasets: { label: 'Datasets', desc: '', types: ['text'], required: true },
        validation_datasets: { label: 'Validation', desc: '', types: ['text'], min_count: '0', max_count: '2' },
        y: { label: 'Y', desc: '', types: ['real'], required: true, min_count: '1', max_count: '3' },
        x: { label: 'X', desc: '', types: ['real'], required: false, max_count: 1 },
      },
      parameters: {
        alpha: { label: 'Alpha', desc: '', types: ['real'], min: '0', max: '1', default: 0 },
        enabled: { label: 'Enabled', desc: '', types: ['boolean'], default: false },
      },
    }));

    expect(config.type).toBe('stats');
    expect(config.flags).toEqual(['beta']);
    expect(config.inputdata?.y?.min_count).toBe(1);
    expect(config.inputdata?.y?.max_count).toBe(3);
    expect(config.inputdata?.x?.max_count).toBe(1);
    expect(config.inputdata?.validation_datasets?.max_count).toBe(2);
    expect(config.configSchema.find(field => field.key === 'alpha')).toEqual(jasmine.objectContaining({
      min: 0,
      max: 1,
      default: 0,
    }));
    expect(config.configSchema.find(field => field.key === 'enabled')?.default).toBeFalse();
  });

  it('maps quartiles and binned Mann-Whitney algorithms to their categories', () => {
    const quartiles = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'quartiles',
      label: 'Quartiles',
      parameters: {
        num_bins: { label: 'Number of bins', desc: '', types: ['int'], required: false, min: 2, max: 100, default: 20 },
      },
    }));
    const mannWhitney = mapRawAlgorithmToAlgorithmConfig(rawAlgorithm({
      name: 'binned_mann_whitney_u_test',
      label: 'Binned Mann-Whitney U Test',
      parameters: {
        groupA: {
          label: 'Group A',
          desc: '',
          types: ['text', 'int'],
          required: true,
          multiple: false,
          enums: { type: 'input_var_CDE_enums', source: ['x'] },
        },
      },
    }));

    expect(quartiles.category).toBe('Descriptive Statistics');
    expect(quartiles.configSchema.find(field => field.key === 'num_bins')).toEqual(jasmine.objectContaining({
      type: 'number',
      min: 2,
      max: 100,
      default: 20,
    }));
    expect(mannWhitney.category).toBe('Statistical Tests');
    expect(mannWhitney.configSchema.find(field => field.key === 'groupA')).toEqual(jasmine.objectContaining({
      type: 'select',
      enumType: 'input_var_CDE_enums',
      enumSource: ['x'],
    }));
  });

  it('provides output schemas for new Exaflow algorithms', () => {
    ['lmm', 'glmm_binary', 'glmm_ordinal', 'chi_squared', 'fisher_exact', 'outlier_report', 'quartiles', 'binned_mann_whitney_u_test'].forEach((name) => {
      const schema = getOutputSchema(name);
      expect(schema).toBeTruthy();
      expect(schema?.length).toBeGreaterThan(0);
    });
  });
});
