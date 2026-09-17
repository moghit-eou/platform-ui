import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { AlgorithmRoleAssignmentComponent } from './algorithm-role-assignment.component';

describe('AlgorithmRoleAssignmentComponent', () => {
  let fixture: ComponentFixture<AlgorithmRoleAssignmentComponent>;
  let experimentStudioService: {
    algorithmAssignableVariables: ReturnType<typeof signal<any[]>>;
    algorithmY: ReturnType<typeof signal<any[]>>;
    algorithmX: ReturnType<typeof signal<any[]>>;
    setAlgorithmY: jasmine.Spy;
    setAlgorithmX: jasmine.Spy;
  };

  const age = { code: 'age', label: 'Age', type: 'real' };
  const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
  const bmi = { code: 'bmi', label: 'BMI', type: 'real' };
  const derived = { code: 'derived_col', label: 'Derived column', type: 'real', isCreatedColumn: true };

  beforeEach(async () => {
    experimentStudioService = {
      algorithmAssignableVariables: signal<any[]>([age, sex, bmi, derived]),
      algorithmY: signal<any[]>([]),
      algorithmX: signal<any[]>([]),
      setAlgorithmY: jasmine.createSpy('setAlgorithmY').and.callFake((nodes: any[]) => {
        experimentStudioService.algorithmY.set(nodes);
      }),
      setAlgorithmX: jasmine.createSpy('setAlgorithmX').and.callFake((nodes: any[]) => {
        experimentStudioService.algorithmX.set(nodes);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [AlgorithmRoleAssignmentComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: experimentStudioService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AlgorithmRoleAssignmentComponent);
    fixture.detectChanges();
  });

  it('assigns a pool member to y via setAlgorithmY', () => {
    fixture.componentInstance.assignTo('y', age);

    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([age]);
    expect(experimentStudioService.algorithmY()).toEqual([age]);
    // The assigned member leaves the available source list.
    expect(fixture.componentInstance.source()).not.toContain(jasmine.objectContaining({ code: 'age' }));
  });

  it('assigns a pool member to x via setAlgorithmX', () => {
    fixture.componentInstance.assignTo('x', sex);

    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([sex]);
    expect(experimentStudioService.algorithmX()).toEqual([sex]);
    expect(fixture.componentInstance.source()).not.toContain(jasmine.objectContaining({ code: 'sex' }));
  });

  it('removes a member from a role via setAlgorithmY/setAlgorithmX', () => {
    experimentStudioService.algorithmY.set([age, bmi]);
    experimentStudioService.algorithmX.set([sex]);
    fixture.detectChanges();

    fixture.componentInstance.removeFrom('y', age);
    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([bmi]);
    expect(experimentStudioService.algorithmY()).toEqual([bmi]);

    fixture.componentInstance.removeFrom('x', sex);
    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([]);
    expect(experimentStudioService.algorithmX()).toEqual([]);
  });

  it('renders a created badge for nodes flagged as created columns', () => {
    experimentStudioService.algorithmY.set([derived]);
    fixture.detectChanges();

    expect(fixture.componentInstance.isCreated(derived)).toBeTrue();
    expect(fixture.componentInstance.isCreated(age)).toBeFalse();
    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.textContent).toContain('Derived column');
    expect(nativeElement.querySelector('.role-chip-created')).toBeTruthy();
  });

  it('assigning to y removes the node from x (disjoint roles)', () => {
    experimentStudioService.algorithmX.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.assignTo('y', age);

    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([]);
    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([age]);
    expect(experimentStudioService.algorithmX()).toEqual([]);
    expect(experimentStudioService.algorithmY()).toEqual([age]);
    // The node is not in both roles.
    expect(fixture.componentInstance.isAssigned(age, 'x')).toBeFalse();
    expect(fixture.componentInstance.isAssigned(age, 'y')).toBeTrue();
  });

  it('assigning to x removes the node from y (disjoint roles)', () => {
    experimentStudioService.algorithmY.set([bmi]);
    fixture.detectChanges();

    fixture.componentInstance.assignTo('x', bmi);

    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([]);
    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([bmi]);
    expect(experimentStudioService.algorithmY()).toEqual([]);
    expect(experimentStudioService.algorithmX()).toEqual([bmi]);
    expect(fixture.componentInstance.isAssigned(bmi, 'y')).toBeFalse();
    expect(fixture.componentInstance.isAssigned(bmi, 'x')).toBeTrue();
  });

  it('assigning an already-assigned node is a no-op and keeps it out of the other role', () => {
    experimentStudioService.algorithmY.set([sex]);
    fixture.detectChanges();
    experimentStudioService.setAlgorithmY.calls.reset();
    experimentStudioService.setAlgorithmX.calls.reset();

    fixture.componentInstance.assignTo('y', sex);

    expect(experimentStudioService.setAlgorithmY).not.toHaveBeenCalled();
    expect(experimentStudioService.setAlgorithmX).not.toHaveBeenCalled();
    expect(experimentStudioService.algorithmY()).toEqual([sex]);
    expect(experimentStudioService.algorithmX()).toEqual([]);
  });

  it('hides assigned variables from the pool roster', () => {
    experimentStudioService.algorithmY.set([age]);
    fixture.detectChanges();

    expect(fixture.componentInstance.filteredPool().some((node) => node.code === 'age')).toBeFalse();
    expect(fixture.componentInstance.roleOf(age)).toBe('y');
    expect((fixture.nativeElement as HTMLElement).querySelector('.roster')?.textContent).not.toContain('Age');
  });

  it('drops a chip dragged into the other role slot', () => {
    experimentStudioService.algorithmX.set([age]);
    fixture.detectChanges();

    const previous = {} as any;
    // Move age from predictors to outcome.
    fixture.componentInstance.onChipDrop(
      { previousContainer: previous, container: {}, item: { data: age } } as any,
      'y',
    );
    expect(experimentStudioService.algorithmX()).toEqual([]);
    expect(experimentStudioService.algorithmY()).toEqual([age]);

    // Releasing inside its own slot changes nothing.
    fixture.componentInstance.onChipDrop(
      { previousContainer: previous, container: previous, item: { data: age } } as any,
      'y',
    );
    expect(experimentStudioService.algorithmY()).toEqual([age]);
  });

  it('labels the role controls in plain language and still assigns', () => {
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.roster .roles button');
    expect(buttons.length).toBe(8); // 4 pool rows x 2 roles
    expect(buttons[0].textContent).toContain('Outcome');
    expect(buttons[1].textContent).toContain('Predictor');
    buttons[0].click(); // first roster row is age; assign it as outcome
    expect(experimentStudioService.algorithmY()).toEqual([age]);
  });

  it('stacks the outcome rail above the predictor rail instead of side by side', () => {
    experimentStudioService.algorithmY.set([age]);
    experimentStudioService.algorithmX.set([sex, bmi]);
    fixture.detectChanges();

    const rails = (fixture.nativeElement as HTMLElement).querySelector('.rails') as HTMLElement;
    const outcome = rails.querySelector<HTMLElement>('.rail--y');
    const predictor = rails.querySelector<HTMLElement>('.rail--x');

    expect(getComputedStyle(rails).gridTemplateColumns.split(' ').length).toBe(1);
    const outcomeRect = outcome!.getBoundingClientRect();
    const predictorRect = predictor!.getBoundingClientRect();
    // The predictor slot starts where the outcome slot ends, at the same full width.
    expect(predictorRect.top).toBeGreaterThanOrEqual(outcomeRect.bottom - 1);
    expect(predictorRect.width).toBeCloseTo(outcomeRect.width, 0);
  });


  it('keeps the assignment column on the same row as the pool list, to its right', () => {
    experimentStudioService.algorithmY.set([age]);
    experimentStudioService.algorithmX.set([sex, bmi]);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const railsRect = (root.querySelector('.rails') as HTMLElement).getBoundingClientRect();
    const rosterRect = (root.querySelector('.roster') as HTMLElement).getBoundingClientRect();

    // Below the stacking breakpoint the rails return above the list, so the row
    // relationship below is only meaningful on a desktop-width viewport.
    if (window.innerWidth <= 640) {
      pending('the pool row needs a viewport wider than 640px');
    }

    // Two columns of one row: the rails start to the right of the whole list.
    expect(railsRect.left).toBeGreaterThanOrEqual(rosterRect.right - 1);
    expect(railsRect.top).toBeLessThan(rosterRect.bottom);
  });
  it('setRole unassigns a node back to the pool', () => {
    experimentStudioService.algorithmY.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.setRole(age, '');

    expect(experimentStudioService.setAlgorithmY).toHaveBeenCalledWith([]);
    expect(experimentStudioService.algorithmY()).toEqual([]);
    expect(fixture.componentInstance.roleOf(age)).toBe('');
  });

  it('setRole unassigns only the node\'s own role, leaving the other role untouched', () => {
    experimentStudioService.algorithmY.set([sex]);
    experimentStudioService.algorithmX.set([age]);
    fixture.detectChanges();

    fixture.componentInstance.setRole(age, '');

    expect(experimentStudioService.setAlgorithmX).toHaveBeenCalledWith([]);
    expect(experimentStudioService.algorithmX()).toEqual([]);
    // age never was an outcome: setAlgorithmY must not be touched at all.
    expect(experimentStudioService.setAlgorithmY).not.toHaveBeenCalled();
    expect(experimentStudioService.algorithmY()).toEqual([sex]);
  });
});
