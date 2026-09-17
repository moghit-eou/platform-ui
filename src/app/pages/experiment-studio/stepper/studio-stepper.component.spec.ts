import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StudioStepperComponent } from './studio-stepper.component';
import {
  ExperimentStudioNavigationHost,
  ExperimentStudioNavigationService,
  ExperimentStudioSection,
  StepState,
} from '../../../services/experiment-studio-navigation.service';

describe('StudioStepperComponent', () => {
  let fixture: ComponentFixture<StudioStepperComponent>;
  let component: StudioStepperComponent;
  let navService: ExperimentStudioNavigationService;
  let host: jasmine.SpyObj<ExperimentStudioNavigationHost>;

  /** railStatus is a full Record, so every test states all four steps explicitly. */
  function rail(overrides: Partial<Record<ExperimentStudioSection, StepState>> = {}): Record<ExperimentStudioSection, StepState> {
    return {
      'variables-top': 'complete',
      'statistics-section': 'complete',
      'algorithm-section': 'available',
      'execution-section': 'locked',
      ...overrides,
    };
  }

  beforeEach(async () => {
    // The service decides clickability, the registered host receives the navigation.
    host = jasmine.createSpyObj<ExperimentStudioNavigationHost>('ExperimentStudioNavigationHost', [
      'navigateToSection',
      'navigateToDescriptiveStep',
      'runExperiment',
      'backToDashboard',
    ]);

    await TestBed.configureTestingModule({
      imports: [StudioStepperComponent],
      providers: [ExperimentStudioNavigationService],
    })
      .compileComponents();

    navService = TestBed.inject(ExperimentStudioNavigationService);
    navService.register(host);
    fixture = TestBed.createComponent(StudioStepperComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => navService.unregister(host));

  function publish(partial: Parameters<ExperimentStudioNavigationService['publishState']>[0]): void {
    navService.publishState({ railStatus: rail(), ...partial });
    fixture.detectChanges();
  }

  it('renders the four parent steps by name, with no station sub-steps', () => {
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.stepper-step-label')];

    expect(labels.map((l) => l.textContent?.trim())).toEqual([
      'Data Exploration',
      'Data Handling',
      'Algorithm Selection',
      'Experiment Execution',
    ]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.stepper-substep-group')).toBeNull();
    expect(component.parentSteps.length).toBe(4);
  });

  it('marks completed steps with a check and lights the connector behind them', () => {
    publish({ activeSection: 'algorithm-section' });

    const nodes = (fixture.nativeElement as HTMLElement).querySelectorAll('.stepper-node');
    expect(nodes[0].classList.contains('is-complete')).toBeTrue();
    expect(nodes[0].querySelector('.stepper-check-icon')).toBeTruthy();
    expect(nodes[2].classList.contains('is-active')).toBeTrue();

    const connectors = (fixture.nativeElement as HTMLElement).querySelectorAll('.stepper-connector');
    expect(connectors[0].classList.contains('is-complete')).toBeTrue();
    expect(connectors[2].classList.contains('is-complete')).toBeFalse();
  });

  it('keeps a locked step inert and explains it, preferring the per-step reason', () => {
    publish({
      activeSection: 'algorithm-section',
      lockedStepReason: 'Run the experiment to unlock',
      lockedStepReasons: { 'execution-section': 'Select an algorithm first' },
    });

    const locked = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.stepper-step-btn')[3];
    expect(locked.disabled).toBeTrue();
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.title).toBe('Select an algorithm first');

    locked.click();
    expect(host.navigateToSection).not.toHaveBeenCalled();
  });

  it('navigates to a step that is available', () => {
    publish({ activeSection: 'variables-top' });

    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('.stepper-step-btn')[2]
      .click();

    expect(host.navigateToSection).toHaveBeenCalledWith('algorithm-section', undefined);
  });

  it('never renders a run control here — running belongs to the studio action bar', () => {
    publish({ activeSection: 'algorithm-section' });

    expect((fixture.nativeElement as HTMLElement).querySelector('.stepper-run-btn')).toBeNull();
  });
});
