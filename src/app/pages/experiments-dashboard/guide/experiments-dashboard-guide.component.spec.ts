import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExperimentsDashboardGuideComponent } from './experiments-dashboard-guide.component';
import { EXPERIMENTS_DASHBOARD_GUIDE_STEPS } from './experiments-dashboard-guide.content';

describe('ExperimentsDashboardGuideComponent', () => {
  let component: ExperimentsDashboardGuideComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExperimentsDashboardGuideComponent],
      providers: [provideZonelessChangeDetection()],
    });

    component = TestBed.createComponent(ExperimentsDashboardGuideComponent).componentInstance;
  });

  afterEach(() => {
    document.querySelectorAll('[data-guide]').forEach((element) => element.remove());
  });

  it('keeps Guide Complete as the last content step', () => {
    expect(EXPERIMENTS_DASHBOARD_GUIDE_STEPS.at(-1)?.id).toBe('dashboard-guide-complete');
    const compareIdx = EXPERIMENTS_DASHBOARD_GUIDE_STEPS.findIndex((s) => s.id === 'compare-workspace');
    const completeIdx = EXPERIMENTS_DASHBOARD_GUIDE_STEPS.findIndex((s) => s.id === 'dashboard-guide-complete');
    expect(compareIdx).toBeGreaterThanOrEqual(0);
    expect(completeIdx).toBeGreaterThan(compareIdx);
  });

  it('freezes totalSteps to the full tour length', () => {
    component.startGuide(true);
    expect(component.totalSteps()).toBe(EXPERIMENTS_DASHBOARD_GUIDE_STEPS.length);
    expect(component.currentStepNumber()).toBe(1);
  });

  it('advances step ordinal by one per forward navigation', () => {
    component.startGuide(true);
    const before = component.currentStepNumber();
    component.goToNextStep(true);
    expect(component.currentStepNumber()).toBe(before + 1);
    expect(component.totalSteps()).toBe(EXPERIMENTS_DASHBOARD_GUIDE_STEPS.length);
  });

  it('uses Skip for optional steps that are not last', () => {
    component.activeSteps.set([...EXPERIMENTS_DASHBOARD_GUIDE_STEPS]);
    const compareIdx = EXPERIMENTS_DASHBOARD_GUIDE_STEPS.findIndex((s) => s.id === 'compare-workspace');
    component.currentIndex.set(compareIdx);
    (component as any).recountProgress();
    expect(component.nextButtonLabel()).toBe('Skip');
  });

  it('prefers workbench over compare-workspace when both targets exist', () => {
    const detail = document.createElement('div');
    detail.setAttribute('data-guide', 'dashboard-detail-card');
    Object.defineProperty(detail, 'getBoundingClientRect', {
      value: () => ({ top: 10, right: 100, bottom: 50, left: 10, width: 90, height: 40, x: 10, y: 10, toJSON: () => ({}) }),
    });
    document.body.appendChild(detail);

    const compare = document.createElement('div');
    compare.setAttribute('data-guide', 'dashboard-compare-workspace');
    Object.defineProperty(compare, 'getBoundingClientRect', {
      value: () => ({ top: 10, right: 100, bottom: 50, left: 10, width: 90, height: 40, x: 10, y: 10, toJSON: () => ({}) }),
    });
    document.body.appendChild(compare);

    component.activeSteps.set([...EXPERIMENTS_DASHBOARD_GUIDE_STEPS]);
    const tutorialIdx = EXPERIMENTS_DASHBOARD_GUIDE_STEPS.findIndex((s) => s.id === 'tutorial-experiment');
    component.currentIndex.set(tutorialIdx);

    const next = (component as any).getNavigableStepIndex(tutorialIdx + 1, 1);
    expect(EXPERIMENTS_DASHBOARD_GUIDE_STEPS[next].id).toBe('workbench');
  });

  it('keeps the highlight aligned when the target scrolls above the viewport', () => {
    const target = document.createElement('section');
    target.setAttribute('data-guide', 'dashboard-workspace');
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      top: -18,
      right: 680,
      bottom: 212,
      left: 48,
      width: 632,
      height: 230,
      x: 48,
      y: -18,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(target);

    component.activeSteps.set([
      {
        id: 'workspace',
        section: 'Explore',
        title: 'Experiment List',
        body: '',
        selector: '[data-guide="dashboard-workspace"]',
      },
    ] as any);

    (component as any).updateLayout();

    expect(component.highlightRect()).toEqual(jasmine.objectContaining({
      top: -28,
      left: 38,
      bottom: 222,
      right: 690,
    }));
  });

  it('points every content step with a selector at its data-guide target', () => {
    const stepsWithSelectors = EXPERIMENTS_DASHBOARD_GUIDE_STEPS.filter((step) => !!step.selector);
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

      component.activeSteps.set([...EXPERIMENTS_DASHBOARD_GUIDE_STEPS] as any);
      component.currentIndex.set(EXPERIMENTS_DASHBOARD_GUIDE_STEPS.findIndex((entry) => entry.id === step.id));
      (component as any).updateLayout();

      const highlight = component.highlightRect();
      expect(highlight).withContext(step.id).not.toBeNull();
      const centerX = 230;
      const centerY = 160;
      expect(highlight!.left <= centerX && centerX <= highlight!.right).withContext(step.id).toBeTrue();
      expect(highlight!.top <= centerY && centerY <= highlight!.bottom).withContext(step.id).toBeTrue();
    }
  });

});
