import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import { observeSize } from '../../../../../core/observe-resize.util';
import {
  CollapsibleTreeRenderer,
  createCollapsibleTree,
} from './collapsible-tree-renderer';

const EMPTY_TREE: D3HierarchyNode = {
  label: 'Data model',
  code: 'data-model',
  children: [],
};

@Component({
  selector: 'app-collapsible-tree-browser',
  templateUrl: './collapsible-tree-browser.component.html',
  styleUrl: './collapsible-tree-browser.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollapsibleTreeBrowserComponent implements AfterViewInit, OnDestroy {
  readonly data = input<D3HierarchyNode | null>(null);
  readonly highlightNode = input<D3HierarchyNode | null>(null);
  readonly selectedVariables = input<D3HierarchyNode[]>([]);
  readonly selectedNodeChange = output<D3HierarchyNode>();
  readonly nodeDoubleClicked = output<D3HierarchyNode>();

  readonly chartCanvas = viewChild<ElementRef<HTMLElement>>('chartCanvas');
  readonly error = signal<string | null>(null);

  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private renderer: CollapsibleTreeRenderer | null = null;
  private stopObservingSize: (() => void) | undefined;
  private viewReady = false;
  private lastDataRef: D3HierarchyNode | null = null;
  private skipNextHighlightExpand = false;
  /** Size the drawing in the DOM was measured at; zero while its step is hidden. */
  private renderedSize = { width: 0, height: 0 };

  constructor() {
    effect(() => {
      const data = this.data();
      if (!this.viewReady) return;
      if (data !== this.lastDataRef) {
        this.render();
      }
    });

    effect(() => {
      const highlightNode = this.highlightNode();
      const renderer = this.renderer;
      if (!renderer) return;
      renderer.refreshSelection({
        selectedVariables: this.selectedVariables(),
        highlightNode,
      });
      if (highlightNode) {
        if (this.skipNextHighlightExpand) {
          this.skipNextHighlightExpand = false;
          return;
        }
        renderer.expandToNode(highlightNode);
      }
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
    const canvas = this.chartCanvas()?.nativeElement;
    if (!canvas) return;

    this.stopObservingSize = observeSize(canvas, this.ngZone, 120, (width, height) => {
      // Zero size is the step being hidden - never a size worth drawing for.
      if (width === 0 || height === 0) return;
      // Compared against the last actual draw, so a tree built while the step was
      // hidden is re-laid-out when the step comes back.
      if (width === this.renderedSize.width && height === this.renderedSize.height) return;

      this.renderer?.resize();
      this.rememberRenderedSize();
    });
  }

  ngOnDestroy(): void {
    this.renderer?.destroy();
    this.stopObservingSize?.();
  }

  /** Records the box the drawing that follows was measured against. */
  private rememberRenderedSize(): void {
    const rect = this.chartCanvas()?.nativeElement?.getBoundingClientRect();
    this.renderedSize = rect
      ? { width: Math.floor(rect.width), height: Math.floor(rect.height) }
      : { width: 0, height: 0 };
  }

  private render(): void {
    const canvas = this.chartCanvas()?.nativeElement;
    if (!canvas) return;

    const data = this.data() ?? EMPTY_TREE;
    this.lastDataRef = data;
    this.renderer?.destroy();
    this.renderer = null;

    if (!data.children?.length) {
      this.error.set('No metadata available for visualization.');
      this.cdr.markForCheck();
      return;
    }

    this.error.set(null);
    this.rememberRenderedSize();
    this.renderer = createCollapsibleTree(data, canvas, {
      selectedVariables: this.selectedVariables(),
      highlightNode: this.highlightNode(),
      onNodeClick: (node) => {
        // This selection originates from the renderer itself; avoid immediately
        // replaying expandToNode through the highlight effect.
        this.skipNextHighlightExpand = true;
        this.selectedNodeChange.emit(node);
        this.cdr.markForCheck();
      },
      onNodeDoubleClick: (node) => {
        this.nodeDoubleClicked.emit(node);
        this.cdr.markForCheck();
      },
    });
    this.cdr.markForCheck();
  }
}
