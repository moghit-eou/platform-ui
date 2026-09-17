import * as d3 from 'd3';
import { D3HierarchyNode } from '../../../../../models/data-model.interface';

interface CollapsibleTreeSelectionOptions {
  selectedVariables?: D3HierarchyNode[];
  highlightNode?: D3HierarchyNode | null;
}

export interface CollapsibleTreeRenderer {
  expandToNode: (node: D3HierarchyNode) => void;
  refreshSelection: (options?: CollapsibleTreeSelectionOptions) => void;
  fitView: () => void;
  resize: () => void;
  destroy: () => void;
}

interface CollapsibleTreeOptions extends CollapsibleTreeSelectionOptions {
  onNodeClick: (node: D3HierarchyNode) => void;
  onNodeDoubleClick: (node: D3HierarchyNode) => void;
  onAutoFitScheduled?: () => void;
  onAutoFitCanceled?: () => void;
  onNodeCentered?: (node: D3HierarchyNode) => void;
}

interface RenderNode extends D3HierarchyNode {
  _children?: RenderNode[];
  children?: RenderNode[];
}

type TreeDatum = d3.HierarchyPointNode<RenderNode> & {
  x0?: number;
  y0?: number;
  _children?: Array<d3.HierarchyPointNode<RenderNode>>;
};

const nodeWidth = 220;
const nodeHeight = 34;
const levelWidth = 260;
const rowGap = 22;
const margin = { top: 40, right: 260, bottom: 40, left: 46 };

