import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Chip states shared with the per-variable preprocessing chips (see src/styles.css). */
export type StationStatus = 'default' | 'pending' | 'applied';

/**
 * Station card used by every Data review sub-step: icon tile + title + description
 * header, status chip, collapsible body and an optional footer action slot.
 */
@Component({
  selector: 'app-station-card',
  imports: [CommonModule],
  templateUrl: './station-card.component.html',
  styleUrl: './station-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StationCardComponent {
  readonly icon = input('');
  readonly title = input('');
  readonly description = input('');
  readonly statusLabel = input('');
  readonly status = input<StationStatus>('default');
  readonly open = input(true);
  readonly collapsible = input(false, { transform: booleanAttribute });
  readonly openChange = output<boolean>();
}
