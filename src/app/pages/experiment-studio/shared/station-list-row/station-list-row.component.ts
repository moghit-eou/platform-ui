import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Shared row anatomy for station lists (filter conditions, transformation category rules):
 * projected content on the left, remove action on the right.
 */
@Component({
  selector: 'app-station-list-row',
  templateUrl: './station-list-row.component.html',
  styleUrl: './station-list-row.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StationListRowComponent {
  readonly removeLabel = input('Remove');
  readonly remove = output<void>();
}
