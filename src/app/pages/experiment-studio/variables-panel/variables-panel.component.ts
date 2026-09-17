import { BubbleChartComponent } from './../visualisations/bubble-chart/bubble-chart.component';
import { ErrorService } from '../../../services/error.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { Component, HostListener, signal, inject, WritableSignal, OnDestroy, ElementRef, ViewChild, effect, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { DataModel } from '../../../models/data-model.interface';
import { DataModelSelectorComponent } from './data-model-selector/data-model-selector.component';
import { DatasetSelectorComponent } from './dataset-selector/dataset-selector.component';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { SelectedVariablesComponent } from './selected-variables/selected-variables.component';
import { HistogramGraphComponent } from './histogram-graph/histogram-graph.component';
import { MetadataInfoPanelComponent } from './metadata-info-panel/metadata-info-panel.component';
import { catchError, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { PdfExportService } from '../../../services/pdf-export.service';
import { CsvExportService } from '../../../services/csv-export.service';
import { ExperimentStudioGuideStateService } from '../guide/experiment-studio-guide-state.service';
import { AlgorithmNames } from '../../../core/constants/algorithm.constants';
import { OntologyTreeBrowserComponent } from '../visualisations/metadata-browser/ontology-tree-browser/ontology-tree-browser.component';
import { CollapsibleTreeBrowserComponent } from '../visualisations/metadata-browser/collapsible-tree-browser/collapsible-tree-browser.component';
import { MetadataBrowserMode, MetadataSearchResult } from '../visualisations/metadata-browser/metadata-browser.model';
import {
  normalizeMetadataTree,
  selectionFromSearchResult,
} from '../visualisations/metadata-browser/metadata-browser-normalizer';
import { countLeafNodes } from '../../../core/data-model.utils';

type DetailsPanelTab = 'histogram' | 'info';

/** Shown when the selected node groups variables only, so there is nothing to census. */
const GROUP_OF_VARIABLES_ONLY_MESSAGE =
  'Please select one of the variables in the representation on the left to see its histogram in the selected centers.';

@Component({
  selector: 'app-variables-panel',
  templateUrl: './variables-panel.component.html',
  styleUrl: './variables-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BubbleChartComponent,
    OntologyTreeBrowserComponent,
    CollapsibleTreeBrowserComponent,
    HistogramGraphComponent,
    MetadataInfoPanelComponent,
    DataModelSelectorComponent,
    DatasetSelectorComponent,
    SearchBarComponent,
    SelectedVariablesComponent,
  ]
})
export class VariablesPanelComponent implements OnDestroy {
  private readonly metadataBrowserModeStorageKey = 'metadata_browser_mode';
  readonly metadataBrowserModes: Array<{
    value: MetadataBrowserMode;
    label: string;
    icon: string;
    title: string;
  }> = [
      {
        value: 'bubble',
        label: 'Map',
        icon: 'fas fa-circle-nodes',
        title: 'Bubble overview of the metadata structure',
      },
      {
        value: 'ontology',
        label: 'List',
        icon: 'fas fa-sitemap',
        title: 'Expandable hierarchy list of groups and variables',
      },
      {
        value: 'collapsible',
        label: 'Graph',
        icon: 'fas fa-project-diagram',
        title: 'Interactive collapsible hierarchy diagram',
      },
    ];

  @ViewChild('histogramExport') histogramExport?: ElementRef<HTMLElement>;
  @ViewChild('searchSection') searchSection?: ElementRef<HTMLElement>;
  @ViewChild('contextSection') contextSection?: ElementRef<HTMLElement>;
  highlightNode: any = null;

  experimentStudioService = inject(ExperimentStudioService);
  pdfExportService = inject(PdfExportService);
  csvExportService = inject(CsvExportService);
  guideState = inject(ExperimentStudioGuideStateService);
  private cdr = inject(ChangeDetectorRef);

