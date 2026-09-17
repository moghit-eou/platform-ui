import { computed, signal } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Bookend for server writes: one request per key on the wire (a doubled click is one write, while
 * unrelated keys still run in parallel), a `busy` signal to disarm controls with, and the failure
 * line routed to whichever signal the owner of the control shows it in.
 */
export class InflightWrites {
  readonly busy = computed(() => this.pending() > 0);
  private readonly keys = new Set<string>();
  private readonly pending = signal(0);

  constructor(private readonly report: (message: string) => void) {}

  run<T>(key: string, request: Observable<T>, onDone: (value: T) => void, failure: string): void {
    if (this.keys.has(key)) return;

    this.keys.add(key);
    this.pending.update((count) => count + 1);
    request.subscribe({
      next: (value) => {
        this.finish(key);
        onDone(value);
      },
      error: (err) => {
        this.finish(key);
        console.error('[InflightWrites] write failed', key, err);
        this.report(failure);
      },
    });
  }

  private finish(key: string): void {
    this.keys.delete(key);
    this.pending.update((count) => Math.max(0, count - 1));
  }
}
