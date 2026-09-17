import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NotebookNavService {
  private readonly seenStorageKey = 'mip.notebook.nav.seen';

  readonly hasVisited = signal(this.readVisited());


  markVisited(): void {
    if (this.hasVisited()) {
      return;
    }
    try {
      localStorage.setItem(this.seenStorageKey, 'true');
      this.hasVisited.set(true);
    } catch {
      // Ignore storage failures; glow may reappear on next visit.
    }
  }

  private readVisited(): boolean {
    try {
      return localStorage.getItem(this.seenStorageKey) === 'true';
    } catch {
      return false;
    }
  }
}
