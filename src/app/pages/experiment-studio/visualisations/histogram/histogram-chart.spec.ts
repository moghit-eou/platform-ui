import {
  clipHistogramNullEdges,
  createHistogram,
  orderHorizontalBarRows,
  selectXTickValues,
  shouldClipNullEdges,
  wrapCategoryLabel,
} from './histogram-chart';

describe('wrapCategoryLabel', () => {
  it('keeps short labels on a single line', () => {
    expect(wrapCategoryLabel('Age')).toEqual(['Age']);
    expect(wrapCategoryLabel('Detailed acute treatment')).toEqual(['Detailed acute treatment']);
  });

  it('breaks long labels at a space near the midpoint', () => {
    expect(wrapCategoryLabel('Cerebrovascular risk assessment protocol')).toEqual([
      'Cerebrovascular risk',
      'assessment protocol',
    ]);
  });

  it('breaks at the only space when it is the nearest break point', () => {
    // 30 chars, single space at index 25 -> the only available word break.
    expect(wrapCategoryLabel('abcdefghijklmnopqrstuvwxy z123')).toEqual([
      'abcdefghijklmnopqrstuvwxy',
      'z123',
    ]);
  });

  it('keeps a label with no space on one line', () => {
    expect(wrapCategoryLabel('abcdefghijklmnopABCDEFGHIJKLMNOP')).toEqual([
      'abcdefghijklmnopABCDEFGHIJKLMNOP',
    ]);
  });

  it('returns the empty label unchanged', () => {
    expect(wrapCategoryLabel('')).toEqual(['']);
  });
});

describe('clipHistogramNullEdges', () => {
  it('trims leading and trailing null counts but keeps interior null bins', () => {
    expect(clipHistogramNullEdges(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      [44, null, 10, 22, 84, 266, 1214, 3106, 2802, 470, 206, 50, 46, null, null]
    )).toEqual({
      bins: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
      counts: [44, null, 10, 22, 84, 266, 1214, 3106, 2802, 470, 206, 50, 46],
    });
  });

  it('trims trailing null counts on edge-based histograms', () => {
    expect(clipHistogramNullEdges(
      [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      [null, 190000, 20000, 5000, null, null, null, null, null, null]
    )).toEqual({
      bins: ['10', '20', '30'],
      counts: [190000, 20000, 5000],
    });
  });

  it('keeps categorical bins aligned with counts', () => {
    expect(clipHistogramNullEdges(
      ['A', 'B', 'C', 'D'],
      [null, 3, 5, null]
    )).toEqual({
      bins: ['B', 'C'],
      counts: [3, 5],
    });
  });

  it('returns empty data when all counts are null', () => {
    expect(clipHistogramNullEdges([0, 10, 20], [null, null])).toEqual({
      bins: [],
      counts: [],
    });
  });
});

describe('selectXTickValues', () => {
  const denseBins = ['110', '115', '120', '125', '130', '135', '140', '145', '150', '155', '160', '165', '170', '175', '180', '185', '190', '195', '200', '205', '210', '215'];

  it('keeps all labels when there is enough width', () => {
    expect(selectXTickValues(['110', '115', '120'], 400, 3)).toEqual(['110', '115', '120']);
  });

  it('subsamples dense multi-digit numeric labels', () => {
    const ticks = selectXTickValues(denseBins, 529, 3);
    expect(ticks.length).toBeLessThan(denseBins.length);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks[0]).toBe('110');
    expect(ticks[ticks.length - 1]).toBe('215');
  });
});

describe('orderHorizontalBarRows', () => {
  it('keeps numeric histogram bins in value order', () => {
    expect(orderHorizontalBarRows(['30', '45', '60'], [10, 80, 20])).toEqual([
      { bin: '30', count: 10 },
      { bin: '45', count: 80 },
      { bin: '60', count: 20 },
    ]);
  });

  it('sorts named group bins by count descending', () => {
    expect(orderHorizontalBarRows(['Acute', 'Hospitalization'], [4, 12])).toEqual([
      { bin: 'Hospitalization', count: 12 },
      { bin: 'Acute', count: 4 },
    ]);
  });
});

describe('shouldClipNullEdges', () => {
  it('returns true for numeric bins', () => {
    expect(shouldClipNullEdges([0, 1, 2, 3])).toBeTrue();
  });

  it('returns false for nominal bins', () => {
    expect(shouldClipNullEdges(['yes', 'no', 'unknown'])).toBeFalse();
  });
});

describe('createHistogram in an unlaid-out container', () => {
  const SAMPLE = {
    bins: ['0-1', '1-2', '2-3', '3-4', '4-5'],
    counts: [12, 30, 22, 5, 1],
    variableName: 'Age',
  };
  let host: HTMLDivElement;

  afterEach(() => {
    host?.remove();
  });

  /** Mirrors a Studio step hidden with `display: none`: every getBBox() is empty. */
  function hiddenContainer(): HTMLDivElement {
    host = document.createElement('div');
    host.style.display = 'none';
    const container = document.createElement('div');
    container.style.width = '480px';
    host.appendChild(container);
    document.body.appendChild(host);
    return container;
  }

  it('keeps the computed height for the vertical chart', () => {
    const container = hiddenContainer();
    createHistogram(SAMPLE, container, {});

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(Number(svg!.getAttribute('height'))).toBeGreaterThan(150);
    expect(parseFloat(container.style.height)).toBeGreaterThan(150);
  });

  it('keeps the computed height for the horizontal chart', () => {
    const container = hiddenContainer();
    createHistogram(SAMPLE, container, { orientation: 'horizontal' });

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(Number(svg!.getAttribute('height'))).toBeGreaterThan(150);
    expect(parseFloat(container.style.height)).toBeGreaterThan(150);
  });
});
