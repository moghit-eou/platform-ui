export interface GuideMaskRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

function expandGuideMaskRect(rect: Pick<GuideMaskRect, 'top' | 'left' | 'right' | 'bottom'>, padding = 10): GuideMaskRect {
  const left = rect.left - padding;
  const top = rect.top - padding;
  const right = rect.right + padding;
  const bottom = rect.bottom + padding;

  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
  };
}

function unionDomRects(rects: Array<Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>>): DOMRect {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
    toJSON: () => ({}),
  } as DOMRect;
}

export function measureGuideInteractionRect(element: HTMLElement, padding = 10): GuideMaskRect {
  const rects: Array<Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>> = [
    element.getBoundingClientRect(),
  ];

  element.querySelectorAll('.suggestions-container').forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      rects.push(rect);
    }
  });

  return expandGuideMaskRect(unionDomRects(rects), padding);
}

export function computeGuideBlockingRects(
  holes: GuideMaskRect[],
  viewport: Pick<GuideMaskRect, 'right' | 'bottom'> = {
    right: typeof window !== 'undefined' ? window.innerWidth : 0,
    bottom: typeof window !== 'undefined' ? window.innerHeight : 0,
  }
): GuideMaskRect[] {
  if (!holes.length || viewport.right <= 0 || viewport.bottom <= 0) {
    return [];
  }

  const xBreaks = Array.from(new Set([
    0,
    viewport.right,
    ...holes.flatMap((hole) => [hole.left, hole.right]),
  ])).sort((a, b) => a - b);

  const yBreaks = Array.from(new Set([
    0,
    viewport.bottom,
    ...holes.flatMap((hole) => [hole.top, hole.bottom]),
  ])).sort((a, b) => a - b);

  const blockers: GuideMaskRect[] = [];

  for (let row = 0; row < yBreaks.length - 1; row += 1) {
    for (let column = 0; column < xBreaks.length - 1; column += 1) {
      const cell = {
        left: xBreaks[column],
        top: yBreaks[row],
        right: xBreaks[column + 1],
        bottom: yBreaks[row + 1],
      };

      const insideHole = holes.some((hole) =>
        cell.left >= hole.left
        && cell.right <= hole.right
        && cell.top >= hole.top
        && cell.bottom <= hole.bottom
      );

      if (insideHole) {
        continue;
      }

      blockers.push({
        top: cell.top,
        left: cell.left,
        width: cell.right - cell.left,
        height: cell.bottom - cell.top,
        right: cell.right,
        bottom: cell.bottom,
      });
    }
  }

  return blockers;
}
