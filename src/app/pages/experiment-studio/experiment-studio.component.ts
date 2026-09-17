import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy, OnInit, signal, viewChild, computed } from '@angular/core';
import { VariablesPanelComponent } from './variables-panel/variables-panel.component';
import { ActivatedRoute, Router } from '@angular/router';
import { ExperimentStudioService } from '../../services/experiment-studio.service';
import { AlgorithmPanelComponent } from './algorithm-panel/algorithm-panel.component';
import { ExecutionPanelComponent } from './execution-panel/execution-panel.component';
import { AuthService } from '../../services/auth.service';
import { ExperimentsDashboardService } from '../../services/experiments-dashboard.service';
import { ErrorService } from '../../services/error.service';
import { StudioStepperComponent } from './stepper/studio-stepper.component';
import {
  DescriptiveProgressState,
  StatisticAnalysisPanelComponent,
} from './statistic-analysis-panel/statistic-analysis-panel.component';
import { countFilterRules } from '../../core/filter-display.utils';
import { Subject, takeUntil } from 'rxjs';
import { ExperimentStudioGuideComponent } from './guide/experiment-studio-guide.component';
import { GuideSection } from './guide/experiment-studio-guide.content';
import { getAnalysisGuideLayout } from './guide/experiment-studio-analysis-guide.util';
import {
  DescriptiveStep,
  ExperimentStudioNavigationHost,
  ExperimentStudioNavigationService,
  ExperimentStudioSection,
} from '../../services/experiment-studio-navigation.service';

type StudioSectionId =
  | 'variables-top'
  | 'statistics-section'
  | 'algorithm-section'
  | 'execution-section';
type AlgorithmSubstepKey = 'setup' | 'parameters';

