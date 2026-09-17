import { EChartsOption } from 'echarts';

export interface CoxForestRow {
  label: string;
  hazardRatio: number;
  ciLower: number;
  ciUpper: number;
  pValue: number;
}

const SIGNIFICANT_COLOR = '#1d4ed8';
const NEUTRAL_COLOR = '#64748b';
const REFERENCE_LINE_COLOR = '#94a3b8';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatClinicianPValue(pValue: number): string {
  if (!Number.isFinite(pValue)) return 'N/A';
  if (pValue < 0.001) return '<0.001';
  return pValue.toFixed(3);
}

function formatClinicianHazardRatio(value: number): string {
  if (!Number.isFinite(value)) return 'N/A';
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

export function isCoxInterceptTerm(name: string): boolean {
  return String(name).trim().toLowerCase() === 'intercept';
}

/** Short y-axis labels; full names stay in tooltips. */
export function shortenCoxFactorLabel(label: string, maxLen = 48): string {
  const trimmed = String(label).trim();
  const bracket = trimmed.match(/^(.+?)\[(.+)\]$/);
  if (bracket) {
    const parent = bracket[1].trim();
    const level = bracket[2].trim();
    const shortParent =
      parent.length > 22 ? `${parent.slice(0, 20).trim()}…` : parent;
    const combined = `${shortParent} · ${level}`;
    return combined.length > maxLen ? `${combined.slice(0, maxLen - 1)}…` : combined;
  }
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
}

export function extractCoxForestRows(result: any): CoxForestRow[] {
  const indepVars: string[] = result?.indep_vars ?? [];
  const summary = result?.summary;
  if (!summary || !indepVars.length) return [];

  const hazardRatios: number[] = summary.hazard_ratios ?? [];
  const ciLower: number[] = summary.hr_lower_ci ?? [];
  const ciUpper: number[] = summary.hr_upper_ci ?? [];
  const pvalues: number[] = summary.pvalues ?? [];

  const rows: CoxForestRow[] = [];

  indepVars.forEach((variable, index) => {
    if (isCoxInterceptTerm(variable)) return;

    const hazardRatio = Number(hazardRatios[index]);
    const lower = Number(ciLower[index]);
    const upper = Number(ciUpper[index]);
    const pValue = Number(pvalues[index]);

    if (
      !Number.isFinite(hazardRatio) ||
      !Number.isFinite(lower) ||
      !Number.isFinite(upper) ||
      hazardRatio <= 0 ||
      lower <= 0 ||
      upper <= 0
    ) {
      return;
    }

    rows.push({
      label: String(variable),
      hazardRatio,
      ciLower: lower,
      ciUpper: upper,
      pValue,
    });
  });

  return rows;
}

export function buildCoxHazardRatioForestChart(result: any): EChartsOption[] {
  const rows = extractCoxForestRows(result);
  if (!rows.length) return [];

  const axisLabels = rows.map((row) => shortenCoxFactorLabel(row.label));
  const maxAxisLabelChars = Math.max(...axisLabels.map((label) => label.length), 12);
  const seriesData = rows.map((row) => [
    row.hazardRatio,
    row.ciLower,
    row.ciUpper,
    row.pValue,
  ]);

  const axisValues = rows.flatMap((row) => [row.ciLower, row.ciUpper, row.hazardRatio, 1]);
  const axisMin = Math.min(...axisValues) * 0.8;
  const axisMax = Math.max(...axisValues) * 1.2;

  const chartHeight = Math.max(300, 128 + rows.length * 88);

  const option: EChartsOption = {
    title: {
      text: 'Hazard ratios (95% CI)',
      subtext: 'Dashed line = no effect (HR 1). Values above 1 suggest higher event risk.',
      left: 'center',
      top: 4,
      textStyle: { fontSize: 15, fontWeight: 600, color: '#0f4f4f' },
      subtextStyle: { fontSize: 11, color: '#64748b', lineHeight: 16 },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const index = params?.dataIndex ?? 0;
        const row = rows[index];
        if (!row) return '';
        return (
          '<b>' + escapeHtml(row.label) + '</b><br/>' +
          'Hazard ratio: ' + formatClinicianHazardRatio(row.hazardRatio) + '<br/>' +
          '95% CI: ' + formatClinicianHazardRatio(row.ciLower) + ' – ' +
          formatClinicianHazardRatio(row.ciUpper) + '<br/>' +
          'p-value: ' + formatClinicianPValue(row.pValue)
        );
      },
    },
    grid: {
      top: 78,
      bottom: 52,
      left: Math.min(360, 28 + maxAxisLabelChars * 6.2),
      right: 48,
    },
    yAxis: {
      type: 'category',
      data: axisLabels,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        width: 340,
        overflow: 'truncate',
        fontSize: 12,
        color: '#334155',
        lineHeight: 16,
      },
    },
    xAxis: {
      type: 'log',
      name: 'Hazard ratio (log scale)',
      nameLocation: 'middle',
      nameGap: 34,
      min: Math.max(axisMin, 0.01),
      max: axisMax,
      axisLabel: {
        hideOverlap: true,
        margin: 10,
        formatter: (val: number) => formatClinicianHazardRatio(val),
      },
      splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
    },
    graphic: [
      {
        type: 'text',
        right: 20,
        top: 82,
        style: {
          text: 'No effect → HR 1',
          fill: REFERENCE_LINE_COLOR,
          fontSize: 11,
          fontWeight: 500,
        },
      },
    ],
    series: [
      {
        type: 'custom',
        renderItem: (params: any, api: any) => {
          const categoryIndex = params.dataIndex;
          const hazardRatio = api.value(0);
          const lower = api.value(1);
          const upper = api.value(2);
          const pValue = api.value(3);
          const y = api.coord([hazardRatio, categoryIndex])[1];
          const xPoint = api.coord([hazardRatio, categoryIndex])[0];
          const xLow = api.coord([lower, categoryIndex])[0];
          const xHigh = api.coord([upper, categoryIndex])[0];
          const color = Number.isFinite(pValue) && pValue < 0.05 ? SIGNIFICANT_COLOR : NEUTRAL_COLOR;

          return {
            type: 'group',
            children: [
              {
                type: 'line',
                shape: { x1: xLow, y1: y, x2: xHigh, y2: y },
                style: { stroke: color, lineWidth: 2 },
              },
              {
                type: 'line',
                shape: { x1: xLow, y1: y - 5, x2: xLow, y2: y + 5 },
                style: { stroke: color, lineWidth: 2 },
              },
              {
                type: 'line',
                shape: { x1: xHigh, y1: y - 5, x2: xHigh, y2: y + 5 },
                style: { stroke: color, lineWidth: 2 },
              },
              {
                type: 'circle',
                shape: { cx: xPoint, cy: y, r: 5 },
                style: { fill: color, stroke: '#fff', lineWidth: 1 },
              },
            ],
          };
        },
        data: seriesData,
        encode: {
          x: [0, 1, 2],
          y: -1,
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ xAxis: 1 }],
          lineStyle: { color: REFERENCE_LINE_COLOR, type: 'dashed', width: 2 },
          label: { show: false },
        },
      },
    ],
  };

  (option as EChartsOption & { mipChartHeight?: number }).mipChartHeight = chartHeight;

  return [option];
}
