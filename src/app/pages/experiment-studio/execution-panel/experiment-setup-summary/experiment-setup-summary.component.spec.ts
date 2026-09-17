import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ExperimentStudioNavigationService } from '../../../../services/experiment-studio-navigation.service';
import { ExperimentRunSetup } from '../../../../models/experiment-run-setup.model';
import { ExperimentSetupSummaryComponent } from './experiment-setup-summary.component';

function buildSetup(overrides: Partial<ExperimentRunSetup> = {}): ExperimentRunSetup {
  return {
    algorithmKey: 'anova_oneway',
    dataModel: 'EU Children',
    datasets: ['clinical', 'biochemistry'],
    outcome: ['outcome_3m'],
    covariates: ['age'],
    filterLogic: { condition: 'AND', rules: [], valid: true },
    preprocessing: [{ label: 'Missing values', value: '3m mRS: drop' }],
    parameters: { conf_level: 0.95, data_transformation: { column: 'x' } },
    ...overrides,
  };
}

describe('ExperimentSetupSummaryComponent', () => {
  let fixture: ComponentFixture<ExperimentSetupSummaryComponent>;
  const studio = {
    runSetup: signal<ExperimentRunSetup | null>(null),
    availableDatasets: signal([{ code: 'clinical', label: 'Clinical' }, { code: 'biochemistry', label: 'Biochemistry' }]),
    variableLabelMap: signal<Record<string, string>>({
      outcome_3m: '3m mRS good outcome',
      age: 'Age at onset',
      sex: 'Sex',
    }),
    getCategoricalEnumMaps: () => ({ sex: { '1': 'female', '0': 'male' } }),
    backendAlgorithms: signal<Record<string, unknown>>({
      anova_oneway: {
        label: 'One-way ANOVA',
        configSchema: [
          { key: 'conf_level', label: 'Confidence level' },
          { key: 'groupA', label: 'Group A', type: 'select', options: [{ code: '1', label: 'female' }] },
        ],
      },
    }),
  };
  const navigation = {
    navigateToSection: jasmine.createSpy('navigateToSection'),
    navigateToDescriptiveStep: jasmine.createSpy('navigateToDescriptiveStep'),
    goToPreprocessing: jasmine.createSpy('goToPreprocessing'),
  };

  beforeEach(async () => {
    studio.runSetup.set(null);
    navigation.navigateToSection.calls.reset();
    navigation.navigateToDescriptiveStep.calls.reset();
    navigation.goToPreprocessing.calls.reset();

    await TestBed.configureTestingModule({
      imports: [ExperimentSetupSummaryComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: studio },
        { provide: ExperimentStudioNavigationService, useValue: navigation },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExperimentSetupSummaryComponent);
  });

  /** Zoneless: every state is a signal write, so rendering is driven through the stub. */
  function render(setup: ExperimentRunSetup | null): HTMLElement {
    studio.runSetup.set(setup);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function textOf(html: HTMLElement, selector: string): string {
    return html.querySelector(selector)?.textContent?.trim() ?? '';
  }

  it('renders nothing until a run has captured a setup', () => {
    expect(render(null).querySelector('.setup-summary')).toBeFalsy();
  });

  it('describes the run from data model to parameters', () => {
    const html = render(buildSetup({
      filterLogic: {
        condition: 'AND',
        valid: true,
        rules: [{ id: 'r1', field: 'sex', type: 'string', input: 'select', operator: 'equal', value: '1' }],
      },
    }));

    expect(textOf(html, '.setup-summary-title')).toBe('Experiment setup');
    expect(textOf(html, '.setup-field-label')).toBe('Pathology');
    expect(textOf(html, '.setup-field-value')).toBe('EU Children');
    expect(html.textContent).toContain('Clinical');
    expect(html.textContent).toContain('Biochemistry');
    expect(html.textContent).toContain('3m mRS good outcome');
    expect(html.textContent).toContain('Age at onset');
    expect(html.textContent).toContain('Sex = female');
    expect(html.textContent).toContain('1 rule');
    expect(html.textContent).toContain('Missing values');
    expect(html.textContent).toContain('3m mRS: drop');
    expect(textOf(html, '.setup-summary-body section:last-child .setup-field-value')).toBe('One-way ANOVA');
  });

  it('lists configured parameters and drops unset or duplicated ones', () => {
    const html = render(buildSetup({
      parameters: { conf_level: 0.95, groupA: '1', notes: '', data_transformation: { column: 'x' } },
    }));

    // Name and value are asserted apart: the whitespace between two cells is the
    // template's business, not the component's.
    const rows = Array.from(html.querySelectorAll('.setup-detail-row')).map((row) => [
      textOf(row as HTMLElement, '.setup-detail-name'),
      textOf(row as HTMLElement, '.setup-detail-value'),
    ].join(' = '));
    expect(rows).toContain('Confidence level = 0.95');
    expect(rows).toContain('Group A = female');
    expect(html.textContent).not.toContain('column');
  });

  it('says so when the cohort was not filtered or parameters were left alone', () => {
    const html = render(buildSetup({ parameters: {} }));

    expect(html.textContent).toContain('every row of the selection was used');
    expect(html.textContent).toContain('Run with the default parameters');
  });

  it('walks back to the step that owns each part of the setup', () => {
    const html = render(buildSetup());
    const actions = Array.from(html.querySelectorAll<HTMLButtonElement>('.setup-field-action'));

    actions[0].click(); // datasets
    actions[1].click(); // variables
    actions[2].click(); // cohort filters
    actions[3].click(); // data handling
    actions[4].click(); // algorithm

    expect(navigation.navigateToSection).toHaveBeenCalledWith('variables-top');
    expect(navigation.navigateToDescriptiveStep).toHaveBeenCalledWith('filters');
    expect(navigation.goToPreprocessing).toHaveBeenCalled();
    expect(navigation.navigateToSection).toHaveBeenCalledWith('algorithm-section');
  });
});
