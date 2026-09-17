import * as d3 from 'd3';

// helpers
// Splits labels


// Creates label + background rect
function createLabelGroup(group: d3.Selection<SVGGElement, any, any, any>, d: any) {
  group.selectAll('*').remove();

  const label = d.data.label || '';
  const maxCharsPerLine = 20;

  // Split label into lines
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let currentLine: string[] = [];

  words.forEach((word: string) => {
    const potentialLine = [...currentLine, word].join(' ');
    if (potentialLine.length <= maxCharsPerLine) {
      currentLine.push(word);
    } else {
      if (currentLine.length > 0) lines.push(currentLine.join(' '));
      currentLine = [word];
    }
  });
  if (currentLine.length > 0) lines.push(currentLine.join(' '));

  const fontSize = d.children ? 15 : 10;
  const hangFromTop = !!d.children;

  const textNode = group
    .append('text')
    .attr('class', 'label')
    .attr('text-anchor', 'middle')
    .style('font-size', `${fontSize}px`)
    .style('font-weight', '600')
    .style('fill', '#0f172a')
    .style('paint-order', 'stroke')
    .style('stroke', 'rgba(255,255,255,0.9)')
    .style('stroke-width', 2)
    .style('stroke-linejoin', 'round');

  // Add tspans
  lines.forEach((lineStr, i) => {
    const firstDy = hangFromTop
      ? '1em'
      : (lines.length === 1 ? '0.35em' : `-${(lines.length - 1) * 0.6}em`);
    textNode.append('tspan')
      .attr('x', 0)
      .attr('dy', i === 0 ? firstDy : '1.2em')
      .text(lineStr);
  });

  if (!d.children) return;
}

// Get code/id from nodes
const codeOf = (x: any): string | undefined =>
  x?.code ?? x?.uniqueId ?? x?.id ??
  x?.data?.code ?? x?.data?.uniqueId ?? x?.data?.id ??
  x?.label;

// Turns input arrays into new Set<string> -- copies
const toCodeSet = (arr: any[] | undefined | null): Set<string> =>
  new Set(
    ([...(arr ?? [])] as any[]) // shallow copy
      .map(codeOf)
      .filter((v): v is string => !!v)
  );

/** Text alternative for the packed chart: the shape of the data, not the 294 circles. */
const bubbleChartLabel = (root: d3.HierarchyNode<any>): string => {
  const nodes = root.descendants().slice(1);
  const groups = nodes.filter((d) => d.children).length;
  const leaves = nodes.length - groups;
  const groupWord = groups === 1 ? 'group' : 'groups';
  const leafWord = leaves === 1 ? 'variable' : 'variables';
  return (
    `Variable hierarchy bubble chart, ${groups} ${groupWord} and ${leaves} ${leafWord}. ` +
    `Double-click a bubble to add it to the pool, or use the search field to find a variable by name.`
  );
};

type BubbleColorConfig = {
  variable: string;
  covariate: string;
  filter: string;
  selected: string;
  groupStart: string;
  groupEnd: string;
};

export const DEFAULT_BUBBLE_COLORS: BubbleColorConfig = {
  variable: '#ffba08',     // MIP golden yellow
  covariate: '#bba66f',    // MIP tan/beige
  filter: '#483300',       // MIP dark brown
  selected: '#3f6078',     // MIP steel blue
  groupStart: '#c8d5f0',   // Light pale blue
  groupEnd: '#3340e8',     // Deep blue
};

// Calculate leaf color
const colorForLeaf = (
  d: any,
  sets: { vars: Set<string>; filters: Set<string> },
  colors: BubbleColorConfig,
  tutorialHighlightCode: string | null,
  tutorialHighlightColor: string
): string => {
  const code = codeOf(d.data);
  if (!code) return 'white';
  if (tutorialHighlightCode && code === tutorialHighlightCode) return tutorialHighlightColor;
  if (sets.vars.has(code)) return colors.variable; // variable
  if (sets.filters.has(code)) return colors.filter; // filter
  return 'white';
};

// MAIN FACTORY

