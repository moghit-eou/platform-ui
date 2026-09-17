import { CommonModule, DOCUMENT } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import {
  EXPERIMENTS_DASHBOARD_GUIDE_STEPS,
  EXPERIMENT_STUDIO_GUIDE_LABELS,
  ExperimentsDashboardGuideStep,
} from './experiments-dashboard-guide.content';
import { GuideLauncher, GuideLauncherService } from '../../../services/guide-launcher.service';

interface GuideRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

@Component({
  selector: 'app-experiments-dashboard-guide',
  imports: [CommonModule],
  templateUrl: './experiments-dashboard-guide.component.html',
  styleUrl: './experiments-dashboard-guide.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onViewportChange()',
    '(window:scroll)': 'onViewportChange()',
    '(window:keydown)': 'onWindowKeydown($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ExperimentsDashboardGuideComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly guideLauncher = inject(GuideLauncherService);
  private readonly autoStartStorageKey = 'mip.guide.experiments-dashboard.autostarted';
  private layoutTimer: number | null = null;
  private advanceTimer: number | null = null;

  /** Handed to the bar, which draws the control (see GuideLauncherService). */
  private readonly launcherHandle: GuideLauncher = {
    label: EXPERIMENT_STUDIO_GUIDE_LABELS.launcher,
    start: () => this.startGuide(),
  };

  @ViewChild('guideCard')
  private guideCard?: ElementRef<HTMLElement>;

  readonly labels = EXPERIMENT_STUDIO_GUIDE_LABELS;
  readonly isOpen = signal(false);
  readonly activeSteps = signal<ExperimentsDashboardGuideStep[]>([]);
  readonly currentIndex = signal(0);
  readonly highlightRect = signal<GuideRect | null>(null);
  readonly isCollapsed = signal(false);
  /** Recounted from currently navigable steps so skipped optionals do not create gaps. */
  readonly totalSteps = signal(0);
  readonly currentStepOrdinal = signal(0);

  readonly currentStep = computed(() => this.activeSteps()[this.currentIndex()] ?? null);
  readonly previousStep = computed(() => {
    const previousIndex = this.getNavigableStepIndex(this.currentIndex() - 1, -1);
    return previousIndex === null ? null : this.activeSteps()[previousIndex] ?? null;
  });
  readonly currentStepNumber = computed(() => this.currentStepOrdinal());
  readonly progressPercent = computed(() => {
    const total = this.totalSteps();
    return total ? (this.currentStepNumber() / total) * 100 : 0;
  });
  readonly hasPrevious = computed(() => this.previousStep() !== null);
  readonly canGoToPrevious = computed(() => this.hasPrevious() && !this.previousStep()?.advanceOnTargetClick);
  readonly isLastStep = computed(() => this.getNavigableStepIndex(this.currentIndex() + 1, 1) === null);
  readonly canGoToNext = computed(() => this.isStepRequirementSatisfied(this.currentStep()));
  readonly stepNeedsAction = computed(() => !!this.currentStep()?.advanceOnTargetClick && !this.canGoToNext());
  readonly nextButtonLabel = computed(() => {
    if (this.stepNeedsAction()) {
      return 'Action required';
    }
    if (this.isLastStep()) {
      return this.labels.done;
    }
    // Only the optional compare workspace is an explicit skip; other optionals still say Next.
    if (this.currentStep()?.id === 'compare-workspace') {
      return this.labels.skip;
    }
    return this.labels.next;
  });
  readonly pendingRequirementHint = computed(() => {
    const step = this.currentStep();
    if (!step || this.canGoToNext()) {
      return null;
    }

    return step.requirementHint ?? 'Use the highlighted element to continue.';
  });

  ngOnInit(): void {
    this.guideLauncher.register(this.launcherHandle);
  }

  ngAfterViewInit(): void {
    window.setTimeout(() => this.startGuide(false), 900);
  }

  ngOnDestroy(): void {
    this.guideLauncher.unregister(this.launcherHandle);
    this.clearLayoutTimer();
    this.clearAdvanceTimer();
  }

  startGuide(manual = true): void {
    if (!manual && this.hasAutoStarted()) {
      return;
    }

    const resolvedSteps = this.resolveSteps();
    if (!resolvedSteps.length) {
      return;
    }

    if (!this.hasAutoStarted()) {
      this.markAutoStarted();
    }

    // Workbench path must not start inside compare mode.
    this.ensureCompareModeOff();

    this.activeSteps.set(resolvedSteps);
    this.totalSteps.set(resolvedSteps.length);
    this.currentIndex.set(this.getNavigableStepIndex(0, 1) ?? 0);
    this.currentStepOrdinal.set(1);
    this.isCollapsed.set(false);
    this.isOpen.set(true);
    this.syncStepLayout();
  }

  closeGuide(): void {
    this.isOpen.set(false);
    this.activeSteps.set([]);
    this.currentIndex.set(0);
    this.totalSteps.set(0);
    this.currentStepOrdinal.set(0);
    this.highlightRect.set(null);
    this.isCollapsed.set(false);
    this.clearLayoutTimer();
    this.clearAdvanceTimer();
  }

  goToNextStep(force = false): void {
    if (!force && !this.canGoToNext()) {
      return;
    }

    const step = this.currentStep();
    // Leaving the compare control without an active workspace: do not linger.
    if (step?.id === 'compare') {
      // keep whatever the user chose; compare-workspace is optional if inactive
    }

    // Entering the open-experiment / workbench stretch: leave compare mode.
    if (step?.id === 'new-experiment' || step?.id === 'tutorial-experiment') {
      this.ensureCompareModeOff();
    }

    // Next from "Open an Experiment" must land on the workbench, same as the click path.
    if (!force && step?.id === 'tutorial-experiment') {
      this.clearAdvanceTimer();
      this.waitForWorkbenchThenAdvance(0);
      return;
    }

    const nextIndex = this.getNavigableStepIndex(this.currentIndex() + 1, 1);
    if (nextIndex === null) {
      this.closeGuide();
      return;
    }

    const movingForward = nextIndex > this.currentIndex();
    this.currentIndex.set(nextIndex);
    if (movingForward) {
      this.currentStepOrdinal.update((value) => value + 1);
    } else {
      this.currentStepOrdinal.update((value) => Math.max(1, value - 1));
    }
    this.ensureTotalSteps(this.activeSteps().length);
    this.syncStepLayout();
  }

  goToPreviousStep(): void {
    if (!this.canGoToPrevious()) {
      return;
    }

    const previousIndex = this.getNavigableStepIndex(this.currentIndex() - 1, -1);
    if (previousIndex === null) {
      return;
    }

    this.currentIndex.set(previousIndex);
    this.currentStepOrdinal.update((value) => Math.max(1, value - 1));
    this.ensureTotalSteps(this.activeSteps().length);
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

    // After opening a run, wait for the workbench target so we do not skip to compare-workspace.
    this.clearAdvanceTimer();
    this.advanceTimer = window.setTimeout(() => {
      if (!this.isOpen() || this.currentStep()?.id !== step.id) {
        return;
      }

      if (step.id === 'tutorial-experiment') {
        this.ensureCompareModeOff();
        this.waitForWorkbenchThenAdvance(0);
        return;
      }

      this.goToNextStep(true);
    }, 260);
  }

  private waitForWorkbenchThenAdvance(attempt: number): void {
    const maxAttempts = 12;
    if (this.findTarget('[data-guide="dashboard-detail-card"]')) {
      this.goToNextStep(true);
      return;
    }

    if (attempt >= maxAttempts) {
      // Fall through to next navigable step (still prefers workbench when present).
      this.goToNextStep(true);
      return;
    }

    this.advanceTimer = window.setTimeout(() => {
      this.waitForWorkbenchThenAdvance(attempt + 1);
    }, 150);
  }

  private resolveSteps(): ExperimentsDashboardGuideStep[] {
    return [...EXPERIMENTS_DASHBOARD_GUIDE_STEPS];
  }

  private syncStepLayout(): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }

    this.recountProgress();

    if (step.id === 'tutorial-experiment' || step.id === 'workbench' || step.id === 'actions' || step.id === 'results') {
      this.ensureCompareModeOff();
    }

    const target = step.selector ? this.findTarget(step.selector) : null;
    if (target) {
      const headerOffset = this.getHeaderOffset();
      const top = Math.max(window.scrollY + target.getBoundingClientRect().top - headerOffset, 0);
      window.scrollTo({ top, behavior: 'smooth' });
    }

    this.scheduleLayoutUpdate(target ? 260 : 0);
  }

  private getHeaderOffset(): number {
    const rootStyles = getComputedStyle(this.document.documentElement);
    const headerHeight = Number.parseFloat(rootStyles.getPropertyValue('--header-height')) || 0;
    return headerHeight + 12;
  }

  private scheduleLayoutUpdate(delayMs: number): void {
    this.clearLayoutTimer();
    this.layoutTimer = window.setTimeout(() => this.updateLayout(), delayMs);
  }

  private clearLayoutTimer(): void {
    if (this.layoutTimer !== null) {
      window.clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
  }

  private clearAdvanceTimer(): void {
    if (this.advanceTimer !== null) {
      window.clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  private updateLayout(): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }

    const target = step.selector ? this.findTarget(step.selector) : null;
    this.highlightRect.set(target ? this.expandRect(target.getBoundingClientRect()) : null);

    window.setTimeout(() => {
      this.guideCard?.nativeElement.focus();
    }, 0);
  }

  private isStepRequirementSatisfied(step: ExperimentsDashboardGuideStep | null): boolean {
    return !step?.advanceOnTargetClick;
  }

  /** Progress X advances one tick per navigation so optional skips cannot drop the counter. */
  private recountProgress(): void {
    this.ensureTotalSteps(this.activeSteps().length);
  }

  private ensureTotalSteps(length: number): void {
    // Freeze Y at the full tour length once known; never shrink or grow mid-tour.
    if (!this.totalSteps() && length) {
      this.totalSteps.set(length);
    }
  }

  private isOptionalStepUnavailable(step: ExperimentsDashboardGuideStep): boolean {
    return !!step.optional && !!step.selector && !this.findTarget(step.selector);
  }

  /**
   * Prefer the single-experiment workbench path over compare-workspace when both
   * could be considered "available" after opening a card.
   */
  private getNavigableStepIndex(startIndex: number, direction: 1 | -1): number | null {
    const steps = this.activeSteps();

    for (let index = startIndex; index >= 0 && index < steps.length; index += direction) {
      const step = steps[index];
      if (this.isOptionalStepUnavailable(step)) {
        continue;
      }

      // If we are moving forward from the open-experiment step, never land on
      // compare-workspace while the workbench target exists (or may still mount).
      if (
        direction === 1
        && step.id === 'compare-workspace'
        && this.findTarget('[data-guide="dashboard-detail-card"]')
      ) {
        continue;
      }

      return index;
    }

    return null;
  }

  private ensureCompareModeOff(): void {
    const exitBtn = [...this.document.querySelectorAll('button')].find((button) =>
      /exit compare mode/i.test((button.textContent || '').trim())
    );
    if (exitBtn instanceof HTMLElement) {
      exitBtn.click();
    }

    const compareToggle = this.document.querySelector('[data-guide="dashboard-compare"]');
    if (compareToggle instanceof HTMLElement && compareToggle.classList.contains('active')) {
      compareToggle.click();
    }
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

  private hasAutoStarted(): boolean {
    try {
      return localStorage.getItem(this.autoStartStorageKey) === 'true';
    } catch {
      return false;
    }
  }

  private markAutoStarted(): void {
    try {
      localStorage.setItem(this.autoStartStorageKey, 'true');
    } catch {
      // Ignore storage failures and keep the guide functional.
    }
  }
}
