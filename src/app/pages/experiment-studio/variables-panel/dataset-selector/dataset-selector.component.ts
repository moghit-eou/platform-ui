import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

@Component({
  selector: 'app-dataset-selector',
  templateUrl: './dataset-selector.component.html',
  styleUrl: './dataset-selector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetSelectorComponent {
  private expStudioService = inject(ExperimentStudioService);

  readonly datasets = input<{ code: string; label: string }[]>([]);
  readonly selectedDatasetCodes = input<string[]>([]);

  /** Selection lives in the service; this is it filtered to the live datasets. */
  readonly selectedDatasets = computed(() => {
    const available = new Set(this.datasets().map((dataset) => dataset.code));
    return new Set(this.selectedDatasetCodes().filter((code) => available.has(code)));
  });

  readonly totalCount = computed(() => this.datasets().length);
  readonly selectedCount = computed(() => this.selectedDatasets().size);
  toggleDataset(datasetCode: string): void {
    const selected = this.selectedDatasets();
    if (selected.has(datasetCode)) {
      selected.delete(datasetCode);
    } else {
      selected.add(datasetCode);
    }
    this.expStudioService.setSelectedDatasets(Array.from(selected));
  }

  selectAll(): void {
    const allCodes = this.datasets().map((dataset) => dataset.code);
    this.expStudioService.setSelectedDatasets(allCodes);
  }

  clearAll(): void {
    this.expStudioService.setSelectedDatasets([]);
  }

  isDatasetSelected(datasetCode: string): boolean {
    return this.selectedDatasets().has(datasetCode);
  }
}
