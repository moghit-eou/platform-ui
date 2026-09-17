import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { CollapsibleTreeBrowserComponent } from './collapsible-tree-browser.component';

describe('CollapsibleTreeBrowserComponent', () => {
  const model: D3HierarchyNode = {
    label: 'Stroke 3.7',
    code: 'stroke',
    children: [
      {
        label: 'Demographics',
        code: 'demographics',
        children: [
          {
            label: 'Sex',
            code: 'sex',
            description: 'Patient sex',
            type: 'nominal',
          },
        ],
      },
      {
        label: 'Age',
        code: 'age',
        description: 'Patient age',
        type: 'real',
        units: 'years',
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CollapsibleTreeBrowserComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('emits the original node when selecting a visible variable', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    const component = fixture.componentInstance;
    const age = model.children![1];
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();
    spyOn(component.selectedNodeChange, 'emit');

    const variableNode = findRenderedNode(fixture.nativeElement, 'Age');
    variableNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(component.selectedNodeChange.emit).toHaveBeenCalledWith(age);
  });

  it('double-click emits the original variable for the add action', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    const component = fixture.componentInstance;
    const age = model.children![1];
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();
    spyOn(component.nodeDoubleClicked, 'emit');

    const variableNode = findRenderedNode(fixture.nativeElement, 'Age');
    variableNode.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(component.nodeDoubleClicked.emit).toHaveBeenCalledWith(age);
  });

  it('expands a highlighted variable inside a collapsed branch', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    fixture.componentRef.setInput('data', model);
    fixture.componentRef.setInput('highlightNode', model.children?.[0].children?.[0]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sex');
  });

  it('keeps an externally highlighted group selected on initial render', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    const group = model.children![0];
    fixture.componentRef.setInput('data', model);
    fixture.componentRef.setInput('highlightNode', group);
    fixture.detectChanges();

    const highlightedNode = fixture.nativeElement.querySelector('g.collapsible-node.highlighted');
    expect(highlightedNode?.textContent).toContain('Demographics');
  });

  it('skips rebuilds for unchanged observer sizes and refits on real resizes', async () => {
    type CaptureCallback = (entries: ResizeObserverEntry[]) => void;
    let observerCallback: CaptureCallback | undefined;
    const globals = globalThis as Record<string, unknown>;
    const previousObserver = globals['ResizeObserver'];
    globals['ResizeObserver'] = class {
      constructor(callback: CaptureCallback) {
        observerCallback = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    const restoreObserver = (): void => {
      if (previousObserver === undefined) {
        delete globals['ResizeObserver'];
      } else {
        globals['ResizeObserver'] = previousObserver;
      }
    };

    try {
      const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
      const component = fixture.componentInstance;
      fixture.componentRef.setInput('data', model);
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg.collapsible-tree-svg');
      expect(svg).toBeTruthy();
      const renderer = (component as any).renderer;
      spyOn(renderer, 'resize');
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // The component compares each observer size against the box it actually drew
      // into, so the fake observer and the measured box have to agree.
      const canvas = fixture.nativeElement.querySelector('.chart-canvas') as HTMLElement;
      let measuredBox = { width: 0, height: 0 };
      spyOn(canvas, 'getBoundingClientRect').and.callFake(() => ({
        width: measuredBox.width,
        height: measuredBox.height,
        top: 0,
        left: 0,
        right: measuredBox.width,
        bottom: measuredBox.height,
        x: 0,
        y: 0,
      }) as DOMRect);

      // Same as the initial (zero) snapshot: no work scheduled.
      observerCallback!([{ contentRect: { width: 0, height: 0 } }] as unknown as ResizeObserverEntry[]);
      await wait(200);
      expect(renderer.resize).not.toHaveBeenCalled();

      // Real size change - the step coming back into view after a hidden draw:
      // debounced refit, not a rebuild.
      measuredBox = { width: 800, height: 600 };
      observerCallback!([{ contentRect: { width: 800, height: 600 } }] as unknown as ResizeObserverEntry[]);
      await wait(200);
      expect(renderer.resize).toHaveBeenCalledTimes(1);

      // Unchanged size afterwards: ignored.
      observerCallback!([{ contentRect: { width: 800, height: 600 } }] as unknown as ResizeObserverEntry[]);
      await wait(200);
      expect(renderer.resize).toHaveBeenCalledTimes(1);

      expect(fixture.nativeElement.querySelector('svg.collapsible-tree-svg')).toBe(svg);
    } finally {
      restoreObserver();
    }
  });

  it('renders mixed nodes with child groups and direct variables', () => {
    const fixture = TestBed.createComponent(CollapsibleTreeBrowserComponent);
    fixture.componentRef.setInput('data', model);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Demographics');
    expect(fixture.nativeElement.textContent).toContain('Age');
  });
});

function findRenderedNode(host: HTMLElement, label: string): SVGGElement {
  const nodes = Array.from(host.querySelectorAll<SVGGElement>('g.collapsible-node'));
  const node = nodes.find((item) => item.textContent?.includes(label));
  expect(node).withContext(`Expected rendered node for ${label}`).toBeDefined();
  return node!;
}
