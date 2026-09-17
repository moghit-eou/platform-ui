import { NgZone } from '@angular/core';

/**
 * Debounced ResizeObserver: `onSize` runs once the box stops changing, back inside the
 * Angular zone. A zero side means the element is hidden (a Studio step folded with
 * `display: none`), which each caller treats as "not a size worth drawing for".
 * Returns the teardown.
 */
export function observeSize(
  element: Element,
  ngZone: NgZone,
  debounceMs: number,
  onSize: (width: number, height: number) => void
): () => void {
  if (typeof ResizeObserver === 'undefined') {
    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: ResizeObserver | undefined;

  ngZone.runOutsideAngular(() => {
    observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      const width = Math.floor(box?.width ?? 0);
      const height = Math.floor(box?.height ?? 0);

      clearTimeout(timer);
      timer = setTimeout(() => ngZone.run(() => onSize(width, height)), debounceMs);
    });
    observer.observe(element);
  });

  return () => {
    clearTimeout(timer);
    observer?.disconnect();
  };
}