export function createCollapsibleTree(
  data: D3HierarchyNode,
  container: HTMLElement,
  options: CollapsibleTreeOptions
): CollapsibleTreeRenderer {
  container.innerHTML = '';

  const root = d3.hierarchy<RenderNode>(data as RenderNode, (node) => node.children) as TreeDatum;
  root.x0 = 0;
  root.y0 = 0;
  initializeCollapse(root);

  let selectedVariables = toCodeSet(options.selectedVariables);
  let highlightedCode = codeOf(options.highlightNode);
  let highlightedPath = pathOf(options.highlightNode);
  let bounds = measureContainer(container);
  let treeSize = { width: bounds.width, height: bounds.height };
  let pendingAutoFitFrame: number | null = null;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('class', 'collapsible-tree-svg')
    .attr('role', 'img')
    .attr('aria-label', 'Collapsible metadata tree')
    .attr('width', bounds.width)
    .attr('height', bounds.height)
    .attr('viewBox', `0 0 ${bounds.width} ${bounds.height}`);

  const zoomLayer = svg.append('g').attr('class', 'collapsible-tree-layer');
  const linkLayer = zoomLayer.append('g').attr('class', 'collapsible-links');
  const nodeLayer = zoomLayer.append('g').attr('class', 'collapsible-nodes');

  const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'collapsible-tree-tooltip')
    .style('opacity', 0);

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.35, 2.2])
    .on('zoom', (event) => {
      zoomLayer.attr('transform', event.transform.toString());
    });

  svg.call(zoom);

  const tree = d3.tree<RenderNode>().nodeSize([nodeHeight + rowGap, levelWidth]);
  let duration = 240;

  const update = (source: TreeDatum): void => {
    bounds = measureContainer(container);
    svg
      .attr('width', bounds.width)
      .attr('height', bounds.height)
      .attr('viewBox', `0 0 ${bounds.width} ${bounds.height}`);

    const layoutRoot = tree(root);
    const nodes = layoutRoot.descendants() as TreeDatum[];
    const links = layoutRoot.links();

    const minX = d3.min(nodes, (node) => node.x) ?? 0;
    const maxX = d3.max(nodes, (node) => node.x) ?? 0;
    const maxY = d3.max(nodes, (node) => node.y) ?? 0;
    treeSize = {
      width: maxY + margin.left + margin.right,
      height: maxX - minX + margin.top + margin.bottom,
    };

    nodes.forEach((node) => {
      node.y = node.depth * levelWidth + margin.left;
      node.x = node.x - minX + margin.top;
    });

    const nodeSelection = nodeLayer
      .selectAll<SVGGElement, TreeDatum>('g.collapsible-node')
      .data(nodes, (node) => stableKey(node.data));

    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'collapsible-node')
      .attr('transform', `translate(${source.y0 ?? margin.left},${source.x0 ?? margin.top})`)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (node) => ariaLabel(node))
      .on('click', (event, node) => {
        event.stopPropagation();
        handleNodeClick(node);
      })
      .on('dblclick', (event, node) => {
        event.stopPropagation();
        if (isVariable(node)) {
          options.onNodeDoubleClick(node.data);
        }
      })
      .on('keydown', (event, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleNodeClick(node);
        }
      })
      .on('mouseenter', (event, node) => showTooltip(event, node))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', hideTooltip);

    nodeEnter.append('rect')
      .attr('class', 'node-card')
      .attr('x', -nodeWidth / 2)
      .attr('y', -nodeHeight / 2)
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('rx', 7);

    nodeEnter.append('circle')
      .attr('class', 'node-anchor')
      .attr('cx', -nodeWidth / 2 + 13)
      .attr('r', 4.5);

    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('x', -nodeWidth / 2 + 26)
      .attr('y', -2)
      .text((node) => truncateLabel(node.data.label));

    nodeEnter.append('text')
      .attr('class', 'node-meta')
      .attr('x', -nodeWidth / 2 + 26)
      .attr('y', 12)
      .text((node) => nodeMeta(node));

    nodeEnter.append('text')
      .attr('class', 'node-chevron')
      .attr('x', nodeWidth / 2 - 16)
      .attr('y', 4)
      .text((node) => chevron(node));

    const nodeMerge = nodeEnter.merge(nodeSelection);

    nodeMerge
      .attr('class', (node) => nodeClass(node))
      .attr('aria-expanded', (node) => hasChildren(node) ? String(!!node.children) : null)
      .transition()
      .duration(duration)
      .attr('transform', (node) => `translate(${node.y},${node.x})`);

    nodeMerge.select<SVGTextElement>('text.node-meta').text((node) => nodeMeta(node));
    nodeMerge.select<SVGTextElement>('text.node-chevron').text((node) => chevron(node));

    nodeSelection.exit()
      .transition()
      .duration(duration)
      .attr('transform', `translate(${source.y},${source.x})`)
      .style('opacity', 0)
      .remove();

    const linkSelection = linkLayer
      .selectAll<SVGPathElement, d3.HierarchyPointLink<RenderNode>>('path.tree-link')
      .data(links, (link) => stableKey(link.target.data));

    linkSelection.enter()
      .append('path')
      .attr('class', 'tree-link')
      .attr('d', () => diagonal({ source, target: source } as d3.HierarchyPointLink<RenderNode>))
      .merge(linkSelection)
      .transition()
      .duration(duration)
      .attr('d', diagonal);

    linkSelection.exit()
      .transition()
      .duration(duration)
      .attr('d', () => diagonal({ source, target: source } as d3.HierarchyPointLink<RenderNode>))
      .remove();

    nodes.forEach((node) => {
      node.x0 = node.x;
      node.y0 = node.y;
    });
  };

  const handleNodeClick = (node: TreeDatum): void => {
    let shouldCenterAfterUpdate = false;
    let didExpand = false;
    if (!isVariable(node) && hasChildren(node)) {
      if (node.children) {
        node._children = node.children;
        node.children = undefined;
      } else if (node._children) {
        node.children = node._children;
        node._children = undefined;
        didExpand = true;
      }
      update(node);
      shouldCenterAfterUpdate = true;
    }
    refreshNodeClasses();
    options.onNodeClick(node.data);
    if (shouldCenterAfterUpdate) {
      window.setTimeout(() => {
        if (didExpand) {
          centerExpandedContent(node);
        } else {
          centerNode(node);
        }
      }, duration + 20);
    } else {
      centerNode(node);
    }
  };

  const refreshNodeClasses = (): void => {
    nodeLayer
      .selectAll<SVGGElement, TreeDatum>('g.collapsible-node')
      .attr('class', (node) => nodeClass(node));
  };

  const fitView = (): void => {
    const scale = Math.min(
      1.15,
      Math.max(0.35, Math.min(bounds.width / Math.max(treeSize.width, 1), bounds.height / Math.max(treeSize.height, 1)) * 0.92)
    );
    const translateX = Math.max(18, (bounds.width - treeSize.width * scale) / 2);
    const translateY = Math.max(18, (bounds.height - treeSize.height * scale) / 2);
    svg
      .transition()
      .duration(duration)
      .call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
  };

  const cancelPendingAutoFit = (): void => {
    if (pendingAutoFitFrame === null) return;
    cancelAnimationFrame(pendingAutoFitFrame);
    pendingAutoFitFrame = null;
    options.onAutoFitCanceled?.();
  };

  const scheduleAutoFit = (): void => {
    cancelPendingAutoFit();
    pendingAutoFitFrame = requestAnimationFrame(() => {
      pendingAutoFitFrame = null;
      fitView();
    });
    options.onAutoFitScheduled?.();
  };

  const expandToNode = (node: D3HierarchyNode): void => {
    cancelPendingAutoFit();
    const target = findHierarchyNode(root, node);
    if (!target) return;
    target.ancestors().reverse().forEach((ancestor) => {
      const treeNode = ancestor as TreeDatum;
      if (treeNode._children) {
        treeNode.children = treeNode._children;
        treeNode._children = undefined;
      }
    });
    highlightedCode = codeOf(node);
    highlightedPath = hierarchyPath(target);
    update(target as TreeDatum);
    centerNode(target as TreeDatum);
  };

  const centerOnPoint = (treeX: number, treeY: number, centeredNode?: D3HierarchyNode): void => {
    const scale = 0.9;
    const x = bounds.width / 2 - treeY * scale;
    const y = bounds.height / 2 - treeX * scale;
    svg
      .transition()
      .duration(duration)
      .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    if (centeredNode) {
      options.onNodeCentered?.(centeredNode);
    }
  };

  const centerNode = (node: TreeDatum): void => {
    centerOnPoint(node.x ?? 0, node.y ?? 0, node.data);
  };

  const centerExpandedContent = (node: TreeDatum): void => {
    const focal = focalPointForExpandedGroup(node);
    centerOnPoint(focal.x, focal.y, node.data);
  };

  const refreshSelection = (selectionOptions?: CollapsibleTreeSelectionOptions): void => {
    selectedVariables = toCodeSet(selectionOptions?.selectedVariables);
    const highlight = selectionOptions?.highlightNode ?? null;
    highlightedCode = codeOf(highlight);
    highlightedPath = pathOf(highlight);
    refreshNodeClasses();
  };

  const resize = (): void => {
    bounds = measureContainer(container);
    svg
      .attr('width', bounds.width)
      .attr('height', bounds.height)
      .attr('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    fitView();
  };

  update(root);
  if (options.highlightNode && findHierarchyNode(root, options.highlightNode)) {
    expandToNode(options.highlightNode);
  } else {
    scheduleAutoFit();
  }

  return {
    expandToNode,
    refreshSelection,
    fitView,
    resize,
    destroy: () => {
      cancelPendingAutoFit();
      tooltip.remove();
      svg.on('.zoom', null);
      container.innerHTML = '';
    },
  };

  function nodeClass(node: TreeDatum): string {
    const classes = ['collapsible-node'];
    classes.push(isVariable(node) ? 'variable-node' : 'group-node');
    if (node.children) classes.push('expanded');
    if (!node.children && node._children) classes.push('collapsed');
    const code = codeOf(node.data);
    const nodePath = hierarchyPath(node);
    if (highlightedPath && nodePath === highlightedPath) {
      classes.push('highlighted');
    } else if (!highlightedPath && code && code === highlightedCode) {
      classes.push('highlighted');
    }
    if (code && selectedVariables.has(code)) classes.push('selected-variable');
    return classes.join(' ');
  }
}