  errorService = inject(ErrorService);
  filteredVariables: WritableSignal<any[]> = signal([]);
  filteredGroups: WritableSignal<any[]> = signal([]);
  histogramData = signal<any | null>(null);
  groupHistogramData = signal<{ bins: string[]; counts: number[]; variableName: string } | null>(null);
  histogramVariants = signal<Array<{ key: string; label: string; data: any }>>([]);
  selectedHistogramVariantKey = signal<string | null>(null);
  groupHistogramMeta = signal<{
    pathNodes: Array<{ code: string; label: string }>;
    groupCount: number;
    hasGroups: boolean;
  } | null>(null);
  d3Data: any;
  selectedDataModel = this.experimentStudioService.selectedDataModel;
  selectedNode: any;
  crossSectionalModels: DataModel[] = [];
  longitudinalModels: DataModel[] = [];
  availableDatasets: { code: string; label: string }[] = [];
  error: string | null = null;
  isLoadingHistogram = signal(false);
  errorMessage = signal<string | null>(null);
  emptyChartMessage = signal<string | null>(null);
  isExporting = signal(false);
  exportMenuOpen = signal(false);
  metadataBrowserMode = signal<MetadataBrowserMode>(this.loadMetadataBrowserMode());
  readonly metadataBrowserModeIndex = computed(() => {
    const index = this.metadataBrowserModes.findIndex(
      (mode) => mode.value === this.metadataBrowserMode()
    );
    return index >= 0 ? index : 0;
  });
  contextOpen = signal(false);
  searchExpanded = signal(false);
  readonly selectedDatasetCount = computed(() => (this.experimentStudioService.selectedDatasets() ?? []).length);
  activeDetailsTab = signal<DetailsPanelTab>('histogram');
  private destroy$ = new Subject<void>();
  private histogramRequest$ = new Subject<{ codes: string[]; label?: string; bins?: number | null }>();
  private lastModelKey: string | null = null;

  constructor() {
    this.setupHistogramPipeline();

    effect(() => {
      const model = this.selectedDataModel();
      if (!model) return;
      const key = `${model.code}:${model.version}`;
      if (this.lastModelKey === key) return;
      this.lastModelKey = key;
      this.loadVisualizationData();
      if (this.d3Data) {
        this.onSelectedNodeChange(this.d3Data);
      }
    });
  }


  ngOnInit(): void {
    this.loadDataModels();
  }


  onSearchSelected(result: MetadataSearchResult): void {
    if (!this.d3Data) {
      console.warn('[Search] No data model loaded');
      return;
    }

    const index = normalizeMetadataTree(this.d3Data);
    const selection = selectionFromSearchResult(index, result);
    const node = selection.originalNode;
    this.highlightNode = { ...node, path: result.path };
    this.onSelectedNodeChange(node);
    this.searchExpanded.set(false);
  }

  private findNodeByCode(node: any, code: string): any | null {
    if (!node) return null;
    if (node.code === code) return node;
    for (const child of node.children ?? []) {
      const found = this.findNodeByCode(child, code);
      if (found) return found;
    }
    return null;
  }

  onVariableClicked(variable: any): void {
    if (!variable?.code) {
      console.warn('Invalid variable clicked:', variable);
      return;
    }
    this.highlightNode = variable;
    this.onSelectedNodeChange(variable);
  }

  onBubbleNodeSelected(node: any): void {
    this.onSelectedNodeChange(node);
  }

  onMetadataBrowserNodeSelected(node: any): void {
    this.highlightNode = node;
    this.onSelectedNodeChange(node);
  }

  onNodeDoubleClicked(node: any): void {
    this.onSelectedNodeChange(node);
    this.addVariableFromBubble();
    this.cdr.detectChanges();
  }

  get selectedVariables(): any[] {
    return this.experimentStudioService.selectedVariables();
  }


  setMetadataBrowserMode(mode: MetadataBrowserMode): void {
    this.metadataBrowserMode.set(mode);
    try {
      localStorage.setItem(this.metadataBrowserModeStorageKey, mode);
    } catch {
      // Ignore private-mode or quota failures; the UI can still use the in-memory signal.
    }
  }

  setActiveDetailsTab(tab: DetailsPanelTab): void {
    this.activeDetailsTab.set(tab);
  }

