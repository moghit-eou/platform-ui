import { ChangeDetectionStrategy, Component, computed, input, OnChanges, OnInit, output, SimpleChanges } from '@angular/core';
import { DataModel } from '../../../../models/data-model.interface';

@Component({
  selector: 'app-data-model-selector',
  templateUrl: './data-model-selector.component.html',
  styleUrl: './data-model-selector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataModelSelectorComponent implements OnChanges, OnInit {
  readonly crossSectionalModels = input<DataModel[]>([]);
  readonly longitudinalModels = input<DataModel[]>([]);
  readonly defaultModel = input<DataModel | null>(null);

  readonly dataModelChange = output<DataModel | null>();

  selectedDataModel: DataModel | null = null;

  /** Single flat list for the chip loop (cross-sectional first). */
  readonly models = computed(() => [...this.crossSectionalModels(), ...this.longitudinalModels()]);

  ngOnInit(): void {
    this.updateSelectedModel();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['defaultModel'] || changes['crossSectionalModels'] || changes['longitudinalModels']) {
      this.updateSelectedModel();
    }
  }

  updateSelectedModel(): void {
    const defaultModel = this.defaultModel();
    if (this.selectedDataModel === defaultModel) {
      return;
    }

    const shouldEmit = !this.isSameModel(this.selectedDataModel, defaultModel);
    this.selectedDataModel = defaultModel;
    if (shouldEmit) {
      this.dataModelChange.emit(this.selectedDataModel);
    }
  }

  selectModel(model: DataModel): void {
    this.selectedDataModel = model;
    this.dataModelChange.emit(this.selectedDataModel);
  }

  isOptionSelected(model: DataModel): boolean {
    return this.isSameModel(this.selectedDataModel, model);
  }

  private isSameModel(a: DataModel | null, b: DataModel | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.code === b.code && String(a.version) === String(b.version);
  }
}
