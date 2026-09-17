import { Injectable, signal } from '@angular/core';

/** What the header needs to draw a Guide control: a label and a way to start. */
export interface GuideLauncher {
  label: string;
  start: () => void;
}

/**
 * The guide lives in the page that owns it (dashboard, studio); the bar that shows its
 * control lives in the shell. The two halves meet here instead of the guide reaching into
 * the header or the header guessing which route has a tour.
 *
 * Each guide registers its own object and unregisters that same object, so a route change
 * cannot let the outgoing guide clear the incoming one's entry.
 */
@Injectable({ providedIn: 'root' })
export class GuideLauncherService {
  readonly launcher = signal<GuideLauncher | null>(null);

  register(launcher: GuideLauncher): void {
    this.launcher.set(launcher);
  }

  unregister(launcher: GuideLauncher): void {
    if (this.launcher() === launcher) {
      this.launcher.set(null);
    }
  }
}
