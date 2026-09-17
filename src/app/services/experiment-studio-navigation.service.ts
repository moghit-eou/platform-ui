import { Injectable, signal } from '@angular/core';

export type ExperimentStudioSection =
  | 'variables-top'
  | 'statistics-section'
  | 'algorithm-section'
  | 'execution-section';
export type DescriptiveStep = 'raw' | 'setup' | 'filters' | 'processed' | 'transformation';

export type StepState = 'active' | 'available' | 'complete' | 'locked';

interface StudioStepperState {
  activeSection: ExperimentStudioSection;
  railStatus: Record<ExperimentStudioSection, StepState>;
  lockedStepReason: string;
  /** Per-step override of `lockedStepReason` for steps that unlock on something else. */
  lockedStepReasons: Partial<Record<ExperimentStudioSection, string>>;
  isRunning: boolean;
}

export interface ExperimentStudioNavigationHost {
  navigateToSection(sectionId: ExperimentStudioSection, anchorId?: string): void;
  navigateToDescriptiveStep(step: DescriptiveStep): void;
  runExperiment(): void;
  backToDashboard(): void;
}

const DEFAULT_STATE: StudioStepperState = {
  activeSection: 'variables-top',
  railStatus: {
    'variables-top': 'active',
    'statistics-section': 'locked',
    'algorithm-section': 'locked',
    'execution-section': 'locked',
  },
  lockedStepReason: 'Add a dataset to unlock',
  lockedStepReasons: {},
  isRunning: false,
};

@Injectable({ providedIn: 'root' })
export class ExperimentStudioNavigationService {
  private host: ExperimentStudioNavigationHost | null = null;

  readonly state = signal<StudioStepperState>(DEFAULT_STATE);

  register(host: ExperimentStudioNavigationHost): void {
    this.host = host;
  }

  unregister(host: ExperimentStudioNavigationHost): void {
    if (this.host === host) {
      this.host = null;
      this.state.set(DEFAULT_STATE);
    }
  }

  publishState(partial: Partial<StudioStepperState>): void {
    this.state.update((current) => ({ ...current, ...partial }));
  }

  navigateToSection(sectionId: ExperimentStudioSection, anchorId?: string): void {
    this.host?.navigateToSection(sectionId, anchorId);
  }

  navigateToDescriptiveStep(step: DescriptiveStep): void {
    this.host?.navigateToDescriptiveStep(step);
  }

  runExperiment(): void {
    this.host?.runExperiment();
  }

  backToDashboard(): void {
    this.host?.backToDashboard();
  }

  goToPreprocessing(): void {
    this.host?.navigateToSection('statistics-section');
    this.host?.navigateToDescriptiveStep('setup');
  }
}
