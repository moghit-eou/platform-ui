import { ChangeDetectionStrategy, Component, OnDestroy, output, input } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { ExperimentDatePreset, ExperimentFilters, } from "./experiment-filter.model";

@Component({
    selector: 'app-experiment-search',
    imports: [CommonModule, FormsModule],
    templateUrl: './experiment-search.component.html',
    styleUrl: './experiment-search.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentSearchComponent implements OnDestroy {
  readonly filters = input.required<ExperimentFilters>();
  readonly filtersChange = output<Partial<ExperimentFilters>>();

  private t: ReturnType<typeof setTimeout> | null = null;

  onQueryInput(value: string) {
    if (this.t) clearTimeout(this.t);

    this.t = setTimeout(() => {
      this.filtersChange.emit({ query: value });
    }, 150);
  }

  onDatePresetChange(value: ExperimentDatePreset) {
    this.filtersChange.emit({ datePreset: value });
  }


  onClear() {
    this.filtersChange.emit({
      query: '',
      datePreset: 'any',
      algorithm: null,
      author: null,
      variable: null,
      status: 'any',
      shared: 'any',
    });
  }

  ngOnDestroy(): void {
    if (this.t) {
      clearTimeout(this.t);
      this.t = null;
    }
  }

}
