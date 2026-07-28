import { Injectable, inject } from '@angular/core';
import { EChartsOption } from 'echarts';
import { AlgorithmChartRegistry } from './chart-registry';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
// @ts-expect-error echarts-gl ships no types for its CommonJS dist bundle
import * as echartsGl from 'echarts-gl/dist/echarts-gl.js';

function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  return path.split('.').reduce((o, key) => o?.[key], obj);
}

function ensureEchartsGlRegistered(): void {
  // echarts-gl omits dist/ from sideEffects; keep a live reference so the
  // CommonJS bundle is evaluated and scatter3D/grid3D types register.
  if (echartsGl == null) {
    throw new Error('echarts-gl failed to load');
  }
}

@Injectable({ providedIn: 'root' })
export class ChartBuilderService {
  private experimentService = inject(ExperimentStudioService);


  getChartsForAlgorithm(algorithm: string, result: any, _fallbackTitle?: string | null): EChartsOption[] {
    ensureEchartsGlRegistered();
    const config = AlgorithmChartRegistry[algorithm] || AlgorithmChartRegistry['default'];

    // raw input
    const input = getByPath(result, config.inputPath);

    // enrich with display names
    const enrichedInput = this.enrichLabels(input);

    // PCA specific enrichment: inject actual variable names for the heatmap
    if (algorithm === 'pca' || algorithm === 'pca_with_transformation') {
      const vars = this.experimentService.selectedVariables();
      const covs = this.experimentService.selectedCovariates();
      const allSelected = [...vars, ...covs];

      if (allSelected.length > 0) {
        // We use a unique property name to avoid collisions
        (enrichedInput as any).variable_names = allSelected.map(v => v.label || v.name || v.code);
      }
    }

    if (algorithm === 'describe') {
      this.attachDescribeDatasetLabels(enrichedInput);
    }

    // Keep chart titles chart-specific. Experiment-level title is rendered in the result header.
    return config.build(enrichedInput);
  }

  private attachDescribeDatasetLabels(target: any): void {
    const map = this.experimentService.getDatasetLabelMap();
    if (!Object.keys(map).length || !target || typeof target !== 'object') return;

    if (target.result && typeof target.result === 'object') {
      (target.result as Record<string, unknown>)['dataset_labels'] = map;
      return;
    }

    target['dataset_labels'] = map;
  }

  private enrichLabels(input: any): any {
    if (!input) return input;

    const variables = this.experimentService.selectedVariables();
    const covariates = this.experimentService.selectedCovariates();
    const filters = this.experimentService.selectedFilters();

    const replaceLabel = (raw: string) => {
      const match =
        variables.find(v => v.code === raw) ||
        covariates.find(c => c.code === raw) ||
        filters.find(f => f.code === raw);

      return match?.name || match?.label || raw;
    };

    // If it's a string, try to replace it if it's a variable code
    if (typeof input === 'string') {
      return replaceLabel(input);
    }

    // If it's an object (but not null/array), process its entries
    if (typeof input === 'object' && !Array.isArray(input)) {
      // Special case: if we are in anova_table, we specifically want to replace x_label and y_label
      // but we should also check other fields. The recursive approach below handles this 
      // by checking if keys or values match codes.

      const newObj: any = {};
      for (const [k, v] of Object.entries(input)) {
        // If the key is 'variable' or ends with '_label', its value is likely a code
        if (k === 'variable' || k.endsWith('_label')) {
          newObj[k] = typeof v === 'string' ? replaceLabel(v) : this.enrichLabels(v);
        } else {
          newObj[k] = this.enrichLabels(v);
        }
      }
      return newObj;
    }

    // If it's an array, process its elements
    if (Array.isArray(input)) {
      return input.map(v => this.enrichLabels(v));
    }

    return input;
  }
}
