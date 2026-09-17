import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { prettifyLabel } from '../../../core/algorithm-mappers';
import { AlgorithmResultComponent } from '../algorithm-panel/algorithm-result/algorithm-result.component';
import { ExperimentSetupSummaryComponent } from './experiment-setup-summary/experiment-setup-summary.component';

/**
 * Experiment Execution step: the run skeleton, its error state, and the result view with
 * its docked setup summary.
 * It owns no run configuration — Save As / Export stay on the algorithm panel, which owns
 * the parameter form, and are emitted back to it by the studio shell.
 */
@Component({
  selector: 'app-execution-panel',
  imports: [FormsModule, RouterLink, AlgorithmResultComponent, ExperimentSetupSummaryComponent],
  templateUrl: './execution-panel.component.html',
  styleUrl: './execution-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExecutionPanelComponent {
  private expStudioService = inject(ExperimentStudioService);
  private studioNavigation = inject(ExperimentStudioNavigationService);

  readonly isRunning = this.expStudioService.isRunning;
  readonly result = this.expStudioService.runResult;
  /** Setup behind the result; the summary aside is only rendered when a run captured one. */
  readonly setupSnapshot = this.expStudioService.runSetup;
  readonly runError = this.expStudioService.runError;
  readonly schema = this.expStudioService.lastRunSchema;
  readonly loadingText = this.expStudioService.runStatusText;
  readonly mipVersion = inject(RuntimeEnvService).mipVersion;

  readonly saveAsMode = signal(false);
  readonly saveAsName = signal('');
  readonly showSuccessNotification = this.expStudioService.saveSucceeded;

  readonly resultAlgorithmLabel = computed(() => {
    const algoKey = this.expStudioService.lastUsedAlgorithm() ?? '';
    if (!algoKey) return 'Algorithm';
    return this.expStudioService.backendAlgorithms()[algoKey]?.label ?? prettifyLabel(algoKey);
  });

  readonly resultDisplayTitle = computed(() => {
    const explicitTitle = this.result()?.title;
    if (typeof explicitTitle === 'string' && explicitTitle.trim()) return explicitTitle.trim();
    return `Result ${this.resultAlgorithmLabel()}`;
  });

  readonly resultAlgorithmKey = computed(() => this.expStudioService.lastUsedAlgorithm() ?? '');
  readonly enumMaps = computed(() => this.expStudioService.getCategoricalEnumMaps());
  readonly yVar = computed(() => this.expStudioService.algorithmY()[0]?.code ?? null);
  readonly xVar = computed(() => this.expStudioService.algorithmX()[0]?.code ?? null);
  readonly labelMap = this.expStudioService.variableLabelMap;

  /** Save As and PDF export need the parameter form, so the algorithm panel keeps them. */
  readonly saveAs = output<string>();
  readonly exportPdf = output<HTMLElement>();

  constructor() {
    // The save itself runs on the algorithm panel (it owns the parameter form); its success
    // flag is the shared signal that closes this panel's inline Save As form.
    effect(() => {
      if (this.expStudioService.saveSucceeded()) {
        this.saveAsMode.set(false);
      }
    });
  }

  toggleSaveAsMode(): void {
    this.saveAsMode.update((v) => !v);
    if (this.saveAsMode()) {
      this.saveAsName.set(`Experiment for ${this.resultAlgorithmLabel()}`);
    }
  }

  cancelSaveAs(): void {
    this.saveAsMode.set(false);
    this.saveAsName.set('');
  }

  onSaveAs(): void {
    const name = this.saveAsName().trim();
    if (!name) return;
    this.saveAs.emit(name);
  }

  backToAlgorithm(): void {
    this.cancelSaveAs();
    this.studioNavigation.navigateToSection('algorithm-section');
  }
}
