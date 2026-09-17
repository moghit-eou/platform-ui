import { provideZonelessChangeDetection, signal, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ErrorService } from '../../../services/error.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { VariablesPanelComponent } from './variables-panel.component';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
describe('VariablesPanelComponent bubble selection', () => {
  let experimentStudioService: {
    selectedDataModel: ReturnType<typeof signal<any>>;
    selectedVariables: ReturnType<typeof signal<any[]>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    availableGroupedAlgorithms: ReturnType<typeof signal<any[]>>;
    getAllDataModels: jasmine.Spy;
    categorizeDataModels: jasmine.Spy;
    getAlgorithmResults: jasmine.Spy;
    setVariables: jasmine.Spy;
    setSelectedDatasets: jasmine.Spy;
    addVariableAndEnrich: jasmine.Spy;
    clearSelectionsForDataModelChange: jasmine.Spy;
    editingExistingExperiment: () => boolean;
  };

  beforeEach(() => {
    experimentStudioService = {
      selectedDataModel: signal<any>(null),
      selectedVariables: signal<any[]>([]),
      selectedDatasets: signal<string[]>(['dataset-a']),
      availableGroupedAlgorithms: signal<any[]>([]),
      getAllDataModels: jasmine.createSpy('getAllDataModels').and.returnValue(of([])),
      categorizeDataModels: jasmine.createSpy('categorizeDataModels').and.returnValue({
        crossSectional: [],
        longitudinal: [],
      }),
      getAlgorithmResults: jasmine.createSpy('getAlgorithmResults').and.returnValue(of({ result: { histogram: [] } })),
      setVariables: jasmine.createSpy('setVariables'),
      setSelectedDatasets: jasmine.createSpy('setSelectedDatasets'),
      addVariableAndEnrich: jasmine.createSpy('addVariableAndEnrich'),
      clearSelectionsForDataModelChange: jasmine.createSpy('clearSelectionsForDataModelChange'),
      editingExistingExperiment: () => false,
    };

    TestBed.configureTestingModule({
      imports: [VariablesPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: experimentStudioService },
        {
          provide: ExperimentStudioGuideStateService,
          useValue: {
            activeStepId: signal<string | null>(null),
            setSelectedHierarchyNode: jasmine.createSpy('setSelectedHierarchyNode'),
          },
        },
        { provide: ErrorService, useValue: {} },
        { provide: PdfExportService, useValue: { exportHistogramPdf: jasmine.createSpy('exportHistogramPdf') } },
        { provide: CsvExportService, useValue: { exportHistogramCsv: jasmine.createSpy('exportHistogramCsv') } },
      ],
    });

    TestBed.overrideComponent(VariablesPanelComponent, {
      set: { template: '' },
    });
    localStorage.removeItem('metadata_browser_mode');
  });

  it('does not auto-add a variable on single bubble click', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };

    const selectSpy = spyOn(component, 'onSelectedNodeChange');
    const addSpy = spyOn(component, 'addVariableFromBubble');

    component.onBubbleNodeSelected(node);

    expect(selectSpy).toHaveBeenCalledWith(node);
    expect(addSpy).not.toHaveBeenCalled();
    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
  });

  it('keeps double click as the explicit add action', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };

    const selectSpy = spyOn(component, 'onSelectedNodeChange');
    const addSpy = spyOn(component, 'addVariableFromBubble');

    component.onNodeDoubleClicked(node);

    expect(selectSpy).toHaveBeenCalledWith(node);
    expect(addSpy).toHaveBeenCalled();
  });

  it('adds the selected node when it is not in the pool', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedNode = { code: 'age_value', label: 'Age', type: 'real' };

    component.toggleSelectedNodeInPool();

    expect(experimentStudioService.addVariableAndEnrich).toHaveBeenCalledWith({
      code: 'age_value',
      label: 'Age',
      type: 'real',
    });
    expect(experimentStudioService.setVariables).not.toHaveBeenCalled();
  });

  it('removes the selected node when it is already in the pool', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'age_value', label: 'Age', type: 'real' },
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedNode = { code: 'age_value', label: 'Age', type: 'real' };

    component.toggleSelectedNodeInPool();

    expect(experimentStudioService.setVariables).toHaveBeenCalledWith([
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
  });

  it('ignores the pool toggle when no datasets are selected', () => {
    experimentStudioService.selectedDatasets.set([]);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedNode = { code: 'age_value', label: 'Age', type: 'real' };

    component.toggleSelectedNodeInPool();

    expect(experimentStudioService.addVariableAndEnrich).not.toHaveBeenCalled();
    expect(experimentStudioService.setVariables).not.toHaveBeenCalled();
  });

  it('auto-selects all available datasets on a fresh session with no valid selection', () => {
    experimentStudioService.selectedDatasets.set([]);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.availableDatasets = [
      { code: 'ds-a', label: 'Dataset A' },
      { code: 'ds-b', label: 'Dataset B' },
    ];

    component.ensureDatasetsSelected();

    expect(experimentStudioService.setSelectedDatasets).toHaveBeenCalledWith(['ds-a', 'ds-b']);
  });

  it('keeps a valid existing selection instead of re-selecting all', () => {
    experimentStudioService.selectedDatasets.set(['ds-b']);
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.availableDatasets = [
      { code: 'ds-a', label: 'Dataset A' },
      { code: 'ds-b', label: 'Dataset B' },
    ];

    component.ensureDatasetsSelected();

    expect(experimentStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('does not auto-select datasets when editing an existing experiment', () => {
    experimentStudioService.selectedDatasets.set([]);
    experimentStudioService.editingExistingExperiment = () => true;
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.availableDatasets = [{ code: 'ds-a', label: 'Dataset A' }];

    component.ensureDatasetsSelected();

    expect(experimentStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('reports a dataset count in the context chip title', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedDataModel.set({ code: 'stroke', label: 'Stroke 3.7' } as any);
    experimentStudioService.selectedDatasets.set(['ds-a', 'ds-b']);

    expect(component.contextChipTitle).toBe('Stroke 3.7 · 2 datasets');
  });

  it('points to the dataset gate in the context chip title when none are selected', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.selectedDataModel.set({ code: 'stroke', label: 'Stroke 3.7' } as any);
    experimentStudioService.selectedDatasets.set([]);

    expect(component.contextChipTitle).toBe('Stroke 3.7 · Select datasets');
  });

  it('toggles the context popover open and closed', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.contextOpen()).toBe(false);

    component.toggleContext();
    expect(component.contextOpen()).toBe(true);

    component.toggleContext();
    expect(component.contextOpen()).toBe(false);
  });

  it('reports the selected dataset count from the studio service', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.selectedDatasetCount()).toBe(1);

    experimentStudioService.selectedDatasets.set(['dataset-a', 'dataset-b']);
    expect(component.selectedDatasetCount()).toBe(2);
  });

  it('closes the context sheet on a click inside the host but outside the context section', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleContext();
    expect(component.contextOpen()).toBe(true);

    const contextSection = document.createElement('div');
    const sibling = document.createElement('div');
    document.body.appendChild(contextSection);
    document.body.appendChild(sibling);
    try {
      component.contextSection = { nativeElement: contextSection } as unknown as ElementRef;
      component.onDocumentClickForContext({ target: sibling } as unknown as MouseEvent);
      expect(component.contextOpen()).toBe(false);
    } finally {
      contextSection.remove();
      sibling.remove();
    }
  });

  it('keeps the context sheet open on a click inside the context section', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleContext();

    const contextSection = document.createElement('div');
    const inner = document.createElement('span');
    contextSection.appendChild(inner);
    document.body.appendChild(contextSection);
    try {
      component.contextSection = { nativeElement: contextSection } as unknown as ElementRef;
      component.onDocumentClickForContext({ target: inner } as unknown as MouseEvent);
      expect(component.contextOpen()).toBe(true);
    } finally {
      contextSection.remove();
    }
  });

  it('closes the context popover on Escape', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleContext();

    component.onDocumentKeydownForContext(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.contextOpen()).toBe(false);
  });

  it('toggles the search popover', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.searchExpanded()).toBe(false);

    component.toggleSearch();
    expect(component.searchExpanded()).toBe(true);

    component.toggleSearch();
    expect(component.searchExpanded()).toBe(false);
  });

  it('collapses the search bar on an outside document click', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleSearch();
    expect(component.searchExpanded()).toBe(true);

    const searchEl = document.createElement('div');
    document.body.appendChild(searchEl);
    const outside = document.createElement('span');
    document.body.appendChild(outside);
    try {
      component.searchSection = { nativeElement: searchEl } as unknown as ElementRef;
      component.onDocumentClickForContext({ target: outside } as unknown as MouseEvent);
      expect(component.searchExpanded()).toBe(false);
    } finally {
      searchEl.remove();
      outside.remove();
    }
  });

  it('keeps the search bar open on an inside click', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleSearch();

    const searchEl = document.createElement('div');
    const inner = document.createElement('input');
    searchEl.appendChild(inner);
    document.body.appendChild(searchEl);
    try {
      component.searchSection = { nativeElement: searchEl } as unknown as ElementRef;
      component.onDocumentClickForContext({ target: inner } as unknown as MouseEvent);
      expect(component.searchExpanded()).toBe(true);
    } finally {
      searchEl.remove();
    }
  });

  it('collapses the search bar on Escape', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleSearch();

    component.onDocumentKeydownForContext(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.searchExpanded()).toBe(false);
  });

  it('toggles the histogram export menu open and closed', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.exportMenuOpen()).toBe(false);

    component.toggleExportMenu();
    expect(component.exportMenuOpen()).toBe(true);

    component.toggleExportMenu();
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('closes the export menu when a format is chosen', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleExportMenu();

    component.exportHistogramCsv();
    expect(component.exportMenuOpen()).toBe(false);

    component.toggleExportMenu();
    component.exportHistogramPdf();
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('closes the export menu on an outside document click', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleExportMenu();

    const group = document.createElement('div');
    group.className = 'histogram-export-group';
    document.body.appendChild(group);
    const outside = document.createElement('span');
    document.body.appendChild(outside);
    try {
      component.onDocumentClickForContext({ target: outside } as unknown as MouseEvent);
      expect(component.exportMenuOpen()).toBe(false);
    } finally {
      group.remove();
      outside.remove();
    }
  });

  it('keeps the export menu open on a click inside the export group', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleExportMenu();

    const group = document.createElement('div');
    group.className = 'histogram-export-group';
    const item = document.createElement('button');
    group.appendChild(item);
    document.body.appendChild(group);
    try {
      component.onDocumentClickForContext({ target: item } as unknown as MouseEvent);
      expect(component.exportMenuOpen()).toBe(true);
    } finally {
      group.remove();
    }
  });

  it('closes the export menu on Escape', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.toggleExportMenu();

    component.onDocumentKeydownForContext(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.exportMenuOpen()).toBe(false);
  });

  it('defaults the metadata browser mode to bubble map', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.metadataBrowserMode()).toBe('bubble');
  });

  it('persists metadata browser mode changes', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    component.setMetadataBrowserMode('collapsible');

    expect(component.metadataBrowserMode()).toBe('collapsible');
    expect(component.metadataBrowserModeIndex()).toBe(2);
    expect(localStorage.getItem('metadata_browser_mode')).toBe('collapsible');
  });

  it('falls back to the bubble map for an invalid saved metadata browser mode', () => {
    localStorage.setItem('metadata_browser_mode', 'columns');

    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.metadataBrowserMode()).toBe('bubble');
  });

  it('includes collapsible tree as an alternative metadata browser mode', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    expect(component.metadataBrowserModes.map((mode) => mode.value)).toEqual(['bubble', 'ontology', 'collapsible']);
  });

  it('resets selected-node details to the histogram tab on variable selection', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const node = { code: 'age_value', label: 'Age', type: 'real' };

    component.setActiveDetailsTab('info');
    component.onSelectedNodeChange(node);

    expect(component.activeDetailsTab()).toBe('histogram');
  });

  it('defaults a group selection to the Chart tab', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const group = {
      code: 'acute_treatment',
      label: 'Acute treatment',
      children: [{ code: 'age_value', label: 'Age', type: 'real' }],
    };

    component.setActiveDetailsTab('info');
    component.onSelectedNodeChange(group);

    expect(component.activeDetailsTab()).toBe('histogram');
  });

  it('switches grouped histogram variants without changing metadata state', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const data = { bins: ['A'], counts: [1], variableName: 'Age' };

    component.histogramVariants.set([
      { key: 'overall', label: 'Overall', data },
      { key: 'group:female', label: 'Sex: Female', data: { ...data, variableName: 'Female age' } },
    ]);
    component.setActiveDetailsTab('info');

    component.onHistogramVariantChange({ target: { value: 'group:female' } } as unknown as Event);

    expect(component.histogramData()?.variableName).toBe('Female age');
    expect(component.activeDetailsTab()).toBe('info');
  });

  it('collapses consecutive duplicate breadcrumb labels', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    component.d3Data = {
      code: 'stroke',
      label: 'Stroke 3.7',
      children: [
        { code: 'inr', label: 'INR', type: 'real' },
      ],
    };

    const path = component.getPathNodes({ code: 'stroke', label: 'Stroke 3.7' });
    expect(path.map((node) => node.label)).toEqual(['Stroke 3.7']);
  });

  it('builds a group census chart for the pathology root', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const root = {
      code: 'stroke',
      label: 'Stroke 3.7',
      children: [
        { code: 'g1', label: 'Acute treatment', children: [{ code: 'a', label: 'A', value: 1 }] },
        { code: 'g2', label: 'Hospitalization', children: [{ code: 'b', label: 'B', value: 1 }, { code: 'c', label: 'C', value: 1 }] },
      ],
    };
    component.d3Data = root;
    component.onSelectedNodeChange(root);

    expect(component.groupHistogramData()).toEqual({
      bins: ['Hospitalization', 'Acute treatment'],
      counts: [2, 1],
      variableName: 'Stroke 3.7',
    });
    expect(component.groupHistogramMeta()?.groupCount).toBe(2);
    expect(component.detailsPanelSubtitle()).toBe('2 groups in this view');
  });

  it('prompts to pick a variable when a group holds only variables', () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;
    const group = {
      code: 'g1',
      label: 'Acute treatment',
      children: [
        { code: 'a', label: 'A', type: 'real' },
        { code: 'b', label: 'B', type: 'real' },
      ],
    };
    component.d3Data = { code: 'stroke', label: 'Stroke 3.7', children: [group] };

    component.onSelectedNodeChange(group);

    expect(component.groupHistogramData()).toBeNull();
    expect(component.emptyChartMessage()).toBe(
      'Please select one of the variables in the representation on the left to see its histogram in the selected centers.',
    );
    expect(component.errorMessage()).toBeNull();
    expect(component.isLoadingHistogram()).toBe(false);
    expect(component.detailsPanelSubtitle()).toBe('2 variables in this group');
    expect(component.isExportDisabled()).toBe(true);
  });

  function flushLeafHistogram(component: VariablesPanelComponent): Promise<void> {
    component.d3Data = { code: 'stroke', label: 'Stroke 3.7' };
    component.onSelectedNodeChange({ code: 'age_value', label: 'Age', type: 'real' });
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('shows a neutral empty message when a leaf has no distribution data', async () => {
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    await flushLeafHistogram(component);

    expect(component.emptyChartMessage()).toBe('No distribution for this selection.');
    expect(component.errorMessage()).toBeNull();
    expect(component.isLoadingHistogram()).toBe(false);
  });

  it('shows the backend insufficient-data message neutrally instead of as an error', async () => {
    experimentStudioService.getAlgorithmResults
      .and.returnValue(of({ result: { data: 'insufficient data' } }));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    await flushLeafHistogram(component);

    expect(component.emptyChartMessage()).toBe('This variable does not have sufficient data.');
    expect(component.errorMessage()).toBeNull();
  });

  it('keeps a red error message when the histogram request fails', async () => {
    experimentStudioService.getAlgorithmResults
      .and.returnValue(throwError(() => new Error('network')));
    const fixture = TestBed.createComponent(VariablesPanelComponent);
    const component = fixture.componentInstance;

    await flushLeafHistogram(component);

    expect(component.errorMessage()).toBe('Error loading histogram. Please try again.');
    expect(component.emptyChartMessage()).toBeNull();
  });
});
