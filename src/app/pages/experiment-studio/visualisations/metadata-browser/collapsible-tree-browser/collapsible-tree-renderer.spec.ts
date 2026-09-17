import * as d3 from 'd3';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';
import {
  cloneNode,
  createCollapsibleTree,
  findHierarchyNode,
  findHierarchyNodeByPath,
  focalPointForExpandedGroup,
  initializeCollapse,
} from './collapsible-tree-renderer';

describe('collapsible tree renderer helpers', () => {
  const model: D3HierarchyNode = {
    label: 'Stroke 3.7',
    code: 'stroke',
    children: [
      {
        label: 'Vitals',
        code: 'vitals',
        children: [
          {
            label: 'Metabolic',
            code: 'metabolic',
            children: [
              {
                label: 'Glucose',
                code: 'glucose',
                type: 'real',
              },
            ],
          },
        ],
      },
    ],
  };

  it('clones input hierarchy without sharing children arrays', () => {
    const cloned = cloneNode(model);

    expect(cloned).not.toBe(model);
    expect(cloned.children).not.toBe(model.children);
    expect(cloned.children?.[0]).not.toBe(model.children?.[0]);
  });

  it('keeps root and first level open while collapsing deeper branches', () => {
    const root = d3.hierarchy(cloneNode(model), (node) => node.children) as any;

    initializeCollapse(root);

    expect(root.children?.length).toBe(1);
    expect(root.children[0].children?.length).toBe(1);
    expect(root.children[0].children[0].children).toBeUndefined();
    expect(root.children[0].children[0]._children?.length).toBe(1);
  });

  it('finds nodes inside collapsed branches for external highlighting', () => {
    const root = d3.hierarchy(cloneNode(model), (node) => node.children) as any;
    initializeCollapse(root);

    const target = findHierarchyNode(root, { label: 'Glucose', code: 'glucose', type: 'real' });

    expect(target?.data.label).toBe('Glucose');
  });

  it('finds duplicate group labels by full path instead of the first code match', () => {
    const duplicateModel: typeof model = {
      label: 'Stroke 3.7',
      code: 'stroke',
      children: [
        {
          label: 'Vitals',
          code: 'vitals',
          children: [
            {
              label: 'Arterial',
              code: 'arterial',
              children: [{ label: 'MAP', code: 'map', type: 'real' }],
            },
          ],
        },
        {
          label: 'Other',
          code: 'other',
          children: [
            {
              label: 'Arterial',
              code: 'arterial',
              children: [{ label: 'DBP', code: 'dbp', type: 'real' }],
            },
          ],
        },
      ],
    };
    const root = d3.hierarchy(cloneNode(duplicateModel), (node) => node.children) as any;
    initializeCollapse(root);

    const target = findHierarchyNodeByPath(root, 'Stroke 3.7 > Other > Arterial');

    expect(target?.data.label).toBe('Arterial');
    expect(target?.parent?.data.label).toBe('Other');
  });

  it('schedules auto-fit when opening without a highlighted node', () => {
    const container = createContainer();
    const onAutoFitScheduled = jasmine.createSpy('onAutoFitScheduled');
    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onAutoFitScheduled,
    });

    expect(onAutoFitScheduled).toHaveBeenCalled();
    renderer.destroy();
    container.remove();
  });

  it('centers a highlighted group instead of scheduling initial auto-fit', () => {
    const group = model.children![0];
    const container = createContainer();
    const onAutoFitScheduled = jasmine.createSpy('onAutoFitScheduled');
    const onNodeCentered = jasmine.createSpy('onNodeCentered');

    const renderer = createCollapsibleTree(model, container, {
      highlightNode: group,
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onAutoFitScheduled,
      onNodeCentered,
    });

    expect(onAutoFitScheduled).not.toHaveBeenCalled();
    expect(onNodeCentered).toHaveBeenCalledWith(group);
    renderer.destroy();
    container.remove();
  });

  it('cancels pending auto-fit when expanding to a selected node', () => {
    const container = createContainer();
    const onAutoFitCanceled = jasmine.createSpy('onAutoFitCanceled');
    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onAutoFitCanceled,
    });

    renderer.expandToNode(model.children![0]);

    expect(onAutoFitCanceled).toHaveBeenCalled();
    renderer.destroy();
    container.remove();
  });

  it('targets expanded group content instead of the group node position', () => {
    const root = d3.hierarchy(cloneNode(model), (node) => node.children) as any;
    const group = root.children![0];
    group.x = 80;
    group.y = 120;
    const child = group.children![0];
    child.x = 140;
    child.y = 380;
    const grandchild = child.children![0];
    grandchild.x = 200;
    grandchild.y = 380;

    const focal = focalPointForExpandedGroup(group);

    expect(focal.x).toBe(170);
    expect(focal.y).toBe(380);
    expect(focal.y).not.toBe(group.y);
  });

  it('resizes the svg in place without rebuilding the tree', () => {
    const rect = { width: 900, height: 600 };
    const container = document.createElement('div');
    spyOn(container, 'getBoundingClientRect').and.callFake(() => ({
      ...rect,
      x: 0,
      y: 0,
      top: 0,
      right: rect.width,
      bottom: rect.height,
      left: 0,
      toJSON: () => undefined,
    } as DOMRect));
    document.body.appendChild(container);

    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
    });

    const svg = container.querySelector('svg.collapsible-tree-svg') as SVGElement;
    const firstNodes = Array.from(container.querySelectorAll('g.collapsible-node'));
    expect(svg.getAttribute('width')).toBe('900');
    expect(firstNodes.length).toBeGreaterThan(0);

    rect.width = 1200;
    rect.height = 800;
    renderer.resize();

    expect(svg.getAttribute('width')).toBe('1200');
    expect(svg.getAttribute('height')).toBe('800');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1200 800');
    const resizedNodes = Array.from(container.querySelectorAll('g.collapsible-node'));
    expect(resizedNodes.length).toBe(firstNodes.length);
    expect(resizedNodes[0]).toBe(firstNodes[0]);
    renderer.destroy();
    container.remove();
  });

  it('cancels pending auto-fit when destroyed before the next animation frame', () => {
    const container = createContainer();
    const onAutoFitCanceled = jasmine.createSpy('onAutoFitCanceled');
    const renderer = createCollapsibleTree(model, container, {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onAutoFitCanceled,
    });

    renderer.destroy();

    expect(onAutoFitCanceled).toHaveBeenCalled();
    container.remove();
  });
});

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  spyOn(container, 'getBoundingClientRect').and.returnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 900,
    bottom: 600,
    left: 0,
    width: 900,
    height: 600,
    toJSON: () => undefined,
  } as DOMRect);
  document.body.appendChild(container);
  return container;
}
