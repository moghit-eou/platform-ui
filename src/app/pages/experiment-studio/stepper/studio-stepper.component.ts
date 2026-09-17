import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  ExperimentStudioNavigationService,
  ExperimentStudioSection,
  StepState,
} from '../../../services/experiment-studio-navigation.service';

interface ParentStep {
  id: ExperimentStudioSection;
  index: number;
  label: string;
  guide: string;
}

@Component({
  selector: 'app-studio-stepper',
  templateUrl: './studio-stepper.component.html',
  styleUrl: './studio-stepper.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioStepperComponent {
  private nav = inject(ExperimentStudioNavigationService);
  readonly state = this.nav.state;

  readonly parentSteps: ParentStep[] = [
    { id: 'variables-top', index: 1, label: 'Data Exploration', guide: 'studio-step-variables' },
    { id: 'statistics-section', index: 2, label: 'Data Handling', guide: 'studio-step-statistics' },
    { id: 'algorithm-section', index: 3, label: 'Algorithm Selection', guide: 'studio-step-algorithm' },
    { id: 'execution-section', index: 4, label: 'Experiment Execution', guide: 'studio-step-execution' },
  ];

  readonly activeSection = computed(() => this.state().activeSection);

  stepState(id: ExperimentStudioSection): StepState {
    return this.state().railStatus[id] ?? 'available';
  }

  isStepClickable(id: ExperimentStudioSection): boolean {
    return this.stepState(id) !== 'locked';
  }

  /** Locked steps explain themselves; the generic reason is the fallback. */
  stepTitle(step: ParentStep): string {
    if (this.isStepClickable(step.id)) return step.label;
    return this.state().lockedStepReasons[step.id] ?? this.state().lockedStepReason;
  }

  onStepClick(id: ExperimentStudioSection): void {
    if (!this.isStepClickable(id)) return;
    this.nav.navigateToSection(id);
  }
}
