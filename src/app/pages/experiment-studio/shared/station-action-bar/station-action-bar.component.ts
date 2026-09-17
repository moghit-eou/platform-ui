import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';

/**
 * Footer action bar shared by every Data handling station: count chip + status text on the
 * left, Clear + Preview data + primary Apply & Continue on the right.
 */
@Component({
  selector: 'app-station-action-bar',
  templateUrl: './station-action-bar.component.html',
  styleUrl: './station-action-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StationActionBarComponent {
  readonly pendingCount = input(0);
  readonly statusText = input('');
  readonly tone = input<'default' | 'pending' | 'applied'>('default');
  /** Empty label hides the secondary action. */
  readonly resetLabel = input('');
  /** Empty label hides the middle preview action (shows the applied-state data). */
  readonly previewLabel = input('');
  readonly applyLabel = input('Apply');
  readonly applyIcon = input('');
  /**
   * 'quiet' draws the primary slot as an outline instead of a solid fill. Used when the
   * slot has nothing to commit and says Close: the solid button stays reserved for a
   * change that will actually be written.
   */
  readonly applyVariant = input<'primary' | 'quiet'>('primary');
  readonly resetDisabled = input(false);
  readonly applyDisabled = input(false);
  /** Footer variant: drops the own border/radius so it merges with the station card's bottom border. */
  readonly flush = input(false, { transform: booleanAttribute });
  readonly reset = output<void>();
  readonly preview = output<void>();
  readonly apply = output<void>();
}
