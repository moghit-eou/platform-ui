import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ExperimentStudioService } from './experiment-studio.service';
import { SessionStorageService } from './session-storage.service';
import { ErrorService } from './error.service';
import { DataModel } from '../models/data-model.interface';
import { AnalysisPreprocessingStep } from '../models/backend-algorithms.model';

describe('ExperimentStudioService', () => {
  let service: ExperimentStudioService;
  let httpMock: HttpTestingController;

  const mockRawAlgo = {
    name: 'mock_algo',
    label: 'Mock Algo',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['real'], required: true, max_count: 1 },
      x: { label: '', desc: '', types: ['real'] },
      filter: { label: '', desc: '', types: [], required: false, max_count: 1 }
    },
    parameters: {
      alpha: {
        label: 'Alpha',
        desc: '',
        types: ['real'],
        required: false,
        default_value: '0.05',
      },
    }
  };

  const mockHistogramAlgo = {
    name: 'histogram',
    label: 'Histogram',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['text'], required: true },
      x: { label: '', desc: '', types: ['text'] },
      filter: { label: '', desc: '', types: [] }
    },
    parameters: {}
  };

  const mockDescribeAlgo = {
    name: 'describe',
    label: 'Describe',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['real'], required: true },
      x: { label: '', desc: '', types: ['real'] },
      filter: { label: '', desc: '', types: [] }
    },
    parameters: {},
    preprocessing: [
      {
        name: 'missing_values_handler',
        label: 'Missing Values Handler',
        desc: '',
        order: 1,
        parameters: {}
      }
    ]
  };

  const mockOutlierReportAlgo = {
    name: 'outlier_report',
    label: 'Outlier Report',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['real'], required: true },
      x: { label: '', desc: '', types: ['real'], required: false },
      filter: { label: '', desc: '', types: [], required: false, max_count: 1 },
    },
    parameters: {},
  };

  const mockLinearSvmAlgo = {
    name: 'linear_svm',
    label: 'Linear SVM',
    desc: '',
    enabled: true,
    inputdata: {
      data_model: { label: '', desc: '', types: [] },
      datasets: { label: '', desc: '', types: [] },
      y: { label: '', desc: '', types: ['real'], required: true },
      x: { label: '', desc: '', types: ['real'], required: true },
      filter: { label: '', desc: '', types: [], required: false, max_count: 1 },
    },
    parameters: {},
  };

  const mockInputdataSpec = {
    data_model: { label: '', desc: '', types: ['text'], required: true },
    datasets: { label: '', desc: '', types: ['text'], required: true },
    filters: { label: '', desc: '', types: ['jsonObject'], required: false },
    variables: { label: '', desc: '', types: ['real', 'int', 'text'], required: true, min_count: 1 },
  };

  function toAlgorithmSpec(mock: any) {
    return {
      name: mock.name,
      label: mock.label,
      desc: mock.desc,
      type: mock.type,
      flags: mock.flags,
      y: mock.inputdata.y,
      x: mock.inputdata.x,
      requires_validation_datasets: false,
      parameters: mock.parameters ?? {},
      required_preprocessing: [],
    };
  }

  function preprocessingSteps(config: Record<string, unknown> | null): AnalysisPreprocessingStep[] | null {
    if (!config) return null;
    return Object.entries(config).map(([name, parameters]) => ({
      name,
      parameters: parameters as Record<string, unknown>,
    }));
  }

  function flushSpecifications(algorithms: any[], preprocessing: any[] = []) {
    httpMock.expectOne('/services/specifications/inputdata').flush(mockInputdataSpec);
    httpMock.expectOne('/services/specifications/preprocessing').flush(preprocessing);
    httpMock.expectOne('/services/specifications/algorithms').flush(algorithms);
  }

  const mockDataModel: DataModel = {
    uuid: 'dm-uuid',
    code: 'dm',
    version: '1',
    label: 'Data Model',
    variables: [
      { code: 'age', label: 'Age', type: 'real' } as any,
      { code: 'sex', label: 'Sex', type: 'nominal' } as any,
      { code: 'site', label: 'Site', type: 'nominal' } as any,
    ],
    groups: [],
    datasets: ['ds1'],
    released: true,
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [provideZonelessChangeDetection(), SessionStorageService, ErrorService]
    });

    service = TestBed.inject(ExperimentStudioService);
    httpMock = TestBed.inject(HttpTestingController);

    flushSpecifications([
      toAlgorithmSpec(mockRawAlgo),
      toAlgorithmSpec(mockHistogramAlgo),
      toAlgorithmSpec(mockDescribeAlgo),
      toAlgorithmSpec(mockOutlierReportAlgo),
      toAlgorithmSpec(mockLinearSvmAlgo),
    ]);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('resolves legacy histogram_sql catalog entries to histogram', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.backendAlgorithms.set({
      histogram_sql: {
        ...mockHistogramAlgo,
        name: 'histogram_sql',
        label: 'Histogram (SQL)',
      } as any,
    });

    const body = service.buildRequestBody('histogram', ['var1']);

    expect(body.analysis.algorithm.name).toBe('histogram_sql');
  });

  it('builds request body for histogram with active data model and datasets', () => {
    // Arrange
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    // Act
    const body = service.buildRequestBody('histogram', ['var1']);

    // Assert
    expect(body.analysis.algorithm.name).toBe('histogram');
    expect(body.analysis.inputdata.data_model).toBe('dm:1');
    expect(body.analysis.inputdata.datasets).toEqual(['ds1']);
    expect(body.analysis.algorithm.y).toEqual(['var1']);
    expect(body.analysis.inputdata.filters).toBeNull();
    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { var1: 'drop' },
      },
    }));
    expect(body.analysis.algorithm.parameters).toEqual({ histogram_type: 'wilkinson' });
    expect(body.mipVersion).toBeUndefined();
  });

  it('does not apply stored descriptive preprocessing to histogram preview requests without an override', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setAppliedDescriptivePreprocessing({
      missing_values_handler: {
        strategies: { var1: 'mean' },
      },
    });

    const body = service.buildRequestBody('histogram', ['var1']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { var1: 'drop' },
      },
    }));
  });

  it('uses an explicit preprocessing override for histogram preview requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { var1: 'median' },
      },
    };

    const body = service.buildRequestBody('histogram', ['var1'], null, null, null, null, applied);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps(applied));
  });

  it('filters applied descriptive preprocessing to histogram y variables only', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { age: 'drop', sex: 'drop' },
      },
      outlier_winsorizer: {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    };

    const body = service.buildRequestBody('histogram', ['age'], null, null, null, null, applied);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { age: 'drop' },
      },
      outlier_winsorizer: {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    }));
  });

  it('skips preprocessing for histogram preview when override is explicitly null', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setAppliedDescriptivePreprocessing({
      missing_values_handler: {
        strategies: { var1: 'mean' },
      },
    });

    const body = service.buildRequestBody('histogram', ['var1'], null, null, null, null, null);

    expect(body.analysis.preprocessing).toBeNull();
  });

  it('does not send validation_datasets for histogram when inputdata spec includes validation_datasets slot', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const histogram = service.backendAlgorithms()['histogram'];
    service.backendAlgorithms.set({
      ...service.backendAlgorithms(),
      histogram: {
        ...histogram,
        requires_validation_datasets: false,
        inputdata: {
          ...histogram.inputdata,
          validation_datasets: { label: '', desc: '', types: ['text'], required: false },
        },
      },
    });

    const body = service.buildRequestBody('histogram', ['var1']);

    expect(body.analysis.inputdata.validation_datasets).toBeNull();
  });

  it('builds spec-driven inputdata with array roles and validation datasets', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.backendAlgorithms.set({
      validation_algo: {
        name: 'validation_algo',
        label: 'Validation Algo',
        description: '',
        requiredVariable: [],
        covariate: [],
        category: 'Mock',
        configSchema: [],
        isDisabled: false,
        requires_validation_datasets: true,
        inputdata: {
          data_model: { label: '', desc: '', types: [] },
          datasets: { label: '', desc: '', types: [] },
          validation_datasets: { label: '', desc: '', types: [] },
          y: { label: '', desc: '', types: ['real'], max_count: 1 },
          x: { label: '', desc: '', types: ['real'] },
          filter: { label: '', desc: '', types: [] },
        },
      } as any,
    });

    const body = service.buildRequestBody('validation_algo', ['y1'], ['x1']);

    expect(body.analysis.inputdata).toEqual(jasmine.objectContaining({
      data_model: 'dm:1',
      datasets: ['ds1'],
      validation_datasets: ['ds1'],
      variables: ['y1', 'x1'],
      filters: null,
    }));
    expect(body.analysis.algorithm).toEqual(jasmine.objectContaining({
      y: ['y1'],
      x: ['x1'],
    }));
  });

  it('adds default drop preprocessing for non-describe algorithm requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    const body = service.buildRequestBody('mock_algo', ['var1'], ['cov1']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: {
          var1: 'drop',
          cov1: 'drop',
        },
      },
    }));
  });

  it('does not add default preprocessing for describe requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    const body = service.buildRequestBody('describe', ['var1']);

    expect(body.analysis.preprocessing).toBeNull();
  });

  it('does not add default preprocessing for outlier_report requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([{ code: 'age', label: 'Age', type: 'real' } as any]);

    const body = service.buildRequestBody('outlier_report', ['age']);

    expect(body.analysis.algorithm.name).toBe('outlier_report');
    expect(body.analysis.preprocessing).toBeNull();
  });

  it('excludes histogram, describe, outlier_report, and linear_svm from the algorithm picker', () => {
    const grouped = service.availableGroupedAlgorithms();
    const names = Object.values(grouped).flat().map((algo) => algo.name);

    expect(names).toContain('mock_algo');
    expect(names).not.toContain('histogram');
    expect(names).not.toContain('histogram_sql');
    expect(names).not.toContain('describe');
    expect(names).not.toContain('outlier_report');
    expect(names).not.toContain('linear_svm');
    expect(names).not.toContain('cox_regression_stacked');
  });

  it('attaches structured availability details to grouped algorithms', () => {
    const grouped = service.availableGroupedAlgorithms();
    const mock = Object.values(grouped).flat().find((algo) => algo.name === 'mock_algo');

    expect(mock?.isDisabled).toBeTrue();
    expect(mock?.availability?.available).toBeFalse();
    expect(mock?.availability?.summary).toBe('Variable needs at least 1, selected 0.');
    expect(mock?.availability?.details.find((detail) => detail.role === 'y')).toEqual(jasmine.objectContaining({
      label: 'Variable',
      minCount: 1,
      selectedCount: 0,
      satisfied: false,
    }));
  });


  it('keeps the selected algorithm when current selections make it unavailable', () => {
    service.setVariables([{ code: 'age', label: 'Age', type: 'real' } as any]);
    const selected = service.backendAlgorithms()['mock_algo'];
    service.selectedAlgorithm.set(selected);

    expect(service.isAlgorithmAvailable('mock_algo')).toBeTrue();

    service.setVariables([]);

    expect(service.isAlgorithmAvailable('mock_algo')).toBeFalse();
    expect(service.selectedAlgorithm()?.name).toBe('mock_algo');
  });

  it('sends raw descriptive overview requests without preprocessing', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    service.loadDescriptiveOverview(['age']).subscribe();

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.body.analysis.algorithm.name).toBe('describe');
    expect(req.request.body.analysis.preprocessing).toBeNull();
    req.flush({ result: { featurewise: [] } });
  });

  it('sends processed descriptive overview requests with explicit preprocessing', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const preprocessing = {
      missing_values_handler: {
        strategies: { age: 'mean' },
      },
    };

    service.loadDescriptiveOverview(['age'], preprocessing).subscribe();

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.body.analysis.preprocessing).toEqual(preprocessingSteps(preprocessing));
    req.flush({ result: { featurewise: [] } });
  });

  it('does not use descriptive preview preprocessing in algorithm requests until it is stored as applied', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);

    service.loadDescriptiveOverview(['age'], {
      missing_values_handler: {
        strategies: { age: 'mean' },
      },
    }).subscribe();
    const previewReq = httpMock.expectOne('/services/experiments/transient');
    previewReq.flush({ result: { featurewise: [] } });

    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { age: 'drop' },
      },
    }));
  });

  it('uses applied descriptive preprocessing for later algorithm requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { age: 'median' },
      },
    };

    service.setAppliedDescriptivePreprocessing(applied);
    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps(applied));
  });

  it('uses applied descriptive preprocessing with multiple preprocessing steps for later algorithm requests', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { age: 'drop', sex: 'drop' },
      },
      longitudinal_transformer: {
        visit1: 'BL',
        visit2: 'FL1',
        strategies: {
          age: 'diff',
          sex: 'first',
        },
      },
    };

    service.setAppliedDescriptivePreprocessing(applied);
    const body = service.buildRequestBody('mock_algo', ['age'], ['sex']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps(applied));
  });

  it('forwards applied outlier preprocessing together with missing values', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const applied = {
      missing_values_handler: {
        strategies: { age: 'drop' },
      },
      outlier_winsorizer: {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    };

    service.setAppliedDescriptivePreprocessing(applied);
    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.analysis.preprocessing).toEqual(preprocessingSteps(applied));
  });

  it('summarizes preprocessing with variable labels and human-readable actions', () => {
    const summary = service.formatPreprocessingConfig({
      missing_values_handler: {
        strategies: { gender: 'drop', subjectageyears: 'drop' },
      },
      longitudinal_transformer: {
        visit1: 'BL',
        visit2: 'FL1',
        strategies: {
          gender: 'first',
          subjectageyears: 'diff',
        },
      },
    }, {
      gender: 'Gender',
      subjectageyears: 'Subject Age Years',
    });

    expect(summary).toBe(
      'Missing values: Gender: remove rows, Subject Age Years: remove rows\nLongitudinal transformation: Gender: use first visit, Subject Age Years: difference between visits (BL to FL1)'
    );
    expect(service.formatPreprocessingEntries({
      missing_values_handler: {
        strategies: { gender: 'drop' },
      },
    }, { gender: 'Gender' })).toEqual([
      { label: 'Missing values', value: 'Gender: remove rows' },
    ]);
  });

  it('summarizes outlier winsorizer preprocessing explicitly', () => {
    const summary = service.formatPreprocessingConfig({
      outlier_winsorizer: {
        strategies: { age: 'iqr', bmi: 'quantile' },
        tails: { age: 'both', bmi: 'right' },
        folds: { age: 1.5, bmi: 0.05 },
      },
    }, {
      age: 'Age',
      bmi: 'BMI',
    });

    expect(summary).toBe(
      'Outlier winsorizer: Age: IQR, both tails, fold 1.5; BMI: Quantile, right tail, fold 0.05'
    );
  });

  it('loads outlier report previews with outlier parameters and upstream missing preprocessing', (done) => {
    service.setSelectedDataModel(mockDataModel);
    service.setVariables([{ code: 'age', label: 'Age', type: 'real' } as any]);
    service.setCovariates([{ code: 'bmi', label: 'BMI', type: 'real' } as any]);

    service.loadOutlierReportPreview(
      ['age', 'bmi'],
      {
        strategies: { age: 'iqr', bmi: 'quantile' },
        tails: { age: 'both', bmi: 'right' },
        folds: { age: 1.5, bmi: 0.05 },
      },
      {
        missing_values_handler: {
          strategies: { age: 'median' },
        },
      }
    ).subscribe((response) => {
      expect(response.result.featurewise).toEqual([]);
      done();
    });

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.analysis.algorithm).toEqual(jasmine.objectContaining({
      name: 'outlier_report',
      y: ['age'],
      x: ['bmi'],
      parameters: {
        strategies: { age: 'iqr', bmi: 'quantile' },
        tails: { age: 'both', bmi: 'right' },
        folds: { age: 1.5, bmi: 0.05 },
      },
    }));
    expect(req.request.body.analysis.inputdata).toEqual(jasmine.objectContaining({
      data_model: 'dm:1',
      datasets: [],
      filters: null,
      variables: jasmine.arrayContaining(['age', 'bmi']),
    }));
    expect(req.request.body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: { age: 'median' },
      },
    }));
    req.flush({ featurewise: [] });
  });

  it('keeps nominal variables and numeric covariates in distinct outlier report input roles', (done) => {
    service.setSelectedDataModel(mockDataModel);
    service.setVariables([{ code: 'sex', label: 'Sex', type: 'nominal' } as any]);
    service.setCovariates([{ code: 'age', label: 'Age', type: 'real' } as any]);

    service.loadOutlierReportPreview(
      ['age'],
      {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    ).subscribe((response) => {
      expect(response.result.featurewise).toEqual([]);
      done();
    });

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.analysis.inputdata).toEqual(jasmine.objectContaining({
      data_model: 'dm:1',
      datasets: [],
      filters: null,
      variables: ['age'],
    }));
    expect(req.request.body.analysis.algorithm).toEqual(jasmine.objectContaining({
      y: ['age'],
      x: null,
    }));
    req.flush({ featurewise: [] });
  });

  it('sends covariate-only outlier report codes through y only', (done) => {
    service.setSelectedDataModel(mockDataModel);
    service.setCovariates([{ code: 'age', label: 'Age', type: 'real' } as any]);

    service.loadOutlierReportPreview(
      ['age'],
      {
        strategies: { age: 'iqr' },
        tails: { age: 'both' },
        folds: { age: 1.5 },
      },
    ).subscribe((response) => {
      expect(response.result.featurewise).toEqual([]);
      done();
    });

    const req = httpMock.expectOne('/services/experiments/transient');
    expect(req.request.body.analysis.algorithm).toEqual(jasmine.objectContaining({
      y: ['age'],
      x: null,
    }));
    req.flush({ featurewise: [] });
  });

  it('resetStudioStateForGuide restores the default pathology after clearing guide progress', () => {
    const defaultModel: DataModel = {
      ...mockDataModel,
      code: 'stroke',
      label: 'Stroke',
    };
    const alternateModel: DataModel = {
      ...mockDataModel,
      code: 'alternate',
      label: 'Alternate',
    };

    service.crossSectionalModels.set([defaultModel]);
    service.longitudinalModels.set([alternateModel]);
    service.setSelectedDataModel(alternateModel);
    service.setVariables([{ code: 'v1', label: 'V1' } as any]);

    service.resetStudioStateForGuide();

    expect(service.selectedVariables()).toEqual([]);
    expect(service.selectedDataModel()).toEqual(defaultModel);
    expect(service.selectedDatasets()).toEqual(['ds1']);
  });

  it('preselectAllDatasetsForModel selects every dataset enumeration for the pathology', () => {
    const model: DataModel = {
      ...mockDataModel,
      variables: [
        {
          code: 'dataset',
          label: 'Dataset',
          type: 'nominal',
          enumerations: [
            { code: 'ds-a', label: 'Dataset A' },
            { code: 'ds-b', label: 'Dataset B' },
          ],
        } as any,
      ],
      datasets: ['ds-a', 'ds-b'],
    };

    service.preselectAllDatasetsForModel(model);

    expect(service.availableDatasets().map((dataset) => dataset.code)).toEqual(['ds-a', 'ds-b']);
    expect(service.selectedDatasets()).toEqual(['ds-a', 'ds-b']);
  });

  it('resetStudioState clears selections and errors', (done) => {
    const errorService = TestBed.inject(ErrorService);

    // Arrange
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.setVariables([{ code: 'v1', label: 'V1' } as any]);
    errorService.setError('Oops');

    // Act
    service.resetStudioState();

    // Assert
    expect(service.selectedDataModel()).toBeNull();
    expect(service.selectedDatasets()).toEqual([]);
    expect(service.selectedVariables()).toEqual([]);
    errorService.error$.subscribe((msg) => {
      expect(msg).toBeNull();
      done();
    });
  });

  it('returns null from runSelectedAlgorithm when no algorithm is selected', () => {
    // Act
    const result = service.runSelectedAlgorithm();

    // Assert
    expect(result).toBeNull();
  });

  it('keeps an algorithm available when multiple filter variables are selected', () => {
    service.setVariables([{ code: 'age', label: 'Age', type: 'real' } as any]);
    service.setFilters([
      { code: 'age', label: 'Age', type: 'real' } as any,
      { code: 'event_type', label: 'Event Type', type: 'text' } as any,
    ]);

    expect(service.isAlgorithmAvailable('mock_algo')).toBeTrue();
  });

  it('coerces numeric parameter strings before building request payloads', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.algorithmConfigurations.set({
      mock_algo: { alpha: '0.05' },
    });

    const body = service.buildRequestBody('mock_algo', ['age']);

    expect(body.analysis.algorithm.parameters.alpha).toBe(0.05);
  });

  it('keeps enum select parameter strings even when their schema type is int', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const algo = service.backendAlgorithms()['mock_algo'];
    service.backendAlgorithms.set({
      ...service.backendAlgorithms(),
      mock_algo: {
        ...algo,
        configSchema: [
          ...algo.configSchema,
          {
            key: 'positive_class',
            label: 'Positive class (y=1)',
            type: 'select',
            types: ['int'],
            enumType: 'input_var_CDE_enums',
            enumSource: ['y'],
            options: [
              { code: '0', label: '0' },
              { code: '1', label: '1' },
              { code: '9', label: '9' },
            ],
          },
        ],
      },
    });
    service.algorithmConfigurations.set({
      mock_algo: { positive_class: '1' },
    });

    const body = service.buildRequestBody('mock_algo', ['acute_treat_evt']);

    expect(body.analysis.algorithm.parameters.positive_class).toBe('1');
  });

  it('omits unset positive_class from experiment request parameters', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.algorithmConfigurations.set({
      mock_algo: { alpha: 0.05 },
    });

    const body = service.buildRequestBody('mock_algo', ['acute_treat_evt']);

    expect(body.analysis.algorithm.parameters.positive_class).toBeUndefined();
    expect(body.analysis.algorithm.parameters.alpha).toBe(0.05);
  });

  it('builds binned Mann-Whitney requests with group enum codes and missing-value preprocessing', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    service.backendAlgorithms.set({
      ...service.backendAlgorithms(),
      binned_mann_whitney_u_test: {
        name: 'binned_mann_whitney_u_test',
        label: 'Binned Mann-Whitney U Test',
        description: '',
        inputdata: {
          y: { label: 'Outcome', desc: '', types: ['real', 'int'], required: true, max_count: 1 },
          x: { label: 'Grouping variable', desc: '', types: ['text'], stattypes: ['nominal'], required: true, max_count: 1 },
        },
        configSchema: [
          { key: 'alt_hypothesis', label: 'Alternative hypothesis', type: 'select', options: ['two-sided', 'less', 'greater'], required: true },
          { key: 'groupA', label: 'Group A', type: 'select', types: ['text', 'int'], enumType: 'input_var_CDE_enums', enumSource: ['x'], required: true, options: [
            { code: '0', label: 'Control' },
            { code: '1', label: 'Case' },
          ] },
          { key: 'groupB', label: 'Group B', type: 'select', types: ['text', 'int'], enumType: 'input_var_CDE_enums', enumSource: ['x'], required: true, options: [
            { code: '0', label: 'Control' },
            { code: '1', label: 'Case' },
          ] },
          { key: 'num_bins', label: 'Number of bins', type: 'number', types: ['int'], required: false, default: 40, min: 2, max: 200 },
        ],
        requiredVariable: ['real', 'int'],
        covariate: ['text'],
        category: 'Statistical Tests',
        preprocessing: [],
        required_preprocessing: ['missing_values_handler'],
        isDisabled: false,
      } as any,
    });
    service.algorithmConfigurations.set({
      binned_mann_whitney_u_test: {
        alt_hypothesis: 'two-sided',
        groupA: 'Control',
        groupB: { code: '1', label: 'Case' },
        num_bins: '40',
      },
    });

    const body = service.buildRequestBody('binned_mann_whitney_u_test', ['age'], ['sex']);

    expect(body.analysis.algorithm.name).toBe('binned_mann_whitney_u_test');
    expect(body.analysis.algorithm.y).toEqual(['age']);
    expect(body.analysis.algorithm.x).toEqual(['sex']);
    expect(body.analysis.algorithm.parameters).toEqual({
      alt_hypothesis: 'two-sided',
      groupA: '0',
      groupB: '1',
      num_bins: 40,
    });
    expect(body.analysis.preprocessing).toEqual(preprocessingSteps({
      missing_values_handler: {
        strategies: {
          age: 'drop',
          sex: 'drop',
        },
      },
    }));
  });

  it('keeps enum multi-select parameter values as strings even when their schema type is int', () => {
    service.setSelectedDataModel(mockDataModel);
    service.setSelectedDatasets(['ds1']);
    const algo = service.backendAlgorithms()['mock_algo'];
    service.backendAlgorithms.set({
      ...service.backendAlgorithms(),
      mock_algo: {
        ...algo,
        configSchema: [
          ...algo.configSchema,
          {
            key: 'category_order',
            label: 'Category order',
            type: 'multi-select',
            types: ['int'],
            enumType: 'input_var_CDE_enums',
            enumSource: ['y'],
            options: [
              { code: '0', label: '0' },
              { code: '1', label: '1' },
              { code: '9', label: '9' },
            ],
          },
        ],
      },
    });
    service.algorithmConfigurations.set({
      mock_algo: { category_order: ['0', '1', '9'] },
    });

    const body = service.buildRequestBody('mock_algo', ['acute_treat_evt']);

    expect(body.analysis.algorithm.parameters.category_order).toEqual(['0', '1', '9']);
  });

  it('hydrates edit state with filters and applied preprocessing from backend experiment', () => {
    const filters = {
      condition: 'AND' as const,
      rules: [
        {
          id: 'site',
          field: 'site',
          type: 'string' as const,
          input: 'select' as const,
          operator: 'equal',
          value: 'athens',
        },
      ],
      valid: true,
    };
    const preprocessing = {
      missing_values_handler: {
        strategies: {
          age: 'median',
          sex: 'drop',
        },
      },
    };

    service.hydrateFromBackendExperiment({
      uuid: 'exp-1',
      name: 'Saved experiment',
      created: '',
      finished: '',
      shared: true,
      viewed: false,
      status: 'success',
      analysis: {
        inputdata: {
          data_model: 'dm:1',
          datasets: ['ds1'],
          variables: ['age', 'sex'],
          filters,
        },
        preprocessing: preprocessingSteps(preprocessing)!,
        algorithm: {
          name: 'mock_algo',
          y: ['age'],
          x: ['sex'],
          parameters: { alpha: 0.01 },
        },
      },
      createdBy: {
        username: 'user',
        fullname: 'User',
        email: 'user@example.org',
        subjectId: 'subject',
        agreeNDA: true,
      },
    });

    const req = httpMock.expectOne('/services/data-models');
    req.flush([mockDataModel]);

    expect(service.selectedDataModel()?.code).toBe('dm');
    expect(service.selectedDatasets()).toEqual(['ds1']);
    expect(service.selectedVariables().map((variable) => variable.code)).toEqual(['age']);
    expect(service.selectedCovariates().map((variable) => variable.code)).toEqual(['sex']);
    expect(service.selectedFilters().map((variable) => variable.code)).toEqual(['site']);
    expect(service.filterLogic()).toEqual(filters);
    expect(service.algorithmConfigurations()['mock_algo']).toEqual({ alpha: 0.01 });
    expect(service.appliedPreprocessingConfig()).toEqual(preprocessing);
    expect(service.isShared()).toBeTrue();
  });
});
