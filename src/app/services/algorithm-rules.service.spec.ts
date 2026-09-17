import { AlgorithmConfig } from '../models/algorithm-definition.model';
import { AlgorithmRulesService } from './algorithm-rules.service';

describe('AlgorithmRulesService', () => {
  let service: AlgorithmRulesService;
  const baseInputdata = {
    data_model: { label: 'data_model', desc: '', types: ['text'], required: true, max_count: 1 },
    datasets: { label: 'datasets', desc: '', types: ['text'], required: true },
  };

  const buildAlgo = (inputdata: Record<string, any>): AlgorithmConfig => ({
    name: 'mock_algo',
    label: 'mock_algo',
    description: '',
    requiredVariable: [],
    covariate: [],
    category: 'Mock',
    configSchema: [],
    isDisabled: false,
    inputdata: {
      ...baseInputdata,
      ...inputdata,
    },
  } as AlgorithmConfig);

  beforeEach(() => {
    service = new AlgorithmRulesService();
  });

  it('validates required roles from the JSON specification', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, max_count: 1 },
      x: { label: 'x', desc: '', types: ['text'], required: false },
    });

    expect(service.isAlgorithmAvailable(algo, { y: [], x: [] })).toBeFalse();
    expect(service.evaluateAlgorithmAvailability(algo, { y: [], x: [] }).summary)
      .toBe('Outcome needs at least 1 (none assigned).');
    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
    })).toBeTrue();
  });

  it('validates max_count from the JSON specification', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, max_count: 1 },
    });

    const available = service.isAlgorithmAvailable(algo, {
      y: [
        { code: 'v1', label: 'var1', type: 'real' } as any,
        { code: 'v2', label: 'var2', type: 'real' } as any,
      ],
      x: [],
    });

    expect(available).toBeFalse();
  });

  it('validates selected variable types from the JSON specification', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, max_count: 1 },
    });

    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'text' } as any],
      x: [],
    })).toBeFalse();

    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
    })).toBeTrue();
  });

  it('uses normalized metadata type aliases only for matching specification types', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['text'], required: true, max_count: 1 },
    });

    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'nominal' } as any],
      x: [],
    })).toBeTrue();
  });

  it('does not apply algorithm-name-specific restrictions beyond the JSON specification for unspecified algorithms', () => {
    const algo = {
      ...buildAlgo({
        y: { label: 'y', desc: '', types: ['real'], required: true, max_count: 1 },
        x: { label: 'x', desc: '', types: ['text'], required: true },
      }),
      name: 'mock_algo',
    } as AlgorithmConfig;

    const availableWithOneCovariate = service.isAlgorithmAvailable(algo, {
      y: [{ code: 'age', label: 'Age', type: 'real' } as any],
      x: [{ code: 'sex', label: 'Sex', type: 'text' } as any],
    });

    expect(availableWithOneCovariate).toBeTrue();
  });

  it('limits linear regression to one target variable when backend omits max_count', () => {
    const algo = {
      ...buildAlgo({
        y: { label: 'y', desc: '', types: ['real', 'int'], required: true },
        x: { label: 'x', desc: '', types: ['real', 'int', 'text'], required: false },
      }),
      name: 'linear_regression',
    } as AlgorithmConfig;

    const result = service.evaluateAlgorithmAvailability(algo, {
      y: [
        { code: 'age', label: 'Age', type: 'real' } as any,
        { code: 'bmi', label: 'BMI', type: 'real' } as any,
      ],
      x: [{ code: 'sex', label: 'Sex', type: 'text' } as any],
    });

    expect(result.available).toBeFalse();
    expect(result.summary).toBe('Outcome allows at most 1, selected 2.');
    expect(result.details.find((detail) => detail.role === 'y')).toEqual(jasmine.objectContaining({
      selectedCount: 2,
      maxCount: 1,
      satisfied: false,
    }));
  });

  it('ignores filter input declarations when evaluating availability', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true, max_count: 1 },
      filter: { label: 'filter', desc: '', types: ['json'], required: true, max_count: 1 },
    });

    const result = service.evaluateAlgorithmAvailability(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
    });

    expect(result.available).toBeTrue();
    expect(result.details.map((detail) => detail.role)).not.toContain('filter' as any);
  });

  it('validates canonical min_count and max_count limits', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], min_count: 2, max_count: 3 },
    });

    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'real' } as any],
      x: [],
    })).toBeFalse();

    expect(service.isAlgorithmAvailable(algo, {
      y: [
        { code: 'v1', label: 'var1', type: 'real' } as any,
        { code: 'v2', label: 'var2', type: 'real' } as any,
      ],
      x: [],
    })).toBeTrue();
  });

  it('requires at least two covariates for Binary GLMM when min_count is omitted', () => {
    const algo = {
      ...buildAlgo({
        y: { label: 'y', desc: '', types: ['int', 'text'], stattypes: ['nominal'], required: true },
        x: { label: 'x', desc: '', types: ['real', 'int', 'text'], stattypes: ['numerical', 'nominal'], required: true },
      }),
      name: 'glmm_binary',
    } as AlgorithmConfig;

    const unavailable = service.evaluateAlgorithmAvailability(algo, {
      y: [{ code: 'outcome', label: 'Outcome', type: 'int', stattype: 'nominal' } as any],
      x: [{ code: 'age', label: 'Age', type: 'real', stattype: 'numerical' } as any],
    });

    expect(unavailable.available).toBeFalse();
    expect(unavailable.summary).toBe('Predictor needs at least 2, selected 1.');
    expect(unavailable.details.find((detail) => detail.role === 'y')).toEqual(jasmine.objectContaining({
      minCount: 1,
      maxCount: 1,
    }));
    expect(unavailable.details.find((detail) => detail.role === 'x')).toEqual(jasmine.objectContaining({
      minCount: 2,
      maxCount: null,
    }));
  });

  it('rejects duplicate selections and y/x overlap', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['real'], required: true },
      x: { label: 'x', desc: '', types: ['real'], required: false },
    });

    expect(service.isAlgorithmAvailable(algo, {
      y: [
        { code: 'age', label: 'Age', type: 'real' } as any,
        { code: 'age', label: 'Age', type: 'real' } as any,
      ],
      x: [],
    })).toBeFalse();

    expect(service.isAlgorithmAvailable(algo, {
      y: [{ code: 'age', label: 'Age', type: 'real' } as any],
      x: [{ code: 'age', label: 'Age', type: 'real' } as any],
    })).toBeFalse();
  });

  it('displays nominal as the user-facing type when stattype validation fails for text inputs', () => {
    const algo = buildAlgo({
      y: { label: 'y', desc: '', types: ['text'], stattypes: ['nominal'], required: true, max_count: 1 },
    });

    const result = service.evaluateAlgorithmAvailability(algo, {
      y: [{ code: 'v1', label: 'var1', type: 'text', stattype: 'ordinal' } as any],
      x: [],
    });

    expect(result.available).toBeFalse();
    expect(result.summary).toBe('Outcome type must be one of nominal.');
  });

  it('displays text as nominal in availability type errors', () => {
    const algo = buildAlgo({
      x: { label: 'x', desc: '', types: ['real', 'int', 'text'], required: true },
    });

    const result = service.evaluateAlgorithmAvailability(algo, {
      y: [],
      x: [{ code: 'v1', label: 'var1', type: 'boolean' } as any],
    });

    expect(result.available).toBeFalse();
    expect(result.summary).toBe('Predictor type must be one of real, int, nominal.');
    expect(result.summary).not.toContain('text');
  });


  it('returns structured details for optional covariate max_count failures', () => {
    const algo = buildAlgo({
      x: { label: 'x', desc: '', types: ['real'], required: false, max_count: 1 },
    });

    const result = service.evaluateAlgorithmAvailability(algo, {
      y: [],
      x: [
        { code: 'v1', label: 'var1', type: 'real' } as any,
        { code: 'v2', label: 'var2', type: 'real' } as any,
      ],
    });

    expect(result.available).toBeFalse();
    expect(result.summary).toBe('Predictor allows at most 1, selected 2.');
    expect(result.details.find((detail) => detail.role === 'x')).toEqual(jasmine.objectContaining({
      label: 'Predictor',
      selectedCount: 2,
      maxCount: 1,
      satisfied: false,
    }));
  });

});
