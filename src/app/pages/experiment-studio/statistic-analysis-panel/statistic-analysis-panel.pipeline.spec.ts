import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';
import { StatisticAnalysisPanelComponent } from './statistic-analysis-panel.component';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ChartBuilderService } from '../visualisations/charts/chart-builder.service';
import { PdfExportService } from '../../../services/pdf-export.service';

/**
 * Contract: a pipeline node is "active" only when the stage's work is either
 * opened this visit or present in the persisted request config. Opening a
 * stage must never write that config.
 */
describe('StatisticAnalysisPanelComponent pipeline presence', () => {
    let component: StatisticAnalysisPanelComponent;
    let fixture: ComponentFixture<StatisticAnalysisPanelComponent>;
    let mockExpService: jasmine.SpyObj<ExperimentStudioService>;

    const age = { code: 'age', label: 'Age', type: 'real' };

    /** Round-trips the applied config the way the real service does. */
    function seedAppliedConfig(config: Record<string, unknown> | null): void {
        (mockExpService.appliedPreprocessingConfig as any).set(config);
        mockExpService.getAppliedDescriptivePreprocessing.and.returnValue(config as never);
    }

    /** A stage card of the pipeline canvas, as rendered. */
    function pipelineCard(stage: 'analysis-preprocessing' | 'analysis-transformation'): HTMLElement {
        return (fixture.nativeElement as HTMLElement).querySelector(`[data-guide="${stage}"]`) as HTMLElement;
    }

    /** The collapsed rail rows, split into what runs and what the rail offers to add. */
    function railRows(card: HTMLElement): { live: HTMLElement[]; ghost: HTMLElement[] } {
        const rows = Array.from(card.querySelectorAll('.pipeline-subnode-item')) as HTMLElement[];
        return {
            live: rows.filter((row) => !row.classList.contains('is-ghost')),
            ghost: rows.filter((row) => row.classList.contains('is-ghost')),
        };
    }

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
            selectedDataModel: signal({ code: 'Stroke', version: '3.7' }),
            filterLogic: signal(null),
            editingExistingExperiment: () => false,
            appliedPreprocessingConfig: signal<Record<string, unknown> | null>(null),
            backendAlgorithms: signal({})
        });
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
        mockExpService.setAppliedDescriptivePreprocessing.and.callFake((config: unknown) =>
            seedAppliedConfig(config as Record<string, unknown> | null));
        mockExpService.setTransformationPreprocessing.and.callFake((config: unknown) => {
            const next: Record<string, unknown> = { ...(mockExpService.appliedPreprocessingConfig() ?? {}) };
            if (config) next['categorical_column_creator'] = config;
            else delete next['categorical_column_creator'];
            seedAppliedConfig(Object.keys(next).length ? next : null);
        });

        await TestBed.configureTestingModule({
            imports: [StatisticAnalysisPanelComponent],
            providers: [
                provideZonelessChangeDetection(),
                provideEchartsCore({ echarts: () => import('echarts') }),
                { provide: ExperimentStudioService, useValue: mockExpService },
                { provide: ChartBuilderService, useValue: (() => { const s = jasmine.createSpyObj('ChartBuilderService', ['getChartsForAlgorithm']); s.getChartsForAlgorithm.and.returnValue([]); return s; })() },
                { provide: PdfExportService, useValue: jasmine.createSpyObj('PdfExportService', ['exportDescriptiveStatisticsPdf']) }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(StatisticAnalysisPanelComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('marks Filtering active from persisted filter rules, without opening it', () => {
        const logic: any = { condition: 'AND', rules: [{ field: 'age', operator: '>', value: 40 }] };
        (mockExpService.filterLogic as any).set(logic);
        fixture.detectChanges();

        expect(component.isStepAdded('filters')).toBeTrue();
        expect(component.activeStagesCount).toBe(1);
        expect(mockExpService.filterLogic()).toBe(logic);
        expect(mockExpService.setFilterLogic).not.toHaveBeenCalled();
    });

    it('marks Preprocessing active from a persisted applied config', () => {
        seedAppliedConfig({ missing_values_handler: { strategies: { age: 'drop' } } });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(component.isStepAdded('setup')).toBeTrue();
        expect(component.activeStagesCount).toBe(1);
    });

    it('counts transformation-only work as Transformation, not Preprocessing', () => {
        seedAppliedConfig({
            categorical_column_creator: [{
                code: 'group',
                strategy: 'filter_rules',
                rules: { mild: { field: 'age', operator: '<', value: 50 } },
            }],
        });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(component.isStepAdded('transformation')).toBeTrue();
        expect(component.isStepAdded('setup')).toBeFalse();
    });

    it('does not persist when Preprocessing is opened', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        mockExpService.setAppliedDescriptivePreprocessing.calls.reset();
        mockExpService.setTransformationPreprocessing.calls.reset();
        component.addStep('setup');
        component.goToSection('setup');
        fixture.detectChanges();

        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        expect(mockExpService.setTransformationPreprocessing).not.toHaveBeenCalled();
        expect((component as any).userPreprocessingApplied).toBe(false);
    });

    it('persists on Apply and clears the persisted config on Remove', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.onMissingActionChange(age, 'mean');
        component.applyPreprocessing();

        expect(mockExpService.setAppliedDescriptivePreprocessing).toHaveBeenCalledWith(
            jasmine.objectContaining({ missing_values_handler: { strategies: { age: 'mean' } } }),
        );
        expect(component.isStepAdded('setup')).toBeTrue();

        mockExpService.setAppliedDescriptivePreprocessing.calls.reset();
        component.removeStep('setup');

        expect(mockExpService.setAppliedDescriptivePreprocessing).toHaveBeenCalledWith(null);
        expect(component.isStepAdded('setup')).toBeFalse();
    });

    it('shows the default NA-removal sub-node before any customization', () => {
        const nodes = component.appliedPreprocessingSubNodes;

        expect(nodes.length).toBe(1);
        expect(nodes[0].id).toBe('missing');
        expect(nodes[0].statusLabel).toBe('Default');
        expect(component.appliedPreprocessingCount).toBe(0);
        expect(component.appliedTransformationSubNodes).toEqual([]);
    });

    /**
     * Default NaN removal is in the request from the first render, so the stage is drawn like
     * an added node whose rail says Default. The dashed card is reserved for stages that will
     * contribute nothing to the next run, so calling this one dormant would be a lie.
     */
    it('draws the untouched stage as a solid node tagged Default', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();
        mockExpService.setAppliedDescriptivePreprocessing.calls.reset();

        const preprocessing = pipelineCard('analysis-preprocessing');
        expect(preprocessing.classList.contains('is-dormant')).toBeFalse();
        expect(preprocessing.querySelector('.pipeline-node-header h3')?.textContent?.trim()).toBe('2. Preprocessing');
        expect(preprocessing.querySelector('.pipeline-node-subtitle')?.textContent).toContain('Default NaN removal is already in effect');

        const badge = preprocessing.querySelector('.pipeline-status-badge') as HTMLElement;
        expect(badge.textContent?.trim()).toBe('Default');
        expect(badge.classList.contains('default')).toBeTrue();
        expect(badge.classList.contains('applied')).toBeFalse();

        const rows = railRows(preprocessing);
        expect(rows.live.length).toBe(1);
        expect(rows.live[0].textContent).toContain('Default NaN removal active');
        const chip = rows.live[0].querySelector('.pipeline-subnode-status') as HTMLElement;
        expect(chip.getAttribute('data-tone')).toBe('default');
        expect(chip.textContent?.trim()).toBe('Default');

        // Default is not user work: it is not counted as a configured stage, and rendering
        // the card writes nothing.
        expect(component.activeStagesCount).toBe(0);
        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        expect(mockExpService.appliedPreprocessingConfig()).toBeNull();
    });

    /**
     * The dashed rail row is the whole add flow: it opens the station already narrowed to that
     * sub-step, so a stage never has to be expanded just to reach a control.
     */
    it('adds a preprocessing sub-step from the collapsed rail without writing the request', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        expect(pipelineCard('analysis-preprocessing').querySelector('.pipeline-node-body')).toBeNull();
        const rows = railRows(pipelineCard('analysis-preprocessing'));
        expect(rows.ghost.map((row) => row.textContent?.trim())).toEqual([jasmine.stringMatching('Add outlier clipping')]);

        mockExpService.setAppliedDescriptivePreprocessing.calls.reset();
        (rows.ghost[0].querySelector('button') as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(component.sectionOpen().setup).toBeTrue();
        expect(component.userEnabledOutliers()).toBeTrue();
        expect(component.preprocessingStepOpen.outlier).toBeTrue();
        expect(component.preprocessingStepOpen.missing).toBeFalse();
        expect(pipelineCard('analysis-preprocessing').querySelector('.pipeline-node-body')).toBeTruthy();
        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();
        // Opening the editor is a read, so the outlier row leaves the rail it came from.
        expect(railRows(pipelineCard('analysis-preprocessing')).ghost).toEqual([]);
    });

    /**
     * An opened step that was never configured contributes nothing to the request, so closing
     * it hands the stage back exactly as it was: the rail must keep offering the step, or the
     * one control that creates it is gone until the user finds the editor by another route.
     */
    it('offers the outlier step from the rail again after an untouched step is closed', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        const rail = railRows(pipelineCard('analysis-preprocessing'));
        (rail.ghost[0].querySelector('button') as HTMLButtonElement).click();
        fixture.detectChanges();

        // Nothing was configured, so the station footer's primary slot closes the station.
        expect(component.pendingChangeCount).toBe(0);
        component.commitOrClosePreprocessing();
        fixture.detectChanges();

        expect(component.sectionOpen().setup).toBeFalse();
        expect(mockExpService.appliedPreprocessingConfig()).toBeNull();
        const rows = railRows(pipelineCard('analysis-preprocessing'));
        expect(rows.live.length).toBe(1);
        expect(rows.ghost.map((row) => row.textContent?.trim())).toEqual([jasmine.stringMatching('Add outlier clipping')]);

        // The row is still the whole add flow, and reopens the station on that sub-step.
        (rows.ghost[0].querySelector('button') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(component.sectionOpen().setup).toBeTrue();
        expect(component.preprocessingStepOpen.outlier).toBeTrue();
    });

    it('opens the transformation stage on a blank column from the collapsed rail', () => {
        seedAppliedConfig({
            categorical_column_creator: [{
                code: 'mrs_good_outcome',
                strategy: 'filter_rules',
                rules: { good: { field: 'age', operator: '<', value: 50 } },
            }],
        });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        const rows = railRows(pipelineCard('analysis-transformation'));
        expect(rows.live.map((row) => row.textContent)).toEqual([jasmine.stringMatching('mrs_good_outcome')]);
        expect(rows.ghost.map((row) => row.textContent?.trim())).toEqual([jasmine.stringMatching('Add derived column')]);

        mockExpService.setTransformationPreprocessing.calls.reset();
        (rows.ghost[0].querySelector('button') as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(component.sectionOpen().transformation).toBeTrue();
        const blankCards = () => component.transformationDrafts.filter((draft) => !draft.code.trim() && !draft.rules.length).length;
        expect(blankCards()).toBe(1);

        // The stage keeps the hydrated applied card and one blank editor, so a second
        // rail click reuses the blank card instead of stacking another one.
        component.addTransformationSubNode();
        expect(component.transformationDrafts.length).toBe(2);
        expect(blankCards()).toBe(1);
        expect(mockExpService.setTransformationPreprocessing).not.toHaveBeenCalled();
    });

    it('lists one sub-node per applied preprocessing step with its summary', () => {
        const mmse = { code: 'mmse', label: 'MMSE', type: 'real' };
        (mockExpService.selectedVariables as any).set([age, mmse]);
        seedAppliedConfig({
            missing_values_handler: { strategies: { age: 'mean', mmse: 'median' } },
            outlier_winsorizer: { strategies: { age: 'iqr' }, tails: { age: 'both' }, folds: { age: 1.5 } },
        });
        fixture.detectChanges();

        const nodes = component.appliedPreprocessingSubNodes;
        expect(nodes.map((n) => n.id)).toEqual(['missing', 'outlier']);
        expect(nodes[0].subtitle).toContain('2 variables');
        expect(nodes[1].subtitle).toContain('IQR');
        expect(component.appliedPreprocessingCount).toBe(2);
        expect(component.preprocessingStatusLabel).toBe('2 steps applied ✓');
    });

    it('surfaces the applied derived column as a transformation sub-node', () => {
        seedAppliedConfig({
            categorical_column_creator: [{
                code: 'mrs_good_outcome',
                strategy: 'filter_rules',
                rules: {
                    good: { field: 'age', operator: '<', value: 50 },
                    bad: { field: 'age', operator: '>=', value: 50 },
                },
                default_enumeration: 'unknown',
            }],
        });
        fixture.detectChanges();

        const nodes = component.appliedTransformationSubNodes;
        expect(nodes.length).toBe(1);
        expect(nodes[0].title).toBe('Derived column: mrs_good_outcome');
        expect(nodes[0].subtitle).toContain('2 category rules');
        expect(nodes[0].subtitle).toContain('default: unknown');
        expect(component.appliedTransformationCount).toBe(1);
        expect(component.transformationBadgeLabel).toBe('1 Transformation active');
    });

    it('lists one sub-node per applied derived column and counts them in the badge', () => {
        seedAppliedConfig({
            categorical_column_creator: [
                {
                    code: 'mrs_good_outcome',
                    strategy: 'filter_rules',
                    rules: { good: { field: 'age', operator: '<', value: 50 } },
                },
                {
                    code: 'mrs_bad_outcome',
                    strategy: 'filter_rules',
                    rules: {
                        bad: { field: 'age', operator: '>=', value: 50 },
                        interim: { field: 'age', operator: '=', value: 50 },
                    },
                    default_enumeration: 'unknown',
                },
            ],
        });
        fixture.detectChanges();

        const nodes = component.appliedTransformationSubNodes;
        expect(nodes.length).toBe(2);
        expect(nodes.map((node) => node.title)).toEqual([
            'Derived column: mrs_good_outcome',
            'Derived column: mrs_bad_outcome',
        ]);
        expect(nodes[1].subtitle).toContain('2 category rules');
        expect(component.appliedTransformationCount).toBe(2);
        expect(component.transformationBadgeLabel).toBe('2 Transformations active');
    });

    it('collapses the stage on Apply so every derived column shows in the overview', () => {
        seedAppliedConfig({
            categorical_column_creator: [
                { code: 'mrs_good_outcome', strategy: 'filter_rules', rules: { good: { field: 'age', operator: '<', value: 50 } } },
                { code: 'mrs_bad_outcome', strategy: 'filter_rules', rules: { bad: { field: 'age', operator: '>=', value: 50 } } },
            ],
        });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.addStep('transformation');
        fixture.detectChanges();
        expect(component.sectionOpen().transformation).toBeTrue();

        // Echo the hydrated filters back so committing does not blank them.
        const committed = component.transformationDrafts.flatMap((draft) => draft.rules.map((rule) => rule.filter));
        component.transformationRuleModals = {
            toArray: () => committed.map((filter) => ({ exportFilterLogic: () => filter, filterError: () => null })),
        } as any;

        component.applyTransformation();
        fixture.detectChanges();

        expect(component.sectionOpen().transformation).toBeFalse();
        const overview = Array.from(
            fixture.nativeElement.querySelectorAll('[data-guide="analysis-transformation"] .pipeline-subnode-item')
        ) as HTMLElement[];
        expect(overview.map((item) => item.textContent)).toEqual([
            jasmine.stringMatching('mrs_good_outcome'),
            jasmine.stringMatching('mrs_bad_outcome'),
            jasmine.stringMatching('Add derived column'),
        ]);
    });

    it('expands the stage and opens only the clicked station on sub-node click', () => {
        seedAppliedConfig({ missing_values_handler: { strategies: { age: 'mean' } } });
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.addStep('setup');
        component.preprocessingStepOpen.missing = true;
        component.jumpToSubNode('setup', 'outlier');

        expect(component.sectionOpen().setup).toBeTrue();
        expect(component.preprocessingStepOpen.outlier).toBeTrue();
        expect(component.preprocessingStepOpen.missing).toBeFalse();
        expect(component.preprocessingStepOpen.longitudinal).toBeFalse();

        component.jumpToSubNode('transformation', 'transformation');
        expect(component.sectionOpen().transformation).toBeTrue();
        expect(component.preprocessingStepOpen.transformation).toBeTrue();
    });

    it('opens step 0 as a read that adds no stage and writes no config', () => {
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        mockExpService.setFilterLogic.calls.reset();
        mockExpService.setAppliedDescriptivePreprocessing.calls.reset();
        component.toggleSourcePreview();
        fixture.detectChanges();

        expect(component.sectionOpen().source).toBeTrue();
        expect(component.sectionOpen().filters).toBeFalse();
        expect(component.isStepAdded('filters')).toBeFalse();
        expect(component.activeStagesCount).toBe(0);
        expect(mockExpService.setFilterLogic).not.toHaveBeenCalled();
        expect(mockExpService.setAppliedDescriptivePreprocessing).not.toHaveBeenCalled();

        component.toggleSourcePreview();
        expect(component.sectionOpen().source).toBeFalse();
    });

    it('describes step 0 without the cohort filter and refetches only on a new selection', () => {
        (mockExpService.selectedVariables as any).set([age]);
        (mockExpService.filterLogic as any).set({ condition: 'AND', rules: [{ field: 'age', operator: '>', value: 40 }] });
        fixture.detectChanges();

        mockExpService.loadDescriptiveOverview.calls.reset();
        component.toggleSourcePreview();

        // Filters are dropped from the request: the snapshot is the data as selected.
        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(['age'], null, null, null);

        // Close and reopen: the snapshot still matches the selection, so it is free.
        mockExpService.loadDescriptiveOverview.calls.reset();
        component.toggleSourcePreview();
        component.toggleSourcePreview();
        expect(mockExpService.loadDescriptiveOverview).not.toHaveBeenCalled();

        // A new selection invalidates it, and an open snapshot refreshes at once.
        mockExpService.loadDescriptiveOverview.calls.reset();
        (mockExpService.selectedVariables as any).set([age, { code: 'mmse', label: 'MMSE', type: 'real' }]);
        fixture.detectChanges();
        expect(mockExpService.loadDescriptiveOverview).toHaveBeenCalledWith(['age', 'mmse'], null, null, null);
    });

    it('renders the step 0 snapshot in the shared summary workspace', () => {
        mockExpService.loadDescriptiveOverview.and.returnValue(of({
            result: {
                featurewise: [
                    { dataset: 'dataset-a', variable: 'age', data: { num_dtps: 10, num_na: 2, num_total: 12, mean: 61 } },
                ],
            },
        }));
        (mockExpService.selectedVariables as any).set([age]);
        fixture.detectChanges();

        component.toggleSourcePreview();
        fixture.detectChanges();

        const snapshot = (fixture.nativeElement as HTMLElement).querySelector('[data-guide="analysis-source-summary"]');
        // Same surface as the Raw preview: overlay tabs, variable browser, statistics table.
        expect(snapshot?.querySelectorAll('.summary-tabs button').length).toBe(3);
        expect(snapshot?.querySelector('.statistics-browser')).toBeTruthy();
        expect(snapshot?.querySelector('.statistics-panel h4')?.textContent).toContain('Age');
        expect(snapshot?.querySelector('.statistics-table')?.textContent).toContain('Dataset A');
        expect(snapshot?.querySelector('.statistics-panel-kicker')?.textContent).toContain('Numerical');
        // Step 0 is read-only: no rule editor, and the tour anchors stay on the raw surface.
        expect(snapshot?.querySelector('app-filter-config-modal')).toBeNull();
        expect(snapshot?.querySelector('[data-guide]')).toBeNull();
    });
});