  toggleContext(): void {
    this.contextOpen.update(open => !open);
  }

  get contextChipTitle(): string {
    const label = this.selectedDataModel()?.label;
    if (!label) {
      return 'Select a pathology';
    }
    const count = this.selectedDatasetCount();
    if (count > 0) {
      return `${label} · ${count} dataset${count === 1 ? '' : 's'}`;
    }
    return `${label} · Select datasets`;
  }

  toggleSearch(): void {
    this.searchExpanded.update(expanded => {
      if (!expanded) {
        setTimeout(() => {
          this.searchSection?.nativeElement?.querySelector('input')?.focus();
        }, 0);
      }
      return !expanded;
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClickForContext(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.contextOpen() && this.contextSection && !this.contextSection.nativeElement.contains(target)) {
      this.contextOpen.set(false);
    }
    if (
      this.searchExpanded()
      && this.searchSection
      && !this.searchSection.nativeElement.contains(target)
    ) {
      this.searchExpanded.set(false);
    }
    if (this.exportMenuOpen() && !(target as HTMLElement)?.closest?.('.histogram-export-group')) {
      this.exportMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydownForContext(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.contextOpen.set(false);
      this.searchExpanded.set(false);
      this.exportMenuOpen.set(false);
    }
  }

  get hasSelectedDatasets(): boolean {
    return (this.experimentStudioService.selectedDatasets() || []).length > 0;
  }

  isSelectedNodeInPool(): boolean {
    const targets = this.selectionTargets();
    if (!targets.length) {
      return false;
    }
    const selected = this.experimentStudioService.selectedVariables();
    return targets.every((item) => selected.some((variable) => variable.code === item.code));
  }

  selectionToggleDisabled(): boolean {
    return !this.hasSelectedDatasets || !this.selectedNode;
  }

  selectionToggleLabel(): string {
    return this.isSelectedNodeInPool() ? 'Remove' : 'Add';
  }

  selectionToggleTitle(): string {
    if (!this.hasSelectedDatasets) {
      return 'Select datasets first';
    }
    if (!this.selectedNode) {
      return 'Select a variable or group on the map';
    }
    return this.isSelectedNodeInPool()
      ? 'Remove the selected variable from this experiment'
      : 'Add the selected variable to this experiment';
  }

  toggleSelectedNodeInPool(): void {
    if (this.selectionToggleDisabled()) {
      return;
    }
    const targets = this.selectionTargets();
    if (!targets.length) {
      return;
    }
    if (this.isSelectedNodeInPool()) {
      const removeCodes = new Set(targets.map((item) => item.code));
      this.experimentStudioService.setVariables(
        this.experimentStudioService.selectedVariables().filter((variable) => !removeCodes.has(variable.code))
      );
      return;
    }
    targets.forEach((item) => this.experimentStudioService.addVariableAndEnrich(item));
  }

  addVariableFromBubble(): void {
    if (!this.hasSelectedDatasets || !this.selectedNode) {
      return;
    }
    this.selectionTargets().forEach((item) => this.experimentStudioService.addVariableAndEnrich(item));
  }

  private selectionTargets(): any[] {
    const selectedNode = this.selectedNode;
    if (!selectedNode) {
      return [];
    }
    return selectedNode.children ? this.getLeafNodes(selectedNode) : [selectedNode];
  }

  private getLeafNodes(node: any): any[] {
    const leaves: any[] = [];

    function collectLeaves(n: any) {
      if (!n.children || n.children.length === 0) {
        leaves.push(n);
      } else {
        n.children.forEach(collectLeaves);
      }
    }

    collectLeaves(node);
    return leaves;
  }

  loadDataModels(): void {
    this.experimentStudioService.getAllDataModels()
      .pipe(takeUntil(this.destroy$))
      .subscribe((dataModels) => {
        this.handleDataModelResponse(dataModels);
      });
  }

  handleDataModelResponse(dataModels: DataModel[]): void {
    const { crossSectional, longitudinal } = this.experimentStudioService.categorizeDataModels(dataModels);
    this.crossSectionalModels = crossSectional;
    this.longitudinalModels = longitudinal;

    if (dataModels.length > 0) {
      const current = this.selectedDataModel();
      const models = [...crossSectional, ...longitudinal];
      const next = current
        ? models.find(
          (model) =>
            model.code === current.code
            && String(model.version) === String(current.version)
        ) ?? null
        : null;
      const fallback = this.experimentStudioService.editingExistingExperiment()
        ? null
        : models[0] ?? null;
      this.selectedDataModel.set(next ?? fallback);
      this.experimentStudioService.selectedDataModel.set(this.selectedDataModel() ?? null);
      return;
    }

    this.selectedDataModel.set(null);
    this.experimentStudioService.selectedDataModel.set(null);
    this.availableDatasets = [];
    this.filteredVariables.set([]);
    this.filteredGroups.set([]);
    this.d3Data = null;
    this.selectedNode = null;
    this.activeDetailsTab.set('histogram');
    this.guideState.setSelectedHierarchyNode(null);
    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.groupHistogramMeta.set(null);
    this.activeDetailsTab.set('histogram');
  }

  loadVisualizationData(): void {
    const model = this.selectedDataModel();
    if (!model) return; // exit early

    const { hierarchy, allVariables } =
      this.experimentStudioService.convertToD3Hierarchy(model);

    this.d3Data = hierarchy;
    this.filteredVariables.set(allVariables);
    this.filteredGroups.set(this.d3Data.children.filter((item: any) => item.children));
    // TODO: Refactor dataset sourcing via Exaflow so datasets/labels come from a single canonical source.
    const datasetVariable = allVariables.find(
      (variable: any) => String(variable?.code ?? '').toLowerCase() === 'dataset'
    );
    const datasetEnums = datasetVariable?.enumerations ?? [];
    const datasetSource: any = (model as any).datasets;
    const allowedCodes = new Set<string>(
      Array.isArray(datasetSource)
        ? datasetSource
          .map((item: any) => String(item?.code ?? item ?? ''))
          .filter((code: string) => code)
        : []
    );
    this.availableDatasets = datasetEnums
      .filter((dataset: any) => {
        const code = String(dataset?.code ?? '');
        return allowedCodes.size === 0 || allowedCodes.has(code);
      })
      .map((dataset: any) => ({
        code: String(dataset?.code ?? ''),
        label: String(dataset?.label ?? dataset?.name ?? dataset?.code ?? ''),
      }));
    this.experimentStudioService.availableDatasets.set(this.availableDatasets);
    this.ensureDatasetsSelected();
  }

  /**
   * A new session (or a fresh pathology pick) should land with a working
   * dataset gate, not a lone "0". Auto-select every available dataset unless
   * the user has a valid selection or is opening an existing experiment.
   */
  ensureDatasetsSelected(): void {
    if (this.experimentStudioService.editingExistingExperiment()) {
      return;
    }
    const selected = new Set(this.experimentStudioService.selectedDatasets());
    const hasValidSelection = this.availableDatasets.some((dataset) => selected.has(dataset.code));
    if (hasValidSelection) {
      return;
    }
    this.experimentStudioService.setSelectedDatasets(
      this.availableDatasets.map((dataset) => dataset.code)
    );
  }


  // end of services functions
  onSelectedDataModelChange(selectedDataModel: DataModel | null): void {
    if (!selectedDataModel) return;
    const current = this.selectedDataModel();
    if (
      current
      && current.code === selectedDataModel.code
      && String(current.version) === String(selectedDataModel.version)
    ) {
      return;
    }
    // update service signal
    this.experimentStudioService.selectedDataModel.set(selectedDataModel);

    // clean up selections
    this.experimentStudioService.clearSelectionsForDataModelChange();

    this.filteredVariables.set([]);
    this.filteredGroups.set([]);
    this.histogramData.set(null);
    this.groupHistogramData.set(null);
    this.groupHistogramMeta.set(null);
    this.activeDetailsTab.set('histogram');
    this.searchExpanded.set(false);

    // reload new model data
    this.loadVisualizationData();
  }


  onSelectedNodeChange(node: any): void {
    if (!node) {
      this.selectedNode = null;
      this.guideState.setSelectedHierarchyNode(null);
      this.cdr.detectChanges();
      this.histogramData.set(null);
      this.groupHistogramData.set(null);
      this.histogramVariants.set([]);
      this.selectedHistogramVariantKey.set(null);
      this.groupHistogramMeta.set(null);
      this.isLoadingHistogram.set(false);
      this.errorMessage.set('No variable selected.');
      this.activeDetailsTab.set('histogram');
      return;
    }

    // Guard against redundant clicks on the already selected node
    if (this.selectedNode?.code === node.code && this.selectedNode?.label === node.label) {
      return;
    }

    this.selectedNode = { ...node };
    this.activeDetailsTab.set('histogram');
    this.guideState.setSelectedHierarchyNode(this.selectedNode);
    this.cdr.detectChanges();
    this.clearChartNotices();
    this.histogramData.set(null); // clear previous histogram
    this.groupHistogramData.set(null);
    this.histogramVariants.set([]);
    this.selectedHistogramVariantKey.set(null);
    this.groupHistogramMeta.set(null);
    if (!node) {
      this.isLoadingHistogram.set(false);
      this.errorMessage.set('No variable selected.');
      return;
    }

    if (node.children && node.children.length > 0) {
      const children = Array.isArray(node.children) ? node.children : [];
      const hasGroups = children.some((child: any) => child?.children?.length);
      const items = hasGroups
        ? children.filter((child: any) => child?.children?.length)
        : children;

      if (!items.length) {
        this.isLoadingHistogram.set(false);
        this.errorMessage.set('No groups found for this selection.');
        return;
      }

      const pathNodes = this.getPathNodes(node);
      this.isLoadingHistogram.set(false);
      this.groupHistogramMeta.set({
        pathNodes,
        groupCount: items.length,
        hasGroups,
      });

      // A group that holds only variables has nothing to census: every bar would be a
      // single variable. Ask the user to pick a variable from the browser instead.
      if (!hasGroups) {
        this.emptyChartMessage.set(GROUP_OF_VARIABLES_ONLY_MESSAGE);
        return;
      }

      const rows = items
        .map((child: any) => ({
          bin: String(child?.label ?? child?.name ?? child?.code ?? ''),
          count: countLeafNodes(child),
        }))
        .sort((a: { bin: string; count: number }, b: { bin: string; count: number }) => b.count - a.count);

      this.groupHistogramData.set({
        bins: rows.map((row: { bin: string; count: number }) => row.bin),
        counts: rows.map((row: { bin: string; count: number }) => row.count),
        variableName: String(node?.label ?? 'Groups'),
      });
      return;
    }

    const codes = [node.code];
    this.queueHistogramRequest(codes, node.label);
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupHistogramPipeline(): void {
    this.histogramRequest$
      .pipe(
        takeUntil(this.destroy$),
        switchMap(({ codes, label, bins }) => {
          return this.experimentStudioService
            .getAlgorithmResults(AlgorithmNames.HISTOGRAM, codes, bins ?? null)
            .pipe(
              catchError((error) => {
                this.isLoadingHistogram.set(false);
                console.error('Error fetching histogram:', error);
                this.errorMessage.set('Error loading histogram. Please try again.');
                return of(null);
              }),
              map((response) => ({ response, label, codes }))
            );
        })
      )
      .subscribe(({ response, label, codes }) => {
        this.isLoadingHistogram.set(false);

        if (!response) return;

        const histList = response?.result?.histogram ?? response?.histogram ?? [];
        if (histList.length) {
          const variableCode = histList[0]?.var ?? histList[0]?.variable ?? codes?.[0];
          const variableNode = variableCode ? this.findNodeByCode(this.d3Data, variableCode) : null;

          const variants = histList.map((hist: any, idx: number) => {
            const enrichedHistogram = this.mapBinsToEnumLabels(hist, variableNode?.enumerations);
            const groupingVarCode = hist?.grouping_var;
            const groupingVarNode = groupingVarCode ? this.findNodeByCode(this.d3Data, groupingVarCode) : null;
            const groupingVarLabel = groupingVarNode?.label ?? groupingVarCode;
            const groupingEnumLabel = this.mapEnumValueLabel(hist?.grouping_enum, groupingVarNode?.enumerations);

            const variantLabel = groupingVarCode
              ? `${groupingVarLabel}: ${groupingEnumLabel ?? hist?.grouping_enum ?? 'N/A'}`
              : 'Overall';

            const dataWithName = {
              ...enrichedHistogram,
              variableName: label ?? variableNode?.label ?? enrichedHistogram.variable ?? enrichedHistogram.variableName,
              variableType: variableNode?.type
            };

            return {
              key: groupingVarCode ? `${groupingVarCode}:${String(hist?.grouping_enum ?? idx)}` : 'overall',
              label: variantLabel,
              data: dataWithName,
              isOverall: !groupingVarCode,
            };
          });

          const sortedVariants = [
            ...variants.filter((v: { isOverall: boolean }) => v.isOverall),
            ...variants.filter((v: { isOverall: boolean }) => !v.isOverall),
          ].map(({ key, label: variantLabel, data }) => ({ key, label: variantLabel, data }));

          this.histogramVariants.set(sortedVariants);
          const selectedKey = sortedVariants[0]?.key ?? null;
          this.selectedHistogramVariantKey.set(selectedKey);
          this.histogramData.set(sortedVariants[0]?.data ?? null);
          this.clearChartNotices();
        } else {
          this.histogramVariants.set([]);
          this.selectedHistogramVariantKey.set(null);
          const resultData = response?.result?.data || response?.data;
          if (typeof resultData === 'string' && resultData.includes('insufficient data')) {
            this.emptyChartMessage.set('This variable does not have sufficient data.');
          } else {
            this.emptyChartMessage.set('No distribution for this selection.');
          }
        }
      });
  }

  private clearChartNotices(): void {
    this.errorMessage.set(null);
    this.emptyChartMessage.set(null);
  }

  private queueHistogramRequest(codes: string[], label?: string, bins: number | null = null) {
    this.isLoadingHistogram.set(true);
    this.clearChartNotices();
    this.histogramData.set(null);
    this.histogramVariants.set([]);
    this.selectedHistogramVariantKey.set(null);
    this.histogramRequest$.next({ codes, label, bins });
  }

  onHistogramVariantChange(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    this.selectedHistogramVariantKey.set(key);
    const variant = this.histogramVariants().find((item) => item.key === key);
    if (variant) {
      this.histogramData.set(variant.data);
    }
  }

  getPathNodes(node: any): Array<{ code: string; label: string }> {
    const code = node?.code;
    if (!code) {
      const fallbackLabel = String(node?.label ?? '');
      return fallbackLabel ? [{ code: String(code ?? ''), label: fallbackLabel }] : [];
    }
    const pathNodes: Array<{ code: string; label: string }> = [];
    const found = this.collectPathNodes(this.d3Data, code, pathNodes);
    if (!found) {
      return [{ code: String(code), label: String(node?.label ?? code) }];
    }
    const collapsed: Array<{ code: string; label: string }> = [];
    for (const pathNode of pathNodes) {
      if (collapsed.length && collapsed[collapsed.length - 1].label === pathNode.label) {
        continue;
      }
      collapsed.push(pathNode);
    }
    return collapsed;
  }

  private collectPathNodes(
    current: any,
    code: string,
    path: Array<{ code: string; label: string }>
  ): boolean {
    if (!current) return false;
    const label = String(current?.label ?? current?.name ?? current?.code ?? '');
    const currentCode = String(current?.code ?? '');
    if (label) {
      path.push({ code: currentCode, label });
    }
    if (current?.code === code) return true;
    for (const child of current.children ?? []) {
      if (this.collectPathNodes(child, code, path)) return true;
    }
    path.pop();
    return false;
  }

  isExportDisabled(): boolean {
    if (this.isLoadingHistogram()) return true;
    if (this.errorMessage()) return true;
    if (!this.selectedNode) return true;
    return !this.histogramData() && !this.groupHistogramData();
  }

  isSelectedNodeGroup(): boolean {
    return !!this.selectedNode?.children?.length;
  }

  detailsPanelTitle(): string {
    if (!this.selectedNode) {
      return 'Select a variable';
    }
    return String(this.selectedNode.label ?? '').trim();
  }

  detailsPanelSubtitle(): string {
    if (!this.selectedNode) {
      return '';
    }
    if (this.isSelectedNodeGroup()) {
      const meta = this.groupHistogramMeta();
      if (meta) {
        return meta.hasGroups
          ? `${meta.groupCount} groups in this view`
          : `${meta.groupCount} variables in this group`;
      }
    }
    return String(this.selectedNode.description ?? '').trim();
  }

  toggleExportMenu(): void {
    this.exportMenuOpen.update(open => !open);
  }

  closeExportMenu(): void {
    this.exportMenuOpen.set(false);
  }

  async exportHistogramPdf(): Promise<void> {
    this.closeExportMenu();
    if (this.isExportDisabled()) return;
    this.isExporting.set(true);

    try {
      const exportTarget = this.histogramExport?.nativeElement;
      if (!exportTarget) {
        console.warn('Histogram export target not found.');
        return;
      }

      await this.pdfExportService.exportHistogramPdf(exportTarget, {
        title: this.groupHistogramData() ? 'Group Description' : 'Histogram',
        nodeLabel: String(this.selectedNode?.label ?? this.histogramData()?.variableName ?? ''),
        modelLabel: String(this.selectedDataModel()?.label ?? this.selectedDataModel()?.code ?? ''),
        datasetLabels: this.experimentStudioService.selectedDatasets()
          .map(code => this.availableDatasets.find(d => d.code === code)?.label ?? code)
          .filter(label => !!label),
        description: String(this.selectedNode?.description ?? ''),
        meta: this.groupHistogramMeta() ?? undefined,
        isGroupView: !!this.groupHistogramData()
      });

    } catch (err) {
      console.error('Histogram PDF export failed:', err);
    } finally {
      this.isExporting.set(false);
    }
  }

  exportHistogramCsv(): void {
    this.closeExportMenu();
    if (this.isExportDisabled()) return;

    const data = this.groupHistogramData() || this.histogramData();
    if (!data) return;

    try {
      this.csvExportService.exportHistogramCsv(
        { bins: data.bins, counts: data.counts },
        String(this.selectedNode?.label ?? data.variableName ?? 'histogram')
      );
    } catch (err) {
      console.error('Histogram CSV export failed:', err);
    }
  }


  /**
   * Replace histogram bin codes with enumeration labels when available.
   */
  private mapBinsToEnumLabels(hist: any, enumerations?: Array<{ code?: any; label?: string; name?: string }>) {
    if (!hist || !Array.isArray(hist.bins) || !enumerations || !enumerations.length) return hist;

    const codeToLabel = new Map(
      enumerations.map((e) => [String(e.code ?? e.label ?? ''), e.label ?? e.name ?? String(e.code ?? '')])
    );

    let mapped = 0;
    const binsWithLabels = hist.bins.map((b: any) => {
      const label = codeToLabel.get(String(b));
      if (label) {
        mapped += 1;
        return label;
      }
      return b;
    });

    if (!mapped) return hist;
    return { ...hist, bins: binsWithLabels };
  }

  private mapEnumValueLabel(value: any, enumerations?: Array<{ code?: any; label?: string; name?: string }>): string | null {
    if (value === null || value === undefined || !enumerations?.length) return null;
    const match = enumerations.find((entry) => String(entry?.code ?? entry?.label ?? entry?.name ?? '') === String(value));
    if (!match) return null;
    return String(match?.label ?? match?.name ?? value);
  }

  private loadMetadataBrowserMode(): MetadataBrowserMode {
    try {
      const saved = localStorage.getItem(this.metadataBrowserModeStorageKey);
      if (saved === 'ontology' || saved === 'collapsible' || saved === 'bubble') {
        return saved;
      }
    } catch {
      // Fall through to the Map default.
    }
    return 'bubble';
  }
}
