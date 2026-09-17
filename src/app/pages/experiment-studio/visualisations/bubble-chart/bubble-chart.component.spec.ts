import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { BubbleChartComponent } from './bubble-chart.component';
import { ExperimentStudioGuideStateService } from '../../guide/experiment-studio-guide-state.service';

describe('BubbleChartComponent tutorial highlighting', () => {
  let fixture: ComponentFixture<BubbleChartComponent>;
  let component: BubbleChartComponent;
  let guideState: {
    activeStepId: ReturnType<typeof signal<string | null>>;
    expectedTutorialCovariate: ReturnType<typeof signal<string | null>>;
    matchesTutorialCovariate: (node: any, expected?: string | null) => boolean;
  };

  const setInputs = (inputs: Record<string, unknown>): void => {
    Object.entries(inputs).forEach(([name, value]) => {
      fixture.componentRef.setInput(name, value);
    });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    guideState = {
      activeStepId: signal<string | null>('select-sex-variable'),
      expectedTutorialCovariate: signal<string | null>('sex'),
      matchesTutorialCovariate: (node: any, expected?: string | null) => {
        const target = String(expected ?? '').trim().toLowerCase();
        const candidates = [node?.code, node?.label, node?.name]
          .map((value) => String(value ?? '').trim().toLowerCase())
          .filter(Boolean);

        return candidates.some((value) => value === target || value.includes(target));
      },
    };

    await TestBed.configureTestingModule({
      imports: [BubbleChartComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioGuideStateService, useValue: guideState },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BubbleChartComponent);
    component = fixture.componentInstance;
    setInputs({
      d3Data: {
        label: 'root',
        children: [
          {
            label: 'Demographics',
            children: [
              { code: 'sex', label: 'Sex', type: 'text' },
              { code: 'age_value', label: 'Age', type: 'real' },
            ],
          },
        ],
      },
    });
  });

  it('returns the highlighted tutorial node code when the guide target is still pending', () => {
    expect((component as any).getPendingTutorialHighlightCode()).toBe('sex');
  });

  it('removes the tutorial highlight once the target is added to the pool', () => {
    guideState.activeStepId.set('add-sex-covariate');
    setInputs({ selectedVariables: [{ code: 'sex', label: 'Sex', type: 'text' }] });

    expect((component as any).getPendingTutorialHighlightCode()).toBeNull();
  });

  it('keeps Age highlighted until it is added to Variables for the Age add step', () => {
    guideState.activeStepId.set('add-age-variable');
    guideState.expectedTutorialCovariate.set('age');

    expect((component as any).getPendingTutorialHighlightCode()).toBe('age_value');

    setInputs({ selectedVariables: [{ code: 'age_value', label: 'Age', type: 'real' }] });

    expect((component as any).getPendingTutorialHighlightCode()).toBeNull();
  });

  it('hides the In pool legend state while the pool is empty', () => {
    const legend = fixture.nativeElement.querySelector('.map-legend') as HTMLElement;

    expect(legend.textContent).toContain('Available');
    expect(legend.textContent).not.toContain('In pool');

    setInputs({ selectedVariables: [{ code: 'age_value', label: 'Age', type: 'real' }] });

    expect(legend.textContent).toContain('In pool');
  });
});
