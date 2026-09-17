import * as d3 from 'd3';

const MIN_X_TICKS = 4;
const MAX_X_TICKS = 12;

/**
 * getBBox() returns an empty rect for text that has never been laid out - a chart
 * inside a Studio step hidden with `display: none`, for example. Used where a
 * measured label extent would otherwise collapse the layout to nothing.
 */
const UNMEASURED_LABEL_WIDTH_PX = 46;

function binsAreNumeric(bins: string[]): boolean {
  return bins.length > 0 && bins.every((bin) => Number.isFinite(Number(bin)));
}

/** Named groups sort by count; numeric histogram bins keep value order. */
export function orderHorizontalBarRows(
  bins: string[],
  counts: Array<number | null>
): Array<{ bin: string; count: number | null }> {
  const rows = bins.map((bin, index) => ({
    bin: String(bin),
    count: counts[index] ?? null,
  }));
  if (binsAreNumeric(rows.map((row) => row.bin))) {
    return rows;
  }
  return [...rows].sort((a, b) => (b.count ?? -1) - (a.count ?? -1));
}

export function shouldClipNullEdges(bins: Array<string | number>): boolean {
  return binsAreNumeric(bins.map(String));
}

export function clipHistogramNullEdges(
  bins: Array<string | number>,
  counts: Array<number | null>
): { bins: string[]; counts: Array<number | null> } {
  if (!Array.isArray(counts) || !counts.length || !Array.isArray(bins) || !bins.length) {
    return { bins: [], counts: [] };
  }

  let start = 0;
  while (start < counts.length && counts[start] === null) {
    start += 1;
  }

  let end = counts.length - 1;
  while (end >= start && counts[end] === null) {
    end -= 1;
  }

  if (start > end) {
    return { bins: [], counts: [] };
  }

  const clippedCounts = counts.slice(start, end + 1);
  const clippedBins = bins.slice(start, end + 1).map(String);

  return { bins: clippedBins, counts: clippedCounts };
}

export function selectXTickValues(bins: string[], chartWidth: number, maxLabelLength: number): string[] {
  const minLabelWidth = Math.max(32, maxLabelLength * 7 + 8);
  const maxTicks = Math.max(MIN_X_TICKS, Math.min(MAX_X_TICKS, Math.floor(chartWidth / minLabelWidth)));
  if (bins.length <= maxTicks) {
    return bins;
  }

  const step = Math.ceil(bins.length / maxTicks);
  const ticks: string[] = [];
  for (let index = 0; index < bins.length; index += step) {
    ticks.push(bins[index]);
  }

  const last = bins[bins.length - 1];
  if (ticks[ticks.length - 1] !== last) {
    ticks.push(last);
  }

  return ticks;
}

/**
 * Split a long horizontal-bar category label into two lines, breaking at the
 * space closest to the midpoint so words stay intact.
 */
export function wrapCategoryLabel(label: string): string[] {
  if (label.length <= 26) return [label];
  const mid = label.length / 2;
  const spaces = [...label.matchAll(/ /g)].map((match) => match.index ?? 0);
  if (!spaces.length) return [label];
  const cut = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best));
  return [label.slice(0, cut), label.slice(cut + 1)];
}

function shouldRotateXLabels(
  bins: string[],
  hasStringBins: boolean,
  maxLabelLength: number,
  denseNumericLabels: boolean
): boolean {
  if (denseNumericLabels) {
    return true;
  }

  const estimatedLines = Math.max(1, Math.ceil(maxLabelLength / 10));
  const hasLongNumericBins = bins.some((bin) => {
    const raw = String(bin).trim();
    if (!raw) {
      return false;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) {
      return false;
    }
    return raw.length >= 4 && raw.includes('.');
  });

  return (hasStringBins && estimatedLines > 1) || hasLongNumericBins || (hasStringBins && bins.length > 8);
}

