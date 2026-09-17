import { ChartBuilderService } from './../../visualisations/charts/chart-builder.service';
import { Component, input, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AutoRendererComponent } from '../../visualisations/auto-renderer/auto-renderer.component';
import { ChartRendererComponent } from '../../visualisations/charts/charts-renderer/charts-renderer.component';
import { NgxEchartsModule } from 'ngx-echarts';
import { EnumMaps, LabelMap, mapAlgorithmResultEnums } from '../../../../core/algorithm-result-enum-mapper';
import { prettifyLabel } from '../../../../core/algorithm-mappers';

@Component({
  selector: 'app-algorithm-result',
  imports: [CommonModule,
    AutoRendererComponent,
    ChartRendererComponent,
    NgxEchartsModule],
  templateUrl: './algorithm-result.component.html',
  styleUrl: './algorithm-result.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlgorithmResultComponent {
  private chartBuilder = inject(ChartBuilderService);

  result = input<any>(null);
  schema = input<any[]>([]);
  algorithm = input.required<string>();
  algorithmLabel = input<string | null>(null);
  enumMaps = input<EnumMaps | null>(null);
  yVar = input<string | null>(null);
  xVar = input<string | null>(null);
  labelMap = input<LabelMap | null>(null);

  constructor() { }

  errorMessage = computed(() => {
    if (!this.result()) return null;
    if (this.result()?.status === 'error') {
      return this.result()?.error || this.result()?.message || 'An error occurred.';
    }
    return this.result()?.error ?? null;
  });

  isRenderable = computed(() => {
    return !!this.result() && !!this.algorithm() && !this.errorMessage();
  });

  mappedResult = computed(() =>
    this.errorMessage()
      ? this.result()
      : mapAlgorithmResultEnums(this.algorithm(), this.result(), this.enumMaps(), {
        y: this.yVar(),
        x: this.xVar(),
      }, this.labelMap())
  );

  fallbackResultTitle = computed(() => {
    const explicitTitle = this.mappedResult()?.title;
    if (typeof explicitTitle === 'string' && explicitTitle.trim()) {
      return explicitTitle.trim();
    }

    const label = this.algorithmLabel()?.trim();
    if (label) return `Result ${label}`;

    return `Result ${prettifyLabel(this.algorithm()) || 'Algorithm'}`;
  });


  renderedCharts = computed(() => {
    if (!this.result() || !this.algorithm() || this.errorMessage()) return [];
    return this.chartBuilder.getChartsForAlgorithm(this.algorithm(), this.mappedResult(), this.fallbackResultTitle());
  });
}

