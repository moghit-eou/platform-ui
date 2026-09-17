import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QueryList } from '@angular/core';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { PdfExportService } from '../../../services/pdf-export.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { of, Subject } from 'rxjs';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';

describe('StatisticAnalysisPanelComponent', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: jasmine.SpyObj<ExperimentStudioService>;
    let mockChartBuilder: jasmine.SpyObj<ChartBuilderService>;
    let mockPdfService: jasmine.SpyObj<PdfExportService>;

    beforeEach(async () => {
        mockExpService = jasmine.createSpyObj('ExperimentStudioService', [
            'loadDescriptiveOverview',
            'loadOutlierReportPreview',
            'getAlgorithmResults',
            'getDatasetLabelMap',
            'setDataExclusionWarnings',
            'clearDataExclusionWarnings',
            'setAppliedDescriptivePreprocessing',
            'getAppliedDescriptivePreprocessing',
            'setFilters',
            'setFilterLogic',
            'setTransformationPreprocessing',
            'filterVariableCodes',
            'appliedCategoricalCreators',
        ], {
            selectedVariables: signal([]),
            selectedFilters: signal([]),
            selectedDatasets: signal(['dataset-a']),
            excludedDatasets: signal([]),
            selectedDataModel: signal({ code: 'Stroke', version: '3.7' }),
            filterLogic: signal(null),
            editingExistingExperiment: () => false,
            appliedPreprocessingConfig: signal(null),
            backendAlgorithms: signal({})
        });
        mockChartBuilder = jasmine.createSpyObj('ChartBuilderService', ['getChartsForAlgorithm']);
        mockChartBuilder.getChartsForAlgorithm.and.returnValue([]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));
        mockExpService.loadOutlierReportPreview.and.returnValue(of({ result: { featurewise: [] } }));
        mockExpService.getAlgorithmResults.and.returnValue(of({ result: { histogram: [] } }));
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(null);
        mockExpService.getDatasetLabelMap.and.returnValue({ 'dataset-a': 'Dataset A' });
        mockExpService.appliedCategoricalCreators.and.callFake(() => {
            const value = (mockExpService.appliedPreprocessingConfig() as any)?.['categorical_column_creator'];
            return Array.isArray(value) ? value : [];
        });
        // Mirrors the real collector: a group walks its rules, a condition is its field.
        mockExpService.filterVariableCodes.and.callFake((logic: any) => {
            const codes = new Set<string>();
            const walk = (node: any) => {
                if (!node) return;
                if (Array.isArray(node.rules)) {
                    node.rules.forEach(walk);
                } else if (node.field || node.id) {
                    codes.add(String(node.field ?? node.id));
                }
            };
            walk(logic);
            return [...codes];
        });
        mockPdfService = jasmine.createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']);

        await TestBed.configureTestingModule({
            imports: [StatisticAnalysisPanelComponent], // Standalone component
            providers: [
                provideZonelessChangeDetection(),
                provideEchartsCore({
                    echarts: () => import('echarts'),
                }),
                { provide: ExperimentStudioService, useValue: mockExpService },
                { provide: ChartBuilderService, useValue: mockChartBuilder },
                { provide: PdfExportService, useValue: mockPdfService }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(StatisticAnalysisPanelComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    function configureRawSummary(chartOptions: any[] = []) {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        mockChartBuilder.getChartsForAlgorithm.and.returnValue(chartOptions);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                    { dataset: 'dataset-a', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                    { dataset: 'all datasets', variable: 'sex', data: { counts: { female: 6, male: 4 }, num_dtps: 10, num_na: 1, num_total: 11 } },
                ],
            },
        }));
        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();
        return { age, sex };
    }

    /** A minimal valid category rule payload, as QueryBuilder would export it. */
    function categoryFilter(field = 'age', operator = 'greater', value = 65) {
        return {
            condition: 'AND' as const,
            rules: [{
                id: `${field}-${operator}`,
                field,
                type: 'integer' as const,
                input: 'number' as const,
                operator,
                value,
            }],
        };
    }

    function workflowSection(title: string): HTMLElement {
        const guideMap: Record<string, string> = {
            'Raw Data Summary': 'analysis-raw-summary',
            'Processed Data Summary': 'analysis-processed-summary',
            Filtering: 'analysis-filtering',
            Preprocessing: 'analysis-preprocessing',
            Transformation: 'analysis-transformation',
        };
        // Stations render as .pipeline-node, the two summaries as .workflow-section.
        const sections = () =>
            Array.from(fixture.nativeElement.querySelectorAll('.workflow-section, .pipeline-node')) as HTMLElement[];
        const guide = guideMap[title];
        if (guide) {
            return sections().find((section) => section.getAttribute('data-guide') === guide) as HTMLElement;
        }
        return sections().find((section) => section.textContent?.includes(title)) as HTMLElement;
    }

    /**
     * Pipeline nodes render dormant until they hold work or were opened this visit,
     * so a spec that reads a station's editor has to open it first. Opening is a read.
     */
    function openStation(step: 'filters' | 'setup' | 'transformation'): HTMLElement {
        component.addStep(step);
        fixture.detectChanges();
        return workflowSection({ filters: 'Filtering', setup: 'Preprocessing', transformation: 'Transformation' }[step]);
    }

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('toggles Filtering exclusive of Raw Summary via Preview data', () => {
        configureRawSummary();
        component.goToSection('filters');
        fixture.detectChanges();

        const filtering = workflowSection('Filtering');
        expect(component.sectionOpen().filters).toBeTrue();
        expect(component.sectionOpen().raw).toBeFalse();

        const preview = filtering.querySelector('.station-action-preview') as HTMLButtonElement;
        expect(preview.textContent?.trim()).toBe('Preview data');
        preview.click();
        fixture.detectChanges();

        expect(component.sectionOpen().filters).toBeFalse();
        expect(component.sectionOpen().raw).toBeTrue();
        expect(component.sectionOpen().setup).toBeFalse();

        const raw = workflowSection('Raw Data Summary');
        const tabLabels = Array.from(raw.querySelectorAll('.summary-tabs button')).map((button) => button.textContent?.trim());
        expect(tabLabels).toEqual(['Table', 'Charts', 'Histogram']);
        expect(raw.querySelector('.station-preview-toggle')?.textContent?.trim()).toBe('Close');

        const close = workflowSection('Raw Data Summary').querySelector('.station-preview-toggle') as HTMLButtonElement;
        expect(close.textContent?.trim()).toBe('Close');
        close.click();
        fixture.detectChanges();

        expect(component.sectionOpen().filters).toBeTrue();
        expect(component.sectionOpen().raw).toBeFalse();
    });

    /**
     * The station footer's primary slot only ever says Apply when there is something to
     * commit; with an empty station it reads Close and folds the station away instead.
     */
    it('labels the filtering primary action Close while there is nothing to commit', () => {
        configureRawSummary();
        const filtering = openStation('filters');

        const apply = filtering.querySelector('.station-action-apply') as HTMLButtonElement;
        expect(apply.textContent?.trim()).toBe('Close');
        expect(apply.disabled).toBeFalse();
        expect(apply.classList.contains('is-quiet')).toBeTrue();

        apply.click();
        fixture.detectChanges();

        // An optional station with no conditions has nothing to keep: it returns to its card.
        expect(component.isStepAdded('filters')).toBeFalse();
        expect(component.sectionOpen().filters).toBeFalse();
        expect(workflowSection('Filtering').textContent).toContain('Add Filtering');
    });

    it('labels the filtering primary action Apply once conditions exist', () => {
        configureRawSummary();
        (mockExpService.filterLogic as any).set(categoryFilter());
        const filtering = openStation('filters');
        fixture.detectChanges();

        const apply = filtering.querySelector('.station-action-apply') as HTMLButtonElement;
        expect(apply.textContent?.trim()).toBe('Apply');
        expect(apply.classList.contains('is-quiet')).toBeFalse();

        apply.click();
        fixture.detectChanges();

        expect(mockExpService.setFilterLogic).toHaveBeenCalled();
        expect(component.sectionOpen().filters).toBeFalse();
        expect(component.sectionOpen().raw).toBeFalse();
        expect(component.sectionOpen().setup).toBeFalse();
        expect(component.sectionOpen().transformation).toBeFalse();
        expect(component.isStepAdded('filters')).toBeTrue();
    });

    it('closes the preprocessing editor from Close without writing anything', () => {
        configureRawSummary();
        const preprocessing = openStation('setup');

        const apply = preprocessing.querySelector('.station-action-apply') as HTMLButtonElement;
        expect(component.pendingChangeCount).toBe(0);
        expect(apply.textContent?.trim()).toBe('Close');
        expect(apply.disabled).toBeFalse();

        const persistCalls = mockExpService.setAppliedDescriptivePreprocessing.calls.count();
        apply.click();
        fixture.detectChanges();

        expect(component.sectionOpen().setup).toBeFalse();
        expect(component.sectionOpen().processed).toBeFalse();
        expect(mockExpService.setAppliedDescriptivePreprocessing.calls.count()).toBe(persistCalls);
        // Nothing was reverted: the collapsed rail of applied steps is the way back in.
        expect(preprocessing.querySelector('.pipeline-subnode-item')).toBeTruthy();
    });

    it('closes the preprocessing Batch menu when the click is outside it', () => {
        configureRawSummary();
        const preprocessing = openStation('setup');
        const trigger = preprocessing.querySelector('.batch-menu-trigger') as HTMLButtonElement;
        trigger.click();
        fixture.detectChanges();
        expect(preprocessing.querySelector('.batch-menu-list')).toBeTruthy();

        fixture.nativeElement.click();
        fixture.detectChanges();
        expect(preprocessing.querySelector('.batch-menu-list')).toBeNull();
        expect(component.batchMenuOpen()).toBeNull();
    });

    it('places Preview data above the Preprocessing cards, exclusive of processed summary', () => {
        configureRawSummary();
        component.goToSection('setup');
        fixture.detectChanges();

        const preprocessing = workflowSection('Preprocessing');
        const preview = preprocessing.querySelector('.station-action-preview') as HTMLButtonElement;
        expect(preview.textContent?.trim()).toBe('Preview data');
        expect(preprocessing.querySelector('.station-card-description')?.textContent?.trim()).toContain('Default: NA removal');
        // The shared action bar owns the station's only preview control.
        expect(preprocessing.querySelectorAll('.station-action-bar .station-action-preview').length).toBe(1);

        preview.click();
        fixture.detectChanges();

        expect(component.sectionOpen().setup).toBeFalse();
        expect(component.sectionOpen().processed).toBeTrue();

        const processed = workflowSection('Processed Data Summary');
        const tabLabels = Array.from(processed.querySelectorAll('.summary-tabs button')).map((button) => button.textContent?.trim());
        expect(tabLabels).not.toContain('Statistics');
        expect(processed.querySelector('.station-preview-toggle')?.textContent?.trim()).toBe('Close');
    });

    /**
     * "Preview data" runs a transient describe of the pending preprocessing config
     * (finding F1 / Phase 3 of data-handling-flow-plan.md): the processed workspace
     * fills without Apply, and nothing is persisted.
     */
    it('opens processed tables from Preview data without clicking Apply', () => {
        spyOn(Element.prototype, 'scrollIntoView');
        spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
            void Promise.resolve().then(() => callback(0));
            return 0;
        });
        configureRawSummary();
        component.goToSection('setup');
        fixture.detectChanges();

        const preprocessing = workflowSection('Preprocessing');
        const apply = preprocessing.querySelector('.station-action-apply') as HTMLButtonElement;
        // Nothing pending: the slot reads Close (enabled) rather than a disabled Apply.
        expect(apply.disabled).toBeFalse();
        expect(preprocessing.textContent).not.toContain('No preprocessing has been applied yet');

        const persistCalls = mockExpService.setAppliedDescriptivePreprocessing.calls.count();
        const preview = preprocessing.querySelector('.station-action-preview') as HTMLButtonElement;
        preview.click();
        fixture.detectChanges();

        expect(component.sectionOpen().processed).toBeTrue();
        expect(component.sectionOpen().setup).toBeFalse();
        expect(component.processedSummary.isLoading).toBeFalse();
        expect(component.selectedStatisticBlock('processed')?.name).toBe('Age');
        // Transient: previewing wrote nothing into the applied request.
        expect(mockExpService.setAppliedDescriptivePreprocessing.calls.count()).toBe(persistCalls);

        const processed = workflowSection('Processed Data Summary');
        expect(processed.textContent).not.toContain('No preprocessing has been applied yet');
        expect(processed.querySelector('[aria-label="Processed data summary variables"]')).toBeTruthy();
    });

    /**
     * The preview has to survive the fold. The processed summary used to live *inside* the
     * station editor's `.workflow-section-body`, which is `display: none` the moment
     * "Preview data" closes the editor, so the click looked like it only collapsed the card.
     * Both stations must therefore mount the summary as a sibling of the editor body.
     */
    it('renders both previews outside the folded station editor', () => {
        configureRawSummary();

        component.goToSection('filters');
        fixture.detectChanges();
        (workflowSection('Filtering').querySelector('.station-action-preview') as HTMLButtonElement).click();
        fixture.detectChanges();

        const raw = workflowSection('Raw Data Summary');
        expect(raw.closest('.workflow-section-body')).toBeNull();
        expect(getComputedStyle(raw.querySelector('.workflow-section-body') as HTMLElement).display).not.toBe('none');

        component.goToSection('setup');
        fixture.detectChanges();
        (workflowSection('Preprocessing').querySelector('.station-action-preview') as HTMLButtonElement).click();
        fixture.detectChanges();

        const processed = workflowSection('Processed Data Summary');
        const editorBody = workflowSection('Preprocessing')
            .querySelector('.pipeline-node-body > .workflow-section-body') as HTMLElement;
        expect(component.sectionOpen().setup).toBeFalse();
        expect(editorBody).toBeTruthy();
        expect(editorBody.contains(processed)).toBeFalse();
        expect(processed.closest('.workflow-section-body')).toBeNull();
        expect(getComputedStyle(processed.querySelector('.workflow-section-body') as HTMLElement).display).not.toBe('none');
    });

    /**
     * Close on a data preview reopens the station editor without writing the request.
     */
    it('closes the processed preview back to the preprocessing editor without writing', () => {
        configureRawSummary();
        component.goToSection('setup');
        fixture.detectChanges();

        const preprocessing = workflowSection('Preprocessing');
        (preprocessing.querySelector('.station-action-preview') as HTMLButtonElement).click();
        fixture.detectChanges();

        const processed = workflowSection('Processed Data Summary');
        const close = processed.querySelector('.station-preview-close') as HTMLButtonElement;
        expect(close.textContent?.trim()).toBe('Close');
        expect(processed.querySelectorAll('.station-preview-toggle').length).toBe(1);

        const persistCalls = mockExpService.setAppliedDescriptivePreprocessing.calls.count();
        close.click();
        fixture.detectChanges();

        expect(component.sectionOpen().processed).toBeFalse();
        expect(component.sectionOpen().setup).toBeTrue();
        expect(mockExpService.setAppliedDescriptivePreprocessing.calls.count()).toBe(persistCalls);
    });

    it('closes the raw preview back to the Filtering editor without writing', () => {
        configureRawSummary();
        component.goToSection('filters');
        fixture.detectChanges();

        (workflowSection('Filtering').querySelector('.station-action-preview') as HTMLButtonElement).click();
        fixture.detectChanges();

        const raw = workflowSection('Raw Data Summary');
        const close = raw.querySelector('.station-preview-close') as HTMLButtonElement;
        expect(close.textContent?.trim()).toBe('Close');
        expect(raw.querySelectorAll('.station-preview-toggle').length).toBe(1);

        const persistCalls = mockExpService.setAppliedDescriptivePreprocessing.calls.count();
        close.click();
        fixture.detectChanges();

        expect(component.sectionOpen().raw).toBeFalse();
        expect(component.sectionOpen().filters).toBeTrue();
        expect(mockExpService.setAppliedDescriptivePreprocessing.calls.count()).toBe(persistCalls);
    });

    it('replaces Transformation Statistics tab with Preview data', () => {
        configureRawSummary();
        component.goToSection('transformation');
        fixture.detectChanges();

        const transformation = workflowSection('Transformation');
        expect(transformation.querySelector('.transformation-tabs')).toBeNull();
        const preview = transformation.querySelector('.station-action-preview') as HTMLButtonElement;
        expect(preview.textContent?.trim()).toBe('Preview data');

        preview.click();
        fixture.detectChanges();

        expect(component.transformationActiveTab).toBe('Statistics');
        const close = transformation.querySelector('.station-preview-toggle') as HTMLButtonElement;
        expect(close.textContent?.trim()).toBe('Close');
        expect(transformation.querySelector('.transformation-create')).toBeNull();
        expect(transformation.querySelector('.transformation-statistics')).toBeTruthy();
    });

    it('renders preprocessing step documentation from backend algorithm metadata', () => {
        (mockExpService.backendAlgorithms as any).set({
            linear_regression: {
                preprocessing: [
                    { name: 'missing_values_handler', documentation: 'Missing docs.\nSecond line.' },
                    { name: 'outlier_winsorizer', documentation: 'Outlier docs.' },
                ],
            },
        });

        openStation('setup');
        component.enableOutlierHandling();
        fixture.detectChanges();

        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Documentation');
        expect(text).toContain('Missing docs.');
        expect(text).toContain('Second line.');
        expect(text).toContain('Outlier docs.');
    });

    it('does not fetch descriptive stats until a model and dataset are ready', () => {
        (mockExpService.selectedDataModel as any).set(null);
        (mockExpService.selectedDatasets as any).set([]);
        (mockExpService.selectedVariables as any).set([{ code: 'age', label: 'Age', type: 'real' }]);

        fixture.detectChanges();

        expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();
        expect(component.isLoading).toBeFalse();
    });

    it('should treat variable as nominal if counts are present in response, even if metadata type is missing', () => {
        // 1. Setup metadata (variable without nominal type)
        const variable = { code: 'biol_sex', label: 'Biological Sex', type: 'unknown' };
        (mockExpService.selectedVariables as any).set([variable]);

        // 2. Setup response with counts
        const response = {
            result: {
                featurewise: [
                    {
                        variable: 'biol_sex',
                        data: {
                            counts: { 'Female': 10, 'Male': 15 }, // Presence of counts
                            num_dtps: 25,
                            num_na: 0,
                            num_total: 25
                        }
                    }
                ],
            }
        };
        mockExpService.loadDescriptiveOverview.and.returnValue(of(response));

        // 3. Trigger fetch
        component.fetchDescriptiveStatistics();

        // 4. Verify categorization
        // Should be in nominalVariables
        expect(component.rawSummary.nominalVariables.find(v => v.code === 'biol_sex')).toBeTruthy();
        // Should NOT be in nonNominalVariables
        expect(component.rawSummary.nonNominalVariables.find(v => v.code === 'biol_sex')).toBeFalsy();
        // Charts should be built for nominal
        expect(component.rawSummary.chartsForNominal.length).toBe(1);
    });

    it('should treat variable as nominal if metadata type is nominal', () => {
        const variable = { code: 'var_nom', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([variable]);

        const response = { result: { featurewise: [] } }; // Empty data
        mockExpService.loadDescriptiveOverview.and.returnValue(of(response));

        component.fetchDescriptiveStatistics();

        expect(component.rawSummary.nominalVariables.find(v => v.code === 'var_nom')).toBeTruthy();
    });

    it('should treat variable as numeric if no counts and not nominal type', () => {
        const variable = { code: 'age', type: 'real' };
        (mockExpService.selectedVariables as any).set([variable]);

        const response = {
            result: {
                featurewise: [
                    { variable: 'age', data: { mean: 30, std: 5 } } // No counts
                ],
            }
        };
        mockExpService.loadDescriptiveOverview.and.returnValue(of(response));

        component.fetchDescriptiveStatistics();

        expect(component.rawSummary.nonNominalVariables.find(v => v.code === 'age')).toBeTruthy();
        expect(component.rawSummary.nominalVariables.find(v => v.code === 'age')).toBeFalsy();
    });

    it('renders the source snapshot ahead of the pipeline stages without a model tab', () => {
        fixture.detectChanges();

        // The sub-tab buttons moved to the studio stepper; the panel now
        // exposes only the pipeline nodes, located by data-guide anchors.
        // Step 0 leads the flow and owns its preview: the source summary is
        // nested inside the source node. The raw and processed summaries are
        // nested in their owning nodes, so they only appear once those steps
        // are added (e.g. after opening Filtering or Preprocessing).
        const guides = (Array.from(
            fixture.nativeElement.querySelectorAll('.workflow-section, .pipeline-node')
        ) as HTMLElement[]).map((section) => section.getAttribute('data-guide'));
        expect(guides).toEqual([
            'analysis-source-data',
            'analysis-source-summary',
            'analysis-filtering',
            'analysis-preprocessing',
            'analysis-transformation',
        ]);

        const buttonLabels = (Array.from(
            fixture.nativeElement.querySelectorAll('button')
        ) as HTMLButtonElement[]).map((button) => button.textContent?.trim());
        expect(buttonLabels).not.toContain('Model');
    });

    it('shows longitudinal preprocessing only for longitudinal data models', () => {
        (mockExpService.selectedDataModel as any).set({
            code: 'longitudinal_dm',
            label: 'Longitudinal Data Model',
            longitudinal: true,
            variables: [
                {
                    code: 'visitid',
                    label: 'Visit ID',
                    enumerations: [
                        { code: 'BL', label: 'Baseline' },
                        { code: 'FL1', label: 'Follow-up 1' },
                    ],
                },
            ],
        });
        (mockExpService.selectedVariables as any).set([
            { code: 'age', label: 'Age', type: 'real' },
        ]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));

        openStation('setup');
        expect(fixture.nativeElement.textContent).toContain('Required for longitudinal pathologies');
        expect(fixture.nativeElement.textContent).toContain('Longitudinal Transformation');
        expect(fixture.nativeElement.textContent).toContain('Longitudinal strategy');
        expect(fixture.nativeElement.textContent).toContain('Diff (Visit 2 - Visit 1)');
        expect(fixture.nativeElement.textContent).not.toContain('Enable longitudinal transformation');

        (mockExpService.selectedDataModel as any).set({ code: 'dm', label: 'Data Model', longitudinal: false });
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).not.toContain('Longitudinal Transformation');
        expect(fixture.nativeElement.textContent).not.toContain('Longitudinal strategy');
    });

    it('filters preprocessing rows by variable search', () => {
        (mockExpService.selectedVariables as any).set([
            { code: 'age', label: 'Age', type: 'real' },
            { code: 'biol_sex', label: 'Biological Sex', type: 'nominal' },
        ]);
        component.prepSearch.missing = 'age';

        expect(component.filteredPrepVariables('missing').map((v) => v.code)).toEqual(['age']);
    });

    it('shows the same empty state for longitudinal preprocessing when search has no matches', () => {
        (mockExpService.selectedDataModel as any).set({
            code: 'longitudinal_dm',
            label: 'Longitudinal Pathology',
            longitudinal: true,
            variables: [
                {
                    code: 'visitid',
                    label: 'Visit ID',
                    enumerations: [
                        { code: 'BL', label: 'Baseline' },
                        { code: 'FL1', label: 'Follow-up 1' },
                    ],
                },
            ],
        });
        (mockExpService.selectedVariables as any).set([
            { code: 'age', label: 'Age', type: 'real' },
        ]);
        component.prepSearch.missing = 'no-match';
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));

        const preprocessingSection = openStation('setup');
        expect(preprocessingSection.querySelector('.empty-state-block')).toBeTruthy();
        expect(preprocessingSection.textContent).toContain('No variables match the current search.');
    });

    it('renders missing values as a selected-variable workspace', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);

        const preprocessingSection = openStation('setup');
        const missingStep = (Array.from(preprocessingSection.querySelectorAll('.station-card')) as HTMLElement[])
            .find((step) => step.textContent?.includes('Missing Values')) as HTMLElement;

        expect(missingStep.querySelector('.preprocessing-browser')).toBeTruthy();
        expect(missingStep.querySelector('.preprocessing-detail-panel')).toBeTruthy();
        expect(missingStep.querySelector('.preprocessing-detail-panel h4')?.textContent).toContain('Age');
        expect(missingStep.textContent).toContain('Missing value handling');
    });

    it('gives Filtering, Preprocessing and Transformation the same station anatomy', () => {
        fixture.detectChanges();

        openStation('filters');
        openStation('setup');
        openStation('transformation');

        // Every node carries its own heading, at least one station card, and one shared
        // Preview data action on its apply surface.
        for (const title of ['Filtering', 'Preprocessing', 'Transformation']) {
            const node = workflowSection(title);
            expect(node.querySelector('h3')?.textContent?.trim()).toBeTruthy();
            expect(node.querySelector('.station-card')).toBeTruthy();
            expect(node.querySelectorAll('.station-action-bar:has(.station-action-preview)').length).toBe(1);
        }

        // Titled cards keep the shared anatomy: icon tile + collapsible header.
        const titled = (Array.from(
            (fixture.nativeElement as HTMLElement).querySelectorAll('.pipeline-node .station-card')
        ) as HTMLElement[]).filter((card) => card.querySelector('.station-card-title')?.textContent?.trim());
        expect(titled.map((card) => card.querySelector('.station-card-title')?.textContent?.trim())).toEqual([
            'Missing Values',
            'Create new categorical column',
        ]);
        for (const card of titled) {
            expect(card.querySelector('.station-card-icon i')).toBeTruthy();
            expect(card.querySelector('button.station-card-header[aria-expanded]')).toBeTruthy();
        }
    });

    it('keeps the preprocessing and transformation stations collapsible', () => {
        fixture.detectChanges();

        // Filtering is the only static station; the other three toggle through their header.
        openStation('setup');
        openStation('transformation');
        component.enableOutlierHandling();
        fixture.detectChanges();

        const headers = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.pipeline-node .station-card-header'));
        expect(headers.filter((header) => header.tagName === 'BUTTON' && header.hasAttribute('aria-expanded')).length).toBe(3);

        const missingHeader = headers.find((header) => header.textContent?.includes('Missing Values')) as HTMLButtonElement;
        expect(missingHeader.getAttribute('aria-expanded')).toBe('true');

        missingHeader.click();
        fixture.detectChanges();

        expect(component.preprocessingStepOpen.missing).toBeFalse();
        expect(missingHeader.getAttribute('aria-expanded')).toBe('false');
    });

    it('updates preprocessing detail controls when a variable is selected', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);

        const preprocessingSection = openStation('setup');
        const sexButton = (Array.from(preprocessingSection.querySelectorAll('.preprocessing-variable-btn')) as HTMLButtonElement[])
            .find((button) => button.textContent?.includes('Sex'));
        sexButton?.click();
        fixture.detectChanges();

        expect(component.selectedPrepVariable('missing')?.code).toBe('sex');
        expect(preprocessingSection.querySelector('.preprocessing-detail-panel h4')?.textContent).toContain('Sex');
    });

    it('uses independent selected variables for missing values and longitudinal transformation', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        (mockExpService.selectedDataModel as any).set({
            code: 'longitudinal_dm',
            label: 'Longitudinal Data Model',
            longitudinal: true,
            variables: [
                {
                    code: 'visitid',
                    label: 'Visit ID',
                    enumerations: [
                        { code: 'BL', label: 'Baseline' },
                        { code: 'FL1', label: 'Follow-up 1' },
                    ],
                },
            ],
        });
        fixture.detectChanges();

        component.selectPrepVariable('missing', sex);
        component.selectPrepVariable('longitudinal', age);
        fixture.detectChanges();

        expect(component.selectedPrepVariable('missing')?.code).toBe('sex');
        expect(component.selectedPrepVariable('longitudinal')?.code).toBe('age');
    });

    it('counts pending preprocessing by step instead of by variable rule', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        (mockExpService.selectedDataModel as any).set({
            code: 'longitudinal_dm',
            label: 'Longitudinal Data Model',
            longitudinal: true,
            variables: [
                {
                    code: 'visitid',
                    label: 'Visit ID',
                    enumerations: [
                        { code: 'BL', label: 'Baseline' },
                        { code: 'FL1', label: 'Follow-up 1' },
                    ],
                },
            ],
        });
        fixture.detectChanges();

        // Missing Values defaults (NA removal) are implicit, so they don't
        // contribute to the pending count. Only the longitudinal step counts.
        openStation('setup');
        expect(component.pendingChangeCount).toBe(1);
        expect(fixture.nativeElement.textContent).toContain('1 pending step');
    });

    it('shows category choices for categorical constant preprocessing values', () => {
        const variable = {
            code: 'pad',
            label: 'PAD',
            type: 'nominal',
            enumerations: [
                { code: '0', label: 'No' },
                { code: '1', label: 'Yes' },
            ],
        };
        (mockExpService.selectedVariables as any).set([variable]);
        component.onMissingActionChange(variable, 'constant');

        const preprocessingSection = openStation('setup');
        const options = Array.from(preprocessingSection.querySelectorAll('.preprocessing-detail-panel option')) as HTMLOptionElement[];

        expect(options.map((option) => option.textContent?.trim())).toContain('No');
        expect(options.map((option) => option.textContent?.trim())).toContain('Yes');
    });

    it('splits preprocessing rows by default, applied and pending state', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        component.appliedPreprocessingRules = {
            age: { variableCode: 'age', action: 'drop', value: '', enabled: true },
        };
        component.pendingPreprocessingRules = {
            age: { variableCode: 'age', action: 'drop', value: '', enabled: true },
        };

        const pendingGroup = component.prepGroups('missing').find((group) => group.key === 'pending');
        const appliedGroup = component.prepGroups('missing').find((group) => group.key === 'applied');
        const defaultGroup = component.prepGroups('missing').find((group) => group.key === 'default');

        // `sex` was just added and sits on the implicit NA-removal default.
        expect(pendingGroup).toBeUndefined();
        expect(defaultGroup?.variables.map((v) => v.code)).toEqual(['sex']);
        expect(appliedGroup?.variables.map((v) => v.code)).toEqual(['age']);
    });

    it('keeps preprocessing rules when variables are removed and re-added', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'real' };
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));
        component.pendingPreprocessingRules = {
            age: { variableCode: 'age', action: 'drop', value: '', enabled: true },
        };
        component.appliedPreprocessingRules = {
            age: { variableCode: 'age', action: 'drop', value: '', enabled: true },
        };

        (mockExpService.selectedVariables as any).set([sex]);
        fixture.detectChanges();
        // Dropping `age` from the selection must not drop its applied rule.
        expect(component.appliedPreprocessingRules['age']?.action).toBe('drop');
        expect(Object.keys(component.appliedPreprocessingRules)).toEqual(['age']);

        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();

        const appliedGroup = component.prepGroups('missing').find((group) => group.key === 'applied');
        const defaultGroup = component.prepGroups('missing').find((group) => group.key === 'default');
        // `age` comes back as applied; `sex` was never applied and sits on the
        // request-time NA-removal default (b0899cf removed the auto-persist).
        expect(appliedGroup?.variables.map((v) => v.code)).toEqual(['age']);
        expect(defaultGroup?.variables.map((v) => v.code)).toEqual(['sex']);
    });

    it('keeps the default NA removal in memory when variables are first selected', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));
        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();

        // The implicit default is shown as a default: algorithm runs get drop from
        // resolveRequestPreprocessing, so it is not persisted work.
        expect(component.prepVariableStateLabel('missing',age)).toBe('Default');
        expect(component.prepVariableStateLabel('missing',sex)).toBe('Default');
        expect(component.pendingChangeCount).toBe(0);
        const persisted = mockExpService.setAppliedDescriptivePreprocessing.calls
            .allArgs()
            .map(([config]) => config)
            .filter((config) => config !== null);
        expect(persisted).toEqual([]);
        expect(component.isStepAdded('setup')).toBeFalse();
        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalled();
        expect(component.preprocessingStatus).toBe('none');
        expect((component as any).userPreprocessingApplied).toBe(false);
    });

    it('reports applied status only after a real apply', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        // The bare set spy does not round-trip the persisted config; wire it up
        // so the post-apply reconcile hydrates from the applied config (as the
        // real service does) instead of treating it as a fresh session.
        mockExpService.setAppliedDescriptivePreprocessing.and.callFake((config: unknown) => {
            mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(config as never);
        });
        (mockExpService.selectedVariables as any).set([age]);
        component.onMissingActionChange(age, 'mean');
        expect(component.preprocessingStatus).not.toBe('applied');

        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));
        component.applyPreprocessing();
        fixture.detectChanges();

        expect((component as any).userPreprocessingApplied).toBe(true);
        expect(component.preprocessingStatus).toBe('applied');
    });

    it('covers variables added after applied preprocessing with the inherited NA removal default', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        const preprocessing = {
            missing_values_handler: {
                strategies: {
                    age: 'drop',
                },
            },
        };
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(component.prepVariableStateLabel('missing',age)).toBe('Applied');
        expect(component.pendingChangeCount).toBe(0);

        (mockExpService.selectedVariables as any).set([age, sex]);
        fixture.detectChanges();

        const defaultGroup = component.prepGroups('missing').find((group) => group.key === 'default');
        // The NA drop for a newly added variable is injected per request, not stored, so the
        // honest label is Default: covered by the inherited default, owed nothing, pending nothing.
        expect(component.prepVariableStateLabel('missing',sex)).toBe('Default');
        expect(component.prepVariableHasPendingChange('missing', sex)).toBeFalse();
        expect(component.pendingChangeCount).toBe(0);
        expect(defaultGroup?.variables.map((v) => v.code)).toEqual(['sex']);
    });

    it('creates pending state when a missing value action changes', () => {
        const variable = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([variable]);
        component.onMissingActionChange(variable, 'mean');

        expect(component.pendingChangeCount).toBe(1);
        expect(component.preprocessingStatus).toBe('pending');
    });

    it('validates constant missing value rules before apply', () => {
        const variable = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([variable]);
        component.onMissingActionChange(variable, 'constant');

        component.applyPreprocessing();

        expect(component.preprocessingValidationErrors['age']).toBe('A constant value is required.');
        expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();
    });

    it('previews the processed data with pending, unapplied preprocessing changes', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();
        mockExpService.loadDescriptiveOverview.calls.reset();

        // Pending (not yet applied) missing-value strategy.
        component.onMissingActionChange(age, 'mean');
        expect(component.preprocessingStatus).toBe('pending');
        expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();

        // Opening the processed preview uses the pending rules, not the applied config.
        component.goToSection('processed');
        fixture.detectChanges();

        expect(component.sectionOpen().processed).toBeTrue();
        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(
            ['age'],
            { missing_values_handler: { strategies: { age: 'mean' } } }
        );
    });

    it('refreshes the open processed preview when pending preprocessing changes', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.onMissingActionChange(age, 'mean');
        component.goToSection('processed');
        fixture.detectChanges();

        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(
            ['age'],
            { missing_values_handler: { strategies: { age: 'mean' } } }
        );

        mockExpService.loadDescriptiveOverview.calls.reset();
        component.onMissingActionChange(age, 'median');
        fixture.detectChanges();

        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(
            ['age'],
            { missing_values_handler: { strategies: { age: 'median' } } }
        );
    });

    it('deduplicates in-flight processed preview requests and keeps the newest response', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();
        mockExpService.loadDescriptiveOverview.calls.reset();

        component.onMissingActionChange(age, 'mean');

        const first = new Subject<any>();
        mockExpService.loadDescriptiveOverview.and.returnValue(first.asObservable());
        (component as any).fetchProcessedPreview();

        // Same pending config: the request is already in flight, so it must not fan out.
        (component as any).fetchProcessedPreview();
        expect(mockExpService.loadDescriptiveOverview.calls.count()).toBe(1);

        component.onMissingActionChange(age, 'median');
        const second = new Subject<any>();
        mockExpService.loadDescriptiveOverview.and.returnValue(second.asObservable());
        (component as any).fetchProcessedPreview();
        expect(mockExpService.loadDescriptiveOverview.calls.count()).toBe(2);

        second.next({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 82 } },
                ],
            },
        });
        first.next({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                ],
            },
        });
        fixture.detectChanges();

        expect(component.processedSummary.featurewiseRows[0].data.mean).toBe(82);

        first.complete();
        second.complete();
    });

    it('supersedes an in-flight source preview when its selection changes', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        const stale = new Subject<any>();
        mockExpService.loadDescriptiveOverview.and.returnValue(stale.asObservable());
        component.fetchSourceSummary();

        (mockExpService.selectedVariables as any).set([age, sex]);
        const current = new Subject<any>();
        mockExpService.loadDescriptiveOverview.and.returnValue(current.asObservable());
        component.fetchSourceSummary();

        current.next({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 82 } },
                ],
            },
        });
        stale.next({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                ],
            },
        });
        fixture.detectChanges();

        expect(component.sourceSummary.featurewiseRows.length).toBe(1);
        expect(component.sourceSummary.featurewiseRows[0].data.mean).toBe(82);
        expect(component.sourceSummary.isLoading).toBeFalse();

        stale.complete();
        current.complete();
    });

    it('selects the first processed statistic after preprocessing is applied', () => {
        const variable = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([variable]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    {
                        dataset: 'all datasets',
                        variable: 'age',
                        data: {
                            num_dtps: 10,
                            num_na: 0,
                            num_total: 10,
                            mean: 71,
                        },
                    },
                ],
            },
        }));

        component.onMissingActionChange(variable, 'mean');
        component.applyPreprocessing();

        // Apply saves and closes the station: nothing is handed to the next one, and the
        // summary it computed is still selected for the trip Preview data makes.
        expect(component.sectionOpen().setup).toBeFalse();
        expect(component.sectionOpen().processed).toBeFalse();
        expect(component.sectionOpen().transformation).toBeFalse();
        expect(component.selectedStatisticBlock('processed')?.name).toBe('Age');
    });

    it('opens and scrolls to the processed summary while preprocessing is loading', (done) => {
        const { age } = configureRawSummary();
        const response$ = new Subject<unknown>();
        const scrollSpy = spyOn(Element.prototype, 'scrollIntoView');
        spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
            void Promise.resolve().then(() => callback(0));
            return 0;
        });
        mockExpService.loadDescriptiveOverview.and.returnValue(response$.asObservable());

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();
        fixture.detectChanges();

        const processedSection = workflowSection('Processed Data Summary');
        const processedBody = processedSection.querySelector('.workflow-section-body.open') as HTMLElement;
        expect(component.sectionOpen().processed).toBeTrue();
        expect(component.processedSummary.isLoading).toBeTrue();
        expect(processedSection.querySelector('[aria-label="Processed data summary loading"]')).toBeTruthy();
        expect(processedBody).toBeTruthy();

        setTimeout(() => {
            expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

            response$.next({
                result: {
                    featurewise: [
                        {
                            dataset: 'all datasets',
                            variable: 'age',
                            data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 },
                        },
                    ],
                },
            });
            response$.complete();
            fixture.detectChanges();

            // Apply folded the station instead of opening the next one; the summary is
            // still built and selected, and Preview data is what shows it.
            expect(component.sectionOpen().setup).toBeFalse();
            expect(component.sectionOpen().processed).toBeFalse();
            expect(component.sectionOpen().transformation).toBeFalse();
            expect(component.processedSummary.isLoading).toBeFalse();
            expect(component.selectedStatisticBlock('processed')?.name).toBe('Age');

            (mockExpService.appliedPreprocessingConfig as any).set({
                missing_values_handler: {
                    strategies: { age: 'mean' },
                },
            });
            fixture.detectChanges();
            // A later config write invalidates the workspace the same way, without
            // losing the statistic selection built for it.
            expect(component.sectionOpen().processed).toBeFalse();
            expect(component.selectedStatisticBlock('processed')?.name).toBe('Age');
            done();
        });
    });

    it('scrolls the workflow subsection into view', (done) => {
        configureRawSummary();
        const scrollSpy = spyOn(Element.prototype, 'scrollIntoView');
        spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
            void Promise.resolve().then(() => callback(0));
            return 0;
        });

        component.goToSection('filters');
        fixture.detectChanges();

        setTimeout(() => {
            expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
            done();
        });
    });

    it('keeps the processed summary open and stops the spinner when preprocessing fails', () => {
        const { age } = configureRawSummary();
        const response$ = new Subject<unknown>();
        spyOn(console, 'error');
        mockExpService.loadDescriptiveOverview.and.returnValue(response$.asObservable());

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();
        fixture.detectChanges();

        expect(component.sectionOpen().processed).toBeTrue();
        expect(component.processedSummary.isLoading).toBeTrue();

        response$.error(new Error('preprocessing failed'));
        fixture.detectChanges();

        const processedSection = workflowSection('Processed Data Summary');
        expect(component.sectionOpen().processed).toBeTrue();
        expect(component.processedSummary.isLoading).toBeFalse();
        expect(processedSection.textContent).not.toContain('Processed data summary loading');
    });

    it('renders raw statistics as a grouped analysis workspace', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);

        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    {
                        dataset: 'all datasets',
                        variable: 'age',
                        data: {
                            num_dtps: 10,
                            num_na: 0,
                            num_total: 10,
                            mean: 71,
                        },
                    },
                    {
                        dataset: 'all datasets',
                        variable: 'sex',
                        data: {
                            counts: { female: 6, male: 4 },
                            num_dtps: 10,
                            num_na: 1,
                            num_total: 11,
                        },
                    },
                ],
            },
        }));
        // The raw summary now lives inside the Filtering node, so it only
        // renders once that step is added.
        component.addStep('filters');
        fixture.detectChanges();

        const workspace = fixture.nativeElement.querySelector('.statistics-workspace') as HTMLElement;
        const text = workspace.textContent ?? '';

        expect(workspace).toBeTruthy();
        expect(text).toContain('Numerical');
        expect(text).toContain('Categorical');
        expect(text).toContain('Age');
        expect(text).toContain('Sex');
        expect(text).toContain('PDF');
        expect(text).toContain('CSV');
        const variableButtons = Array.from(workspace.querySelectorAll('.statistics-variable-btn')) as HTMLButtonElement[];
        const ageButton = variableButtons.find((button) => button.textContent?.includes('Age'));
        const ageButtonText = ageButton?.textContent ?? '';
        // Deliberate change from "10 datapoints · 0 missing": the rail is a column
        // you compare top to bottom, and absolute counts are not comparable across
        // variables of different size. The share is, and it fits one line in the
        // 300px rail; the counts stay in the row's tooltip.
        expect(ageButtonText).toContain('0%');
        expect(ageButton?.querySelector('.statistics-variable-coverage')?.getAttribute('title')).toContain('of 10');
        expect(ageButtonText).not.toContain('Numerical');
    });

    it('pools the rail foot over counts rather than averaging the row shares', () => {
        configureRawSummary();
        component.fetchDescriptiveStatistics();
        fixture.detectChanges();

        const pooled = component.selectionCoverage('raw');
        expect(pooled?.variables).toBe(2);
        expect(pooled?.total).toBe(21);
        expect(pooled?.missing).toBe(1);
        // Re-pooled: 1 of 21. Averaging the two row shares (0% and 9.1%) would
        // report 4.6%, a number that describes no dataset in the selection.
        expect(component.coveragePercent(pooled!)).toBe('4.8%');
    });

    it('marks only numeric summary tables for the compact no-scroll layout', () => {
        const { age } = configureRawSummary();
        // The raw summary now lives inside the Filtering node, so it only
        // renders once that step is added.
        component.addStep('filters');
        fixture.detectChanges();

        const rawSection = workflowSection('Raw Data Summary');
        const rawWrapper = rawSection.querySelector('.statistics-table-wrapper') as HTMLElement;
        expect(rawWrapper.classList.contains('statistics-table-wrapper--numeric')).toBeTrue();

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();
        fixture.detectChanges();

        const processedWrapper = workflowSection('Processed Data Summary').querySelector('.statistics-table-wrapper') as HTMLElement;
        expect(processedWrapper.classList.contains('statistics-table-wrapper--numeric')).toBeTrue();

        const sexButton = (Array.from(workflowSection('Raw Data Summary').querySelectorAll('.statistics-variable-btn')) as HTMLButtonElement[])
            .find((button) => button.textContent?.includes('Sex'));
        sexButton?.click();
        fixture.detectChanges();

        const nominalWrapper = workflowSection('Raw Data Summary').querySelector('.statistics-table-wrapper') as HTMLElement;
        expect(nominalWrapper.classList.contains('statistics-table-wrapper--numeric')).toBeFalse();
    });

    it('filters raw statistics browser by variable label or code', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                    { dataset: 'all datasets', variable: 'sex', data: { counts: { female: 6 }, num_dtps: 6, num_na: 0, num_total: 6 } },
                ],
            },
        }));
        // The raw summary now lives inside the Filtering node, so it only
        // renders once that step is added.
        component.addStep('filters');
        fixture.detectChanges();

        const search = fixture.nativeElement.querySelector('input[aria-label="Search raw data summary variables"]') as HTMLInputElement;
        search.value = 'sex';
        search.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        expect(component.filteredStatisticBlocks('raw').map((block) => block.name)).toEqual(['Sex']);
        expect(component.selectedStatisticBlock('raw')?.name).toBe('Sex');
        const text = fixture.nativeElement.querySelector('.statistics-workspace')?.textContent ?? '';
        expect(text).toContain('Sex');
        expect(text).not.toContain('Age');
    });

    it('updates the statistics detail panel when a variable is selected', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                    { dataset: 'all datasets', variable: 'sex', data: { counts: { female: 6 }, num_dtps: 6, num_na: 0, num_total: 6 } },
                ],
            },
        }));
        // The raw summary now lives inside the Filtering node, so it only
        // renders once that step is added.
        component.addStep('filters');
        fixture.detectChanges();

        const buttons = Array.from(fixture.nativeElement.querySelectorAll('.statistics-variable-btn')) as HTMLButtonElement[];
        const sexButton = buttons.find((button) => button.textContent?.includes('Sex'));
        sexButton?.click();
        fixture.detectChanges();

        expect(component.selectedStatisticBlock('raw')?.name).toBe('Sex');
        expect(fixture.nativeElement.querySelector('.statistics-panel h4')?.textContent).toContain('Sex');
    });

    it('keeps the raw variable browser visible when the right panel switches to charts', () => {
        configureRawSummary([{ title: { text: 'Age chart' }, series: [] }]);
        // The raw summary now lives inside the Filtering node, so it only
        // renders once that step is added.
        component.addStep('filters');
        fixture.detectChanges();

        component.setSummaryTab('raw', 'Charts');
        fixture.detectChanges();

        const rawSection = workflowSection('Raw Data Summary');
        expect(rawSection.querySelectorAll('.statistics-browser').length).toBe(1);
        expect(rawSection.querySelector('.chart-browser')).toBeNull();
        expect(rawSection.querySelector('.statistics-browser')?.textContent).toContain('Age');
        expect(rawSection.querySelector('.statistics-panel h4')?.textContent).toContain('Age');
        expect(rawSection.querySelector('app-chart-renderer')).toBeTruthy();
    });

    it('preserves the selected raw variable across Statistics and Charts tabs', () => {
        configureRawSummary();
        // The raw summary now lives inside the Filtering node, so it only
        // renders once that step is added.
        component.addStep('filters');
        fixture.detectChanges();

        const buttons = Array.from(fixture.nativeElement.querySelectorAll('.statistics-variable-btn')) as HTMLButtonElement[];
        buttons.find((button) => button.textContent?.includes('Sex'))?.click();
        fixture.detectChanges();

        component.setSummaryTab('raw', 'Charts');
        fixture.detectChanges();
        expect(component.selectedStatisticBlock('raw')?.name).toBe('Sex');
        expect(workflowSection('Raw Data Summary').querySelector('.statistics-panel h4')?.textContent).toContain('Sex');

        component.setSummaryTab('raw', 'Statistics');
        fixture.detectChanges();
        expect(component.selectedStatisticBlock('raw')?.name).toBe('Sex');
        expect(workflowSection('Raw Data Summary').querySelector('.statistics-panel h4')?.textContent).toContain('Sex');
    });

    it('shows a chart empty state for a selected variable without chart options', () => {
        configureRawSummary([]);
        // The raw summary now lives inside the Filtering node, so it only
        // renders once that step is added.
        component.addStep('filters');
        fixture.detectChanges();

        component.setSummaryTab('raw', 'Charts');
        fixture.detectChanges();

        const rawSection = workflowSection('Raw Data Summary');
        expect(component.selectedStatisticBlock('raw')?.name).toBe('Age');
        expect(rawSection.textContent).toContain('No chart available for Age.');
        expect(rawSection.querySelector('.statistics-browser')).toBeTruthy();
    });

    it('uses the same selected-variable workspace for processed summaries', () => {
        const { age } = configureRawSummary([{ title: { text: 'Age chart' }, series: [] }]);

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();
        component.setSummaryTab('processed', 'Charts');
        fixture.detectChanges();

        const processedSection = workflowSection('Processed Data Summary');
        expect(processedSection.querySelector('.statistics-browser')).toBeTruthy();
        expect(processedSection.querySelector('.chart-browser')).toBeNull();
        expect(component.selectedStatisticBlock('processed')?.name).toBe('Age');
        expect(processedSection.querySelector('.statistics-panel h4')?.textContent).toContain('Age');
    });

    it('applies longitudinal preprocessing with visit pair and per-variable strategies', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        (mockExpService.selectedDataModel as any).set({
            code: 'longitudinal_dm',
            label: 'Longitudinal Data Model',
            longitudinal: true,
            variables: [
                {
                    code: 'visitid',
                    label: 'Visit ID',
                    enumerations: [
                        { code: 'BL', label: 'Baseline' },
                        { code: 'FL1', label: 'Follow-up 1' },
                    ],
                },
            ],
        });
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));

        component.applyPreprocessing();

        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(['age', 'sex'], {
            missing_values_handler: {
                strategies: {
                    age: 'drop',
                    sex: 'drop',
                },
            },
            longitudinal_transformer: {
                visit1: 'BL',
                visit2: 'FL1',
                strategies: {
                    age: 'diff',
                    sex: 'first',
                },
            },
        });
        expect(mockExpService.setAppliedDescriptivePreprocessing).toHaveBeenCalledWith({
            missing_values_handler: {
                strategies: {
                    age: 'drop',
                    sex: 'drop',
                },
            },
            longitudinal_transformer: {
                visit1: 'BL',
                visit2: 'FL1',
                strategies: {
                    age: 'diff',
                    sex: 'first',
                },
            },
        });
    });

    it('applies outlier winsorizer together with missing values for numerical variables only', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        const bmi = { code: 'bmi', label: 'BMI', type: 'real' };
        (mockExpService.selectedVariables as any).set([age, sex, bmi]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));
        fixture.detectChanges();
        mockExpService.loadDescriptiveOverview.calls.reset();

        expect(component.outlierPreprocessingVariables.map((variable) => variable.code)).toEqual(['age', 'bmi']);

        component.onOutlierStrategyChange(age, 'quantile');
        component.onOutlierFoldChange(age, 0.05);
        component.onOutlierEnabledChange(bmi, true);
        component.applyPreprocessing();

        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(['age', 'sex', 'bmi'], {
            missing_values_handler: {
                strategies: {
                    age: 'drop',
                    sex: 'drop',
                    bmi: 'drop',
                },
            },
            outlier_winsorizer: {
                strategies: {
                    age: 'quantile',
                    bmi: 'iqr',
                },
                tails: {
                    age: 'both',
                    bmi: 'both',
                },
                folds: {
                    age: 0.05,
                    bmi: 1.5,
                },
            },
        });
    });

    it('previews pending outlier winsorizer rules with an outlier report before applying', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        mockExpService.loadOutlierReportPreview.and.returnValue(of({
            result: {
                featurewise: [
                    {
                        variable: 'age',
                        dataset: 'dataset-a',
                        data: {
                            strategy: 'iqr',
                            tail: 'both',
                            fold: 1.5,
                            lower_bound: null,
                            upper_bound: 90,
                            lower_outlier_count: 0,
                            upper_outlier_count: 2,
                            total_outlier_count: 2,
                            total_outlier_percentage: 0.2,
                        },
                    },
                ],
            },
        }));
        openStation('setup');
        mockExpService.setAppliedDescriptivePreprocessing.calls.reset();

        component.onOutlierEnabledChange(age, true);
        component.previewOutlierReport();

        expect(mockExpService.loadOutlierReportPreview).toHaveBeenCalledWith(
            ['age'],
            {
                strategies: { age: 'iqr' },
                tails: { age: 'both' },
                folds: { age: 1.5 },
            },
            {
                missing_values_handler: {
                    strategies: {
                        age: 'drop',
                    },
                },
            }
        );
        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        expect(component.outlierPreviewRows).toEqual([
            jasmine.objectContaining({
                variable: 'Age',
                dataset: 'dataset-a',
                strategy: 'IQR',
                fold: '1.5',
                upperBound: '90',
                lowerBound: '-',
                lowerOutliers: '0',
                totalOutliers: '2',
            }),
        ]);

        fixture.detectChanges();
        const preview = fixture.nativeElement.querySelector('.preview-panel') as HTMLElement;
        expect(preview.textContent).toContain('Outlier Report Preview');
        expect(preview.textContent).toContain('0');
        expect(preview.textContent).toContain('2');
    });

    it('excludes all datasets rows from outlier report preview like descriptive numerical charts', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([age]);
        mockExpService.loadOutlierReportPreview.and.returnValue(of({
            result: {
                featurewise: [
                    {
                        variable: 'age',
                        dataset: 'dataset-a',
                        data: { strategy: 'iqr', tail: 'both', fold: 1.5 },
                    },
                    {
                        variable: 'age',
                        dataset: 'all datasets',
                        data: { strategy: 'iqr', tail: 'both', fold: 1.5 },
                    },
                ],
            },
        }));
        fixture.detectChanges();

        component.onOutlierEnabledChange(age, true);
        component.previewOutlierReport();

        expect(component.outlierPreviewRows.map((row) => row.dataset)).toEqual(['dataset-a']);
    });

    it('validates outlier fold boundaries before applying preprocessing', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();
        mockExpService.loadDescriptiveOverview.calls.reset();

        component.onOutlierStrategyChange(age, 'quantile');
        component.onOutlierFoldChange(age, 0.5);
        component.applyPreprocessing();

        expect(component.outlierValidationErrors['age']).toBe('Quantile fold must be greater than 0 and less than 0.5.');
        expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();

        component.onOutlierStrategyChange(age, 'iqr');
        component.onOutlierFoldChange(age, 0);
        component.applyPreprocessing();

        expect(component.outlierValidationErrors['age']).toBe('Fold must be greater than 0.');
        expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();
    });

    it('resets missing value and longitudinal pending state together', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        (mockExpService.selectedVariables as any).set([age, sex]);
        (mockExpService.selectedDataModel as any).set({
            code: 'longitudinal_dm',
            label: 'Longitudinal Data Model',
            longitudinal: true,
            variables: [
                {
                    code: 'visitid',
                    label: 'Visit ID',
                    enumerations: [
                        { code: 'BL', label: 'Baseline' },
                        { code: 'FL1', label: 'Follow-up 1' },
                    ],
                },
            ],
        });
        component.appliedPreprocessingRules = {
            age: { variableCode: 'age', action: 'mean', value: '', enabled: true },
            sex: { variableCode: 'sex', action: 'drop', value: '', enabled: true },
        };
        component.appliedLongitudinalEnabled = true;
        component.appliedLongitudinalVisit1 = 'BL';
        component.appliedLongitudinalVisit2 = 'FL1';
        component.appliedLongitudinalStrategies = { age: 'diff', sex: 'first' };
        component.onMissingActionChange(age, 'median');
        component.onLongitudinalStrategyChange(sex, 'second');

        component.resetChanges();

        expect(component.ruleFor(age).action).toBe('mean');
        expect(component.longitudinalStrategyFor(sex)).toBe('first');
        expect(component.pendingChangeCount).toBe(0);
    });

    it('hydrates saved preprocessing as applied without pending changes', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        const preprocessing = {
            missing_values_handler: {
                strategies: {
                    age: 'median',
                    sex: 'drop',
                },
            },
        };
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        (mockExpService.selectedVariables as any).set([age, sex]);

        fixture.detectChanges();

        expect(component.ruleFor(age).action).toBe('median');
        expect(component.ruleFor(sex).action).toBe('drop');
        expect((component as any).userPreprocessingApplied).toBe(false);
        // Internal status stays config-driven; the flag (and the emitted,
        // downgraded status) is what keeps the stepper from claiming Done.
        expect(component.preprocessingStatus).toBe('applied');
        expect(component.pendingChangeCount).toBe(0);
    });

    it('hydrates saved outlier preprocessing as applied without enabling categorical variables', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
        const preprocessing = {
            missing_values_handler: {
                strategies: {
                    age: 'drop',
                    sex: 'drop',
                },
            },
            outlier_winsorizer: {
                strategies: {
                    age: 'iqr',
                },
                tails: {
                    age: 'both',
                },
                folds: {
                    age: 1.5,
                },
            },
        };
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        (mockExpService.selectedVariables as any).set([age, sex]);

        fixture.detectChanges();

        expect(component.outlierPreprocessingVariables.map((variable) => variable.code)).toEqual(['age']);
        expect(component.outlierRuleFor(age).enabled).toBeTrue();
        expect(component.prepVariableStateLabel('outlier', age)).toBe('Applied');
        // Internal status stays config-driven (outlier config is applied); the
        // user-apply flag is what keeps the stepper from claiming Done.
        expect((component as any).userPreprocessingApplied).toBe(false);
        expect(component.preprocessingStatus).toBe('applied');
        expect(component.pendingChangeCount).toBe(0);
    });

    it('builds processed histogram preview from describe counts without calling histogram_sql', () => {
        const aspiration = {
            code: 'aspiration',
            label: 'Aspiration',
            type: 'nominal',
            enumerations: [{ code: '0', label: 'No' }, { code: '1', label: 'Yes' }],
        };
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue({
            missing_values_handler: { strategies: { aspiration: 'drop' } },
        });
        (mockExpService.selectedVariables as any).set([aspiration]);
        fixture.detectChanges();
        component.preprocessingStatus = 'applied';
        component.processedSummary = (component as any).buildSummaryFromResponse({
            result: {
                featurewise: [
                    {
                        dataset: 'all datasets',
                        variable: 'aspiration',
                        data: {
                            num_dtps: 21766,
                            num_na: 0,
                            num_total: 21766,
                            counts: { '0': 18000, '1': 3766 },
                        },
                    },
                ],
            },
        }, 'processed');
        component.processedSummary.selectedStatisticKey = 'aspiration';
        fixture.detectChanges();

        mockExpService.getAlgorithmResults.calls.reset();
        component.setSummaryTab('processed', 'Histogram');
        fixture.detectChanges();

        expect(mockExpService.getAlgorithmResults).not.toHaveBeenCalled();
        const block = component.selectedStatisticBlock('processed');
        expect(block).toBeTruthy();
        expect(component.selectedSummaryHistogramData('processed', block!)).toEqual(jasmine.objectContaining({
            bins: ['No', 'Yes'],
            counts: [18000, 3766],
            variableName: 'Aspiration',
        }));
    });

    it('reloads the raw histogram preview after filters change while the Histogram tab is active', () => {
        const aspiration = {
            code: 'aspiration',
            label: 'Aspiration',
            type: 'nominal',
            enumerations: [{ code: '0', label: 'No' }, { code: '1', label: 'Yes' }],
        };
        configureRawSummary();
        (mockExpService.selectedVariables as any).set([aspiration]);
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    {
                        dataset: 'all datasets',
                        variable: 'aspiration',
                        data: {
                            num_dtps: 21766,
                            num_na: 0,
                            num_total: 21766,
                            counts: { '0': 18000, '1': 3766 },
                        },
                    },
                ],
            },
        }));
        fixture.detectChanges();

        component.setSummaryTab('raw', 'Histogram');
        fixture.detectChanges();
        expect(component.rawSummary.activeTab).toBe('Histogram');

        const filteredLogic = {
            condition: 'AND',
            rules: [{ field: 'age', operator: 'greater', value: 65 }],
        };
        (mockExpService.filterLogic as any).set(filteredLogic);
        fixture.detectChanges();

        const block = component.selectedStatisticBlock('raw');
        expect(component.selectedSummaryHistogramData('raw', block!)).toEqual(jasmine.objectContaining({
            bins: ['No', 'Yes'],
            counts: [18000, 3766],
        }));
    });

    it('requests raw histogram with the default NaN drop only', () => {
        const dose = { code: 'dose', label: 'Dose', type: 'real' };
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    {
                        dataset: 'all datasets',
                        variable: 'dose',
                        data: { num_dtps: 100, num_na: 5, num_total: 105, mean: 12.5 },
                    },
                ],
            },
        }));
        mockExpService.getAlgorithmResults.and.returnValue(of({
            result: {
                histogram: [{
                    var: 'dose',
                    bins: [0, 5, 10, 15],
                    counts: [10, 40, 50],
                }],
            },
        }));
        (mockExpService.selectedVariables as any).set([dose]);
        fixture.detectChanges();

        mockExpService.getAlgorithmResults.calls.reset();
        component.setSummaryTab('raw', 'Histogram');
        fixture.detectChanges();

        expect(mockExpService.getAlgorithmResults).toHaveBeenCalledWith(
            'histogram',
            ['dose'],
            null,
            // histogram_sql needs a handler, so the raw preview adds the default
            // drop for the plotted variable and no preprocessing of its own.
            { missing_values_handler: { strategies: { dose: 'drop' } } },
            // No pending cohort preview is pinned, so the stored filter applies.
            undefined
        );
    });

    it('requests processed histogram with pending preprocessing when edits are unapplied', () => {
        const aspiration = {
            code: 'aspiration',
            label: 'Aspiration',
            type: 'nominal',
        };
        const applied = {
            missing_values_handler: {
                strategies: { aspiration: 'mean' },
            },
        };
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(applied);
        (mockExpService.selectedVariables as any).set([aspiration]);
        fixture.detectChanges();

        component.onMissingActionChange(aspiration, 'drop');
        mockExpService.getAlgorithmResults.and.returnValue(of({
            result: {
                histogram: [{
                    var: 'aspiration',
                    bins: ['0', '1'],
                    counts: [18000, 3766],
                }],
            },
        }));
        component.processedSummary = (component as any).buildSummaryFromResponse({
            result: {
                featurewise: [
                    {
                        dataset: 'all datasets',
                        variable: 'aspiration',
                        data: { num_dtps: 21766, num_na: 0, num_total: 21766 },
                    },
                ],
            },
        }, 'processed');
        component.processedSummary.selectedStatisticKey = 'aspiration';
        fixture.detectChanges();

        mockExpService.getAlgorithmResults.calls.reset();
        component.setSummaryTab('processed', 'Histogram');
        fixture.detectChanges();

        expect(mockExpService.getAlgorithmResults).toHaveBeenCalledWith(
            'histogram',
            ['aspiration'],
            null,
            { missing_values_handler: { strategies: { aspiration: 'drop' } } },
            undefined
        );
    });

    it('plots the processed histogram from the pending rules, never the stored config', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const stored = {
            missing_values_handler: { strategies: { age: 'drop' } },
            // A derived column is the output of this variable's pipeline, never an
            // input of its histogram.
            categorical_column_creator: [{
                code: 'group_a',
                strategy: 'filter_rules',
                rules: { a: categoryFilter() },
            }],
        };
        (mockExpService.appliedPreprocessingConfig as any).set(stored);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(stored);
        (mockExpService.selectedVariables as any).set([age]);
        mockExpService.getAlgorithmResults.and.returnValue(of({
            result: {
                histogram: [{
                    var: 'age',
                    bins: [0, 5, 10, 15],
                    counts: [10, 40, 50],
                }],
            },
        }));
        fixture.detectChanges();
        component.preprocessingStatus = 'applied';

        // The pending edit the stored config does not carry yet.
        component.onMissingActionChange(age, 'mean');
        component.processedSummary = (component as any).buildSummaryFromResponse({
            result: {
                featurewise: [
                    {
                        dataset: 'all datasets',
                        variable: 'age',
                        data: { num_dtps: 10, num_na: 1, num_total: 11, mean: 12.5 },
                    },
                ],
            },
        }, 'processed');
        component.processedSummary.selectedStatisticKey = 'age';
        fixture.detectChanges();

        mockExpService.getAlgorithmResults.calls.reset();
        component.setSummaryTab('processed', 'Histogram');
        fixture.detectChanges();

        expect(mockExpService.getAlgorithmResults).toHaveBeenCalledWith(
            'histogram',
            ['age'],
            null,
            { missing_values_handler: { strategies: { age: 'mean' } } },
            undefined
        );
        const preprocessingArg = mockExpService.getAlgorithmResults.calls.mostRecent().args[3] as Record<string, unknown>;
        expect(Object.keys(preprocessingArg ?? {})).not.toContain('categorical_column_creator');
    });

    it('loads the processed summary when saved preprocessing is hydrated', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const preprocessing = {
            missing_values_handler: {
                strategies: {
                    age: 'median',
                },
            },
        };
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        mockExpService.loadDescriptiveOverview.and.callFake((_codes: string[], preprocessingArg?: unknown) => {
            if (!preprocessingArg) {
                return of({ result: { featurewise: [] } });
            }
            return of({
                result: {
                    featurewise: [
                        {
                            dataset: 'all datasets',
                            variable: 'age',
                            data: {
                                num_dtps: 10,
                                num_na: 0,
                                num_total: 10,
                                mean: 71,
                            },
                        },
                    ],
                },
            });
        });

        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(['age'], preprocessing);
        expect(component.processedSummary.data.length).toBe(1);
        expect(component.processedSummary.data[0].name).toBe('Age');
    });

    it('scrolls to the transformation section when that sub-tab is selected', (done) => {
        configureRawSummary();
        const scrollSpy = spyOn(Element.prototype, 'scrollIntoView');
        spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
            void Promise.resolve().then(() => callback(0));
            return 0;
        });

        component.goToSection('transformation');
        fixture.detectChanges();

        setTimeout(() => {
            expect(component.sectionOpen().transformation).toBeTrue();
            expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
            done();
        });
    });

    it('hydrates the transformation form from applied categorical_column_creator and keeps it on sync', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const filter = {
            condition: 'AND' as const,
            rules: [{
                id: 'age-gt-65',
                field: 'age',
                type: 'integer' as const,
                input: 'number' as const,
                operator: 'greater',
                value: 65,
            }],
        };
        const transformation = {
            code: 'mrs_good_outcome',
            strategy: 'filter_rules',
            rules: { good: filter },
            default_enumeration: 'unknown',
        };
        const preprocessing = {
            missing_values_handler: {
                strategies: { age: 'drop' },
            },
            categorical_column_creator: [transformation],
        };
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(component.transformationDrafts.length).toBe(1);
        const draft = component.transformationDrafts[0];
        expect(draft.code).toBe('mrs_good_outcome');
        expect(draft.defaultEnumeration).toBe('unknown');
        expect(draft.rules).toEqual([{ value: 'good', filter }]);
        expect(component.transformationStatusLabel).toBe('Applied');
        expect(mockExpService.setTransformationPreprocessing).toHaveBeenCalledWith([transformation]);
    });

    it('hydrates a category rule stored as a bare condition, and keeps it through Apply', () => {
        const clinical = { code: 'clinical_sdr', label: 'Clinical syndrome', type: 'nominal', enumerations: [
            { code: '1', label: 'ACS' },
            { code: '2', label: 'PACS' },
            { code: '4', label: 'POCS' },
        ] };
        // The shape a saved experiment holds: one rule per category, no wrapping group.
        const acs: any = { id: 'clinical_sdr', field: 'clinical_sdr', operator: 'in', value: ['1', '2'], type: 'string' };
        const pcs: any = { id: 'clinical_sdr', field: 'clinical_sdr', operator: 'equal', value: '4', type: 'string' };
        const transformation = {
            code: 'stroke_territory_cohort',
            strategy: 'filter_rules',
            rules: { ACS: acs, PCS: pcs },
            default_enumeration: 'other_or_unknown',
        };
        const preprocessing = { categorical_column_creator: [transformation] };
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        (mockExpService.selectedVariables as any).set([clinical]);
        fixture.detectChanges();

        const draft = component.transformationDrafts[0];
        expect(draft.rules.map((rule) => rule.value)).toEqual(['ACS', 'PCS']);
        expect(draft.rules.map((rule) => rule.filter)).toEqual([acs, pcs]);
        expect(component.transformationDraftStatus(draft).label).toBe('Applied');

        // Apply commits the rendered builders; a rule that loaded must survive untouched.
        const modals: any = new QueryList();
        modals.reset([
            {
                exportFilterLogic: () => ({ condition: 'AND', rules: [{ field: 'clinical_sdr', operator: 'in', value: ['1', '2'] }], valid: true }),
                filterError: () => null,
            },
            {
                exportFilterLogic: () => ({ condition: 'AND', rules: [{ field: 'clinical_sdr', operator: 'equal', value: '4' }], valid: true }),
                filterError: () => null,
            },
        ]);
        component.transformationRuleModals = modals;

        component.applyTransformation();
        expect(draft.rules.map((rule) => (rule.filter as any)?.rules.length)).toEqual([1, 1]);
    });

    it('hydrates every saved categorical creator into its own card', () => {
        const age = { code: 'age', label: 'Age', type: 'real' };
        const filter = {
            condition: 'AND' as const,
            rules: [{
                id: 'age-gt-65',
                field: 'age',
                type: 'integer' as const,
                input: 'number' as const,
                operator: 'greater',
                value: 65,
            }],
        };
        const creators = [
            { code: 'group_a', strategy: 'filter_rules', rules: { a: filter } },
            { code: 'group_b', strategy: 'filter_rules', rules: { b: filter }, default_enumeration: 'other' },
        ];
        const preprocessing = { categorical_column_creator: creators };
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(preprocessing);
        (mockExpService.appliedPreprocessingConfig as any).set(preprocessing);
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        // Both steps hydrate; the last one must not win.
        expect(component.transformationDrafts.map((draft) => draft.code)).toEqual(['group_a', 'group_b']);
        expect(component.transformationDrafts[1].defaultEnumeration).toBe('other');
        expect(component.transformationDraftStatus(component.transformationDrafts[0]).label).toBe('Applied');
        expect(component.transformationDraftStatus(component.transformationDrafts[1]).label).toBe('Applied');

        // Re-persisting the same cards keeps them as an ordered array of two.
        mockExpService.setTransformationPreprocessing.calls.reset();
        component.onTransformationChange();
        expect(mockExpService.setTransformationPreprocessing).toHaveBeenCalledWith([
            { code: 'group_a', strategy: 'filter_rules', rules: { a: filter } },
            { code: 'group_b', strategy: 'filter_rules', rules: { b: filter }, default_enumeration: 'other' },
        ]);
    });

    it('adds and removes extra categorical column cards, keeping at least one', () => {
        // Scoped to the card list: the stage header carries its own Remove Step.
        const cards = () => workflowSection('Transformation').querySelectorAll('.transformation-cards app-station-card');
        const cardActions = () =>
            Array.from(
                workflowSection('Transformation').querySelectorAll('.transformation-cards .btn-remove-step-node')
            ) as HTMLButtonElement[];
        openStation('transformation');
        expect(cards().length).toBe(1);
        // The primary card has no Remove Step: Clear already covers it.
        expect(cardActions().length).toBe(0);

        (workflowSection('Transformation').querySelector('.transformation-cards .btn-add-dashed') as HTMLButtonElement)
            .click();
        fixture.detectChanges();

        expect(component.transformationDrafts.length).toBe(2);
        expect(cards().length).toBe(2);
        // Only the extra card offers Remove Step.
        expect(cardActions().length).toBe(1);
        expect(cardActions()[0].textContent).toContain('Remove Step');

        cardActions()[0].click();
        fixture.detectChanges();

        expect(component.transformationDrafts.length).toBe(1);
        expect(cardActions().length).toBe(0);
    });

    it('clears the primary card instead of removing the last one', () => {
        const draft = component.transformationDrafts[0];
        draft.code = 'group_a';
        draft.rules = [{ value: 'a', filter: { condition: 'AND', rules: [] } }];

        component.removeTransformationDraft(draft.id);

        expect(component.transformationDrafts.length).toBe(1);
        expect(component.transformationDrafts[0].code).toBe('');
        expect(component.transformationDrafts[0].rules).toEqual([]);
    });

    it('applies the transformation without leaving the pipeline', () => {
        const navigate = spyOn(TestBed.inject(ExperimentStudioNavigationService), 'navigateToSection');
        const filter = categoryFilter();
        openStation('transformation');
        const draft = component.transformationDrafts[0];
        draft.code = 'mrs_good_outcome';
        draft.rules = [{ value: 'good', filter }];
        component.transformationRuleModals = {
            toArray: () => [{ exportFilterLogic: () => filter, filterError: () => null }],
        } as any;
        component.transformationActiveTab = 'Statistics';
        expect(component.sectionOpen().transformation).toBeTrue();

        component.applyTransformation();
        fixture.detectChanges();

        expect(mockExpService.setTransformationPreprocessing).toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();

        // A successful Apply folds the stage to its sub-node overview instead of
        // jumping ahead, and the next visit opens the editor, not the preview tab.
        expect(component.sectionOpen().transformation).toBeFalse();
        expect(component.transformationActiveTab).toBe('Create');
        expect(component.transformationDrafts.every((card) => !card.open)).toBeTrue();
        const body = workflowSection('Transformation').querySelector('.workflow-section-body');
        expect(body?.classList.contains('open')).toBeFalse();

        // The terminal card is the only control that advances to Algorithm.
        component.finishDataHandling();
        expect(navigate).toHaveBeenCalledWith('algorithm-section');
    });

    it('leaves the stage open when a stage with no derived column is applied', () => {
        // Collapsing would reveal an empty overview, so an untouched stage stays put.
        openStation('transformation');
        component.transformationRuleModals = { toArray: () => [] } as any;

        component.applyTransformation();

        expect(component.sectionOpen().transformation).toBeTrue();
    });

    it('applies the first card when two derived columns share a name', () => {
        const navigate = spyOn(TestBed.inject(ExperimentStudioNavigationService), 'navigateToSection');
        const filter = categoryFilter();
        openStation('transformation');
        component.addTransformationDraft();
        component.transformationDrafts[0].code = 'group';
        component.transformationDrafts[0].rules = [{ value: 'a', filter }];
        component.transformationDrafts[1].code = 'group';
        component.transformationDrafts[1].rules = [{ value: 'b', filter }];
        component.transformationRuleModals = {
            toArray: () => [
                { exportFilterLogic: () => filter, filterError: () => null },
                { exportFilterLogic: () => filter, filterError: () => null },
            ],
        } as any;
        fixture.detectChanges();

        component.applyTransformation();
        fixture.detectChanges();

        // Apply no longer refuses. The duplicate is named by the card's own chip and by
        // the stage status, and only the first occurrence of a shared code is persisted.
        expect(component.transformationDraftStatus(component.transformationDrafts[1]).label).toBe('Duplicate name');
        expect(component.transformationStatusLabel).toBe('Pending');
        expect(navigate).not.toHaveBeenCalled();
        // Apply no longer refuses, and the stage does not fold over the problem: the two
        // Duplicate name chips are what name it, and they live in the station body.
        expect(component.sectionOpen().transformation).toBeTrue();
        const persisted = mockExpService.setTransformationPreprocessing.calls.mostRecent().args[0];
        expect(persisted).toEqual([jasmine.objectContaining({ code: 'group' })]);
    });

    it('copies live category filters onto rules before preview and apply', () => {
        const filter = categoryFilter('age', 'greater', 65);
        const secondFilter = categoryFilter('sex', 'equal', 1);
        component.addTransformationDraft();
        component.transformationDrafts[0].code = 'mrs_good_outcome';
        component.transformationDrafts[0].rules = [{ value: 'good', filter: null }];
        component.transformationDrafts[1].code = 'mrs_bad_outcome';
        component.transformationDrafts[1].rules = [{ value: 'bad', filter: null }];
        // One modal per rule, flattened in draft order, as the template emits them.
        component.transformationRuleModals = {
            toArray: () => [
                { exportFilterLogic: () => filter, filterError: () => null },
                { exportFilterLogic: () => secondFilter, filterError: () => null },
            ],
        } as any;

        component.commitTransformationRuleFilters();
        expect(component.transformationDrafts[0].rules[0].filter).toBe(filter as any);
        expect(component.transformationDrafts[1].rules[0].filter).toBe(secondFilter as any);
        expect(mockExpService.setTransformationPreprocessing).toHaveBeenCalledWith([
            jasmine.objectContaining({ code: 'mrs_good_outcome' }),
            jasmine.objectContaining({ code: 'mrs_bad_outcome' }),
        ]);
    });

    describe('preprocessing evidence', () => {
        it('prices the selected missing-value action in real rows', () => {
            const { sex } = configureRawSummary();
            component.fetchDescriptiveStatistics();
            fixture.detectChanges();

            const coverage = component.coverageFor(sex);
            expect(coverage?.total).toBe(11);
            expect(coverage?.missing).toBe(1);
            expect(component.coveragePercent(coverage!)).toBe('9.1%');
            // Below coverageSeverity's 10% warning onset, so it is deliberately
            // uncoloured — the rail compares values, and 9.1% is the floor case.
            expect(component.coverageSeverity(coverage!)).toBe('none');

            component.onMissingActionChange(sex, 'drop');
            expect(component.missingActionConsequence(sex)).toBe('Drops up to 1 of 11 rows (9.1%).');
        });

        it('reports category frequencies for a nominal variable only', () => {
            const { age, sex } = configureRawSummary();
            component.fetchDescriptiveStatistics();
            fixture.detectChanges();

            expect(component.categoryCountsFor(sex).map((row) => [row.label, row.value, row.share]))
                .toEqual([['female', '6', 0.6], ['male', '4', 0.4]]);
            // A numeric block's Mean/Std/Min/... rows are metrics, not categories.
            expect(component.categoryCountsFor(age)).toEqual([]);
        });

        it('omits quantiles the payload does not carry instead of rendering N/A', () => {
            const { age } = configureRawSummary();
            component.fetchDescriptiveStatistics();
            fixture.detectChanges();

            expect(component.distributionFor(age)).toEqual([]);
        });

        it('shows no evidence at all before the descriptive stats arrive', () => {
            // Default harness resolves an empty featurewise payload, so there is
            // no block for this variable and the rail must render nothing.
            expect(component.coverageFor({ code: 'age' })).toBeNull();
            expect(component.missingActionConsequence({ code: 'age' })).toBeNull();
            expect(component.distributionFor({ code: 'age' })).toEqual([]);
        });

        it('prices every picker row with that variable\'s own share missing', () => {
            configureRawSummary();
            component.fetchDescriptiveStatistics();
            fixture.detectChanges();

            openStation('setup');
            const rows = Array.from(fixture.nativeElement.querySelectorAll('.preprocessing-variable-btn')) as HTMLElement[];
            const sexRow = rows.find((row) => row.textContent?.includes('Sex'));
            // sex: num_na 1 of num_total 11. age carries num_na 0 -> 0%.
            expect(sexRow?.querySelector('.preprocessing-variable-coverage')?.textContent.trim()).toBe('9.1%');
            // 9.1% is under coverageSeverity's 10% onset, so it is not red.
            expect(sexRow?.querySelector('.preprocessing-variable-coverage')?.getAttribute('data-severity')).not.toBe('high');
        });

        it('states why the evidence pane is empty instead of rendering blank space', () => {
            const age = { code: 'age', label: 'Age', type: 'real' };
            (mockExpService.selectedVariables as any).set([age]);
            mockExpService.loadDescriptiveOverview.and.returnValue(of({ result: { featurewise: [] } }));
            openStation('setup');
            component.selectPrepVariable('missing', age);
            fixture.detectChanges();

            expect(component.coverageFor(age)).toBeNull();
            const note = fixture.nativeElement.querySelector('.preprocessing-evidence .preprocessing-consequence') as HTMLElement;
            expect(note?.textContent?.trim()).toContain('No dataset statistics are available');
        });
    });

    describe('step documentation', () => {
        it('renders prose with one list for every bullet marker', () => {
            mockExpService.backendAlgorithms.set({
                describe: {
                    preprocessing: [
                        {
                            name: 'missing_values_handler',
                            documentation: [
                                'Handles missing values using a selected strategy for each variable.',
                                'Strategies:',
                                '- Drop removes rows with missing values for the variable.',
                                '\u2022 Mean fills missing numerical values with the local mean.',
                                'Fold: the multiple of the IQR used by the winsorizer.',
                            ].join('\n'),
                        },
                    ],
                },
            } as any);

            const html = component.formatPreprocessingDocumentationHtml('missing_values_handler');

            expect(html).toContain(
                '<p class="preprocessing-doc-paragraph preprocessing-doc-intro">Handles missing values using a selected strategy for each variable.</p>'
            );
            expect(html).toContain('<p class="preprocessing-doc-section-title">Strategies:</p>');
            // '-' and '\u2022' are the same list, and a 'Term: description' item keeps its colon
            // because it is read as one line of prose rather than a table row.
            expect(html.match(/<li>/g)).toHaveSize(3);
            expect(html).toContain('<span class="preprocessing-doc-term">Fold:</span>');
            expect(html).toContain(
                '<span class="preprocessing-doc-desc">Mean fills missing numerical values with the local mean.</span>'
            );
        });
    });

    describe('summary number formatting', () => {
        it('keeps pivot values canonical for CSV and groups only at display time', () => {
            const age = { code: 'age', label: 'Age', type: 'real' };
            mockExpService.loadDescriptiveOverview.and.returnValue(of({
                result: {
                    featurewise: [
                        { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 1234.5 } },
                    ],
                },
            }));
            (mockExpService.selectedVariables as any).set([age]);
            component.fetchDescriptiveStatistics();
            fixture.detectChanges();

            // Stored cell value is the same string the CSV export reads: fixed
            // decimals, no locale grouping (1234.5 -> "1234.50", not "1,234.50").
            const meanRow = component.rawSummary.data
                .find((block) => block.code === 'age')
                ?.rows.find((row) => row.metric === 'Mean');
            expect(meanRow?.values['all datasets']).toBe('1234.50');

            const csvSpy = spyOn(TestBed.inject(CsvExportService), 'exportToCsv');
            component.exportSummaryToCSV('raw');
            expect(csvSpy).toHaveBeenCalledWith(
                jasmine.arrayContaining([jasmine.objectContaining({ Metric: 'Mean', Dataset: 'All datasets', Value: '1234.50' })]),
                ['Variable', 'Metric', 'Dataset', 'Value'],
                'raw_data_summary.csv',
            );

            // Grouping happens only on the way to the table, parsed from the canonical string.
            expect(component.displayNumber('1234.50'))
                .toBe((1234.5).toLocaleString(undefined, { maximumFractionDigits: 2 }));
            expect(component.displayNumber('1234.50')).not.toBe('1234.50');
        });

    describe('summary tabs', () => {
        it('switches tabs directly without toggle-off gymnastics', () => {
            configureRawSummary();

            component.setSummaryTab('raw', 'Charts');
            expect(component.rawSummary.activeTab).toBe('Charts');

            // Re-clicking the same tab keeps it active; it does not fall back to Statistics.
            component.setSummaryTab('raw', 'Charts');
            expect(component.rawSummary.activeTab).toBe('Charts');

            component.setSummaryTab('raw', 'Statistics');
            expect(component.rawSummary.activeTab).toBe('Statistics');
        });

        it('renders an explicit Table tab in the raw summary workspace', () => {
            configureRawSummary();
            // The raw summary now lives inside the Filtering node, so it only
            // renders once that step is added.
            component.addStep('filters');
            fixture.detectChanges();
            const rawSection = workflowSection('Raw Data Summary');
            const tabs = Array.from(rawSection.querySelectorAll('.summary-tabs button')) as HTMLButtonElement[];
            expect(tabs.map((b) => b.textContent?.trim())).toEqual(['Table', 'Charts', 'Histogram']);
            // Default tab is Statistics (Table).
            expect(tabs[0].classList.contains('active')).toBeTrue();
        });

        /**
         * The switch only swaps the results pane, so the pane owns it. Rendered above the
         * card it sat over the variable rail and read as a toolbar for the whole surface.
         * The column wrapper is also what keeps it out of the pane's scroll area.
         */
        it('renders the overlay switch inside the results pane it controls', () => {
            configureRawSummary();
            component.addStep('filters');
            fixture.detectChanges();

            const rawSection = workflowSection('Raw Data Summary');
            const column = rawSection.querySelector('.summary-detail-column') as HTMLElement;
            const tabs = column.querySelector('.summary-tabs') as HTMLElement;
            const panel = column.querySelector('.statistics-panel') as HTMLElement;

            expect(tabs).toBeTruthy();
            expect(panel).toBeTruthy();
            expect(tabs.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            // The rail lists variables, which the switch does not affect.
            expect(rawSection.querySelector('.statistics-browser .summary-tabs')).toBeNull();
        });

        /**
         * A numerical histogram is a live federated run, not part of the summary payload.
         * The wait has to say so, otherwise a couple of shimmer lines in a pane that
         * reserves a full chart height reads as a surface that stopped responding.
         */
        it('names the federated run while a numerical histogram loads', () => {
            configureRawSummary();
            component.addStep('filters');
            fixture.detectChanges();

            // Held open: this is the window the user actually stares at.
            const pending = new Subject<any>();
            mockExpService.getAlgorithmResults.and.returnValue(pending.asObservable());
            component.setSummaryTab('raw', 'Histogram');
            fixture.detectChanges();

            const rawSection = workflowSection('Raw Data Summary');
            expect(mockExpService.getAlgorithmResults).toHaveBeenCalled();
            expect(rawSection.textContent).toContain('Calculated on');
            expect(rawSection.textContent).toContain('dataset node');
            expect(rawSection.querySelector('.studio-skeleton-chart')).toBeTruthy();
            expect(rawSection.querySelector('app-histogram')).toBeNull();

            pending.complete();
        });
    });

    describe('raw summary fetch', () => {
        /**
         * Raw is described with a null preprocessing config, so an Apply cannot move its
         * numbers. It used to share the selection key with the processed summary and paid
         * a second full federated describe on every apply.
         */
        it('does not refetch the raw summary when only the applied preprocessing changes', () => {
            configureRawSummary();
            const before = component.rawSummary;
            mockExpService.loadDescriptiveOverview.calls.reset();

            (mockExpService.appliedPreprocessingConfig as any).set({ missing_values_handler: { age: 'mean' } });
            fixture.detectChanges();

            expect(component.rawSummary).toBe(before);
            const rawRuns = mockExpService.loadDescriptiveOverview.calls.allArgs().filter((args) => args[1] === null);
            expect(rawRuns.length).toBe(0);
        });

        /**
         * Adding variables in quick succession starts overlapping describes. Without a
         * sequence guard the slowest response wins, so the card can show a stale cohort.
         */
        it('drops a raw describe response that a newer run already superseded', () => {
            configureRawSummary();
            component.addStep('filters');
            fixture.detectChanges();

            const describePayload = (mean: number) => ({
                result: {
                    featurewise: [
                        { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean } },
                    ],
                },
            });

            const stale = new Subject<any>();
            mockExpService.loadDescriptiveOverview.and.returnValue(stale.asObservable());
            component.fetchDescriptiveStatistics();

            const current = new Subject<any>();
            mockExpService.loadDescriptiveOverview.and.returnValue(current.asObservable());
            component.fetchDescriptiveStatistics();

            current.next(describePayload(71));
            stale.next(describePayload(99));
            fixture.detectChanges();

            const table = workflowSection('Raw Data Summary').querySelector('.statistics-table');
            expect(table?.textContent).toContain('71');
            expect(table?.textContent).not.toContain('99');

            stale.complete();
            current.complete();
        });
    });

    describe('unapplied-changes guard at the pipeline terminal', () => {
        it('advances straight to algorithm selection when nothing is pending', () => {
            const navigate = spyOn(TestBed.inject(ExperimentStudioNavigationService), 'navigateToSection');
            configureRawSummary();

            component.finishDataHandling();

            expect(component.showUnappliedChangesWarning()).toBeFalse();
            expect(navigate).toHaveBeenCalledWith('algorithm-section');
        });

        it('asks what to do with unapplied changes instead of advancing', () => {
            const navigate = spyOn(TestBed.inject(ExperimentStudioNavigationService), 'navigateToSection');
            const { age } = configureRawSummary();
            component.onMissingActionChange(age, 'mean');
            expect(component.pendingChangeCount).toBeGreaterThan(0);

            component.finishDataHandling();
            fixture.detectChanges();

            expect(navigate).not.toHaveBeenCalled();
            expect(component.showUnappliedChangesWarning()).toBeTrue();
            const card = fixture.nativeElement.querySelector('.unapplied-warning-card');
            expect(card?.textContent).toContain('You have unapplied changes');
        });

        it('stays in the pipeline when the warning is dismissed', () => {
            const navigate = spyOn(TestBed.inject(ExperimentStudioNavigationService), 'navigateToSection');
            const { age } = configureRawSummary();
            component.onMissingActionChange(age, 'mean');
            component.finishDataHandling();
            fixture.detectChanges();
            expect(component.showUnappliedChangesWarning()).toBeTrue();

            (fixture.nativeElement.querySelector('.unapplied-warning-btn.ghost') as HTMLButtonElement).click();
            fixture.detectChanges();

            expect(component.showUnappliedChangesWarning()).toBeFalse();
            expect(navigate).not.toHaveBeenCalled();
            expect(component.pendingChangeCount).toBeGreaterThan(0);
        });

        it('discards pending changes and continues', () => {
            const navigate = spyOn(TestBed.inject(ExperimentStudioNavigationService), 'navigateToSection');
            const { age } = configureRawSummary();
            component.onMissingActionChange(age, 'mean');
            expect(component.pendingChangeCount).toBeGreaterThan(0);

            component.discardAndContinue();
            fixture.detectChanges();

            expect(component.showUnappliedChangesWarning()).toBeFalse();
            expect(component.pendingChangeCount).toBe(0);
            expect(component.pendingPreprocessingRules['age']?.action).toBe('drop');
            expect(navigate).toHaveBeenCalledWith('algorithm-section');
        });

        it('applies pending changes and continues once the describe lands', (done) => {
            const navigate = spyOn(TestBed.inject(ExperimentStudioNavigationService), 'navigateToSection');
            const { age } = configureRawSummary();
            const response$ = new Subject<unknown>();
            spyOn(Element.prototype, 'scrollIntoView');
            spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
                void Promise.resolve().then(() => callback(0));
                return 0;
            });
            mockExpService.loadDescriptiveOverview.and.returnValue(response$.asObservable());

            component.onMissingActionChange(age, 'mean');
            component.applyAndContinue();

            expect(component.showUnappliedChangesWarning()).toBeFalse();
            expect(navigate).not.toHaveBeenCalled();

            setTimeout(() => {
                response$.next({
                    result: {
                        featurewise: [
                            { dataset: 'all datasets', variable: 'age', data: { num_dtps: 10, num_na: 0, num_total: 10, mean: 71 } },
                        ],
                    },
                });
                response$.complete();
                fixture.detectChanges();

                expect(component.pendingChangeCount).toBe(0);
                expect(navigate).toHaveBeenCalledWith('algorithm-section');
                done();
            }, 0);
        });
    });

    describe('batch preprocessing actions', () => {
        it('applies a batch mean strategy to every numerical variable only', () => {
            const age = { code: 'age', label: 'Age', type: 'real' };
            const glucose = { code: 'glucose', label: 'Glucose', type: 'real' };
            const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
            (mockExpService.selectedVariables as any).set([age, glucose, sex]);
            fixture.detectChanges();

            component.applyBatchMissingStrategy('mean');

            expect(component.pendingPreprocessingRules['age']?.action).toBe('mean');
            expect(component.pendingPreprocessingRules['glucose']?.action).toBe('mean');
            // sex keeps the implicit NA-removal default; the batch only touched numerical.
            expect(component.pendingPreprocessingRules['sex']?.action).toBe('drop');
            expect(component.pendingChangeCount).toBeGreaterThan(0);
        });

        it('resets every variable to drop via batch action', () => {
            const age = { code: 'age', label: 'Age', type: 'real' };
            const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
            (mockExpService.selectedVariables as any).set([age, sex]);
            fixture.detectChanges();

            // Move age off its default so the reset is observable.
            component.onMissingActionChange(age, 'mean');
            expect(component.pendingPreprocessingRules['age']?.action).toBe('mean');

            component.applyBatchMissingStrategy('drop');

            expect(component.pendingPreprocessingRules['age']?.action).toBe('drop');
            expect(component.pendingPreprocessingRules['sex']?.action).toBe('drop');
            // Both back at the implicit default: nothing pending.
            expect(component.pendingChangeCount).toBe(0);
        });

        it('enables the outlier winsorizer for all eligible variables via batch action', () => {
            const age = { code: 'age', label: 'Age', type: 'real' };
            const sex = { code: 'sex', label: 'Sex', type: 'nominal' };
            (mockExpService.selectedVariables as any).set([age, sex]);
            fixture.detectChanges();

            component.toggleAllOutliers(true);

            expect(component.pendingOutlierRules['age']?.enabled).toBeTrue();
            expect(component.pendingOutlierRules['sex']).toBeUndefined();
        });
    });

    describe('cohort retention strip', () => {
        it('shows the retention strip only when both raw and processed summaries are loaded', (done) => {
            const { age } = configureRawSummary();
            // Before any preprocessing is applied, the processed summary is empty.
            expect(fixture.nativeElement.querySelector('.cohort-retention-strip')).toBeNull();

            const response$ = new Subject<unknown>();
            spyOn(Element.prototype, 'scrollIntoView');
            spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback): number => {
                void Promise.resolve().then(() => callback(0));
                return 0;
            });
            mockExpService.loadDescriptiveOverview.and.returnValue(response$.asObservable());

            component.onMissingActionChange(age, 'mean');
            component.applyPreprocessing();

            setTimeout(() => {
                response$.next({
                    result: {
                        featurewise: [
                            { dataset: 'all datasets', variable: 'age', data: { num_dtps: 8, num_na: 0, num_total: 8, mean: 71 } },
                        ],
                    },
                });
                response$.complete();
                fixture.detectChanges();

                const strip = fixture.nativeElement.querySelector('.cohort-retention-strip');
                expect(strip).not.toBeNull();
                expect(strip.textContent).toContain('8 / 10');
                expect(strip.textContent).toContain('2 rows removed by preprocessing');
                done();
            }, 0);
        });
    });

    });

    describe('Data Handling preview contracts', () => {
        /** Stand-in for a category-rule QueryBuilder, as the template hands them over. */
        function ruleModal(filter: any, error: string | null = null) {
            return {
                exportFilterLogic: () => filter,
                filterError: () => error,
            };
        }

        /** Stand-in for the cohort builder: exports what the editor holds, unapplied. */
        function cohortModal(filter: any, error: string | null = null) {
            return { exportFilterLogic: () => filter, filterError: () => error };
        }

        function stationButton(stage: string, selector: string): HTMLButtonElement {
            return workflowSection(stage).querySelector(selector) as HTMLButtonElement;
        }

        it('plots the step 0 histogram with the default drop and no cohort filter', () => {
            const dose = { code: 'dose', label: 'Dose', type: 'real' };
            mockExpService.loadDescriptiveOverview.and.returnValue(of({
                result: {
                    featurewise: [
                        { dataset: 'all datasets', variable: 'dose', data: { num_dtps: 100, num_na: 5, num_total: 105, mean: 12.5 } },
                    ],
                },
            }));
            mockExpService.getAlgorithmResults.and.returnValue(of({
                result: { histogram: [{ var: 'dose', bins: [0, 5, 10, 15], counts: [10, 40, 50] }] },
            }));
            (mockExpService.filterLogic as any).set({
                condition: 'AND',
                rules: [{ field: 'site', operator: 'equal', value: 'A' }],
            });
            (mockExpService.selectedVariables as any).set([dose]);
            fixture.detectChanges();

            component.toggleSourcePreview();
            fixture.detectChanges();
            mockExpService.getAlgorithmResults.calls.reset();
            component.setSummaryTab('source', 'Histogram');
            fixture.detectChanges();

            expect(mockExpService.getAlgorithmResults).toHaveBeenCalledWith(
                'histogram',
                ['dose'],
                null,
                // Step 0 stays free of preprocessing: only the drop the histogram needs.
                { missing_values_handler: { strategies: { dose: 'drop' } } },
                // A null override is the snapshot: the selection, not the filtered cohort.
                null
            );
        });

        it('previews the cohort with the pending rules and never applies them', () => {
            configureRawSummary();
            component.goToSection('filters');
            fixture.detectChanges();
            const pending = categoryFilter();
            mockExpService.loadDescriptiveOverview.calls.reset();

            component.previewFilterData(cohortModal(pending) as any);
            fixture.detectChanges();

            expect(component.sectionOpen().raw).toBeTrue();
            expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(
                ['age', 'sex'],
                null,
                null,
                pending
            );
            // Apply (`saveFilters`) stays the only path that writes the cohort.
            expect(mockExpService.setFilterLogic).not.toHaveBeenCalled();
            expect(mockExpService.filterLogic()).toBeNull();

            // The pending filter is part of the cache key, so the same rules are free.
            mockExpService.loadDescriptiveOverview.calls.reset();
            component.previewFilterData(cohortModal(pending) as any);
            fixture.detectChanges();
            expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();
        });

        it('keeps the Filtering editor open when the pending rules are invalid', () => {
            configureRawSummary();
            component.goToSection('filters');
            fixture.detectChanges();
            mockExpService.loadDescriptiveOverview.calls.reset();

            component.previewFilterData(cohortModal(null, 'A filter value is required') as any);
            fixture.detectChanges();

            expect(component.sectionOpen().filters).toBeTrue();
            expect(component.sectionOpen().raw).toBeFalse();
            expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();
        });

        it('keeps the pending cohort preview when the stored filter changes underneath it', () => {
            configureRawSummary();
            const pending = categoryFilter();
            component.previewFilterData(cohortModal(pending) as any);
            fixture.detectChanges();
            mockExpService.loadDescriptiveOverview.calls.reset();

            // The stored cohort moves underneath the preview. Falling back to it would swap
            // the cohort the user asked to see for an older one, so the pinned rules keep the
            // surface — and the numbers it already holds need no second describe.
            const stored = { condition: 'AND', rules: [{ field: 'sex', operator: 'equal', value: 'female' }] } as any;
            (mockExpService.filterLogic as any).set(stored);
            fixture.detectChanges();

            const cohorts = mockExpService.loadDescriptiveOverview.calls.allArgs().map((args) => args[3]);
            expect(cohorts).not.toContain(stored);
        });

        it('previews the complete cards and drops the unfinished ones', () => {
            const filter = categoryFilter();
            openStation('transformation');
            component.addTransformationDraft();
            component.addTransformationDraft();
            component.addTransformationDraft();
            const [first, second, unfiltered, nameless] = component.transformationDrafts;
            first.code = 'group_a';
            first.rules = [{ value: 'a', filter }];
            second.code = 'group_b';
            second.rules = [{ value: 'b', filter }];
            unfiltered.code = 'other';
            unfiltered.rules = [{ value: 'c', filter: null }];
            nameless.defaultEnumeration = 'unknown';
            component.transformationRuleModals = {
                toArray: () => [ruleModal(filter), ruleModal(filter), ruleModal(null)],
            } as any;
            mockExpService.loadDescriptiveOverview.and.returnValue(of({
                result: {
                    featurewise: [
                        { dataset: 'all datasets', variable: 'group_a', data: { counts: { a: 3 } } },
                        { dataset: 'all datasets', variable: 'group_b', data: { counts: { b: 4 } } },
                    ],
                },
            }));
            fixture.detectChanges();

            // The stage keeps no fix-list and no red row, and never dims the pair: the
            // Pending chips on the two unfinished cards are the whole warning.
            const transformation = workflowSection('Transformation');
            expect(transformation.querySelector('.row-error')).toBeNull();
            expect(transformation.querySelector('.glass-feedback-warning')).toBeNull();
            expect(stationButton('Transformation', '.station-action-preview').disabled).toBeFalse();
            expect(stationButton('Transformation', '.station-action-apply').disabled).toBeFalse();
            expect(component.transformationDraftStatus(unfiltered).label).toBe('Pending');
            expect(component.transformationStatusLabel).toBe('Pending');

            mockExpService.loadDescriptiveOverview.calls.reset();
            component.previewTransformationData();
            fixture.detectChanges();

            // An incomplete card simply drops out of the describe; the complete ones
            // still get their counts.
            expect(component.transformationActiveTab).toBe('Statistics');
            expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledTimes(1);
            expect(component.transformationStatistics).toEqual([
                { code: 'group_a', rows: [{ value: 'a', count: 3 }] },
                { code: 'group_b', rows: [{ value: 'b', count: 4 }] },
            ]);
        });

        it('previews while a category builder rejects its condition', () => {
            openStation('transformation');
            const draft = component.transformationDrafts[0];
            draft.code = 'group_a';
            draft.rules = [{ value: 'a', filter: null }];
            component.transformationRuleModals = {
                toArray: () => [ruleModal(null, 'A filter value is required')],
            } as any;
            fixture.detectChanges();
            expect(stationButton('Transformation', '.station-action-preview').disabled).toBeFalse();
            mockExpService.loadDescriptiveOverview.calls.reset();

            component.previewTransformationData();
            fixture.detectChanges();

            // A half-typed condition no longer strands the stage on Create. It does keep
            // its previous filter rather than committing an empty one, and the Statistics
            // tab says why the table has no counts.
            expect(component.transformationActiveTab).toBe('Statistics');
            expect(draft.rules[0].filter).toBeNull();
            expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();
            expect(component.transformationStatisticsError)
                .toBe('Each derived column needs a filter on each one before counts can be loaded.');
        });

        it('explains a named card instead of claiming counts that never ran', () => {
            openStation('transformation');
            component.transformationDrafts[0].code = 'pro';
            component.transformationRuleModals = { toArray: () => [] } as any;
            fixture.detectChanges();
            mockExpService.loadDescriptiveOverview.calls.reset();

            component.previewTransformationData();
            fixture.detectChanges();

            // A bare column name owns a heading above this table, so it has to own a reason
            // too. Before, it rendered dashes under "counts from a describe run" — a describe
            // that never happened.
            expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();
            expect(component.transformationStatistics.map((block) => block.code)).toEqual(['pro']);
            const statistics = workflowSection('Transformation').querySelector('.transformation-statistics');
            expect(statistics?.querySelector('.glass-feedback-warning')?.textContent?.trim())
                .toBe('Each derived column needs a named category before counts can be loaded.');
            expect(statistics?.textContent).not.toContain('Category counts from a describe run');
        });

        it('names every gap when no card can be described', () => {
            openStation('transformation');
            component.addTransformationDraft();
            const [unfiltered, nameless] = component.transformationDrafts;
            unfiltered.code = 'group_a';
            unfiltered.rules = [{ value: 'a', filter: null }];
            nameless.code = 'group_b';
            component.transformationRuleModals = { toArray: () => [ruleModal(null), ruleModal(null)] } as any;
            fixture.detectChanges();

            component.previewTransformationData();

            // One line for the whole stage, covering each card's own shortcoming.
            expect(component.transformationStatisticsError).toBe(
                'Each derived column needs a named category and a filter on each one before counts can be loaded.'
            );
        });

        it('dims Apply only while no card can form a column', () => {
            openStation('transformation');
            const draft = component.transformationDrafts[0];
            draft.code = 'pro';
            component.transformationRuleModals = { toArray: () => [] } as any;
            component.onTransformationInput();
            fixture.detectChanges();

            // Apply has nothing to write, so it stays dim instead of answering the click with
            // silence. Preview stays live: the read is what names the gap.
            expect(stationButton('Transformation', '.station-action-apply').disabled).toBeTrue();
            expect(stationButton('Transformation', '.station-action-preview').disabled).toBeFalse();

            const filter = categoryFilter();
            draft.rules = [{ value: 'old', filter }];
            component.transformationRuleModals = { toArray: () => [ruleModal(filter)] } as any;
            component.onTransformationInput();
            fixture.detectChanges();

            expect(stationButton('Transformation', '.station-action-apply').disabled).toBeFalse();
        });

        it('keeps the stage open after Apply while a card is unfinished', () => {
            const filter = categoryFilter();
            openStation('transformation');
            component.addTransformationDraft();
            const [complete, unfinished] = component.transformationDrafts;
            complete.code = 'group_a';
            complete.rules = [{ value: 'a', filter }];
            unfinished.code = 'group_b';
            unfinished.rules = [{ value: 'b', filter: null }];
            component.transformationRuleModals = {
                toArray: () => [ruleModal(filter), ruleModal(null)],
            } as any;
            fixture.detectChanges();

            component.applyTransformation();
            fixture.detectChanges();

            // The complete card is committed. The stage does not fold over the card whose
            // Pending chip is the only thing left saying that work remains.
            expect(component.transformationStatusLabel).toBe('Pending');
            expect(component.sectionOpen().transformation).toBeTrue();
            const body = workflowSection('Transformation').querySelector('.workflow-section-body');
            expect(body?.classList.contains('open')).toBeTrue();
            expect(mockExpService.setTransformationPreprocessing.calls.mostRecent().args[0])
                .toEqual([jasmine.objectContaining({ code: 'group_a' })]);
        });

        it('loads category counts once every started card is complete', () => {
            const filter = categoryFilter();
            openStation('transformation');
            const draft = component.transformationDrafts[0];
            draft.code = 'group_a';
            draft.rules = [{ value: 'a', filter }];
            component.transformationRuleModals = { toArray: () => [ruleModal(filter)] } as any;
            mockExpService.loadDescriptiveOverview.and.returnValue(of({
                result: {
                    featurewise: [
                        { dataset: 'all datasets', variable: 'group_a', data: { counts: { a: 7 } } },
                    ],
                },
            }));
            fixture.detectChanges();
            mockExpService.loadDescriptiveOverview.calls.reset();

            component.previewTransformationData();
            fixture.detectChanges();

            expect(component.transformationActiveTab).toBe('Statistics');
            expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(
                ['group_a'],
                jasmine.objectContaining({
                    categorical_column_creator: [jasmine.objectContaining({ code: 'group_a' })],
                }),
                ['age']
            );
            expect(component.transformationStatistics).toEqual([
                { code: 'group_a', rows: [{ value: 'a', count: 7 }] },
            ]);
        });
    });
});