export function cloneNode(node: D3HierarchyNode): RenderNode {
  return {
    ...node,
    children: node.children?.map((child) => cloneNode(child)),
  };
}

export function focalPointForExpandedGroup(node: TreeDatum): { x: number; y: number } {
  const descendants = node.descendants().filter((descendant) => descendant !== node);
  if (!descendants.length) {
    return { x: node.x ?? 0, y: node.y ?? 0 };
  }

  const xs = descendants.map((descendant) => descendant.x ?? 0);
  const ys = descendants.map((descendant) => descendant.y ?? 0);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

export function initializeCollapse(root: TreeDatum): void {
  root.descendants().forEach((node) => {
    if (node.depth > 1 && node.children) {
      node._children = node.children as TreeDatum[];
      node.children = undefined;
    }
  });
}

export function findHierarchyNode(root: TreeDatum, target: D3HierarchyNode): TreeDatum | null {
  const nodes = collectTreeNodes(root);
  const byReference = nodes.find((node) => node.data === target);
  if (byReference) {
    return byReference;
  }

  const targetPath = pathOf(target);
  if (targetPath) {
    const byPath = findHierarchyNodeByPath(root, targetPath);
    if (byPath) {
      return byPath;
    }
  }

  const targetCode = codeOf(target);
  const targetLabel = normalizeString(target.label);
  const matches = nodes.filter((node) => {
    const nodeCode = codeOf(node.data);
    if (targetCode && nodeCode === targetCode) return true;
    return !!targetLabel && normalizeString(node.data.label) === targetLabel;
  });

  return matches.length === 1 ? matches[0] : null;
}

export function findHierarchyNodeByPath(root: TreeDatum, path: string): TreeDatum | null {
  const segments = path
    .split('>')
    .map((segment) => normalizeString(segment))
    .filter(Boolean);
  if (!segments.length) {
    return null;
  }

  if (normalizeString(root.data.label) !== segments[0]) {
    return null;
  }

  let current: TreeDatum = root;
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    const children = [...(current.children ?? []), ...(current._children ?? [])] as TreeDatum[];
    const next = children.find((child) => normalizeString(child.data.label) === segment);
    if (!next) {
      return null;
    }
    current = next;
  }

  return current;
}

