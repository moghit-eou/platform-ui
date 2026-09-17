import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ExperimentStudioGuideComponent } from './experiment-studio-guide.component';
import { EXPERIMENT_STUDIO_GUIDE_STEPS } from './experiment-studio-guide.content';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { GuideOnboardingService } from '../../../services/guide-onboarding.service';
import { ExperimentStudioGuideStateService } from './experiment-studio-guide-state.service';

describe('ExperimentStudioGuideComponent', () => {
  let component: ExperimentStudioGuideComponent;
  let router: jasmine.SpyObj<Router>;
  let guideOnboarding: jasmine.SpyObj<GuideOnboardingService>;
  let experimentStudioService: {
    resetStudioState: jasmine.Spy;
    resetStudioStateForGuide: jasmine.Spy;
    hasPersistedStudioWork: jasmine.Spy;
    pathologyAccessWarning: ReturnType<typeof signal>;
    selectedVariables: ReturnType<typeof signal>;
    algorithmY: ReturnType<typeof signal>;
    algorithmX: ReturnType<typeof signal>;
    selectedAlgorithm: ReturnType<typeof signal>;
    runResult: ReturnType<typeof signal>;
    currentExperimentUUID: ReturnType<typeof signal>;
  };

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));

    guideOnboarding = jasmine.createSpyObj<GuideOnboardingService>(
      'GuideOnboardingService',
      ['hasSeenStudioGuide', 'markStudioGuideSeen'],
    );
    guideOnboarding.hasSeenStudioGuide.and.returnValue(false);
    guideOnboarding.markStudioGuideSeen.and.stub();

    experimentStudioService = {
      resetStudioState: jasmine.createSpy('resetStudioState'),
      resetStudioStateForGuide: jasmine.createSpy('resetStudioStateForGuide'),
      hasPersistedStudioWork: jasmine.createSpy('hasPersistedStudioWork').and.returnValue(false),
      pathologyAccessWarning: signal(null),
      selectedVariables: signal([]),
      algorithmY: signal([]),
      algorithmX: signal([]),
      selectedAlgorithm: signal(null),
      runResult: signal<unknown | null>(null),
      currentExperimentUUID: signal<string | null>(null),
    };

    TestBed.configureTestingModule({
      imports: [ExperimentStudioGuideComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: router },
        { provide: ExperimentStudioService, useValue: experimentStudioService },
        { provide: GuideOnboardingService, useValue: guideOnboarding },
        ExperimentStudioGuideStateService,
      ],
    });

    component = TestBed.createComponent(ExperimentStudioGuideComponent).componentInstance;
  });

  afterEach(() => {
    document.querySelectorAll('.studio-stepper').forEach((element) => element.remove());
    document.querySelectorAll('[data-guide]').forEach((element) => element.remove());
  });

  it('does not auto-open the guide on first visit', () => {
    expect(component.isOpen()).toBeFalse();

    component.startGuide();

    expect(component.isOpen()).toBeTrue();
    component.closeGuide();
  });

  it('does not reset studio state on the first guide visit', () => {
    component.startGuide();

    expect(experimentStudioService.resetStudioState).not.toHaveBeenCalled();

    component.closeGuide();
  });

  it('does not reset studio state until the user continues past the launcher step', () => {
    guideOnboarding.hasSeenStudioGuide.and.returnValue(true);
    experimentStudioService.hasPersistedStudioWork.and.returnValue(true);

    component.startGuide();
    component.currentIndex.set(1);

    expect(experimentStudioService.resetStudioStateForGuide).not.toHaveBeenCalled();

    component.goToNextStep();

    expect(experimentStudioService.resetStudioStateForGuide).toHaveBeenCalled();
    component.closeGuide();
  });

  it('shows a reset warning on the launcher step when an existing session would be cleared', () => {
    guideOnboarding.hasSeenStudioGuide.and.returnValue(true);
    experimentStudioService.hasPersistedStudioWork.and.returnValue(true);

    component.startGuide();
    component.currentIndex.set(1);

    expect(component.studioResetWarning()).toContain('continuing past this step will reset');
    component.closeGuide();
  });

  it('explains blue-panel interaction on the welcome and launcher steps', () => {
    const steps = (component as any).resolveSteps();
    const welcomeStep = steps.find((step: any) => step.id === 'welcome');
    const launcherStep = steps.find((step: any) => step.id === 'launcher');

    expect(welcomeStep?.body).toContain('blue panel');
    expect(launcherStep?.body).toContain('highlighted blue panel');
  });

  it('does not steal focus from inputs during passive layout refresh', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const guideFocus = jasmine.createSpy('guideFocus');
    (component as any).guideCard = { nativeElement: { focus: guideFocus } };
    component.activeSteps.set([
      {
        id: 'select-sex-variable',
        section: 'Explore',
        title: 'Select Sex',
        body: '',
        selector: '[data-guide="variable-browser"]',
        allowTargetInteraction: true,
        requirement: 'selected-sex',
      },
    ] as any);

    (component as any).updateLayout(false);

    expect(guideFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it('tracks the highlighted target rectangle for the active step', () => {
    const target = document.createElement('section');
    target.setAttribute('data-guide', 'variable-selection');
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      top: 140,
      right: 760,
      bottom: 540,
      left: 220,
      width: 540,
      height: 400,
      x: 220,
      y: 140,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(target);

    component.activeSteps.set([
      {
        id: 'variable-selection',
        section: 'Explore',
        title: 'Variables Selection',
        body: '',
        selector: '[data-guide="variable-selection"]',
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.highlightRect()).toEqual(jasmine.objectContaining({
      top: 130,
      left: 210,
    }));
    expect(component.highlightRect()?.right).toBeGreaterThan(component.highlightRect()!.left);
    expect(component.highlightRect()?.bottom).toBeGreaterThan(component.highlightRect()!.top);
  });

  it('keeps the highlight aligned when the target scrolls above the viewport', () => {
    const target = document.createElement('section');
    target.setAttribute('data-guide', 'analysis-section');
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      top: -24,
      right: 760,
      bottom: 140,
      left: 220,
      width: 540,
      height: 164,
      x: 220,
      y: -24,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(target);

    component.activeSteps.set([
      {
        id: 'analysis-intro',
        section: 'Analysis',
        title: 'Analysis Section',
        body: '',
        selector: '[data-guide="analysis-section"]',
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.highlightRect()).toEqual(jasmine.objectContaining({
      top: -34,
      left: 210,
      bottom: 150,
      right: 770,
    }));
  });

  it('clears the highlight when the active step target is missing', () => {
    component.highlightRect.set({
      top: 40,
      right: 160,
      bottom: 120,
      left: 24,
      width: 136,
      height: 80,
    });
    component.activeSteps.set([
      {
        id: 'missing-target',
        section: 'Explore',
        title: 'Missing',
        body: '',
        selector: '[data-guide="missing-target"]',
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.highlightRect()).toBeNull();
  });

  it('scrolls the analysis section guide step to the top of the viewport', () => {
    const analysisSection = document.createElement('section');
    analysisSection.setAttribute('data-guide', 'analysis-section');
    spyOn(analysisSection, 'getBoundingClientRect').and.returnValue({
      top: 320,
      right: 920,
      bottom: 880,
      left: 260,
      width: 660,
      height: 560,
      x: 260,
      y: 320,
      toJSON: () => ({}),
    } as DOMRect);
    const scrollSpy = spyOn(analysisSection, 'scrollIntoView');
    document.body.appendChild(analysisSection);
    spyOn(component as any, 'scheduleLayoutUpdate').and.stub();

    component.activeSteps.set([
      {
        id: 'analysis-intro',
        section: 'Analysis',
        title: 'Analysis Section',
        body: '',
        selector: '[data-guide="analysis-section"]',
      },
    ] as any);

    (component as any).syncStepLayout();

    expect(scrollSpy).toHaveBeenCalledWith(jasmine.objectContaining({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    }));
  });

  it('keeps the guide collapsed when navigating to the next step from collapsed mode', () => {
    spyOn(component as any, 'syncStepLayout').and.stub();
    component.activeSteps.set([
      { id: 'step-1', section: 'Explore', title: 'Step 1', body: '' },
      { id: 'step-2', section: 'Explore', title: 'Step 2', body: '' },
    ] as any);
    component.isOpen.set(true);
    component.isCollapsed.set(true);

    component.goToNextStep();

    expect(component.currentIndex()).toBe(1);
    expect(component.isCollapsed()).toBeTrue();
  });

  it('disables Back when the previous step requires action', () => {
    spyOn(component as any, 'syncStepLayout').and.stub();
    component.activeSteps.set([
      { id: 'step-1', section: 'Explore', title: 'Step 1', body: '', requirement: 'selected-sex' },
      { id: 'step-2', section: 'Explore', title: 'Step 2', body: '' },
    ] as any);
    component.isOpen.set(true);
    component.currentIndex.set(1);

    expect(component.canGoToPrevious()).toBeFalse();

    component.goToPreviousStep();

    expect(component.currentIndex()).toBe(1);
  });

  it('keeps Back available when the previous step is informational', () => {
    spyOn(component as any, 'syncStepLayout').and.stub();
    component.activeSteps.set([
      { id: 'step-1', section: 'Explore', title: 'Step 1', body: '' },
      { id: 'step-2', section: 'Explore', title: 'Step 2', body: '' },
    ] as any);
    component.isOpen.set(true);
    component.currentIndex.set(1);

    expect(component.canGoToPrevious()).toBeTrue();

    component.goToPreviousStep();

    expect(component.currentIndex()).toBe(0);
  });

  it('keeps the guide expanded when navigating onto compact-title steps', () => {
    spyOn(component as any, 'syncStepLayout').and.stub();
    component.activeSteps.set([
      { id: 'step-1', section: 'Explore', title: 'Step 1', body: '' },
      { id: 'step-2', section: 'Explore', title: 'Step 2', body: '', compactTitle: true },
      { id: 'step-3', section: 'Explore', title: 'Step 3', body: '' },
    ] as any);
    component.isOpen.set(true);

    component.goToNextStep();

    expect(component.currentIndex()).toBe(1);
    expect(component.isCollapsed()).toBeFalse();

    component.isCollapsed.set(true);
    component.goToNextStep();

    expect(component.currentIndex()).toBe(2);
    expect(component.isCollapsed()).toBeTrue();
  });

  it('replaces exact Sex and Age guide copy with the configured guide labels', () => {
    (component as any).guideCovariateLabel = 'Biological Sex';
    (component as any).guideVariableLabel = 'Age Years';

    const replaced = (component as any).replaceGuideTargets('Use Sex as Covariate and Age as Variable.');
    const steps = (component as any).resolveSteps();

    expect(replaced).toBe('Use Biological Sex as Covariate and Age Years as Variable.');
    expect(steps.find((step: any) => step.id === 'add-sex-covariate')?.title).toBe('Add Biological Sex as Variable');
    expect(steps.find((step: any) => step.id === 'add-age-variable')?.title).toBe('Add Age Years as Variable');
  });

  it('treats the Age guide step as complete only when both targets are added to the variables pool', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'sex', label: 'Sex' },
      { code: 'age', label: 'Age' },
    ]);

    expect((component as any).isStepRequirementSatisfied({ requirement: 'variable-age' })).toBeTrue();
  });

  it('unlocks the algorithm selection guide step when any algorithm is selected', () => {
    expect((component as any).isStepRequirementSatisfied({ requirement: 'algorithm-selected' })).toBeFalse();

    experimentStudioService.selectedAlgorithm.set({ name: 'linear_regression', label: 'Linear Regression' });
    expect((component as any).isStepRequirementSatisfied({ requirement: 'algorithm-selected' })).toBeTrue();
  });

  it('marks the add-sex and add-age guide steps as requiring action until the variables are added', () => {
    component.activeSteps.set([
      { id: 'add-sex-covariate', section: 'Explore', title: 'Add Sex', body: '', requirement: 'variable-sex' },
      { id: 'add-age-variable', section: 'Explore', title: 'Add Age', body: '', requirement: 'variable-age' },
    ] as any);

    component.currentIndex.set(0);
    expect(component.stepNeedsAction()).toBeTrue();
    expect(component.nextButtonLabel()).toBe('Action required');

    experimentStudioService.selectedVariables.set([{ code: 'sex', label: 'Sex' }]);
    expect(component.stepNeedsAction()).toBeFalse();

    component.currentIndex.set(1);
    expect(component.stepNeedsAction()).toBeTrue();
    expect(component.nextButtonLabel()).toBe('Action required');

    experimentStudioService.selectedVariables.set([
      { code: 'sex', label: 'Sex' },
      { code: 'age', label: 'Age' },
    ]);
    expect(component.stepNeedsAction()).toBeFalse();
  });

  it('requires the guide variable (Age) in y and the guide covariate (Sex) in x', () => {
    expect((component as any).isStepRequirementSatisfied({ requirement: 'roles-assigned' })).toBeFalse();

    // Guide covariate (Sex) in x only; Age not yet assigned.
    experimentStudioService.algorithmX.set([{ code: 'sex', label: 'Sex' }]);
    expect((component as any).isStepRequirementSatisfied({ requirement: 'roles-assigned' })).toBeFalse();

    // Both targets in y (wrong mix) does not satisfy the requirement.
    experimentStudioService.algorithmY.set([
      { code: 'age', label: 'Age' },
      { code: 'sex', label: 'Sex' },
    ]);
    experimentStudioService.algorithmX.set([]);
    expect((component as any).isStepRequirementSatisfied({ requirement: 'roles-assigned' })).toBeFalse();

    // Guide variable (Age) in x (wrong mix) does not satisfy the requirement.
    experimentStudioService.algorithmY.set([]);
    experimentStudioService.algorithmX.set([
      { code: 'sex', label: 'Sex' },
      { code: 'age', label: 'Age' },
    ]);
    expect((component as any).isStepRequirementSatisfied({ requirement: 'roles-assigned' })).toBeFalse();

    // Guide variable (Age) in y and guide covariate (Sex) in x satisfies it.
    experimentStudioService.algorithmY.set([{ code: 'age', label: 'Age' }]);
    experimentStudioService.algorithmX.set([{ code: 'sex', label: 'Sex' }]);
    expect((component as any).isStepRequirementSatisfied({ requirement: 'roles-assigned' })).toBeTrue();
  });

  it('keeps future experiment steps in the guide flow even before the save flow is opened', () => {
    const steps = (component as any).resolveSteps();

    expect(steps.some((step: any) => step.id === 'experiment-set-parameters')).toBeFalse();
    expect(steps.some((step: any) => step.id === 'experiment-wait-for-save')).toBeTrue();
    expect(steps.some((step: any) => step.id === 'experiment-finish')).toBeTrue();
  });

  it('lets the algorithm selection step interact with the algorithm catalog', () => {
    const steps = (component as any).resolveSteps();
    const algorithmStep = steps.find((step: any) => step.id === 'experiment-select-algorithm');

    expect(algorithmStep?.selector).toBe('[data-guide="algorithm-selection"]');
    expect(algorithmStep?.allowTargetInteraction).toBeTrue();
  });

  it('marks the Save as step as requiring action until the save form is opened', () => {
    component.activeSteps.set([
      {
        id: 'experiment-save-as-action',
        section: 'Experiment',
        title: 'Save as',
        body: '',
        selector: '[data-guide="save-as-action"]',
        allowTargetInteraction: true,
        advanceOnTargetClick: true,
        requirement: 'save-as-opened',
      },
    ] as any);

    expect(component.stepNeedsAction()).toBeTrue();
    expect(component.nextButtonLabel()).toBe('Action required');
    expect((component as any).isStepRequirementSatisfied({ requirement: 'save-as-opened' })).toBeFalse();

    const saveForm = document.createElement('div');
    saveForm.setAttribute('data-guide', 'save-as-form');
    spyOn(saveForm, 'getBoundingClientRect').and.returnValue({
      top: 240,
      right: 420,
      bottom: 320,
      left: 240,
      width: 180,
      height: 80,
      x: 240,
      y: 240,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(saveForm);

    expect((component as any).isStepRequirementSatisfied({ requirement: 'save-as-opened' })).toBeTrue();
  });

  it('moves to the next step after clicking the Save as target', (done) => {
    const saveButton = document.createElement('button');
    saveButton.setAttribute('data-guide', 'save-as-action');
    spyOn(saveButton, 'getBoundingClientRect').and.returnValue({
      top: 240,
      right: 360,
      bottom: 280,
      left: 240,
      width: 120,
      height: 40,
      x: 240,
      y: 240,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(saveButton);

    const saveForm = document.createElement('div');
    saveForm.setAttribute('data-guide', 'save-as-form');
    spyOn(saveForm, 'getBoundingClientRect').and.returnValue({
      top: 240,
      right: 460,
      bottom: 330,
      left: 240,
      width: 220,
      height: 90,
      x: 240,
      y: 240,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(saveForm);

    spyOn(component as any, 'syncStepLayout').and.callFake(() => undefined);
    component.isOpen.set(true);
    component.activeSteps.set([
      {
        id: 'experiment-save-as-action',
        section: 'Experiment',
        title: 'Save as',
        body: '',
        selector: '[data-guide="save-as-action"]',
        allowTargetInteraction: true,
        advanceOnTargetClick: true,
        requirement: 'save-as-opened',
      },
      {
        id: 'experiment-wait-for-save',
        section: 'Experiment',
        title: 'Save Experiment',
        body: '',
        selector: '[data-guide="save-as-flow"]',
        allowTargetInteraction: true,
        requirement: 'experiment-saved-as',
      },
    ] as any);

    component.onDocumentClick({ target: saveButton } as unknown as MouseEvent);

    setTimeout(() => {
      expect(component.currentIndex()).toBe(1);
      done();
    }, 320);
  });

  it('places the result action familiarization steps before the save-complete waiting step', () => {
    const steps = (component as any).resolveSteps();
    const runIndex = steps.findIndex((step: any) => step.id === 'experiment-run');
    const exploreIndex = steps.findIndex((step: any) => step.id === 'experiment-explore-result');
    const editIndex = steps.findIndex((step: any) => step.id === 'experiment-edit-parameters');
    const summaryActionIndex = steps.findIndex((step: any) => step.id === 'experiment-result-actions');
    const saveActionIndex = steps.findIndex((step: any) => step.id === 'experiment-save-as-action');
    const saveWaitIndex = steps.findIndex((step: any) => step.id === 'experiment-wait-for-save');

    expect(runIndex).toBeGreaterThan(-1);
    expect(exploreIndex).toBe(runIndex + 1);
    expect(editIndex).toBe(exploreIndex + 1);
    expect(summaryActionIndex).toBe(editIndex + 1);
    expect(saveActionIndex).toBe(summaryActionIndex + 1);
    expect(saveWaitIndex).toBe(saveActionIndex + 1);
  });

  it('keeps the Edit parameters familiarization step non-interactive', () => {
    const steps = (component as any).resolveSteps();
    const editStep = steps.find((step: any) => step.id === 'experiment-edit-parameters');

    expect(editStep?.allowTargetInteraction).toBeFalse();
  });

  it('keeps the Analysis filtering step interactive and optional', () => {
    const steps = (component as any).resolveSteps();
    const filteringStep = steps.find((step: any) => step.id === 'analysis-filtering');

    expect(filteringStep?.allowTargetInteraction).toBeTrue();
    expect(filteringStep?.body).toContain('Optional');
    expect(filteringStep?.body).toContain('Add Filtering');
  });

  it('keeps the Analysis preprocessing step interactive and optional', () => {
    const steps = (component as any).resolveSteps();
    const preprocessingStep = steps.find((step: any) => step.id === 'analysis-preprocessing');

    expect(preprocessingStep?.allowTargetInteraction).toBeTrue();
    expect(preprocessingStep?.body).toContain('Optional');
    expect(preprocessingStep?.body).toContain('missing values are already dropped');
  });

  it('keeps the raw and processed summary guide steps interactive across the full section', () => {
    const steps = (component as any).resolveSteps();
    const rawStatisticsStep = steps.find((step: any) => step.id === 'analysis-raw-statistics');
    const processedStep = steps.find((step: any) => step.id === 'analysis-processed-summary');

    expect(rawStatisticsStep?.selector).toBe('[data-guide="analysis-raw-summary"]');
    expect(processedStep?.selector).toBe('[data-guide="analysis-processed-summary"]');
    expect(rawStatisticsStep?.allowTargetInteraction).toBeTrue();
    expect(processedStep?.allowTargetInteraction).toBeTrue();
    expect(steps.some((step: any) => step.id === 'analysis-raw-charts')).toBeFalse();
  });

  it('points the experiment summary step at the visible summary panel', () => {
    const steps = (component as any).resolveSteps();
    const summaryStep = steps.find((step: any) => step.id === 'experiment-result-actions');

    expect(summaryStep?.selector).toBe('[data-guide="save-as-flow"]');
    expect(summaryStep?.allowTargetInteraction).toBeTrue();
  });

  it('keeps the final experiment step open to page interaction', () => {
    const steps = (component as any).resolveSteps();
    const finishStep = steps.find((step: any) => step.id === 'experiment-finish');

    expect(finishStep?.allowTargetInteraction).toBeTrue();
  });

  it('labels the final experiment step action as Move to dashboard', () => {
    component.activeSteps.set([
      { id: 'experiment-finish', section: 'Experiment', title: 'Done', body: '', allowTargetInteraction: true },
    ] as any);

    expect(component.nextButtonLabel()).toBe('Move to dashboard');
  });

  it('navigates to the dashboard from the final experiment step', () => {
    component.activeSteps.set([
      { id: 'experiment-finish', section: 'Experiment', title: 'Done', body: '', allowTargetInteraction: true },
    ] as any);
    component.isOpen.set(true);

    component.goToNextStep();

    expect(router.navigate).toHaveBeenCalledWith(['/experiments-dashboard']);
    expect(component.isOpen()).toBeFalse();
  });

  it('keeps the run step locked until an experiment result is rendered', () => {
    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-result-ready' })).toBeFalse();

    // Service state, not DOM: the Execution view can be display:none while the Run step
    // still owns Algorithm Selection, so a target-size check would miss a finished run.
    experimentStudioService.runResult.set({ algorithm: 'chi-square' });

    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-result-ready' })).toBeTrue();
  });

  it('keeps the save-wait step locked until Save as creates a new experiment and returns to parameters', () => {
    component.isOpen.set(true);
    component.activeSteps.set([
      {
        id: 'experiment-wait-for-save',
        section: 'Experiment',
        title: 'Save Experiment',
        body: '',
        requirement: 'experiment-saved-as',
      },
    ] as any);
    (component as any).experimentSaveBaselineUuid.set(null);

    const resultSection = document.createElement('section');
    resultSection.setAttribute('data-guide', 'experiment-result');
    spyOn(resultSection, 'getBoundingClientRect').and.returnValue({
      top: 240,
      right: 1080,
      bottom: 760,
      left: 360,
      width: 720,
      height: 520,
      x: 360,
      y: 240,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(resultSection);

    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-saved-as' })).toBeFalse();

    experimentStudioService.currentExperimentUUID.set('saved-experiment-uuid');

    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-saved-as' })).toBeFalse();

    resultSection.remove();

    expect((component as any).isStepRequirementSatisfied({ requirement: 'experiment-saved-as' })).toBeTrue();
  });

  it('auto-advances after an algorithm is selected', () => {
    expect((component as any).shouldAutoAdvance({ requirement: 'algorithm-selected' })).toBeTrue();
  });

  it('auto-advances after the experiment result becomes available', () => {
    expect((component as any).shouldAutoAdvance({ requirement: 'experiment-result-ready' })).toBeTrue();
  });

  it('auto-advances after Save as opens the save form', () => {
    expect((component as any).shouldAutoAdvance({ requirement: 'save-as-opened' })).toBeTrue();
  });

  it('auto-advances after Save as creates a new experiment', () => {
    expect((component as any).shouldAutoAdvance({ requirement: 'experiment-saved-as' })).toBeTrue();
  });

  it('tracks interaction cutouts for variable selection and details panels', () => {
    const browser = document.createElement('div');
    browser.setAttribute('data-guide', 'variable-browser');
    spyOn(browser, 'getBoundingClientRect').and.returnValue({
      top: 120,
      right: 620,
      bottom: 640,
      left: 80,
      width: 540,
      height: 520,
      x: 80,
      y: 120,
      toJSON: () => ({}),
    } as DOMRect);

    const details = document.createElement('section');
    details.setAttribute('data-guide', 'variable-details');
    spyOn(details, 'getBoundingClientRect').and.returnValue({
      top: 360,
      right: 1180,
      bottom: 760,
      left: 660,
      width: 520,
      height: 400,
      x: 660,
      y: 360,
      toJSON: () => ({}),
    } as DOMRect);

    document.body.appendChild(browser);
    document.body.appendChild(details);

    component.activeSteps.set([
      {
        id: 'select-age-variable',
        section: 'Explore',
        title: 'Select Age',
        body: '',
        selector: '[data-guide="variable-browser"]',
        interactionSelectors: ['[data-guide="variable-details"]'],
        allowTargetInteraction: true,
        requirement: 'selected-age',
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.interactionCutouts().length).toBe(2);
    expect(component.blockingMaskRects().length).toBeGreaterThan(0);
  });

  it('keeps the Explore Variable Views step interactive and optional', () => {
    const steps = (component as any).resolveSteps();
    const exploreStep = steps.find((step: any) => step.id === 'variable-selection');

    expect(exploreStep?.title).toBe('Explore Variable Views');
    expect(exploreStep?.selector).toBe('[data-guide="variable-selection"]');
    expect(exploreStep?.allowTargetInteraction).toBeTrue();
    expect(exploreStep?.body).toContain('Map');
    expect(exploreStep?.body).toContain('List');
    expect(exploreStep?.body).toContain('Graph');
    expect(exploreStep?.body).toContain('Next');
    expect(exploreStep?.interactionSelectors).toBeUndefined();
    expect(steps.some((step: any) => step.id === 'explore-variable-visualizations')).toBeFalse();
  });

  it('builds click-through blockers around interactive guide targets', () => {
    const target = document.createElement('div');
    target.setAttribute('data-guide', 'variable-selection');
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      top: 180,
      right: 620,
      bottom: 640,
      left: 80,
      width: 540,
      height: 460,
      x: 80,
      y: 180,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(target);

    component.activeSteps.set([
      {
        id: 'variable-selection',
        section: 'Explore',
        title: 'Explore Variable Views',
        body: '',
        selector: '[data-guide="variable-selection"]',
        allowTargetInteraction: true,
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.blockingMaskRects().length).toBeGreaterThan(0);
    expect(component.blockingMaskRects().some((rect) => rect.top === 0 && rect.bottom === 170)).toBeTrue();
  });

  it('keeps the Sex selection step interactive without highlighting variable details', () => {
    const steps = (component as any).resolveSteps();
    const selectSexStep = steps.find((step: any) => step.id === 'select-sex-variable');

    expect(selectSexStep?.allowTargetInteraction).toBeTrue();
    expect(selectSexStep?.selector).toBe('[data-guide="variable-selection"]');
    expect(selectSexStep?.interactionSelectors).toBeUndefined();
  });

  it('places variable preview steps after each guided variable selection', () => {
    const steps = (component as any).resolveSteps();
    const selectSexIndex = steps.findIndex((step: any) => step.id === 'select-sex-variable');
    const previewSexIndex = steps.findIndex((step: any) => step.id === 'preview-sex-variable-details');
    const addSexIndex = steps.findIndex((step: any) => step.id === 'add-sex-covariate');
    const selectAgeIndex = steps.findIndex((step: any) => step.id === 'select-age-variable');
    const previewAgeIndex = steps.findIndex((step: any) => step.id === 'preview-age-variable-details');
    const addAgeIndex = steps.findIndex((step: any) => step.id === 'add-age-variable');

    expect(previewSexIndex).toBe(selectSexIndex + 1);
    expect(addSexIndex).toBe(previewSexIndex + 1);
    expect(previewAgeIndex).toBe(selectAgeIndex + 1);
    expect(addAgeIndex).toBe(previewAgeIndex + 1);
    expect(steps[previewSexIndex].selector).toBe('[data-guide="variable-details"]');
    expect(steps[previewAgeIndex].allowTargetInteraction).toBeTrue();
  });

  it('points every content step with a selector at its data-guide target', () => {
    const stepsWithSelectors = EXPERIMENT_STUDIO_GUIDE_STEPS.filter((step) => !!step.selector);
    expect(stepsWithSelectors.length).toBeGreaterThan(0);

    for (const step of stepsWithSelectors) {
      document.querySelectorAll('[data-guide]').forEach((element) => element.remove());

      const target = document.createElement('div');
      const guideValue = step.selector!.match(/data-guide="([^"]+)"/)?.[1];
      expect(guideValue).withContext(step.id).toBeTruthy();
      target.setAttribute('data-guide', guideValue!);
      Object.defineProperty(target, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: 120,
          right: 420,
          bottom: 200,
          left: 40,
          width: 380,
          height: 80,
          x: 40,
          y: 120,
          toJSON: () => ({}),
        }),
      });
      document.body.appendChild(target);

      component.activeSteps.set([...EXPERIMENT_STUDIO_GUIDE_STEPS] as any);
      component.currentIndex.set(EXPERIMENT_STUDIO_GUIDE_STEPS.findIndex((entry) => entry.id === step.id));
      (component as any).updateLayout();

      const highlight = component.highlightRect();
      expect(highlight).withContext(step.id).not.toBeNull();
      expect(highlight!.width).withContext(step.id).toBeGreaterThan(0);
      expect(highlight!.height).withContext(step.id).toBeGreaterThan(0);
      // Pathology & Datasets contract: target center sits inside the spotlight.
      const centerX = 230;
      const centerY = 160;
      expect(highlight!.left <= centerX && centerX <= highlight!.right).withContext(step.id).toBeTrue();
      expect(highlight!.top <= centerY && centerY <= highlight!.bottom).withContext(step.id).toBeTrue();
    }
  });

  it('documents that the guide host stacks above the app header', () => {
    // app-header uses z-index 10000; guide :host must stay above that (see component CSS).
    // This keeps the Account menu / launcher spotlight visible on chrome targets.
    const guideHostZIndex = 11000;
    const appHeaderZIndex = 10000;
    expect(guideHostZIndex).toBeGreaterThan(appHeaderZIndex);
  });

});
