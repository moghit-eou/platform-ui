import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ErrorService } from '../../../services/error.service';
import { ResultsPdfExportService } from '../../../services/export-results-pdf.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { SessionStorageService } from '../../../services/session-storage.service';
import { AlgorithmConfig } from '../../../models/algorithm-definition.model';
import { AlgorithmPanelComponent } from './algorithm-panel.component';
import { of } from 'rxjs';

describe('AlgorithmPanelComponent', () => {
  let fixture: ComponentFixture<AlgorithmPanelComponent>;
  let studioNavigation: jasmine.SpyObj<ExperimentStudioNavigationService>;
  let experimentStudioService: {
    selectedAlgorithm: ReturnType<typeof signal<AlgorithmConfig | null>>;
    selectedVariables: ReturnType<typeof signal<any[]>>;
    algorithmY: ReturnType<typeof signal<any[]>>;
    algorithmX: ReturnType<typeof signal<any[]>>;
    algorithmAssignableVariables: ReturnType<typeof signal<any[]>>;
    selectedFilters: ReturnType<typeof signal<any[]>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    selectedDataModel: ReturnType<typeof signal<any>>;
    algorithmConfigurations: ReturnType<typeof signal<Record<string, any>>>;
    availableGroupedAlgorithms: ReturnType<typeof signal<Record<string, AlgorithmConfig[]>>>;
    backendAlgorithms: ReturnType<typeof signal<Record<string, AlgorithmConfig>>>;
    isRunning: ReturnType<typeof signal<boolean>>;
    currentExperimentUUID: ReturnType<typeof signal<string | null>>;
    lastUsedAlgorithm: ReturnType<typeof signal<string>>;
    runResult: ReturnType<typeof signal<any>>;
    runError: ReturnType<typeof signal<string | null>>;
    lastRunSchema: ReturnType<typeof signal<any[]>>;
    hasRunStarted: ReturnType<typeof signal<boolean>>;
    runStatusText: ReturnType<typeof signal<string>>;
    variableLabelMap: ReturnType<typeof signal<Record<string, string>>>;
    notifySaveSucceeded: jasmine.Spy;
    availableDatasets: ReturnType<typeof signal<any[]>>;
    getCategoricalEnumMaps: jasmine.Spy;
    isCrossValidationOnly: jasmine.Spy;
    getCrossValidationBase: jasmine.Spy;
    getCrossValidationVariant: jasmine.Spy;
    getTransformationBase: jasmine.Spy;
    getTransformationVariant: jasmine.Spy;
    hasAppliedDescriptivePreprocessing: jasmine.Spy;
    hasRequestPreprocessingForRun: jasmine.Spy;
    isAlgorithmAvailable: jasmine.Spy;
    getAlgorithmAvailability: jasmine.Spy;
    setAlgorithm: jasmine.Spy;
    setRunning: jasmine.Spy;
    runSelectedAlgorithmTransient: jasmine.Spy;
    runSelectedAlgorithm: jasmine.Spy;
    captureRunSetup: jasmine.Spy;
    getEffectivePreprocessingSummary: jasmine.Spy;
    getDatasetLabelMap: jasmine.Spy;
    getAppliedDescriptivePreprocessing: jasmine.Spy;
    formatPreprocessingEntries: jasmine.Spy;
    filterLogic: ReturnType<typeof signal<any>>;
    isCrossValidationAlgorithm: jasmine.Spy;
  };

  const algorithm: AlgorithmConfig = {
    name: 'flat_config_algorithm',
    label: 'Flat Config Algorithm',
    description: 'Algorithm with more than three configuration fields.',
    documentation: 'Line one.\nLine two.',
    category: 'Test',
    requiredVariable: [],
    covariate: [],
    configSchema: [
      { key: 'first', label: 'First', type: 'number', default: 1 },
      { key: 'second', label: 'Second', type: 'number', default: 2 },
      { key: 'third', label: 'Third', type: 'number', default: 3 },
      { key: 'fourth', label: 'Fourth', type: 'number', default: 4 },
    ],
    isDisabled: false,
  };

  beforeEach(async () => {
    studioNavigation = jasmine.createSpyObj<ExperimentStudioNavigationService>(
      'ExperimentStudioNavigationService',
      ['navigateToSection', 'goToPreprocessing', 'publishState'],
    );

    experimentStudioService = {
      selectedAlgorithm: signal<AlgorithmConfig | null>(algorithm),
      selectedVariables: signal<any[]>([{ code: 'y', label: 'Y variable' }]),
      algorithmY: signal<any[]>([]),
      algorithmX: signal<any[]>([]),
      algorithmAssignableVariables: signal<any[]>([{ code: 'y', label: 'Y variable', type: 'real' }]),
      selectedFilters: signal<any[]>([]),
      selectedDatasets: signal<string[]>([]),
      selectedDataModel: signal<any>(null),
      algorithmConfigurations: signal<Record<string, any>>({}),
      availableGroupedAlgorithms: signal<Record<string, AlgorithmConfig[]>>({ Test: [algorithm] }),
      backendAlgorithms: signal<Record<string, AlgorithmConfig>>({ flat_config_algorithm: algorithm }),
      isRunning: signal(false),
      currentExperimentUUID: signal<string | null>(null),
      lastUsedAlgorithm: signal(''),
      runResult: signal<any>(null),
      runError: signal<string | null>(null),
      lastRunSchema: signal<any[]>([]),
      hasRunStarted: signal(false),
      runStatusText: signal('Processing experiment...'),
      variableLabelMap: signal<Record<string, string>>({}),
      notifySaveSucceeded: jasmine.createSpy('notifySaveSucceeded'),
      availableDatasets: signal<any[]>([]),
      getCategoricalEnumMaps: jasmine.createSpy('getCategoricalEnumMaps').and.returnValue({}),
      isCrossValidationOnly: jasmine.createSpy('isCrossValidationOnly').and.returnValue(false),
      getCrossValidationBase: jasmine.createSpy('getCrossValidationBase').and.returnValue(null),
      getCrossValidationVariant: jasmine.createSpy('getCrossValidationVariant').and.returnValue(null),
      getTransformationBase: jasmine.createSpy('getTransformationBase').and.returnValue(null),
      getTransformationVariant: jasmine.createSpy('getTransformationVariant').and.returnValue(null),
      hasAppliedDescriptivePreprocessing: jasmine.createSpy('hasAppliedDescriptivePreprocessing').and.returnValue(true),
      hasRequestPreprocessingForRun: jasmine.createSpy('hasRequestPreprocessingForRun').and.returnValue(false),
      isAlgorithmAvailable: jasmine.createSpy('isAlgorithmAvailable').and.returnValue(true),
      getAlgorithmAvailability: jasmine.createSpy('getAlgorithmAvailability').and.returnValue({
        available: true,
        summary: '',
        details: [],
      }),
      setAlgorithm: jasmine.createSpy('setAlgorithm').and.callFake((next: AlgorithmConfig) => {
        experimentStudioService.selectedAlgorithm.set(next);
      }),
      setRunning: jasmine.createSpy('setRunning'),
      runSelectedAlgorithmTransient: jasmine.createSpy('runSelectedAlgorithmTransient'),
      runSelectedAlgorithm: jasmine.createSpy('runSelectedAlgorithm'),
      captureRunSetup: jasmine.createSpy('captureRunSetup'),
      getEffectivePreprocessingSummary: jasmine.createSpy('getEffectivePreprocessingSummary').and.returnValue(null),
      getDatasetLabelMap: jasmine.createSpy('getDatasetLabelMap').and.returnValue({}),
      getAppliedDescriptivePreprocessing: jasmine.createSpy('getAppliedDescriptivePreprocessing').and.returnValue(null),
      formatPreprocessingEntries: jasmine.createSpy('formatPreprocessingEntries').and.returnValue([]),
      filterLogic: signal(null),
      isCrossValidationAlgorithm: jasmine.createSpy('isCrossValidationAlgorithm').and.returnValue(false),
    };

    await TestBed.configureTestingModule({
      imports: [AlgorithmPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ExperimentStudioService, useValue: experimentStudioService },
        { provide: ErrorService, useValue: { clearError: jasmine.createSpy('clearError') } },
        { provide: AuthService, useValue: { currentUser: null } },
        { provide: ResultsPdfExportService, useValue: { exportExperimentPdf: jasmine.createSpy('exportExperimentPdf') } },
        { provide: RuntimeEnvService, useValue: { mipVersion: 'test' } },
        { provide: SessionStorageService, useValue: {} },
        { provide: ExperimentStudioNavigationService, useValue: studioNavigation },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AlgorithmPanelComponent);
    fixture.detectChanges();
  });

  it('renders all algorithm configuration fields without an advanced toggle', async () => {
    fixture.componentInstance.setStudioSubstep('parameters');
    await fixture.whenStable();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const fields = nativeElement.querySelectorAll('.config-field');

    expect(fields.length).toBe(4);
    expect(nativeElement.textContent).toContain('Fourth');
    expect((nativeElement.querySelector('.algorithm-readonly-fieldset') as HTMLFieldSetElement)?.disabled).toBeFalse();
    expect(fixture.componentInstance.canRun()).toBeTrue();
    expect(nativeElement.textContent).not.toContain('Show advanced configuration');
    expect(nativeElement.textContent).not.toContain('Hide advanced configuration');
  });

  it('renders selected algorithm documentation separately from the short description', async () => {
    fixture.componentInstance.setStudioSubstep('parameters');
    await fixture.whenStable();
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const details = nativeElement.querySelector('.documentation-panel') as HTMLDetailsElement;

    expect(nativeElement.querySelector('.config-description')?.textContent).toContain('Algorithm with more than three configuration fields.');
    expect(details?.textContent).toContain('Documentation');
    expect(details?.textContent).toContain('Line one.');
    expect(details?.textContent).toContain('Line two.');
    expect(details?.open).toBeTrue();
    expect(details?.querySelector('.documentation-content')?.textContent).toContain('Line one.');
  });

  it('shows disabled algorithm availability reasons on the card and in the tooltip', async () => {
    const disabledAlgorithm: AlgorithmConfig = {
      ...algorithm,
      name: 'needs_two_variables',
      label: 'Needs Two Variables',
      isDisabled: true,
      availability: {
        available: false,
        summary: 'Outcome needs at least 2, selected 1.',
        details: [
          {
            role: 'y',
            label: 'Outcome',
            selectedCount: 1,
            minCount: 2,
            maxCount: 3,
            required: true,
            types: ['real'],
            stattypes: ['nominal'],
            messages: [
              'Outcome needs at least 2, selected 1.',
              'Outcome type must be one of real.',
            ],
            satisfied: false,
          },
        ],
      },
    };
    experimentStudioService.availableGroupedAlgorithms.set({ Test: [disabledAlgorithm] });
    fixture.componentInstance.showOnlyActive.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    // Groups without runnable methods start collapsed: reveal the Test group.
    ((fixture.nativeElement as HTMLElement).querySelector('.algorithm-match-cat') as HTMLButtonElement).click();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.tooltipVisible.set(true);
    component.tooltipData.set(disabledAlgorithm);
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const algorithmItem = nativeElement.querySelector('.algo-tile') as HTMLElement;
    expect(algorithmItem.textContent).toContain('Needs Two Variables');
    expect(algorithmItem.querySelector('.algo-why')?.textContent).toContain('Outcome needs at least 2, selected 1.');
    expect(nativeElement.querySelector('.tooltip')?.textContent).toContain('Outcome needs at least 2, selected 1.');
    expect(nativeElement.textContent).toContain('Availability');
    expect(nativeElement.textContent).toContain('Outcome: 2-3, selected 1');
    expect(nativeElement.textContent).toContain('type: real');
    expect(nativeElement.querySelector('.tooltip')?.textContent).toContain('Outcome type must be one of real.');
    expect(nativeElement.textContent).not.toContain('type: nominal');
    expect(nativeElement.textContent).not.toContain('stattypes: nominal');
  });

  it('displays text availability types as nominal in requirement tips', () => {
    const text = fixture.componentInstance.availabilityRequirementText({
      role: 'x',
      label: 'Predictor',
      selectedCount: 1,
      minCount: 1,
      maxCount: null,
      required: true,
      types: ['real', 'int', 'text'],
      stattypes: [],
      messages: [],
      satisfied: true,
    });

    expect(text).toContain('type: real, int, nominal');
    expect(text).not.toContain('text');
  });

  it('shows type availability reasons on algorithm cards', async () => {
    const disabledAlgorithm: AlgorithmConfig = {
      ...algorithm,
      name: 'type_only_algorithm',
      label: 'Type Only Algorithm',
      isDisabled: true,
      availability: {
        available: false,
        summary: 'Outcome type must be one of real.',
        details: [
          {
            role: 'y',
            label: 'Outcome',
            selectedCount: 1,
            minCount: 1,
            maxCount: 1,
            required: true,
            types: ['real'],
            stattypes: [],
            messages: ['Outcome type must be one of real.'],
            satisfied: false,
          },
        ],
      },
    };
    experimentStudioService.availableGroupedAlgorithms.set({ Test: [disabledAlgorithm] });
    fixture.componentInstance.showOnlyActive.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    // Groups without runnable methods start collapsed: reveal the Test group.
    ((fixture.nativeElement as HTMLElement).querySelector('.algorithm-match-cat') as HTMLButtonElement).click();
    fixture.detectChanges();

    const algorithmItem = fixture.nativeElement.querySelector('.algo-tile') as HTMLElement;
    expect(algorithmItem.textContent).toContain('Type Only Algorithm');
    expect(algorithmItem.querySelector('.algo-why')?.textContent).toContain('Outcome type must be one of real.');
  });

  it('selects unavailable algorithms as a read-only preview with expandable documentation', async () => {
    const unavailableAlgorithm: AlgorithmConfig = {
      ...algorithm,
      name: 'unavailable_algorithm',
      label: 'Unavailable Algorithm',
      documentation: 'Unavailable docs.\nSecond line.',
      isDisabled: true,
      configSchema: [
        { key: 'alpha', label: 'Alpha', type: 'number', default: 0.05 },
      ],
      availability: {
        available: false,
        summary: 'Outcome type must be one of text.',
        details: [],
      },
    };
    experimentStudioService.availableGroupedAlgorithms.set({ Test: [unavailableAlgorithm] });
    experimentStudioService.backendAlgorithms.set({ unavailable_algorithm: unavailableAlgorithm });
    experimentStudioService.isAlgorithmAvailable.and.callFake((name: string) => name !== 'unavailable_algorithm');
    experimentStudioService.getAlgorithmAvailability.and.callFake((name: string) => name === 'unavailable_algorithm'
      ? unavailableAlgorithm.availability
      : { available: true, summary: '', details: [] });

    fixture.componentInstance.showOnlyActive.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    // Groups without runnable methods start collapsed: reveal the Test group.
    ((fixture.nativeElement as HTMLElement).querySelector('.algorithm-match-cat') as HTMLButtonElement).click();
    fixture.detectChanges();

    const unavailableListItem = (fixture.nativeElement as HTMLElement).querySelector('.algo-tile.disabled-algo') as HTMLElement;
    expect(getComputedStyle(unavailableListItem).cursor).toBe('pointer');

    fixture.componentInstance.onAlgorithmClick(unavailableAlgorithm);
    fixture.detectChanges();
    await fixture.whenStable();

    const nativeElement = fixture.nativeElement as HTMLElement;
    const details = nativeElement.querySelector('.documentation-panel') as HTMLDetailsElement;

    expect(experimentStudioService.selectedAlgorithm()?.name).toBe('unavailable_algorithm');
    expect(details?.textContent).toContain('Unavailable docs.');
    expect(details?.open).toBeTrue();

    fixture.componentInstance.setStudioSubstep('parameters');
    fixture.detectChanges();
    await fixture.whenStable();

    const runRoot = fixture.nativeElement as HTMLElement;
    const fieldset = runRoot.querySelector('.algorithm-readonly-fieldset') as HTMLFieldSetElement;
    const requirementsPanel = runRoot.querySelector('.algorithm-requirements-panel') as HTMLElement;
    expect(requirementsPanel?.textContent).toContain('Complete before running');
    expect(requirementsPanel?.textContent).toContain('Outcome type must be one of nominal.');
    expect(requirementsPanel?.textContent).not.toContain('text');
    expect(fieldset).toBeTruthy();
    expect(fieldset.disabled).toBeTrue();
    expect(getComputedStyle(fieldset).pointerEvents).toBe('none');
    expect(fixture.componentInstance.canRun()).toBeFalse();

    fixture.componentInstance.onClickRunExp();
    expect(experimentStudioService.runSelectedAlgorithm).not.toHaveBeenCalled();
    expect(experimentStudioService.runSelectedAlgorithmTransient).not.toHaveBeenCalled();
  });

  it('keeps fields after the old advanced cutoff in the persisted form config', async () => {
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.configForm().get('fourth')?.setValue('42');

    expect(experimentStudioService.algorithmConfigurations()['flat_config_algorithm']['fourth']).toBe(42);
  });

  it('shows event_var description and covariate options for Cox regression', async () => {
    const coxAlgorithm: AlgorithmConfig = {
      name: 'cox_regression_classical',
      label: 'Cox Regression Classical',
      description: '',
      category: 'Regression',
      requiredVariable: ['real'],
      covariate: ['real', 'text'],
      configSchema: [
        {
          key: 'event_var',
          label: 'Event indicator variable',
          desc: 'Variable from x to use as the binary event indicator.',
          type: 'select',
          enumType: 'input_var_names',
          enumSource: ['x'],
          required: true,
          options: [],
        },
      ],
      isDisabled: false,
    };

    experimentStudioService.selectedAlgorithm.set(coxAlgorithm);
    experimentStudioService.backendAlgorithms.set({ cox_regression_classical: coxAlgorithm });
    experimentStudioService.availableGroupedAlgorithms.set({ Regression: [coxAlgorithm] });
    experimentStudioService.algorithmX.set([
      { code: 'event_status', label: 'Event status', type: 'nominal' },
      { code: 'age', label: 'Age', type: 'real' },
    ]);

    fixture.componentInstance.setStudioSubstep('parameters');
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Variable from x to use as the binary event indicator.');
    const select = root.querySelector('select.config-select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.textContent).toContain('Event status');
    expect(select.textContent).toContain('Age');
  });

  it('lists positive_class options from the selected event indicator variable', async () => {
    const coxAlgorithm: AlgorithmConfig = {
      name: 'cox_regression_classical',
      label: 'Cox Regression Classical',
      description: '',
      category: 'Regression',
      requiredVariable: ['real'],
      covariate: ['text'],
      configSchema: [
        {
          key: 'event_var',
          label: 'Event indicator variable',
          desc: 'Variable from x to use as the binary event indicator.',
          type: 'select',
          enumType: 'input_var_names',
          enumSource: ['x'],
          required: true,
          options: [],
        },
        {
          key: 'positive_class',
          label: 'Positive event class',
          desc: 'Event level mapped to 1; other observed levels are mapped to 0.',
          type: 'text',
          required: true,
        },
      ],
      isDisabled: false,
    };

    experimentStudioService.selectedAlgorithm.set(coxAlgorithm);
    experimentStudioService.algorithmX.set([
      {
        code: 'procedure',
        label: 'Procedure',
        type: 'nominal',
        enumerations: [
          { code: 'balloon', label: 'Balloon angioplasty' },
          { code: 'stent', label: 'Extracranial stent' },
        ],
      },
    ]);
    experimentStudioService.algorithmConfigurations.set({
      cox_regression_classical: { event_var: 'procedure' },
    });

    fixture.componentInstance.setStudioSubstep('parameters');
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const selects = root.querySelectorAll('select.config-select');
    expect(selects.length).toBe(2);
    const positiveSelect = selects[1] as HTMLSelectElement;
    expect(positiveSelect.textContent).toContain('Balloon angioplasty');
    expect(positiveSelect.textContent).toContain('Extracranial stent');
    expect(positiveSelect.textContent).not.toContain('None (optional)');
    expect(positiveSelect.textContent).toContain('-- Select --');
    expect(root.textContent).toContain('Select the event level mapped to 1');

    const component = fixture.componentInstance;
    expect(component.visibleConfigSchema().find((field) => field.key === 'positive_class')?.required).toBeTrue();
    const values = (component as any).normalizeFormValues(
      { event_var: 'procedure', positive_class: 'yes' },
      component.visibleConfigSchema()
    );
    expect(values.positive_class).toBe('yes');
  });

  it('blocks Cox runs when positive_class is unset', async () => {
    const coxAlgorithm: AlgorithmConfig = {
      name: 'cox_regression_classical',
      label: 'Cox Regression Classical',
      description: '',
      category: 'Regression',
      requiredVariable: ['real'],
      covariate: ['text'],
      configSchema: [
        {
          key: 'event_var',
          label: 'Event indicator variable',
          type: 'select',
          enumType: 'input_var_names',
          enumSource: ['x'],
          required: true,
          options: [],
        },
        {
          key: 'positive_class',
          label: 'Positive event class',
          type: 'text',
          required: false,
        },
      ],
      isDisabled: false,
    };

    experimentStudioService.selectedAlgorithm.set(coxAlgorithm);
    experimentStudioService.algorithmX.set([
      {
        code: 'sex',
        label: 'Sex',
        type: 'nominal',
        enumerations: [
          { code: 'male', label: 'male' },
          { code: 'female', label: 'female' },
        ],
      },
    ]);
    experimentStudioService.algorithmConfigurations.set({
      cox_regression_classical: { event_var: 'sex' },
    });

    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.onClickRunExp();

    expect(experimentStudioService.runSelectedAlgorithm).not.toHaveBeenCalled();
    expect(component.configForm().get('positive_class')?.invalid).toBeTrue();
  });

  it('shows covariate hint for empty input_var_names selects', async () => {
    const coxAlgorithm: AlgorithmConfig = {
      name: 'cox_regression_classical',
      label: 'Cox Regression Classical',
      description: '',
      category: 'Regression',
      requiredVariable: ['real'],
      covariate: ['real'],
      configSchema: [
        {
          key: 'event_var',
          label: 'Event indicator variable',
          desc: 'Variable from x to use as the binary event indicator.',
          type: 'select',
          enumType: 'input_var_names',
          enumSource: ['x'],
          required: true,
          options: [],
        },
      ],
      isDisabled: false,
    };

    experimentStudioService.selectedAlgorithm.set(coxAlgorithm);
    experimentStudioService.algorithmX.set([]);

    fixture.componentInstance.setStudioSubstep('parameters');
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const select = root.querySelector('select.config-select') as HTMLSelectElement;
    expect(root.textContent).toContain('Select covariates first');
    expect(select?.options.length).toBe(1);
  });

  it('serializes outlier_report rules into dictionary parameters', async () => {
    const outlierAlgorithm: AlgorithmConfig = {
      name: 'outlier_report',
      label: 'Outlier Report',
      description: '',
      category: 'Descriptive Statistics',
      requiredVariable: ['real'],
      covariate: ['real'],
      configSchema: [
        { key: 'strategies', label: 'Strategies', type: 'dict' },
        { key: 'tails', label: 'Tails', type: 'dict' },
        { key: 'folds', label: 'Folds', type: 'dict' },
      ],
      isDisabled: false,
    };
    experimentStudioService.selectedAlgorithm.set(outlierAlgorithm);
    experimentStudioService.backendAlgorithms.set({ outlier_report: outlierAlgorithm });
    experimentStudioService.availableGroupedAlgorithms.set({ 'Descriptive Statistics': [outlierAlgorithm] });
    experimentStudioService.selectedVariables.set([
      { code: 'age', label: 'Age', type: 'real' },
      { code: 'sex', label: 'Sex', type: 'nominal' },
    ]);
    experimentStudioService.algorithmX.set([{ code: 'bmi', label: 'BMI', type: 'real' }]);
    experimentStudioService.algorithmAssignableVariables.set([
      { code: 'age', label: 'Age', type: 'real' },
      { code: 'sex', label: 'Sex', type: 'nominal' },
      { code: 'bmi', label: 'BMI', type: 'real' },
    ]);
    experimentStudioService.hasAppliedDescriptivePreprocessing.and.returnValue(false);
    experimentStudioService.runSelectedAlgorithmTransient.and.returnValue(of({
      status: 'success',
      result: { featurewise: [] },
    }));

    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.onOutlierReportEnabledChange({ code: 'bmi', label: 'BMI', type: 'real' }, false);
    component.onOutlierReportStrategyChange({ code: 'age', label: 'Age', type: 'real' }, 'quantile');
    component.onOutlierReportFoldChange({ code: 'age', label: 'Age', type: 'real' }, 0.05);
    component.onClickRunExp();

    expect(experimentStudioService.algorithmConfigurations()['outlier_report']).toEqual({
      strategies: { age: 'quantile' },
      tails: { age: 'both' },
      folds: { age: 0.05 },
    });
    expect(experimentStudioService.captureRunSetup).toHaveBeenCalledWith('outlier_report');
    expect(experimentStudioService.runSelectedAlgorithmTransient).toHaveBeenCalledWith('outlier_report', 'outlier_report');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Age');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('BMI');
  });

  it('blocks invalid outlier_report folds', async () => {
    const outlierAlgorithm: AlgorithmConfig = {
      name: 'outlier_report',
      label: 'Outlier Report',
      description: '',
      category: 'Descriptive Statistics',
      requiredVariable: ['real'],
      covariate: ['real'],
      configSchema: [
        { key: 'strategies', label: 'Strategies', type: 'dict' },
        { key: 'tails', label: 'Tails', type: 'dict' },
        { key: 'folds', label: 'Folds', type: 'dict' },
      ],
      isDisabled: false,
    };
    experimentStudioService.selectedAlgorithm.set(outlierAlgorithm);
    experimentStudioService.selectedVariables.set([{ code: 'age', label: 'Age', type: 'real' }]);
    experimentStudioService.algorithmAssignableVariables.set([{ code: 'age', label: 'Age', type: 'real' }]);
    experimentStudioService.hasAppliedDescriptivePreprocessing.and.returnValue(false);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.onOutlierReportStrategyChange({ code: 'age', label: 'Age', type: 'real' }, 'quantile');
    component.onOutlierReportFoldChange({ code: 'age', label: 'Age', type: 'real' }, 0.5);
    experimentStudioService.runSelectedAlgorithmTransient.calls.reset();

    component.onClickRunExp();

    expect(experimentStudioService.runSelectedAlgorithmTransient).not.toHaveBeenCalled();
    expect(component.errorMsg()).toBe('Fix the outlier report configuration before running.');
  });

  it('lists availability and preprocessing requirements together', async () => {
    const unavailableAlgorithm: AlgorithmConfig = {
      ...algorithm,
      name: 'unavailable_algorithm',
      availability: {
        available: false,
        summary: 'Outcome needs at least 1, selected 0.',
        details: [{
          role: 'y',
          label: 'Outcome',
          selectedCount: 0,
          minCount: 1,
          maxCount: 1,
          required: true,
          types: [],
          stattypes: [],
          messages: ['Outcome needs at least 1, selected 0.'],
          satisfied: false,
        }],
      },
    };

    experimentStudioService.availableGroupedAlgorithms.set({ Test: [unavailableAlgorithm] });
    experimentStudioService.backendAlgorithms.set({ unavailable_algorithm: unavailableAlgorithm });
    experimentStudioService.isAlgorithmAvailable.and.callFake((name: string) => name !== 'unavailable_algorithm');
    experimentStudioService.getAlgorithmAvailability.and.callFake((name: string) => (
      name === 'unavailable_algorithm'
        ? unavailableAlgorithm.availability!
        : { available: true, summary: '', details: [] }
    ));
    experimentStudioService.selectedAlgorithm.set(unavailableAlgorithm);
    experimentStudioService.hasAppliedDescriptivePreprocessing.and.returnValue(false);
    fixture.componentInstance.setStudioSubstep('parameters');
    fixture.detectChanges();
    await fixture.whenStable();

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.algorithm-requirement-item');
    expect(items.length).toBe(2);
    expect(items[0]?.textContent).toContain('Outcome needs at least 1, selected 0.');
    expect(items[0]?.textContent).toContain('Assign outcome');
    expect(items[1]?.textContent).toContain('Apply missing value preprocessing');
    expect(items[1]?.textContent).toContain('Go to preprocessing');
  });

  it('keeps the availability run-requirement action on the algorithm panel for role assignment', async () => {
    const unavailableAlgorithm: AlgorithmConfig = {
      ...algorithm,
      name: 'unavailable_algorithm',
      availability: {
        available: false,
        summary: 'Outcome needs at least 1, selected 0.',
        details: [{
          role: 'y',
          label: 'Outcome',
          selectedCount: 0,
          minCount: 1,
          maxCount: 1,
          required: true,
          types: [],
          stattypes: [],
          messages: ['Outcome needs at least 1, selected 0.'],
          satisfied: false,
        }],
      },
    };

    experimentStudioService.availableGroupedAlgorithms.set({ Test: [unavailableAlgorithm] });
    experimentStudioService.backendAlgorithms.set({ unavailable_algorithm: unavailableAlgorithm });
    experimentStudioService.isAlgorithmAvailable.and.callFake((name: string) => name !== 'unavailable_algorithm');
    experimentStudioService.getAlgorithmAvailability.and.callFake((name: string) => (
      name === 'unavailable_algorithm'
        ? unavailableAlgorithm.availability!
        : { available: true, summary: '', details: [] }
    ));
    experimentStudioService.selectedAlgorithm.set(unavailableAlgorithm);
    fixture.componentInstance.setStudioSubstep('parameters');
    fixture.detectChanges();
    await fixture.whenStable();

    const action = (fixture.nativeElement as HTMLElement).querySelector(
      '.algorithm-requirement-item .algorithm-requirement-action',
    ) as HTMLButtonElement;

    expect(action?.textContent).toContain('Assign outcome');
    action.click();
    // Role assignment lives on this panel; the action does not navigate back to variables.
    expect(studioNavigation.navigateToSection).not.toHaveBeenCalled();
  });

  it('navigates to preprocessing from the requirements list', async () => {
    experimentStudioService.hasAppliedDescriptivePreprocessing.and.returnValue(false);
    experimentStudioService.selectedAlgorithm.set({ ...algorithm });
    fixture.componentInstance.setStudioSubstep('parameters');
    fixture.detectChanges();
    await fixture.whenStable();

    const action = (fixture.nativeElement as HTMLElement).querySelector(
      '.algorithm-requirement-item .algorithm-requirement-action',
    ) as HTMLButtonElement;

    expect(action?.textContent).toContain('Go to preprocessing');
    action.click();
    expect(studioNavigation.goToPreprocessing).toHaveBeenCalled();
  });

  it('lists unavailable methods with their why badge in All mode', () => {
    const disabledAlgorithm = {
      ...algorithm,
      isDisabled: true,
      availability: {
        available: false,
        summary: 'Needs an outcome',
        details: [],
      },
    };

    experimentStudioService.availableGroupedAlgorithms.set({ Test: [disabledAlgorithm] });
    experimentStudioService.getAlgorithmAvailability.and.returnValue({
      available: false,
      summary: 'Needs an outcome',
      details: [],
    });
    fixture.componentInstance.showOnlyActive.set(false);
    fixture.detectChanges();
    expect(fixture.componentInstance.showOnlyActive()).toBeFalse();

    // The group holds the selected method, so it is open even with nothing runnable.
    const tile = (fixture.nativeElement as HTMLElement).querySelector('.algo-tile');
    expect(tile?.textContent).toContain('Flat Config Algorithm');
    expect(tile?.querySelector('.algo-why')?.textContent).toContain('Needs an outcome');
  });

  it('nests the matching catalog in the outcomes board', () => {
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const board = root.querySelector('.algorithm-roles-board');
    expect(board?.querySelector('[data-guide="algorithm-selection"]')).toBeTruthy();
    expect(board?.querySelector('.algo-tile')?.textContent).toContain('Flat Config Algorithm');
  });

  it('shows the pointing chevron only on the selected runnable tile', () => {
    fixture.detectChanges();
    const tiles = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.algo-tile'));
    expect(tiles.length).toBeGreaterThan(0);

    tiles.forEach((tile) => {
      const cue = tile.querySelector<HTMLElement>('.algo-tile-cue');
      const pointsAtConfig = tile.classList.contains('selected') && !tile.classList.contains('disabled-algo');
      expect(getComputedStyle(cue!).display).toBe(pointsAtConfig ? 'block' : 'none');
    });
    const pointing = tiles.filter(
      (tile) => getComputedStyle(tile.querySelector<HTMLElement>('.algo-tile-cue')!).display === 'block',
    );
    expect(pointing.length).toBe(1);
  });

  it('places the parameter pool above the catalog-and-configuration split', () => {
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const pool = root.querySelector('.algorithm-pool');
    const workspace = root.querySelector('.algorithm-workspace');
    // The pool is the full-width top band, a direct child under the card header.
    expect(pool?.querySelector('app-algorithm-role-assignment')).toBeTruthy();
    expect(pool?.parentElement?.classList.contains('algorithm-roles-board')).toBeTrue();
    expect(
      !!pool && !!workspace &&
      !!(pool.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBeTrue();
    // The bottom row is the master–detail split: catalog left, configuration right.
    expect(workspace?.querySelector('app-algorithm-role-assignment')).toBeNull();
    expect(workspace?.querySelector('[data-guide="algorithm-selection"]')).toBeTruthy();
    expect(
      workspace?.querySelector('.algorithm-config-column [data-guide="algorithm-settings"]')
    ).toBeTruthy();
    expect(root.querySelector('.algo-tile')).toBeTruthy();
    expect(root.querySelector('.algorithm-roles-footer')).toBeNull();
  });

  it('opens the configure view when a matching method is clicked', async () => {
    experimentStudioService.selectedAlgorithm.set(null);
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.algo-tile')).toBeTruthy();
    expect(root.querySelector('.documentation-panel')).toBeNull();

    fixture.componentInstance.onAlgorithmClick(algorithm);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.studioSubstep()).toBe('parameters');
    const details = root.querySelector('.documentation-panel') as HTMLDetailsElement | null;
    expect(details?.open).toBeTrue();
    expect(details?.textContent).toContain('Line one.');
    expect(root.querySelector('.config-form')).toBeTruthy();
    // Setup stays on screen: the method grid is still rendered above the board.
    expect(root.querySelector('.algo-tile')).toBeTruthy();
  });

  it('renders setup and configuration in one unified card', () => {
    fixture.componentInstance.onAlgorithmClick(algorithm);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const boards = root.querySelectorAll('.algorithm-roles-board');
    // One frame: roles, catalog, parameters, and details share a single studio card.
    expect(boards.length).toBe(1);
    expect(boards[0]?.querySelector('.algo-tile')).toBeTruthy();
    const paramsPane = root.querySelector('[data-guide="algorithm-settings"]');
    expect(boards[0]?.contains(paramsPane)).toBeTrue();

    // The parameters pane must not paint its own card frame on top of the unified
    // card, otherwise the workspace reads as separate cards again.
    const styles = getComputedStyle(paramsPane as HTMLElement);
    expect(styles.borderTopWidth).toBe('0px');
    expect(styles.backgroundColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(styles.boxShadow).toBe('none');
  });

  it('renders details and parameters in the configuration column beside the catalog', async () => {
    experimentStudioService.selectedAlgorithm.set(null);
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const column = root.querySelector('.algorithm-workspace .algorithm-config-column');
    const catalog = root.querySelector('[data-guide="algorithm-selection"]');
    const params = root.querySelector('[data-guide="algorithm-settings"]');
    // Nothing selected: the column still offers guidance instead of a parameter form.
    expect(params?.querySelector('.algorithm-params__empty')).toBeTruthy();
    expect(root.querySelector('.algorithm-details')).toBeNull();
    expect(column?.contains(params ?? null)).toBeTrue();

    fixture.componentInstance.onAlgorithmClick(algorithm);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(params!.querySelector('.algorithm-params__empty')).toBeNull();
    expect(params!.querySelector('.config-form')).toBeTruthy();
    // Details head the column and the parameters follow them, both beside the catalog.
    const details = root.querySelector('.algorithm-details');
    expect(details).toBeTruthy();
    expect(column?.contains(details)).toBeTrue();
    expect(catalog?.contains(details ?? null)).toBeFalse();
    expect(
      !!(details!.compareDocumentPosition(params!) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBeTrue();
  });

  it('keeps matching methods visible on setup until a method is chosen', () => {
    experimentStudioService.selectedAlgorithm.set(null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.documentation-panel')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.algo-tile')).toBeTruthy();
  });

  it('defaults to runnable only and reveals unavailable methods on demand', () => {
    // The catalog ships in Runnable mode: the chip is pressed from the first render.
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.pill-toggle')?.getAttribute('aria-pressed')).toBe('true');

    const disabledAlgorithm = { ...algorithm, isDisabled: true, label: 'Locked Algorithm' };
    experimentStudioService.availableGroupedAlgorithms.set({ Test: [disabledAlgorithm] });
    fixture.componentInstance.showOnlyActive.set(false);
    fixture.detectChanges();
    fixture.detectChanges();

    // All mode lists unavailable methods with their reason; the group stays open
    // because it holds the selected method.
    expect(root.querySelector('.algo-tile')?.textContent).toContain('Locked Algorithm');

    const filter = root.querySelector('.pill-toggle') as HTMLButtonElement;
    // The single status chip reads All {runnable}/{total} until toggled back.
    expect(filter?.textContent).toContain('All');
    expect(filter?.textContent).toContain('0/1');
    expect(filter?.getAttribute('aria-pressed')).toBe('false');

    filter.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.showOnlyActive()).toBeTrue();
    expect(filter.getAttribute('aria-pressed')).toBe('true');
    expect(filter.textContent).toContain('Runnable');
    expect(root.querySelector('.algo-tile')).toBeNull();
    expect(root.textContent).toContain('No runnable methods for this assignment.');
  });

  it('filters the catalog instantly by search text', () => {
    const kruskal: AlgorithmConfig = { ...algorithm, name: 'kruskal', label: 'Kruskal-Wallis' };
    experimentStudioService.availableGroupedAlgorithms.set({ Test: [algorithm, kruskal] });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.algo-tile').length).toBe(2);

    fixture.componentInstance.algoSearchQuery.set('kruskal');
    fixture.detectChanges();
    const tiles = root.querySelectorAll('.algo-tile');
    expect(tiles.length).toBe(1);
    expect(tiles[0].textContent).toContain('Kruskal-Wallis');

    fixture.componentInstance.algoSearchQuery.set('no-such-method');
    fixture.detectChanges();
    expect(root.querySelector('.algo-tile')).toBeNull();
    expect(root.textContent).toContain('No methods match');
  });

  /**
   * Two Matching-method groups with no selection: the first holds runnable methods,
   * the second is unavailable, for the default-expansion specs.
   */
  function loadMethodGroups(): { groupComparison: AlgorithmConfig[]; association: AlgorithmConfig } {
    const anova: AlgorithmConfig = { ...algorithm, name: 'anova_oneway', label: 'One-way ANOVA' };
    const kruskal: AlgorithmConfig = { ...algorithm, name: 'kruskal', label: 'Kruskal-Wallis' };
    const association: AlgorithmConfig = {
      ...algorithm,
      name: 'correlation',
      label: 'Correlation',
      isDisabled: true,
    };

    experimentStudioService.selectedAlgorithm.set(null);
    experimentStudioService.availableGroupedAlgorithms.set({
      'Group comparison': [anova, kruskal],
      Association: [association],
    });
    // These specs study category expansion over the full catalog, so opt into All mode.
    fixture.componentInstance.showOnlyActive.set(false);
    fixture.detectChanges();

    return { groupComparison: [anova, kruskal], association };
  }

  function categoryHeader(row: Element): HTMLButtonElement {
    return row.querySelector('.algorithm-match-cat') as HTMLButtonElement;
  }

  it('opens only groups with runnable methods and keeps the rest collapsed', async () => {
    loadMethodGroups();
    await fixture.whenStable();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.algorithm-match-row');
    expect(rows.length).toBe(2);
    expect(categoryHeader(rows[0]).textContent).toContain('Group comparison');
    // Group comparison holds runnable methods: open by default.
    expect(categoryHeader(rows[0]).getAttribute('aria-expanded')).toBe('true');
    expect(rows[0].querySelector('.algo-tile')?.textContent).toContain('One-way ANOVA');
    // Association has nothing runnable: collapsed until clicked.
    expect(categoryHeader(rows[1]).getAttribute('aria-expanded')).toBe('false');
    expect(rows[1].querySelector('.algo-tile')).toBeNull();
  });

  it('expands and collapses matching method groups independently', async () => {
    loadMethodGroups();
    await fixture.whenStable();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.algorithm-match-row');

    categoryHeader(rows[1]).click();
    fixture.detectChanges();
    expect(rows[1].querySelector('.algo-tile')?.textContent).toContain('Correlation');
    expect(rows[0].querySelector('.algo-tile')).toBeTruthy();

    categoryHeader(rows[0]).click();
    fixture.detectChanges();
    expect(rows[0].querySelector('.algo-tile')).toBeNull();
    expect(rows[1].querySelector('.algo-tile')).toBeTruthy();
  });

  it('opens the group of the selected method without closing the others', async () => {
    const { groupComparison } = loadMethodGroups();
    await fixture.whenStable();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.algorithm-match-row');
    categoryHeader(rows[0]).click();
    fixture.detectChanges();
    expect(rows[0].querySelector('.algo-tile')).toBeNull();

    fixture.componentInstance.onAlgorithmClick(groupComparison[1]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(categoryHeader(rows[0]).getAttribute('aria-expanded')).toBe('true');
    expect(rows[0].querySelector('.algo-tile')?.textContent).toContain('One-way ANOVA');
    expect(rows[1].querySelector('.algo-tile')).toBeNull();
  });

  it('wires the role assignment component into the algorithm workspace', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-algorithm-role-assignment')).toBeTruthy();
  });

  it('exposes y/x role selections to the availability and config helpers', () => {
    experimentStudioService.algorithmY.set([{ code: 'age', label: 'Age' }]);
    experimentStudioService.algorithmX.set([{ code: 'sex', label: 'Sex' }]);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.yVar()).toBe('age');
    expect(component.xVar()).toBe('sex');
  });

  it('keeps parameters off Setup until a method is chosen', () => {
    experimentStudioService.selectedAlgorithm.set(null);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.config-form')).toBeNull();
    expect(root.querySelector('.algorithm-readonly-fieldset')).toBeNull();
    expect(root.querySelector('.documentation-panel')).toBeNull();

    fixture.componentInstance.onAlgorithmClick(algorithm);
    fixture.detectChanges();

    expect(root.querySelector('.documentation-panel')).toBeTruthy();
  });

  it('keeps documentation in the details band and parameters under it', () => {
    const component = fixture.componentInstance;
    component.setStudioSubstep('parameters');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const params = root.querySelector('.algorithm-params');
    expect(params?.querySelector('.config-form')).toBeTruthy();
    expect(params?.querySelector('.documentation-panel')).toBeNull();
    const details = root.querySelector('.algorithm-details');
    expect(details?.querySelector('.documentation-panel')).toBeTruthy();
    expect(details?.querySelector('.config-form')).toBeNull();
    expect(root.querySelector('[data-guide="run-experiment"]')).toBeNull();
    expect(component.canRun()).toBeTrue();
  });

  it('shows parameters on Parameter selection', () => {
    const component = fixture.componentInstance;
    component.setStudioSubstep('parameters');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.config-form')).toBeTruthy();
    expect(root.querySelector('[data-guide="algorithm-settings"]')).toBeTruthy();
    const labels = Array.from(root.querySelectorAll('.config-field > label')).map(
      (label) => label.textContent?.trim(),
    );
    expect(labels).toEqual(jasmine.arrayContaining(['First', 'Second', 'Third', 'Fourth']));
    expect(component.configForm().get('first')?.value).toBe(1);
  });

  it('refuses to save an experiment without a name', () => {
    const component = fixture.componentInstance;

    component.onSaveAs('   ');

    expect(component.errorMsg()).toContain('name');
    expect(experimentStudioService.runSelectedAlgorithm).not.toHaveBeenCalled();
    expect(experimentStudioService.setRunning).not.toHaveBeenCalled();
  });
});
