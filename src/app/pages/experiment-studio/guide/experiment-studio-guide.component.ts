import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  EXPERIMENT_STUDIO_GUIDE_LABELS,
  EXPERIMENT_STUDIO_GUIDE_STEPS,
  ExperimentStudioGuideStep,
  GuideSection,
} from './experiment-studio-guide.content';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { GuideOnboardingService } from '../../../services/guide-onboarding.service';
import { GuideLauncherService, GuideLauncher } from '../../../services/guide-launcher.service';
import { ExperimentStudioGuideStateService } from './experiment-studio-guide-state.service';
import { computeGuideBlockingRects, measureGuideInteractionRect } from './experiment-studio-guide-mask.util';

interface GuideRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

@Component({
  selector: 'app-experiment-studio-guide',
  imports: [CommonModule],
  templateUrl: './experiment-studio-guide.component.html',
  styleUrl: './experiment-studio-guide.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onViewportChange()',
    '(window:scroll)': 'onViewportChange()',
    '(window:keydown)': 'onWindowKeydown($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ExperimentStudioGuideComponent implements OnInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly experimentStudioService = inject(ExperimentStudioService);
  private readonly guideOnboarding = inject(GuideOnboardingService);
  private readonly guideLauncher = inject(GuideLauncherService);
  private readonly guideState = inject(ExperimentStudioGuideStateService);
  private layoutTimer: number | null = null;
  private autoAdvanceTimer: number | null = null;
  private targetResizeObserver: ResizeObserver | null = null;
  private observedTarget: HTMLElement | null = null;
  private domMutationObserver: MutationObserver | null = null;

  /** The bar draws this (see GuideLauncherService); the launcher button used to be a
   *  fixed circle floating over the header at z 10001. */
  private readonly launcherHandle: GuideLauncher = {
    label: EXPERIMENT_STUDIO_GUIDE_LABELS.launcher,
    start: () => this.startGuide(),
  };

  /**
   * View-activation hook provided by the studio shell. The guide must activate a
   * rail-switched view before querying/measuring a target inside it, because hidden
   * views are display:none and report zero dimensions. The step id lets the shell
   * additionally open the relevant sub-tab inside the activated view (e.g. an
   * Analysis tour step opens its statistics sub-tab before the guide measures it).
   */
  @Input() activateGuideTarget?: (view: GuideSection, stepId?: string) => void;

  @ViewChild('guideCard')
  private guideCard?: ElementRef<HTMLElement>;

  readonly labels = EXPERIMENT_STUDIO_GUIDE_LABELS;
  readonly guideCovariateLabel = this.guideState.guideCovariate.label;
  readonly guideVariableLabel = this.guideState.guideVariable.label;
  readonly isOpen = signal(false);
  readonly activeSteps = signal<ExperimentStudioGuideStep[]>([]);
  readonly currentIndex = signal(0);
  readonly highlightRect = signal<GuideRect | null>(null);
  readonly interactionCutouts = signal<GuideRect[]>([]);
  readonly blockingMaskRects = signal<GuideRect[]>([]);
  readonly isCollapsed = signal(false);
  private readonly domRevision = signal(0);
  private readonly experimentSaveBaselineUuid = signal<string | null | undefined>(undefined);
  private readonly pendingStudioResetOnContinue = signal(false);

  readonly currentStep = computed(() => this.activeSteps()[this.currentIndex()] ?? null);
  readonly previousStep = computed(() => this.activeSteps()[this.currentIndex() - 1] ?? null);
  readonly totalSteps = computed(() => this.activeSteps().length);
  readonly currentStepNumber = computed(() => (this.currentStep() ? this.currentIndex() + 1 : 0));
  readonly progressPercent = computed(() => {
    const total = this.totalSteps();
    return total ? (this.currentStepNumber() / total) * 100 : 0;
  });
  readonly hasPrevious = computed(() => this.currentIndex() > 0);
  readonly canGoToPrevious = computed(() => this.hasPrevious() && !this.previousStep()?.requirement);
  readonly isLastStep = computed(() => this.currentIndex() >= this.totalSteps() - 1);
  readonly canGoToNext = computed(() => this.isStepRequirementSatisfied(this.currentStep()));
  readonly stepNeedsAction = computed(() => !!this.currentStep()?.requirement && !this.canGoToNext());
  readonly isDashboardStep = computed(() => this.currentStep()?.id === 'experiment-finish');
  readonly nextButtonLabel = computed(() =>
    this.stepNeedsAction()
      ? 'Action required'
      : this.isDashboardStep()
        ? this.labels.moveToDashboard
        : this.isLastStep()
          ? this.labels.done
          : this.labels.next
  );
  readonly studioResetWarning = computed(() => {
    if (this.currentStep()?.id !== 'launcher' || !this.pendingStudioResetOnContinue()) {
      return null;
    }

    return 'Warning: continuing past this step will reset your current session, including variables, covariates, preprocessing, and algorithm selection.';
  });
  readonly pendingRequirementHint = computed(() => {
    const step = this.currentStep();
    if (!step?.requirement || this.canGoToNext()) {
      return null;
    }

    switch (step.requirement) {
      case 'selected-sex':
        return this.replaceGuideTargets('Either use the search bar to find the Sex variable or click the green-highlighted variable through the bubble chart to continue.');
      case 'variable-sex':
        return 'Click Add to put ' + this.guideCovariateLabel + ' into the experiment. Open the selected-variables count in the details header to review the list.';
      case 'selected-age':
        return this.replaceGuideTargets('Either use the search bar to find the Age variable or click the green-highlighted variable through the bubble chart to continue. You can also explore the chart and details on the right.');
      case 'variable-age':
        return 'Click Add to put ' + this.guideVariableLabel + ' into the experiment. Open the selected-variables count in the details header to review the list.';
      case 'roles-assigned':
        return 'Assign each added variable as an outcome (Variables / y) or a predictor (Covariates / x) on the algorithm panel to continue.';
      case 'algorithm-selected':
        return 'Select any available algorithm with a green tick to continue.';
      case 'experiment-result-ready':
        return 'Run the experiment and wait for the result view to load before continuing.';
      case 'save-as-opened':
        return 'Click Save as to open the save form and continue.';
      case 'experiment-saved-as':
        return 'Enter a name and click Save. The guide continues automatically once the experiment has been saved.';
      default:
        return null;
    }
  });

  constructor() {
    effect(() => {
      this.guideState.setActiveStep(this.isOpen() ? this.currentStep()?.id ?? null : null);
    });

    effect(() => {
      const step = this.currentStep();

      if (!this.isOpen() || step?.requirement !== 'experiment-saved-as') {
        this.experimentSaveBaselineUuid.set(undefined);
        return;
      }

      const currentUuid = this.experimentStudioService.currentExperimentUUID();
      if (this.experimentSaveBaselineUuid() === undefined) {
        this.experimentSaveBaselineUuid.set(currentUuid);
      }
    });

    effect(() => {
      this.experimentStudioService.selectedVariables();
      this.experimentStudioService.algorithmY();
      this.experimentStudioService.algorithmX();
      this.experimentStudioService.selectedAlgorithm();
      this.experimentStudioService.runResult();
      this.experimentStudioService.currentExperimentUUID();
      this.guideState.selectedHierarchyNode();
      const step = this.currentStep();

      if (
        !this.isOpen() ||
        !step?.requirement ||
        !this.shouldAutoAdvance(step) ||
        !this.isStepRequirementSatisfied(step)
      ) {
        this.clearAutoAdvanceTimer();
        return;
      }

      this.clearAutoAdvanceTimer();
      this.autoAdvanceTimer = window.setTimeout(() => {
        if (this.isOpen() && this.currentStep()?.id === step.id && this.isStepRequirementSatisfied(step)) {
          this.goToNextStep();
        }
      }, 320);
    });
  }

  ngOnInit(): void {
    this.guideLauncher.register(this.launcherHandle);
  }

  ngOnDestroy(): void {
    this.guideLauncher.unregister(this.launcherHandle);
    this.disconnectTargetObserver();
    this.disconnectDomObserver();
    this.clearLayoutTimer();
    this.clearAutoAdvanceTimer();
  }

  startGuide(manual = true): void {
    if (!manual && this.guideOnboarding.hasSeenStudioGuide()) {
      return;
    }

    this.pendingStudioResetOnContinue.set(
      this.guideOnboarding.hasSeenStudioGuide()
      && this.experimentStudioService.hasPersistedStudioWork(),
    );

    const warning = this.experimentStudioService.pathologyAccessWarning();
    let resolvedSteps: ExperimentStudioGuideStep[];

    if (warning) {
      resolvedSteps = [{
        id: 'no-pathology-access',
        section: 'Explore',
        title: 'No Access to Federation Pathologies',
        body: '',
        selector: '.pathology-warning-banner',
        allowTargetInteraction: false
      }];
    } else {
      resolvedSteps = this.resolveSteps();
      if (!resolvedSteps.length) {
        return;
      }
    }

    this.activeSteps.set(resolvedSteps);
    this.currentIndex.set(0);
    this.isCollapsed.set(false);
    this.isOpen.set(true);
    this.startDomObserver();
    this.syncStepLayout();
  }

  closeGuide(): void {
    this.guideOnboarding.markStudioGuideSeen();
    this.pendingStudioResetOnContinue.set(false);
    this.isOpen.set(false);
    this.isCollapsed.set(false);
    this.activeSteps.set([]);
    this.currentIndex.set(0);
    this.highlightRect.set(null);
    this.interactionCutouts.set([]);
    this.blockingMaskRects.set([]);
    this.disconnectTargetObserver();
    this.disconnectDomObserver();
    this.clearLayoutTimer();
    this.clearAutoAdvanceTimer();
  }

  goToNextStep(): void {
    if (!this.canGoToNext()) {
      return;
    }

    const step = this.currentStep();
    if (step?.id === 'launcher' && this.pendingStudioResetOnContinue()) {
      this.experimentStudioService.resetStudioStateForGuide();
      this.pendingStudioResetOnContinue.set(false);
    }

    if (this.isDashboardStep()) {
      this.closeGuide();
      void this.router.navigate(['/experiments-dashboard']);
      return;
    }

    if (this.isLastStep()) {
      this.closeGuide();
      return;
    }

    const nextIndex = this.currentIndex() + 1;
    this.currentIndex.set(nextIndex);
    this.syncStepLayout();
  }

  goToPreviousStep(): void {
    if (!this.canGoToPrevious()) {
      return;
    }

    const previousIndex = this.currentIndex() - 1;
    this.currentIndex.set(previousIndex);
    this.syncStepLayout();
  }

  toggleCollapsed(): void {
    this.isCollapsed.update((collapsed) => !collapsed);
    this.scheduleLayoutUpdate(0);
  }

  onViewportChange(): void {
    if (!this.isOpen()) {
      return;
    }

    this.scheduleLayoutUpdate(0);
  }

  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.isOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeGuide();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.goToNextStep();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.goToPreviousStep();
    }
  }

  onDocumentClick(event: MouseEvent): void {
    const step = this.currentStep();
    if (!this.isOpen() || !step?.advanceOnTargetClick || !step.selector) {
      return;
    }

    const clickedNode = event.target;
    if (!(clickedNode instanceof Node)) {
      return;
    }

    const target = this.findTarget(step.selector);
    if (!target || !target.contains(clickedNode)) {
      return;
    }

    window.setTimeout(() => {
      if (this.isOpen() && this.currentStep()?.id === step.id) {
        this.goToNextStep();
      }
    }, 260);
  }

  private resolveSteps(): ExperimentStudioGuideStep[] {
    return EXPERIMENT_STUDIO_GUIDE_STEPS.map((step) => ({
      ...step,
      title: this.replaceGuideTargets(step.title),
      body: this.replaceGuideTargets(step.body),
    }));
  }

  private replaceGuideTargets(text: string): string {
    return text
      .replace(/\bSex\b/g, this.guideCovariateLabel)
      .replace(/\bAge\b/g, this.guideVariableLabel)
      .replace(/\{\{GUIDE_COVARIATE\}\}/g, this.guideCovariateLabel)
      .replace(/\{\{GUIDE_VARIABLE\}\}/g, this.guideVariableLabel);
  }

  private syncStepLayout(): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }

    // Reveal the owning view before measuring the target (hidden views have no size).
    this.activateViewForStep(step);

    const scrollAndObserve = () => {
      const target = step.selector ? this.findTarget(step.selector) : null;
      this.observeTarget(target);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: this.getScrollBlock(step),
          inline: 'nearest',
        });
      }
      this.scheduleLayoutUpdate(target ? 260 : 0, true);
    };

    scrollAndObserve();

    // The owning view may not be rendered yet after activation, so retry the
    // target scroll once the view has had a change-detection cycle to appear.
    if (!step.selector || !this.findTarget(step.selector)) {
      window.setTimeout(scrollAndObserve, 60);
    }
  }

  private scheduleLayoutUpdate(delayMs: number, focusGuideCard = false): void {
    this.clearLayoutTimer();
    this.layoutTimer = window.setTimeout(() => this.updateLayout(focusGuideCard), delayMs);
  }

  private clearLayoutTimer(): void {
    if (this.layoutTimer !== null) {
      window.clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
  }

  private clearAutoAdvanceTimer(): void {
    if (this.autoAdvanceTimer !== null) {
      window.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  private observeTarget(target: HTMLElement | null): void {
    if (this.observedTarget === target) {
      return;
    }

    this.disconnectTargetObserver();
    this.observedTarget = target;

    if (!target || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.targetResizeObserver = new ResizeObserver(() => {
      if (this.isOpen()) {
        this.scheduleLayoutUpdate(0);
      }
    });
    this.targetResizeObserver.observe(target);
  }

  private disconnectTargetObserver(): void {
    this.targetResizeObserver?.disconnect();
    this.targetResizeObserver = null;
    this.observedTarget = null;
  }

  private startDomObserver(): void {
    if (this.domMutationObserver || typeof MutationObserver === 'undefined') {
      return;
    }

    const root = this.document.querySelector('.studio-main');
    if (!(root instanceof HTMLElement)) {
      return;
    }

    this.domMutationObserver = new MutationObserver(() => {
      this.domRevision.update((revision) => revision + 1);
      if (this.isOpen()) {
        this.scheduleLayoutUpdate(0);
      }
    });

    this.domMutationObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  private disconnectDomObserver(): void {
    this.domMutationObserver?.disconnect();
    this.domMutationObserver = null;
  }

  private updateLayout(focusGuideCard = false): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }

    // Ensure the owning view is active so the target is measurable.
    this.activateViewForStep(step);

    const target = step.selector ? this.findTarget(step.selector) : null;
    this.highlightRect.set(target ? this.expandRect(target.getBoundingClientRect()) : null);

    const cutoutTargets = step.allowTargetInteraction
      ? this.getInteractionSelectors(step)
        .map((selector) => this.findTarget(selector))
        .filter((element): element is HTMLElement => !!element)
      : [];
    const cutouts = cutoutTargets.map((element) => measureGuideInteractionRect(element));
    this.interactionCutouts.set(cutouts);
    this.blockingMaskRects.set(computeGuideBlockingRects(cutouts));

    if (focusGuideCard && this.canFocusGuideCard()) {
      window.setTimeout(() => this.guideCard?.nativeElement.focus(), 0);
    }
  }

  private getInteractionSelectors(step: ExperimentStudioGuideStep): string[] {
    return [
      step.selector,
      ...(step.interactionSelectors ?? []),
    ].filter((selector, index, selectors): selector is string =>
      !!selector && selectors.indexOf(selector) === index
    );
  }

  private canFocusGuideCard(): boolean {
    const active = this.document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return true;
    }

    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return false;
    }

    return !active.isContentEditable;
  }

  /**
   * Activates the studio view that owns this guide step so its target is visible,
   * and opens the relevant sub-tab for steps inside a tabbed view. Steps are
   * grouped by section: Explore -> variables, Analysis -> statistics,
   * Experiment -> algorithm, Results -> execution.
   */
  private activateViewForStep(step: ExperimentStudioGuideStep): void {
    if (!this.activateGuideTarget) {
      return;
    }
    this.activateGuideTarget(step.section, step.id);
  }

  private getScrollBlock(step: ExperimentStudioGuideStep): ScrollLogicalPosition {
    const selector = step.selector ?? '';
    if (
      (selector.includes('analysis-')
        && !selector.includes('analysis-raw-summary')
        && !selector.includes('analysis-raw-details')
        && !selector.includes('analysis-processed-summary')
        && !selector.includes('analysis-processed-details'))
      || selector === '[data-guide="experiment-workspace"]'
      || selector === '[data-guide="analysis-section"]'
    ) {
      return 'start';
    }
    return 'center';
  }

  private expandRect(rect: DOMRect, padding = 10): GuideRect {
    const left = rect.left - padding;
    const top = rect.top - padding;
    const right = rect.right + padding;
    const bottom = rect.bottom + padding;

    return {
      top,
      left,
      right,
      bottom,
      width: Math.max(right - left, 0),
      height: Math.max(bottom - top, 0),
    };
  }

  private findTarget(selector: string): HTMLElement | null {
    const target = this.document.querySelector(selector);
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return target;
  }

  private isStepRequirementSatisfied(step: ExperimentStudioGuideStep | null): boolean {
    if (!step?.requirement) {
      return true;
    }

    this.domRevision();

    switch (step.requirement) {
      case 'selected-sex':
        return this.hasSelectedHierarchyNode(this.guideState.guideCovariate.value);
      case 'variable-sex':
        return this.hasVariable(this.guideState.guideCovariate.value);
      case 'selected-age':
        return this.hasVariable(this.guideState.guideCovariate.value)
          && this.hasSelectedHierarchyNode(this.guideState.guideVariable.value);
      case 'variable-age':
        return this.hasVariable(this.guideState.guideCovariate.value)
          && this.hasVariable(this.guideState.guideVariable.value);
      case 'roles-assigned':
        // The guide 'variable' target (e.g. age) must be assigned to y and the
        // guide 'covariate' target (e.g. sex) to x, so the tutorial stays on a
        // mapping compatible with the available algorithms (y max 1).
        return this.hasRoleVariable(this.guideState.guideVariable.value)
          && this.hasRoleCovariate(this.guideState.guideCovariate.value);
      case 'algorithm-selected':
        return !!this.experimentStudioService.selectedAlgorithm();
      case 'experiment-result-ready':
        // Prefer service state: the Execution view can be display:none while the
        // Run step still owns Algorithm Selection, so a DOM size check would miss it.
        return !!this.experimentStudioService.runResult();
      case 'save-as-opened':
        return !!this.findTarget('[data-guide="save-as-form"]');
      case 'experiment-saved-as': {
        const baselineUuid = this.experimentSaveBaselineUuid();
        const currentUuid = this.experimentStudioService.currentExperimentUUID();
        return baselineUuid !== undefined
          && !!currentUuid
          && currentUuid !== baselineUuid
          && !this.findTarget('[data-guide="experiment-result"]');
      }
      default:
        return true;
    }
  }

  private shouldAutoAdvance(step: ExperimentStudioGuideStep | null): boolean {
    return step?.requirement === 'selected-sex'
      || step?.requirement === 'variable-sex'
      || step?.requirement === 'selected-age'
      || step?.requirement === 'variable-age'
      || step?.requirement === 'roles-assigned'
      || step?.requirement === 'algorithm-selected'
      || step?.requirement === 'experiment-result-ready'
      || step?.requirement === 'save-as-opened'
      || step?.requirement === 'experiment-saved-as';
  }

  /**
   * Pool membership: does the code exist in the variables-panel pool
   * (selectedVariables). Used by the Explore add-to-pool steps.
   */
  private hasVariable(expected: string): boolean {
    return this.experimentStudioService.selectedVariables().some((node) =>
      this.guideState.matchesTutorialCovariate(node, expected)
    );
  }

  /** Role membership: code assigned as outcome (algorithmY). */
  private hasRoleVariable(expected: string): boolean {
    return this.experimentStudioService.algorithmY().some((node) =>
      this.guideState.matchesTutorialCovariate(node, expected)
    );
  }

  /** Role membership: code assigned as predictor/covariate (algorithmX). */
  private hasRoleCovariate(expected: string): boolean {
    return this.experimentStudioService.algorithmX().some((node) =>
      this.guideState.matchesTutorialCovariate(node, expected)
    );
  }

  private hasSelectedHierarchyNode(expected: string): boolean {
    return this.guideState.matchesTutorialCovariate(this.guideState.selectedHierarchyNode(), expected);
  }

}