function attachChartTooltip(
  container: HTMLElement,
  formatTitle: (binLabel: string) => string = (binLabel) => binLabel,
) {
  container.style.position = 'relative';
  const tooltip = d3
    .select(container)
    .append('div')
    .style('position', 'absolute')
    .style('visibility', 'hidden')
    .style('background-color', '#ffffff')
    .style('color', '#0f172a')
    .style('padding', '8px 12px')
    .style('border-radius', '6px')
    .style('font-size', '12px')
    .style('font-weight', '500')
    .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
    .style('border', '1px solid #e2e8f0')
    .style('max-width', '250px')
    .style('white-space', 'normal')
    .style('pointer-events', 'none')
    .style('z-index', '10');

  const smartFormat = (d: any): string => {
    if (typeof d !== 'number' || isNaN(d)) return String(d);
    const abs = Math.abs(d);
    if (Number.isInteger(d)) return d.toString();
    if (abs > 10000) return d3.format('.2f')(d);
    if (abs > 0 && abs < 0.01) return d3.format('.2e')(d);
    return d3.format('.2f')(d);
  };

  const formatCountLabel = (count: number | null): string =>
    count === null ? 'Masked for privacy (count below minimum threshold)' : smartFormat(count);

  const showTooltip = (binLabel: string, count: number | null) => {
    tooltip.selectAll('*').remove();
    tooltip
      .append('div')
      .style('margin-bottom', '4px')
      .style('font-weight', '600')
      .style('line-height', '1.4')
      .text(formatTitle(binLabel));
    tooltip.append('div').text('Count: ' + formatCountLabel(count));
    tooltip.style('visibility', 'visible');
  };

  const moveTooltip = (event: MouseEvent) => {
    const [x, y] = d3.pointer(event, container);
    const tooltipNode = tooltip.node() as HTMLElement;
    const tooltipWidth = tooltipNode?.offsetWidth || 100;
    const tooltipHeight = tooltipNode?.offsetHeight || 60;
    const bounds = container.getBoundingClientRect();
    let left = x + 15;
    let top = y - 10;
    if (left + tooltipWidth > bounds.width) left = x - tooltipWidth - 15;
    if (top + tooltipHeight > bounds.height) top = y - tooltipHeight - 10;
    tooltip.style('left', `${left}px`).style('top', `${top}px`);
  };

  const hideTooltip = () => {
    tooltip.style('visibility', 'hidden');
  };

  return { smartFormat, showTooltip, moveTooltip, hideTooltip };
}

