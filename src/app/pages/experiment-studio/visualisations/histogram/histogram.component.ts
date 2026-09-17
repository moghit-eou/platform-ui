import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { observeSize } from '../../../../core/observe-resize.util';
import { createHistogram } from './histogram-chart';

/** The census a chart is drawn from: one count per bin label. */
interface HistogramChartData {
  bins: string[];
  counts: Array<number | null>;
  variableName: string;
  variableType?: string;
}

export interface HistogramChartConfig {
  color?: string;
  orientation?: 'vertical' | 'horizontal';
}

/** Matches the sibling D3 charts: redraw once the resizing has settled. */
const RESIZE_DEBOUNCE_MS = 150;

/** ResizeObserver and getBoundingClientRect round the same width differently. */
const WIDTH_TOLERANCE_PX = 1;

@Component({
  selector: 'app-histogram',
  templateUrl: './histogram.component.html',
  styleUrl: './histogram.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistogramComponent implements OnDestroy {
  private elementRef = inject(ElementRef);
  private ngZone = inject(NgZone);
  private viewReady = false;

  readonly data = input<HistogramChartData | null>(null);
  readonly config = input<HistogramChartConfig>({});
  isLoading = false;

  /** What the drawing in the DOM was built from, and the width it was measured at. */
  private renderedData: HistogramChartData | null = null;
  private renderedConfigKey = '';
  private renderedWidth = 0;

  private stopObservingSize: (() => void) | undefined;

  constructor() {
    afterNextRender(() => {
      this.viewReady = true;
      this.renderHistogram();
      const container = this.chartContainer();
      if (container) {
        // Width only: the render writes an inline height, which would otherwise feed
        // this callback back to itself.
        this.stopObservingSize = observeSize(container, this.ngZone, RESIZE_DEBOUNCE_MS, (width) => {
          if (width === 0 || Math.abs(width - this.renderedWidth) <= WIDTH_TOLERANCE_PX) {
            return;
          }
          this.renderHistogram();
        });
      }
    });

    effect(() => {
      this.data();
      this.config();
      if (this.viewReady) {
        this.renderHistogram();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopObservingSize?.();
  }

  renderHistogram(): void {
    const data = this.data();
    if (!data || !data.bins || !data.counts) {
      return;
    }

    const container = this.chartContainer();
    if (!container) {
      console.error('Histogram container not found.');
      return;
    }

    const config = this.config();
    const configKey = this.describeConfig(config);
    const isStale = data !== this.renderedData || configKey !== this.renderedConfigKey;
    const measuredWidth = Math.floor(container.getBoundingClientRect().width);

    // A Studio step hidden with `display: none` measures 0x0 and reports zeroed
    // getBBox() sizes, so drawing here would collapse the chart to a few pixels.
    // Keep the existing drawing; the observer redraws once the step is visible,
    // and forgetting the rendered width is what makes that redraw happen.
    if (measuredWidth === 0) {
      if (isStale) {
        this.renderedWidth = 0;
      }
      return;
    }

    if (!isStale && Math.abs(measuredWidth - this.renderedWidth) <= WIDTH_TOLERANCE_PX) {
      return;
    }

    createHistogram(data, container, { ...config });
    this.renderedData = data;
    this.renderedConfigKey = configKey;
    this.renderedWidth = measuredWidth;
  }

  private chartContainer(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector('#histogram-chart');
  }

  private describeConfig(config: HistogramChartConfig): string {
    return [config.color, config.orientation].join('|');
  }
}
