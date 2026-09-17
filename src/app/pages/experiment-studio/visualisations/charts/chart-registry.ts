import { EChartsOption } from 'echarts';
import { buildRocCurveChart } from './renderers/roc-curve-chart';
import { buildMatrixChart } from './renderers/matrix-chart';

import { buildPCAHeatmapChart } from './renderers/pca-heatmap-chart';
import { buildNaiveBayesConfusionChart } from './renderers/naive-bayes-confusion-matrix-chart';
import { buildLogRegConfusionChart } from './renderers/log-reg-confusion-matrix-chart';
import { buildKMeansChart } from './renderers/k-means-chart';
import { buildMeanPlotChart } from './renderers/mean-plot-chart';
import { buildBoxPlotChart } from './renderers/box-plot-chart';
import { buildSVMChart } from './renderers/svm-chart';

// New Renderers
import { buildRegressionLineChart } from './renderers/regression-line-chart';
import { buildTTestChart } from './renderers/t-test-chart';

import { buildCVMetricsChart } from './renderers/cv-metrics-chart';
import { buildHistogramChart } from './renderers/histogram-chart';
import { buildNaiveBayesPriorsChart } from './renderers/naive-bayes-priors-chart';
import { buildCoxHazardRatioForestChart } from './renderers/cox-hazard-ratio-forest-chart';

interface AlgorithmChartConfig {
  build: (input: any) => EChartsOption[];
  inputPath: string;
}

function composeCharts(...builders: ((result: any) => EChartsOption[])[]): (result: any) => EChartsOption[] {
  return (result: any) => builders.flatMap(fn => fn(result));
}

export const AlgorithmChartRegistry: Record<string, AlgorithmChartConfig> = {
  kmeans: {
    build: buildKMeansChart,
    inputPath: '',
  },

  linear_regression: {
    build: buildRegressionLineChart,
    inputPath: '',
  },

  linear_regression_cv: {
    build: buildCVMetricsChart,
    inputPath: '',
  },

  // Logistic Regression (Standard)
  logistic_regression: {
    build: buildRegressionLineChart,
    inputPath: '',
  },


  logistic_regression_cv: {
    build: composeCharts(buildLogRegConfusionChart, buildRocCurveChart), // CV Metrics chart could be added if supported
    inputPath: '',
  },

  naive_bayes_gaussian: {
    build: buildNaiveBayesPriorsChart,
    inputPath: '',
  },

  naive_bayes_categorical: {
    build: buildNaiveBayesPriorsChart,
    inputPath: '',
  },

  naive_bayes_gaussian_cv: {
    build: buildNaiveBayesConfusionChart,
    inputPath: '',
  },

  naive_bayes_categorical_cv: {
    build: buildNaiveBayesConfusionChart,
    inputPath: '',
  },

  pearson_correlation: {
    build: buildMatrixChart,
    inputPath: '',
  },

  pca: {
    build: buildPCAHeatmapChart,
    inputPath: '',
  },

  pca_with_transformation: {
    build: buildPCAHeatmapChart,
    inputPath: '',
  },

  anova_oneway: {
    build: buildMeanPlotChart,
    inputPath: '',
  },

  anova_twoway: {
    build: () => [],
    inputPath: '',
  },

  ttest_independent: {
    build: buildTTestChart,
    inputPath: '',
  },

  ttest_paired: {
    build: buildTTestChart,
    inputPath: '',
  },

  ttest_onesample: {
    build: buildTTestChart,
    inputPath: '',
  },

  linear_svm: {
    build: buildSVMChart,
    inputPath: '',
  },

  describe: {
    build: buildBoxPlotChart,
    inputPath: '',
  },

  histogram: {
    build: buildHistogramChart,
    inputPath: '',
  },


  cox_regression_classical: {
    build: buildCoxHazardRatioForestChart,
    inputPath: '',
  },

  cox_regression_stacked: {
    build: buildCoxHazardRatioForestChart,
    inputPath: '',
  },

  default: {
    build: () => [],
    inputPath: '',
  },
};
