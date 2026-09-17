import { Component, ElementRef, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistogramChartConfig, HistogramComponent } from './histogram.component';

type ChartData = { bins: string[]; counts: number[]; variableName: string };

const OVERALL: ChartData = {
  bins: ['0-1', '1-2', '2-3', '3-4', '4-5'],
  counts: [12, 30, 22, 5, 1],
  variableName: 'Age',
};
const SWAPPED: ChartData = { bins: ['a', 'b', 'c'], counts: [4, 8, 2], variableName: 'Sex' };
const VERTICAL: HistogramChartConfig = { color: '#2b33e9', orientation: 'vertical' };

/** Long enough for afterNextRender plus the 150ms resize debounce. */
const RENDER_MS = 200;
const RESIZE_MS = 300;

@Component({
  selector: 'app-histogram-spec-host',
  standalone: true,
  imports: [HistogramComponent],
  template: `<div #wrapper><app-histogram [data]="data()" [config]="config()" /></div>`,
  styles: ['app-histogram { display: block; }'],
})
class HistogramSpecHostComponent {
  readonly wrapper = viewChild.required<ElementRef<HTMLDivElement>>('wrapper');
  readonly data = signal<ChartData | null>(null);
  readonly config = signal<HistogramChartConfig>({});
}

describe('HistogramComponent', () => {
  let fixture: ComponentFixture<HistogramSpecHostComponent>;
  let host: HistogramSpecHostComponent;
  let wrapper: HTMLDivElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HistogramSpecHostComponent],
      providers: [provideZonelessChangeDetection()],
    });

    fixture = TestBed.createComponent(HistogramSpecHostComponent);
    host = fixture.componentInstance;
    wrapper = host.wrapper().nativeElement;
    wrapper.style.width = '480px';
  });

  afterEach(() => {
    fixture.destroy();
  });

  async function settle(waitMs: number): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  function chart(): HTMLElement {
    return wrapper.querySelector('#histogram-chart') as HTMLElement;
  }

  function svg(): SVGElement | null {
    return chart()?.querySelector('svg');
  }

  function drawnHeight(): number {
    return parseFloat(chart().style.height || '0');
  }

  function bars(): number {
    return chart().querySelectorAll('.bar').length;
  }

  it('draws the chart from the width its container actually has', async () => {
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    expect(svg()).withContext('chart drawn').not.toBeNull();
    expect(bars()).toBe(OVERALL.bins.length);
    expect(drawnHeight()).toBeGreaterThan(150);
  });

  it('does not draw a collapsed chart while its step is hidden', async () => {
    wrapper.style.display = 'none';
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    expect(svg()).withContext('nothing measured, nothing drawn').toBeNull();
  });

  it('draws as soon as the hidden step becomes visible again', async () => {
    wrapper.style.display = 'none';
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);
    expect(svg()).toBeNull();

    wrapper.style.display = '';
    await settle(RESIZE_MS);

    expect(svg()).withContext('redrawn on reveal').not.toBeNull();
    expect(bars()).toBe(OVERALL.bins.length);
    expect(drawnHeight()).toBeGreaterThan(150);
  });

  it('keeps the drawing when an equal config object arrives again', async () => {
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    const first = svg();
    expect(first).not.toBeNull();
    first!.setAttribute('data-probe', 'first');

    // A fresh object with the same values, exactly as an inline template literal does.
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    expect(chart().querySelectorAll('svg').length).toBe(1);
    expect(svg()!.getAttribute('data-probe')).toBe('first');
  });

  it('redraws when the container is resized', async () => {
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);

    const widthBefore = Number(svg()!.getAttribute('width'));
    wrapper.style.width = '300px';
    await settle(RESIZE_MS);

    const widthAfter = Number(svg()!.getAttribute('width'));
    expect(widthAfter).toBeGreaterThan(0);
    expect(widthAfter).toBeLessThan(widthBefore);
  });

  it('draws data that arrived while the step was hidden once it is back', async () => {
    host.data.set(OVERALL);
    host.config.set({ ...VERTICAL });
    await settle(RENDER_MS);
    expect(bars()).toBe(OVERALL.bins.length);

    wrapper.style.display = 'none';
    host.data.set(SWAPPED);
    await settle(RENDER_MS);

    wrapper.style.display = '';
    await settle(RESIZE_MS);

    expect(bars()).toBe(SWAPPED.bins.length);
  });
});
