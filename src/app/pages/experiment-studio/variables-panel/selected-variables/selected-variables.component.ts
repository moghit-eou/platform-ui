import { ChangeDetectionStrategy, Component, computed, output, inject, input, signal, ElementRef } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { D3HierarchyNode } from '../../../../models/data-model.interface';


@Component({
  selector: 'app-selected-variables',
  templateUrl: './selected-variables.component.html',
  styleUrl: './selected-variables.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onOutsideClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class SelectedVariablesComponent {
  private expStudioService = inject(ExperimentStudioService);
  private elementRef = inject(ElementRef);

  readonly selectedNode = input<any>();
  readonly variableClicked = output<any>();

  readonly isOpen = signal(false);

  /** The single assignable pool (data-model variables only). */
  readonly variables = computed(() => this.expStudioService.selectedVariables());

  onVariableClick(node: D3HierarchyNode): void {
    this.variableClicked.emit(node);
  }

  toggle(): void {
    this.isOpen.update((open) => !open);
  }

  close(): void {
    this.isOpen.set(false);
  }

  onOutsideClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  removeItem(item: any): void {
    this.expStudioService.setVariables(
      this.variables().filter((v) => v.code !== item.code)
    );
  }

  clearList(): void {
    this.expStudioService.setVariables([]);
  }
}