function hierarchyPath(node: TreeDatum): string {
  return node
    .ancestors()
    .reverse()
    .map((ancestor) => normalizeString(ancestor.data.label))
    .filter(Boolean)
    .join(' > ');
}

function pathOf(node: D3HierarchyNode | null | undefined): string {
  return normalizeString((node as D3HierarchyNode & { path?: string } | null | undefined)?.path);
}

function collectTreeNodes(root: TreeDatum): TreeDatum[] {
  const nodes: TreeDatum[] = [];
  const visit = (node: TreeDatum): void => {
    nodes.push(node);
    ([...(node.children ?? []), ...(node._children ?? [])] as TreeDatum[]).forEach(visit);
  };
  visit(root);
  return nodes;
}

function diagonal(link: d3.HierarchyPointLink<RenderNode>): string {
  const source = link.source as TreeDatum;
  const target = link.target as TreeDatum;
  const midY = (source.y + target.y) / 2;
  return `M${source.y},${source.x}C${midY},${source.x} ${midY},${target.x} ${target.y},${target.x}`;
}

function isVariable(node: TreeDatum): boolean {
  return !hasChildren(node) && !!node.data.type;
}

function hasChildren(node: TreeDatum): boolean {
  return !!node.children?.length || !!node._children?.length;
}

function nodeMeta(node: TreeDatum): string {
  if (isVariable(node)) {
    const type = normalizeString(node.data.type);
    return type || 'Variable';
  }
  const variableCount = countVariables(node);
  const childCount = (node.children?.length ?? 0) + (node._children?.length ?? 0);
  return `${childCount} groups/items · ${variableCount} variables`;
}

function countVariables(node: TreeDatum): number {
  const children = [...(node.children ?? []), ...(node._children ?? [])] as TreeDatum[];
  if (!children.length) return isVariable(node) ? 1 : 0;
  return children.reduce((sum, child) => sum + countVariables(child), 0);
}

function chevron(node: TreeDatum): string {
  if (isVariable(node)) return '';
  if (node.children?.length) return '−';
  if (node._children?.length) return '+';
  return '';
}

function stableKey(node: RenderNode): string {
  return `${normalizeString(node.code)}:${normalizeString(node.label)}:${normalizeString(node.type)}`;
}

function ariaLabel(node: TreeDatum): string {
  return `${isVariable(node) ? 'Variable' : 'Group'} ${node.data.label ?? ''}`;
}

function truncateLabel(value: unknown): string {
  const label = normalizeString(value) || 'Untitled';
  return label.length > 31 ? `${label.slice(0, 28)}...` : label;
}

function showTooltip(event: MouseEvent, node: TreeDatum): void {
  const label = normalizeString(node.data.label) || 'Untitled';
  const type = normalizeString(node.data.type);
  const description = normalizeString(node.data.description);
  const tooltip = d3.select('.collapsible-tree-tooltip');

  const appendRow = (name: string, value: string): void => {
    const row = tooltip.append('span');
    row.append('b').text(name);
    row.append('span').text(' ' + value);
  };

  tooltip.selectAll('*').remove();
  tooltip.append('strong').text(label);
  if (type) appendRow('Type:', type);
  if (description) appendRow('Description:', description);
  tooltip
    .style('left', `${event.clientX + 12}px`)
    .style('top', `${event.clientY + 12}px`)
    .transition()
    .duration(120)
    .style('opacity', 1);
}

function moveTooltip(event: MouseEvent): void {
  d3.select('.collapsible-tree-tooltip')
    .style('left', `${event.clientX + 12}px`)
    .style('top', `${event.clientY + 12}px`);
}

function hideTooltip(): void {
  d3.select('.collapsible-tree-tooltip')
    .transition()
    .duration(120)
    .style('opacity', 0);
}

function measureContainer(container: HTMLElement): { width: number; height: number } {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(640, Math.floor(rect.width || 0)),
    height: Math.max(500, Math.floor(rect.height || 0)),
  };
}

function toCodeSet(nodes: D3HierarchyNode[] | null | undefined): Set<string> {
  return new Set((nodes ?? []).map((node) => codeOf(node)).filter((code): code is string => !!code));
}

function codeOf(node: D3HierarchyNode | null | undefined): string {
  return normalizeString(node?.code);
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}