export function createHistogram(
  data: {
    bins: string[];
    counts: Array<number | null>;
    variable?: string;
    variableName?: string;
    description?: string;
    variableType?: string;
  },
  container: HTMLElement,
  config: {
    color?: string;
    orientation?: 'vertical' | 'horizontal';
  } = {}
): void {
  if (config.orientation === 'horizontal') {
    createHorizontalBarChart(data, container, config);
    return;
  }

  const textColor = '#475569';
  const mutedTextColor = '#64748b';
  const gridColor = '#e2e8f0';
  const domainColor = '#cbd5e1';
  const barColor = config.color || '#2b33e9';

  const clipped = shouldClipNullEdges(data.bins)
    ? clipHistogramNullEdges(data.bins, data.counts)
    : { bins: data.bins.map(String), counts: data.counts };
  const { bins, counts } = clipped;
  const containerRect = container.getBoundingClientRect();
  const containerWidth = containerRect.width || 640;

  // Clear any existing chart
  container.innerHTML = '';
  container.style.height = 'auto';
  container.style.minHeight = '0';

  if (!bins.length || !counts.length) {
    return;
  }

  // Create SVG once; height is computed from plot content below.
  const svg = d3
    .select(container)
    .append('svg');

  // Measure Y-axis label to make left margin dynamic
  const yLabelText = 'Count';

  const tempLabel = svg
    .append('text')
    .attr('x', -9999)
    .attr('y', -9999)
    .style('font-size', '16px')
    .text(yLabelText);

  const yLabelBBox = (tempLabel.node() as SVGTextElement | null)?.getBBox();
  tempLabel.remove();
  const measuredYLabelWidth = yLabelBBox && yLabelBBox.width > 0
    ? yLabelBBox.width
    : UNMEASURED_LABEL_WIDTH_PX;

  const baseMargins = { top: 16, right: 10, bottom: 60, left: 40 };
  const maxLabelLength = bins.reduce((max, b) => Math.max(max, String(b).length), 0);
  const estimatedLines = Math.max(1, Math.ceil(maxLabelLength / 10));
  const hasStringBins = !binsAreNumeric(bins);
  const denseNumericLabels = !hasStringBins && bins.length > 8 && maxLabelLength >= 3;
  const needsRotate = shouldRotateXLabels(bins, hasStringBins, maxLabelLength, denseNumericLabels);
  const bottomMargin = needsRotate
    ? Math.max(88, 24 + Math.min(120, maxLabelLength * 3.2))
    : Math.max(70, baseMargins.bottom + estimatedLines * 16);

  // Left margin = base + label width + small padding
  const margin = {
    top: baseMargins.top,
    right: baseMargins.right,
    bottom: bottomMargin,
    left: baseMargins.left + measuredYLabelWidth + 8
  };

  const innerHeight = needsRotate
    ? 240
    : hasStringBins && bins.length <= 8
      ? 200
      : 260;
  let containerHeight = margin.top + innerHeight + margin.bottom;

  // Scale width by bin count to allow horizontal scrolling when needed
  const minPerBinWidth = hasStringBins ? 30 : Math.max(24, maxLabelLength * 8);
  const desiredWidth = Math.max(containerWidth, bins.length * minPerBinWidth);

  svg.attr('width', desiredWidth).attr('height', containerHeight);

  const innerWidth = desiredWidth - margin.left - margin.right;

  // Aesthetic: Limit max bar width for small number of bins
  const maxBarWidth = 100;
  const optimalChartWidth = bins.length * maxBarWidth;
  const chartWidth = Math.min(innerWidth, optimalChartWidth);
  const xOffset = (innerWidth - chartWidth) / 2;

  // Scales
  const xScale = d3
    .scaleBand()
    .domain(bins)
    .range([0, chartWidth])
    .padding(0.2);

  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(counts.filter((count): count is number => count !== null)) || 0])
    .nice()
    .range([innerHeight, 0]);
  const binPoints = bins.map((bin, index) => ({
    bin,
    index,
    count: counts[index] ?? null,
  }));

  // Chart group
  const chart = svg
    .append('g')
    .attr('transform', `translate(${margin.left + xOffset}, ${margin.top})`);

  // Background Grid (Y-axis only)
  chart
    .append('g')
    .attr('class', 'grid')
    .call(
      d3.axisLeft(yScale)
        .ticks(6)
        .tickSize(-chartWidth)
        .tickFormat(() => '')
    )
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('.tick line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '3,3')
    );


  const { smartFormat, showTooltip, moveTooltip, hideTooltip } = attachChartTooltip(
    container,
    (binLabel) => `${data.variableName ? data.variableName + ': ' : ''}${binLabel}`,
  );
  const getBarSelector = (index: number) => `.bar[data-index="${index}"]`;

  // Visible bars: proportional heights only.
  chart
    .selectAll('.bar')
    .data(binPoints.filter((entry) => entry.count !== null))
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('data-index', (d) => d.index)
    .attr('x', (d) => xScale(bins[d.index]) || 0)
    .attr('y', (d) => yScale(d.count as number))
    .attr('width', xScale.bandwidth())
    .attr('height', (d) => innerHeight - yScale(d.count as number))
    .attr('fill', barColor)
    .attr('opacity', 0.85)
    .style('pointer-events', 'none');

  // Invisible hit areas: full-height bin targets for reliable hover.
  chart
    .selectAll('.bar-hit-area')
    .data(binPoints)
    .enter()
    .append('rect')
    .attr('class', 'bar-hit-area')
    .attr('x', (d) => xScale(d.bin) || 0)
    .attr('y', 0)
    .attr('width', xScale.bandwidth())
    .attr('height', innerHeight)
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('mouseover', function (_event, d) {
      chart.select(getBarSelector(d.index)).attr('opacity', 1).attr('filter', 'brightness(1.1)');
      showTooltip(String(d.bin), d.count);
    })
    .on('mousemove', function (event) {
      moveTooltip(event as MouseEvent);
    })
    .on('mouseout', function (_event, d) {
      chart.select(getBarSelector(d.index)).attr('opacity', 0.85).attr('filter', null);
      hideTooltip();
    });

  const xTickValues = denseNumericLabels
    ? selectXTickValues(bins, chartWidth, maxLabelLength)
    : bins;

  // X axis
  const xAxis = d3
    .axisBottom(xScale)
    .tickValues(xTickValues)
    .tickFormat((d: any) => {
      const num = parseFloat(d);
      if (isNaN(num)) return d;

      if (data.variableType === 'integer' || Number.isInteger(num)) {
        return d3.format(',')(Math.round(num));
      }

      return smartFormat(num);
    })
    .tickSize(0)
    .tickPadding(needsRotate ? 8 : 12);

  const xAxisGroup = chart
    .append('g')
    .attr('transform', `translate(0, ${innerHeight})`)
    .call(xAxis)
    .call(g => g.select('.domain').attr('stroke', domainColor));

  const tickFontSize = denseNumericLabels ? '11px' : '13px';
  const tickText = xAxisGroup
    .selectAll<SVGTextElement, any>('text')
    .attr('font-size', tickFontSize)
    .attr('font-weight', '500')
    .attr('fill', textColor)
    .style('text-anchor', needsRotate ? 'end' : 'middle');

  if (needsRotate) {
    tickText.attr('transform', 'rotate(-40)').attr('dx', '-0.35em').attr('dy', '0.15em');
  }

  const xAxisBBox = (xAxisGroup.node() as SVGGElement | null)?.getBBox();
  if (xAxisBBox && xAxisBBox.height > 0) {
    const axisBottom = margin.top + innerHeight + xAxisBBox.y + xAxisBBox.height + 12;
    if (axisBottom > containerHeight) {
      containerHeight = Math.ceil(axisBottom);
      svg.attr('height', containerHeight);
    }
  }

  // Y axis
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(6)
    .tickFormat((d: any) => smartFormat(d))
    .tickSize(0)
    .tickPadding(12);

  chart.append('g')
    .call(yAxis)
    .call(g => g.select('.domain').remove())
    .selectAll('text')
    .attr('font-size', '13px')
    .attr('font-weight', '500')
    .attr('fill', textColor);

  // Y label
  const yLabelPaddingFromAxis = 32;

  chart
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerHeight / 2)
    .attr('y', -margin.left + yLabelPaddingFromAxis)
    .attr('text-anchor', 'middle')
    .text(yLabelText)
    .style('font-size', '12px')
    .style('font-weight', '700')
    .style('fill', mutedTextColor)
    .style('letter-spacing', '0.08em')
    .style('text-transform', 'uppercase');

  // A zero-height bbox is the signature of an unlaid-out container; keep the
  // computed height instead of collapsing the chart to a few visible pixels.
  const svgBBox = (svg.node() as SVGSVGElement | null)?.getBBox();
  if (svgBBox && svgBBox.height > 0) {
    containerHeight = Math.ceil(svgBBox.y + svgBBox.height + 8);
    svg.attr('height', containerHeight);
  }

  container.style.height = `${containerHeight}px`;
}