@Component({
  selector: 'app-experiment-studio',
  imports: [
    VariablesPanelComponent,
    AlgorithmPanelComponent,
    ExecutionPanelComponent,
    StatisticAnalysisPanelComponent,
    ExperimentStudioGuideComponent,
    StudioStepperComponent,
  ],
  templateUrl: './experiment-studio.component.html',
  styleUrl: './experiment-studio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentStudioComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dashboardService = inject(ExperimentsDashboardService);
  public auth = inject(AuthService);
  private errorService = inject(ErrorService);
  private studioNavigation = inject(ExperimentStudioNavigationService);

  // Public service for telemetry/ribbon signals
  public expStudioService = inject(ExperimentStudioService);
  readonly isRunning = this.expStudioService.isRunning;
  readonly selectedDataModel = this.expStudioService.selectedDataModel;
  readonly selectedDatasets = this.expStudioService.selectedDatasets;
  readonly selectedAlgorithm = this.expStudioService.selectedAlgorithm;
  readonly dataExclusionWarnings = this.expStudioService.dataExclusionWarnings;
  readonly pathologyAccessWarning = this.expStudioService.pathologyAccessWarning;
  readonly dismissedPathologyWarning = signal(false);
  readonly visiblePathologyAccessWarning = computed(() => {
    const warning = this.pathologyAccessWarning();
    return warning && !this.dismissedPathologyWarning() ? warning : null;
  });
  readonly algorithmPanel = viewChild(AlgorithmPanelComponent);
  readonly runResult = this.expStudioService.runResult;
  readonly statisticPanel = viewChild(StatisticAnalysisPanelComponent);

  // --- Step views -------------------------------------------------
  activeSection = signal<StudioSectionId>('variables-top');
  readonly hasDatasetContext = computed(() => (
    !!this.selectedDataModel() && this.selectedDatasets().length > 0
  ));
  readonly hasAnalysisSelection = computed(() => (
    this.expStudioService.selectedVariables().length > 0
  ));
  readonly isDataReviewReady = computed(() => this.hasDatasetContext() && this.hasAnalysisSelection());
  readonly isAlgorithmReady = computed(() => this.isDataReviewReady());

  readonly isAlgorithmActive = computed(() => this.activeSection() === 'algorithm-section');

  readonly previousSection = computed<StudioSectionId | null>(() => {
    const idx = this.sectionIds.indexOf(this.activeSection());
    return idx > 0 ? this.sectionIds[idx - 1] : null;
  });

  /** Stepper labels are the source for the back affordance, so the two never drift. */
  readonly backLabel = computed(() => {
    const prev = this.previousSection();
    if (!prev) return '';
    const labels: Record<StudioSectionId, string> = {
      'variables-top': 'Data Exploration',
      'statistics-section': 'Data Handling',
      'algorithm-section': 'Algorithm Selection',
      'execution-section': 'Experiment Execution',
    };
    return `Back to ${labels[prev]}`;
  });

  readonly ctaLabel = computed(() => {
    if (this.isAlgorithmActive()) {
      return this.isRunning() ? 'Running…' : 'Run experiment';
    }
    if (this.activeSection() === 'variables-top') {
      const count = this.expStudioService.selectedVariables().length;
      return count > 0 ? `Continue with ${count} variable${count > 1 ? 's' : ''}` : 'Continue';
    }
    if (this.activeSection() === 'statistics-section') {
      return 'Continue to Algorithm Selection';
    }
    return 'Continue';
  });

  readonly canContinue = computed(() => {
    const active = this.activeSection();
    const status = this.railStatus();
    if (this.isRunning()) return false;
    if (active === 'variables-top') {
      return status['statistics-section'] !== 'locked';
    }
    if (active === 'statistics-section') {
      return status['algorithm-section'] !== 'locked';
    }
    if (active === 'algorithm-section') {
      return this.algorithmPanel()?.canRun() ?? false;
    }
    return false;
  });

  readonly ctaDisabledReason = computed(() => {
    if (this.canContinue()) return '';
    if (this.isRunning()) return 'Experiment is running';
    if (this.isAlgorithmActive()) {
      return this.algorithmPanel()?.runDisabledReason() ?? 'Select an algorithm to run';
    }
    return this.lockedStepReason;
  });

  private get unlockWait(): string {
    return this.hasDatasetContext() ? 'a variable' : 'a dataset';
  }

  get lockedStepReason(): string {
    return `Add ${this.unlockWait} to unlock`;
  }

  descriptiveProgress = signal<DescriptiveProgressState>({
    pendingChangeCount: 0,
    preprocessingStatus: 'none',
    transformationStatusLabel: 'Not defined',
  });
  readonly sectionIds: StudioSectionId[] = [
    'variables-top',
    'statistics-section',
    'algorithm-section',
    'execution-section',
  ] as const;

  readonly algorithmSubstep = signal<AlgorithmSubstepKey>('setup');

  readonly filterRuleCount = computed(() =>
    countFilterRules(this.expStudioService.filterLogic())
  );

  readonly dataReviewWorked = computed(() => {
    const progress = this.descriptiveProgress();
    return (
      progress.preprocessingStatus === 'applied' ||
      this.filterRuleCount() > 0
    );
  });

  readonly railStatus = computed<Record<StudioSectionId, 'active' | 'available' | 'complete' | 'locked'>>(() => {
    const active = this.activeSection();
    const variables: 'active' | 'available' | 'complete' =
      active === 'variables-top'
        ? 'active'
        : this.isDataReviewReady()
          ? 'complete'
          : 'available';

    const statistics: 'active' | 'available' | 'complete' | 'locked' =
      !this.isDataReviewReady()
        ? 'locked'
        : active === 'statistics-section'
          ? 'active'
          : this.dataReviewWorked()
            ? 'complete'
            : 'available';

    const algorithm: 'active' | 'available' | 'complete' | 'locked' =
      !this.isAlgorithmReady()
        ? 'locked'
        : active === 'algorithm-section'
          ? 'active'
          : !!this.expStudioService.selectedAlgorithm() && this.dataReviewWorked()
            ? 'complete'
            : 'available';

    // Execution is session-scoped: it unlocks the first time a run is dispatched here.
    const execution: 'active' | 'available' | 'complete' | 'locked' =
      !this.expStudioService.hasRunStarted()
        ? 'locked'
        : active === 'execution-section'
          ? 'active'
          : !!this.expStudioService.runResult()
            ? 'complete'
            : 'available';

    return {
      'variables-top': variables,
      'statistics-section': statistics,
      'algorithm-section': algorithm,
      'execution-section': execution,
    };
  });

  readonly lockedStepReasons: Partial<Record<StudioSectionId, string>> = {
    'execution-section': 'Run the experiment to unlock',
  };

  readonly unlockAnnouncement = signal<string | null>(null);
  private prevLocked = this.railStatus()['statistics-section'] === 'locked';
  private unlockTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Sync state into the bridge service so the header stepper stays reactive
    effect(() => {
      this.studioNavigation.publishState({
        activeSection: this.activeSection(),
        railStatus: this.railStatus(),
        lockedStepReason: this.lockedStepReason,
        lockedStepReasons: this.lockedStepReasons,
        isRunning: this.isRunning(),
      });
    });

    effect(() => {
      const locked = this.railStatus()['statistics-section'] === 'locked';
      const wasLocked = this.prevLocked;
      this.prevLocked = locked;
      if (wasLocked && !locked) {
        this.unlockAnnouncement.set('Data Handling and Algorithm Selection are now available.');
        if (this.unlockTimer) clearTimeout(this.unlockTimer);
        this.unlockTimer = setTimeout(() => this.unlockAnnouncement.set(null), 1500);
      }
    });
  }

  private readonly navigationHost: ExperimentStudioNavigationHost = {
    navigateToSection: (sectionId, anchorId) => this.navigateToStudioSection(sectionId, anchorId),
    navigateToDescriptiveStep: (step) => this.goToDescriptiveStep(step),
    runExperiment: () => this.runCurrentExperiment(),
    backToDashboard: () => this.onBackToDashboard(),
  };

  private destroy$ = new Subject<void>();
  errorMessage = computed(() => this.errorService.error() ?? '');

  ngOnInit(): void {
    this.errorService.clearError();
    this.dismissedPathologyWarning.set(false);
    this.expStudioService.clearDataExclusionWarnings();
    const initialMode = this.route.snapshot.queryParamMap.get('mode');
    const initialExperimentId = this.route.snapshot.queryParamMap.get('experimentId');
    if (initialMode === 'edit' && initialExperimentId) {
      this.expStudioService.setEditingExistingExperiment(true);
    }
    this.expStudioService.loadAndCategorizeModels().subscribe();

    this.route.queryParamMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        const experimentId = params.get('experimentId');
        const mode = params.get('mode');

        if (mode === 'edit' && experimentId) {
          this.loadExperimentForEdit(experimentId);
        } else if (mode === 'duplicate' && experimentId) {
          this.loadExperimentForDuplicate(experimentId);
        } else {
          this.initCreateMode();
        }
      });

    this.activateFromFragment(this.route.snapshot.fragment);
    this.route.fragment
      .pipe(takeUntil(this.destroy$))
      .subscribe((fragment) => this.activateFromFragment(fragment));
  }

  ngOnDestroy(): void {
    if (this.unlockTimer) clearTimeout(this.unlockTimer);
    this.studioNavigation.unregister(this.navigationHost);
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    this.studioNavigation.register(this.navigationHost);
  }

  dismissError(): void {
    this.errorService.clearError();
    this.expStudioService.loadAndCategorizeModels().subscribe();
  }

  dismissDataExclusionWarnings(): void {
    this.expStudioService.clearDataExclusionWarnings();
  }

  dismissPathologyWarning(): void {
    this.dismissedPathologyWarning.set(true);
  }

  goToDescriptiveStep(section: DescriptiveStep): void {
    if (this.railStatus()['statistics-section'] === 'locked') {
      return;
    }
    this.navigateToStudioSection('statistics-section');
    this.scrollToDescriptiveStep(section);
  }

  switchSection(sectionId: StudioSectionId): void {
    if (this.railStatus()[sectionId] === 'locked') {
      return;
    }
    this.navigateToStudioSection(sectionId);
  }

  readonly activateGuideTarget = (view: GuideSection, stepId?: string): void => {
    // Explore -> variables, Analysis -> statistics, Experiment -> algorithm setup,
    // Results -> execution (result / save-as chrome). Keep these distinct so the
    // guide can see zero-size-sensitive targets like [data-guide="experiment-result"].
    const target: StudioSectionId =
      view === 'Analysis'
        ? 'statistics-section'
        : view === 'Results'
          ? 'execution-section'
          : view === 'Experiment'
            ? 'algorithm-section'
            : 'variables-top';
    this.activeSection.set(target);

    if (target === 'statistics-section' && stepId) {
      const section = this.guideStepToSection(stepId);
      if (section) {
        this.statisticPanel()?.goToSection(section);
      }
    }
  };

  private guideStepToSection(stepId: string): DescriptiveStep | null {
    const layout = getAnalysisGuideLayout(stepId);
    if (!layout || layout.expandSection === 'none') {
      return null;
    }
    return layout.expandSection as DescriptiveStep;
  }

  private scrollToDescriptiveStep(section: DescriptiveStep): void {
    requestAnimationFrame(() => this.statisticPanel()?.goToSection(section));
  }

  private runCurrentExperiment(): void {
    if (this.activeSection() !== 'algorithm-section') {
      this.navigateToStudioSection('algorithm-section');
    }
    this.algorithmPanel()?.onClickRunExp();
    if (this.expStudioService.isRunning()) {
      this.navigateToStudioSection('execution-section');
    }
  }

  private navigateToStudioSection(sectionId: ExperimentStudioSection, anchorId?: string): void {
    this.activeSection.set(sectionId as StudioSectionId);
    if (sectionId === 'algorithm-section' && !anchorId) {
      const step: AlgorithmSubstepKey = this.selectedAlgorithm() ? 'parameters' : 'setup';
      this.algorithmSubstep.set(step);
      queueMicrotask(() => this.algorithmPanel()?.setStudioSubstep(step));
    }

    void this.router.navigate([], {
      fragment: sectionId,
      queryParamsHandling: 'preserve',
    });

    requestAnimationFrame(() => {
      if (anchorId) {
        document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  private activateFromFragment(fragment: string | null): void {
    if (!fragment) return;
    const targetId = fragment === 'studio-top' ? 'variables-top' : fragment;
    const section = this.sectionIds.find((id) => id === targetId);
    if (!section) return;
    if (section === 'execution-section' && !this.expStudioService.hasRunStarted()) return;

    if (this.activeSection() === section) {
      return;
    }

    this.activeSection.set(section);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  private initCreateMode(): void {
    this.expStudioService.setEditingExistingExperiment(false);
  }

  private loadExperimentForEdit(uuid: string): void {
    this.expStudioService.setEditingExistingExperiment(true);
    this.dashboardService.getExperiment(uuid).subscribe({
      next: (backendExp) => {
        this.expStudioService.hydrateFromBackendExperiment(backendExp);
      },
      error: (err) => {
        console.error('Failed to load experiment for edit:', err);
        this.initCreateMode();
      },
    });
  }

  private loadExperimentForDuplicate(uuid: string): void {
    this.dashboardService.getExperiment(uuid).subscribe({
      next: (backendExp) => {
        this.expStudioService.hydrateFromBackendExperiment(backendExp);
        // Keep the configuration, drop the persisted identity and run it as a new experiment.
        this.expStudioService.clearCurrentExperimentUUID();
        this.expStudioService.setEditingExistingExperiment(false);
      },
      error: (err) => {
        console.error('Failed to load experiment for duplication:', err);
        this.initCreateMode();
      },
    });
  }

  onBackClick(): void {
    const prev = this.previousSection();
    if (prev) {
      this.switchSection(prev);
    }
  }

  onBackToDashboard(): void {
    if (this.isRunning()) {
      return;
    }

    this.expStudioService.resetStudioState();
    this.expStudioService.setEditingExistingExperiment(false);
    this.errorService.clearError();
    this.expStudioService.loadAndCategorizeModels().subscribe();

    this.router.navigate(['/experiments-dashboard']);
  }

  onCtaClick(): void {
    if (!this.canContinue()) return;
    const active = this.activeSection();
    if (active === 'variables-top') {
      this.switchSection('statistics-section');
    } else if (active === 'statistics-section') {
      this.switchSection('algorithm-section');
    } else if (active === 'algorithm-section') {
      this.runCurrentExperiment();
    }
  }
}