export function createZoomableCirclePacking(
  data: any,
  container: HTMLElement,
  onNodeClick: (node: any) => void,
  onNodeDoubleClick: (node: any) => void,
  options?: {
    selectedVariables?: any[];
    selectedFilters?: any[];
    colors?: Partial<BubbleColorConfig>;
    tutorialHighlightCode?: string | null;
    tutorialHighlightColor?: string;
    onAnimationStart?: () => void;
    onAnimationEnd?: () => void;
    onFocusChange?: (path: Array<{ code: string; label: string }>) => void;
  }
): {
  zoomToNode: (d: any) => void;
  refreshColors: (opts?: any) => void;
  resetZoom: () => void;
  destroy?: () => void;
} {

  // local snapshots, decouple references of the experiment studio service signals
  let sets = {
    vars: toCodeSet(options?.selectedVariables),
    filters: toCodeSet(options?.selectedFilters),
  };

  let colors: BubbleColorConfig = { ...DEFAULT_BUBBLE_COLORS, ...(options?.colors ?? {}) };
  let tutorialHighlightCode = options?.tutorialHighlightCode ?? null;
  let tutorialHighlightColor = options?.tutorialHighlightColor ?? '#ffba08';

  const bounds = container.getBoundingClientRect();
  const width = Math.floor(bounds.width || 0) || 700;
  const height = Math.floor(bounds.height || 0) || 728;
  const paddingLabel = 20;
  const availableHeight = height - paddingLabel;
  const size = Math.min(width, availableHeight);
  // Calculate offset to center the square packing within the rectangle
  const offsetX = (width - size) / 2;
  const offsetY = paddingLabel + (availableHeight - size) / 2;
  let groupColor = d3.scaleLinear<string>()
    .domain([0, 5])
    .range([colors.groupStart, colors.groupEnd])
    .interpolate(d3.interpolateHcl);

  if (!container) {
    console.error('No container provided');
    return { zoomToNode: () => { }, refreshColors: () => { }, resetZoom: () => { } };
  }
  container.innerHTML = '';

  // Tooltip setup
  const tooltip = d3
    .select('body')
    .append('div')
    .attr('class', 'tooltip');

  function decodeUnicode(str: string): string {
    try {
      return str.replace(/\\u[\dA-Fa-f]{4}/g, (match) =>
        String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))
      );
    } catch {
      return str;
    }
  }

  function appendTooltipRow(name: string, value: string): void {
    const row = tooltip.append('div').style('margin-top', '4px');
    row.append('strong').text(name);
    row.append('span').text(' ' + value);
  }

  function showTooltip(event: MouseEvent, d: any) {
    const label = d.data.label || '(no label)';
    const descriptionRaw = d.data.description || '';
    const description = decodeUnicode(descriptionRaw.trim());
    const type = d.data.type || '';

    tooltip.selectAll('*').remove();
    tooltip.append('div').append('strong').text(label);
    if (type) appendTooltipRow('Type:', type);
    if (description) appendTooltipRow('Description:', description);

    tooltip
      .style('left', `${event.clientX + 10}px`)
      .style('top', `${event.clientY + 10}px`)
      .transition()
      .duration(150)
      .style('opacity', 1);
  }

  function moveTooltip(event: MouseEvent) {
    tooltip
      .style('left', `${event.clientX + 10}px`)
      .style('top', `${event.clientY + 10}px`);
  }

  function hideTooltip() {
    tooltip.transition().duration(150).style('opacity', 0);
  }

  // Create a perfectly square pack layout
  const packSize = size;
  const packHeight = packSize;

  const root = d3.pack<any>().size([packSize, packHeight]).padding(3)(
    d3.hierarchy<any>(data, (d: any) => d.children)
      .sum((d: any) => d.value ?? 0)
      .sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0))
  );

  let focus = root;
  // Use a 2.05x radius to reduce padding
  let view: [number, number, number] = [focus.x, focus.y, focus.r * 2.05];
  let selectedDataNode: d3.HierarchyNode<any> | null = null;

  const svg = d3
    .create('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    // The 294 circles carry no semantics of their own, so expose the chart as one
    // labelled image and let the search field stay the keyboard path to a variable.
    .attr('role', 'img')
    .attr(
      'aria-label',
      bubbleChartLabel(root)
    )
    .attr(
      'style',
      `width: 100%; height: 100%; display: block; margin: 0;
       background: transparent; cursor: pointer;`
    );

  const defs = svg.append('defs');
  defs.append('filter')
    .attr('id', 'node-glow')
    .attr('x', '-50%')
    .attr('y', '-50%')
    .attr('width', '200%')
    .attr('height', '200%')
    .append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 0)
    .attr('stdDeviation', 2.5)
    .attr('flood-color', 'rgba(0,0,0,0.35)');

  const fillForNode = (d: any): string => {
    if (d.children) {
      return groupColor(d.depth);
    }

    if (tutorialHighlightCode) {
      const code = codeOf(d.data);
      if (code && code === tutorialHighlightCode) {
        return tutorialHighlightColor;
      }
    }

    if (d === selectedDataNode) {
      return colors.selected;
    }

    return colorForLeaf(d, sets, colors, tutorialHighlightCode, tutorialHighlightColor);
  };

  // Nodes
  const node = svg.append('g')
    .selectAll('circle')
    .data(root.descendants().slice(1))
    .join('circle')
    .attr('class', (d: any) => (d.children ? 'group' : 'leaf'))
    .attr('fill', (d: any) => fillForNode(d))
    .attr('fill-opacity', (d: any) => (d.children ? 0.6 : 1))
    .attr('stroke', (d: any) => (d.children ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.12)'))
    .attr('stroke-width', (d: any) => (d.children ? 1 : 0.6))
    .style('cursor', 'pointer')
    .on('click', (event: MouseEvent, d: any) => {
      event.stopPropagation();
      if (!d.children) {
        selectedDataNode = d;
        onNodeClick(d.data);
        updateSelection();
        return;
      }
      zoom(event, d);
    })
    .on('dblclick', (event: MouseEvent, d: any) => {
      event.stopPropagation();
      if (!d.children) {
        onNodeDoubleClick(d.data);
      }
    })
    .on('mouseover', function (event, d: any) {
      d3.select(this)
        .attr('stroke', '#2b33e9')
        .attr('stroke-width', 1.5)
        .attr('fill-opacity', d.children ? 0.78 : 1);
      showTooltip(event, d);
    })
    .on('mousemove', function (event) {
      moveTooltip(event);
    })
    .on('mouseout', function () {
      updateSelection();
      hideTooltip();
    });


  // Labels
  const labelsGroup = svg.append('g').attr('pointer-events', 'none');
  const labelNodes = labelsGroup
    .selectAll('g.label-group')
    .data(root.descendants())
    .join('g')
    .attr('class', 'label-group')
    .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    .style('display', (d: any) => (d.parent === focus ? 'inline' : 'none'));

  zoomTo([focus.x, focus.y, focus.r * 2.05]);
  emitFocusChange();
  container.appendChild(svg.node()!);

  // Functions
  function zoomTo(v: [number, number, number]) {
    const k = size / v[2];
    view = v;

    node.attr('transform', (d: any) => `translate(${(d.x - v[0]) * k + size / 2 + offsetX}, ${(d.y - v[1]) * k + size / 2 + offsetY})`);
    node.attr('r', (d: any) => d.r * k);

    labelNodes.attr('transform', (d: any) => {
      const x = (d.x - v[0]) * k + size / 2 + offsetX;
      const y = (d.y - v[1]) * k + size / 2 + offsetY;
      const topY = d.children ? y - d.r * k + 2 : y;
      return `translate(${x}, ${topY})`;
    })
      .each(function (d: any) {
        const el = d3.select(this as SVGGElement);
        if (d.parent === focus && shouldShowLabel(d, k)) {
          el.style('display', 'inline').style('fill-opacity', 0.92);
          createLabelGroup(el, d);
        } else el.style('display', 'none');
      });
  }

  function updateSelection() {
    node.transition().duration(200)
      .attr('fill', (d: any) => fillForNode(d))
      .attr('fill-opacity', (d: any) => (d.children ? 0.6 : 1))
      .attr('stroke', (d: any) => {
        if (d === selectedDataNode) return '#000';
        if (d.children) return 'rgba(0,0,0,0.08)';
        return 'rgba(0,0,0,0.12)';
      })
      .attr('stroke-width', (d: any) => {
        if (d === selectedDataNode) return 2;
        if (d.children) return 1;
        return 0.6;
      })
      .attr('filter', (d: any) => (d === selectedDataNode ? 'url(#node-glow)' : 'none'));
  }

  function zoom(event: MouseEvent | null, d: any) {
    if (focus === d) return;
    focus = d;
    onNodeClick(d.data);

    const isFast = event && event.altKey;

    options?.onAnimationStart?.();

    svg.transition()
      .duration(isFast ? 7500 : 750)
      .tween('zoom', () => {
        const i = d3.interpolateZoom(view, [d.x, d.y, d.r * 2.05]);
        return (t: number) => zoomTo(i(t));
      })
      .on('end', () => {
        selectedDataNode = null;
        updateSelection();
        emitFocusChange();
        options?.onAnimationEnd?.();
      })
      .on('interrupt', () => {
        options?.onAnimationEnd?.();
      });
  }

  function zoomToNode(dataNode: any) {
    const code = dataNode?.code ?? dataNode;  // accepts {code} or "code"

    const target = root.descendants().find((n: any) => n.data.code === code);
    if (!target) return;

    // if group -> zoom to group
    // if leaf  -> zoom to parent
    const group = target.children ? target : (target.parent ?? root);

    if (focus === group) {
      selectedDataNode = target.children ? null : target;
      updateSelection();
      emitFocusChange();
      return;
    }

    const zoomTarget: [number, number, number] = [group.x, group.y, group.r * 2.05];

    labelNodes.each(function (nd: any) {
      const el = d3.select(this as SVGGElement);
      if (nd.parent === group && shouldShowLabel(nd, size / zoomTarget[2])) {
        el.style('display', 'inline').style('fill-opacity', 0.6);
        createLabelGroup(el, nd);
      } else el.style('display', 'none').style('fill-opacity', 0);
    });

    if (!view) view = [root.x, root.y, root.r * 2.05];

    if (focus === root && !selectedDataNode) {
      zoomTo(zoomTarget);
      focus = group;
      selectedDataNode = target.children ? null : target; // group -> null
      updateSelection();
      emitFocusChange();
    }

    options?.onAnimationStart?.();

    svg.transition()
      .duration(750)
      .tween('zoom', () => {
        const i = d3.interpolateZoom(view, zoomTarget);
        return (t: number) => zoomTo(i(t));
      })
      .on('end', () => {
        focus = group;
        selectedDataNode = target.children ? null : target; // group -> null
        updateSelection();

        labelNodes.each(function (nd: any) {
          const el = d3.select(this as SVGGElement);
          if (nd.parent === group && shouldShowLabel(nd, size / zoomTarget[2])) {
            el.style('display', 'inline')
              .transition()
              .duration(250)
              .style('fill-opacity', 0.92);
          } else el.style('display', 'none').style('fill-opacity', 0);
        });

        emitFocusChange();
        options?.onAnimationEnd?.();
      })
      .on('interrupt', () => {
        options?.onAnimationEnd?.();
      });
  }

  function emitFocusChange(): void {
    const path: Array<{ code: string; label: string }> = [];
    let current: any = focus;
    while (current) {
      path.unshift({
        code: String(current.data?.code ?? ''),
        label: String(current.data?.label ?? current.data?.name ?? ''),
      });
      current = current.parent;
    }
    options?.onFocusChange?.(path);
  }

  svg.on('click', function (event: MouseEvent) {
    if (event.target === this) zoom(event, root);
  });

  // immutable refreshColors
  function refreshColors(newOptions?: {
    selectedVariables?: any[];
    selectedFilters?: any[];
    colors?: Partial<BubbleColorConfig>;
    tutorialHighlightCode?: string | null;
    tutorialHighlightColor?: string;
  }) {
    const hasTutorialHighlightCode = !!newOptions
      && Object.prototype.hasOwnProperty.call(newOptions, 'tutorialHighlightCode');
    const hasTutorialHighlightColor = !!newOptions
      && Object.prototype.hasOwnProperty.call(newOptions, 'tutorialHighlightColor');

    colors = { ...colors, ...(newOptions?.colors ?? {}) };
    if (hasTutorialHighlightCode) {
      tutorialHighlightCode = newOptions?.tutorialHighlightCode ?? null;
    }
    if (hasTutorialHighlightColor && newOptions?.tutorialHighlightColor) {
      tutorialHighlightColor = newOptions.tutorialHighlightColor;
    }
    groupColor = d3.scaleLinear<string>()
      .domain([0, 5])
      .range([colors.groupStart, colors.groupEnd])
      .interpolate(d3.interpolateHcl);

    // Updates global snapshot
    sets = {
      vars: new Set(
        [...(newOptions?.selectedVariables ?? [])]
          .map(codeOf)
          .filter((v): v is string => !!v)
      ),
      filters: new Set(
        [...(newOptions?.selectedFilters ?? [])]
          .map(codeOf)
          .filter((v): v is string => !!v)
      ),
    };

    updateSelection();
  }

  function shouldShowLabel(d: any, k: number): boolean {
    if (d === root) return false;
    if (focus === root && !d.children) return false;
    const radius = d.r * k;
    if (d.children) return radius >= 18;
    return radius >= 22;
  }

  return {
    zoomToNode,
    refreshColors,
    resetZoom: () => {
      if (focus !== root) {
        zoom(null, root);
      }
    },
    destroy: () => {
      tooltip.remove();
    }
  };
}