/**
 * Horizontal bar chart used for group summaries: one bar per group/variable,
 * category labels on the Y axis and count on the X axis. Reads cleanly without
 * rotating labels or horizontal scrolling.
 */
function createHorizontalBarChart(
  data: {
    bins: string[];
    counts: Array<number | null>;
    variable?: string;
    variableName?: string;
    description?: string;
    variableType?: string;
  },
  container: HTMLElement,
  config: {
    color?: string;
    orientation?: 'vertical' | 'horizontal';
  } = {}
): void {
  const textColor = '#475569';
  const mutedTextColor = '#64748b';
  const gridColor = '#e2e8f0';
  const barColor = config.color || '#2b33e9';
  const containerRect = container.getBoundingClientRect();
  const containerWidth = containerRect.width || 640;

  const rows = orderHorizontalBarRows(data.bins.map(String), data.counts);
  const bins = rows.map((row) => row.bin);
  const sortedCounts = rows.map((row) => row.count);

  container.innerHTML = '';
  container.style.height = 'auto';
  container.style.minHeight = '0';
  container.style.position = 'relative';

  if (!bins.length || !sortedCounts.length) {
    return;
  }

  const yLabelWidth = 200;
  const margin = { top: 40, right: 44, bottom: 40, left: yLabelWidth };

  const rowHeight = 42;
  const innerHeight = Math.max(120, bins.length * rowHeight);
  const containerHeight = margin.top + innerHeight + margin.bottom;
  const desiredWidth = Math.max(containerWidth, 360);
  const innerWidth = desiredWidth - margin.left - margin.right;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', desiredWidth)
    .attr('height', containerHeight);

  // Y scale: categories (bands)
  const yScale = d3
    .scaleBand<string>()
    .domain(bins)
    .range([0, innerHeight])
    .padding(0.22);

  // X scale: count (linear)
  const maxCount = d3.max(sortedCounts.filter((count): count is number => count !== null)) || 0;
  const xScale = d3
    .scaleLinear()
    .domain([0, maxCount])
    .nice()
    .range([0, innerWidth]);

  const chart = svg
    .append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  // Vertical grid lines (X axis)
  chart
    .append('g')
    .attr('class', 'grid')
    .call(
      d3.axisBottom(xScale)
        .ticks(Math.min(8, Math.max(3, Math.floor(innerWidth / 80))))
        .tickSize(-innerHeight)
        .tickFormat(() => '')
    )
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '3,3')
    );

  const { smartFormat, showTooltip, moveTooltip, hideTooltip } = attachChartTooltip(container);
  const getBarSelector = (index: number) => `.bar[data-index="${index}"]`;

  const binPoints = bins.map((bin, index) => ({
    bin,
    index,
    count: sortedCounts[index] ?? null,
  }));

  // Visible bars: horizontal, proportional widths.
  chart
    .selectAll('.bar')
    .data(binPoints.filter((entry) => entry.count !== null))
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('data-index', (d) => d.index)
    .attr('x', 0)
    .attr('y', (d) => yScale(bins[d.index]) || 0)
    .attr('width', (d) => xScale(d.count as number))
    .attr('height', yScale.bandwidth())
    .attr('fill', barColor)
    .attr('opacity', 0.85)
    .attr('rx', 3)
    .attr('ry', 3)
    .style('pointer-events', 'none');

  chart
    .selectAll('.bar-value')
    .data(binPoints.filter((entry) => entry.count !== null))
    .enter()
    .append('text')
    .attr('class', 'bar-value')
    .attr('x', (d) => xScale(d.count as number) + 6)
    .attr('y', (d) => (yScale(bins[d.index]) || 0) + yScale.bandwidth() / 2)
    .attr('dy', '0.35em')
    .attr('font-size', '11px')
    .attr('font-weight', '600')
    .attr('fill', textColor)
    .style('pointer-events', 'none')
    .text((d) => String(d.count));

  // Invisible full-height hit areas for reliable hover.
  chart
    .selectAll('.bar-hit-area')
    .data(binPoints)
    .enter()
    .append('rect')
    .attr('class', 'bar-hit-area')
    .attr('x', -yLabelWidth)
    .attr('y', (d) => yScale(d.bin) || 0)
    .attr('width', innerWidth + yLabelWidth)
    .attr('height', yScale.bandwidth())
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('mouseover', function (_event, d) {
      chart.select(getBarSelector(d.index)).attr('opacity', 1).attr('filter', 'brightness(1.1)');
      showTooltip(String(d.bin), d.count);
    })
    .on('mousemove', function (event) {
      moveTooltip(event as MouseEvent);
    })
    .on('mouseout', function (_event, d) {
      chart.select(getBarSelector(d.index)).attr('opacity', 0.85).attr('filter', null);
      hideTooltip();
    });

  // Y axis (category labels): long clinical names wrap to two lines instead of
  // hard-truncating; the full label stays available via the native <title>.
  const yAxisGroup = chart
    .append('g')
    .call(d3.axisLeft(yScale).tickSize(0).tickPadding(10).tickFormat((label) => String(label)))
    .call((g) => g.select('.domain').remove());
  yAxisGroup
    .selectAll<SVGTextElement, string>('text')
    .attr('font-size', '12px')
    .attr('font-weight', '500')
    .attr('fill', textColor)
    .each(function (label) {
      const text = d3.select(this);
      const lines = wrapCategoryLabel(String(label));
      const x = this.getAttribute('x');
      text.text('');
      lines.forEach((line, i) => {
        text
          .append('tspan')
          .attr('x', x)
          .attr('dy', i === 0 ? 0 : 12)
          .text(line);
      });
      text.append('title').text(String(label));
    });

  // X axis (count)
  chart.append('g')
    .attr('transform', `translate(0, ${innerHeight})`)
    .call(d3.axisBottom(xScale).ticks(Math.min(8, Math.max(3, Math.floor(innerWidth / 80)))).tickSize(0).tickPadding(8).tickFormat((d: any) => smartFormat(d)))
    .call((g) => g.select('.domain').attr('stroke', '#cbd5e1'))
    .selectAll('text')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('fill', textColor);

  // X label
  chart.append('text')
    .attr('x', innerWidth / 2)
    .attr('y', innerHeight + 30)
    .attr('text-anchor', 'middle')
    .text('Count')
    .style('font-size', '12px')
    .style('font-weight', '700')
    .style('fill', mutedTextColor)
    .style('letter-spacing', '0.08em')
    .style('text-transform', 'uppercase');

  container.style.height = `${containerHeight}px`;
}
