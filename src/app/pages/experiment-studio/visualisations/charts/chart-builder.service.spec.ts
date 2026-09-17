import { TestBed } from '@angular/core/testing';
import { ChartBuilderService } from './chart-builder.service';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

describe('ChartBuilderService', () => {
  const experimentServiceStub = {
    algorithmAssignableVariables: () => [],
    selectedFilters: () => [],
    getDatasetLabelMap: () => ({ 'dataset-a': 'Dataset A' }),
  };

  let service: ChartBuilderService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ExperimentStudioService, useValue: experimentServiceStub }],
    });
    service = TestBed.inject(ChartBuilderService);
  });

  it('keeps chart-specific title for single-chart algorithms', () => {
    const charts = service.getChartsForAlgorithm('linear_svm', {
      title: 'Federated SVM Report',
      weights: [0.2, -0.1, 0.3, 0.4],
      intercept: 0.25,
    });

    expect(charts.length).toBe(1);
    expect((charts[0] as any).title?.text).toBe('SVM Support Vector Distribution');
  });

  it('keeps chart-specific titles for multi-chart algorithms', () => {
    const charts = service.getChartsForAlgorithm('pca', {
      title: 'PCA Run 2026',
      eigenvectors: [
        [0.7, 0.2],
        [0.1, 0.9],
      ],
      eigenvalues: [1.8, 0.9],
    });

    expect(charts.length).toBe(2);
    expect((charts[0] as any).title?.text).toBe('Eigenvectors');
    expect((charts[1] as any).title?.text).toBe('Scree Plot (Eigenvalues)');
  });

  it('uses fallback title when result title is missing', () => {
    const charts = service.getChartsForAlgorithm(
      'linear_svm',
      {
        weights: [0.2, -0.1, 0.3, 0.4],
        intercept: 0.25,
      },
      'Result Linear SVM'
    );

    expect(charts.length).toBe(1);
    expect((charts[0] as any).title?.text).toBe('SVM Support Vector Distribution');
  });

  it('renders pearson p-values and CI charts for legacy key aliases', () => {
    const matrix = {
      variables: ['v1', 'v2'],
      v1: [1, 0.25],
      v2: [0.25, 1],
    };

    const charts = service.getChartsForAlgorithm('pearson_correlation', {
      correlations: matrix,
      'p-values': matrix,
      low_confidence_intervals: matrix,
      high_confidence_intervals: matrix,
    });

    expect(charts.length).toBe(4);
    const titles = charts.map((c) => (c as any).title?.text);
    expect(titles).toContain('Correlation Matrix');
    expect(titles).toContain('P-Values');
    expect(titles).toContain('Confidence Interval (Lower 95%)');
    expect(titles).toContain('Confidence Interval (Upper 95%)');
  });

  it('renders describe box plots from featurewise rows', () => {
    const charts = service.getChartsForAlgorithm('describe', {
      featurewise: [
        {
          variable: 'age',
          dataset: 'ds1',
          data: { min: 40, q1: 45, q2: 50, q3: 55, max: 60, mean: 51 },
        },
      ],
    });

    expect(charts.length).toBe(1);
    expect((charts[0] as any).title?.text).toBe('Distribution for age');
  });
});
