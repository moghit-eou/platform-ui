import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, catchError, defaultIfEmpty, filter, finalize, forkJoin, map, of, shareReplay, switchMap, take, takeUntil, tap, timer } from 'rxjs';
import { SessionStorageService } from './session-storage.service';
import { D3HierarchyNode, DataModel, Group, Variable } from '../models/data-model.interface';
import { mapSpecificationsToAlgorithmConfigs } from '../core/algorithm-mappers';
import { EnumMaps } from '../core/algorithm-result-enum-mapper';
import {
  AnalysisInputData,
  AnalysisPreprocessingStep,
  AnalysisRequest,
  ExperimentCreateRequest,
} from '../models/backend-algorithms.model';
import { BackendFilter, BackendRule } from '../models/filters.model';
import { ExperimentRunSetup, RunSetupSummaryRow } from '../models/experiment-run-setup.model';
import { AlgorithmAvailability, AlgorithmConfig } from '../models/algorithm-definition.model';
import { BackendExperiment } from '../models/backend-experiment.model';
import { ErrorService } from './error.service';
import { AlgorithmRulesService } from './algorithm-rules.service';
import { AlgorithmNames, HistogramBinningType, VariableTypes } from '../core/constants/algorithm.constants';
import {
  omitEmptyOptionalParameters,
  serializeAlgorithmParameterValue,
} from '../core/algorithm-parameter.utils';
import { outlierStrategyLabel, outlierTailLabel } from '../core/outlier-rules';
import { buildEnumMapForVariables, findDataModelByCodeVersion } from '../core/data-model.utils';

type PathologyAccessWarningKind = 'no-pathologies' | 'no-access';

interface PathologyAccessWarning {
  kind: PathologyAccessWarningKind;
  title: string;
  message: string;
}

export type PreprocessingConfig = Record<string, unknown>;

const MISSING_VALUES_HANDLER = 'missing_values_handler';
const OUTLIER_WINSORIZER = 'outlier_winsorizer';
const APPLIED_DESCRIPTIVE_PREPROCESSING = '__applied_descriptive_preprocessing__';

/** Quick-preview / diagnostic algorithms hidden from the experiment algorithm picker. */
const ALGORITHM_PANEL_EXCLUDED = new Set<string>([
  AlgorithmNames.HISTOGRAM,
  AlgorithmNames.DESCRIBE,
  AlgorithmNames.OUTLIER_REPORT,
  AlgorithmNames.LINEAR_SVM,
  'cox_regression_stacked',
]);

@Injectable({ providedIn: 'root' })
export class ExperimentStudioService {
  private http = inject(HttpClient);
  private sessionStorage = inject(SessionStorageService);
  private errorService = inject(ErrorService);
  private algorithmRulesService = inject(AlgorithmRulesService);

  private apiUrl = '/services/data-models';
  private experimentUrl = '/services/experiments';
  private dataModels: any[] = [];
  private dataModelsLoaded = false;
  private dataModelsRequest$: Observable<any[]> | null = null;

  private selectedVariablesSignal = signal<any[]>(this.sessionStorage.getItem('selectedVariables') || []);
  private selectedFiltersSignal = signal<any[]>(this.sessionStorage.getItem('selectedFilters') || []);
  private _filterLogic = signal<BackendFilter | null>(this.sessionStorage.getItem('filterLogic'));
  private algorithmYSignal = signal<any[]>(this.sessionStorage.getItem('algorithmY') || []);
  private algorithmXSignal = signal<any[]>(this.sessionStorage.getItem('algorithmX') || []);

  readonly selectedVariables = computed(() => this.selectedVariablesSignal());
  readonly selectedFilters = computed(() => this.selectedFiltersSignal());
  /** Variables assigned to the y role on the Algorithm panel. */
  readonly algorithmY = computed(() => this.algorithmYSignal());
  /** Covariates assigned to the x role on the Algorithm panel. */
  readonly algorithmX = computed(() => this.algorithmXSignal());

  /**
   * Assignable pool for the Algorithm role UI: the data-model variable pool, the
   * synthetic node for the applied transformation column, plus any synthetic
   * derived role nodes hydrated from a saved experiment. Synthetic nodes never
   * belong in the variables-panel pool (real CDE nodes only).
   */
  readonly algorithmAssignableVariables = computed(() => {
    const nodes = [...this.selectedVariables()];
    const created = this.transformationColumnNodes();
    if (created.length) {
      const knownCodes = new Set(nodes.map((v) => v?.code));
      for (const node of created) {
        if (node?.code && !knownCodes.has(node.code)) {
          nodes.push(node);
          knownCodes.add(node.code);
        }
      }
    } else {
      // No live transformation creator: re-include synthetic derived nodes that
      // were hydrated into the y/x roles (e.g. editing a saved experiment that
      // has a created column but no active transformation step). Synthetic nodes
      // never belong in the variables-panel pool (real CDE nodes only).
      const knownCodes = new Set(nodes.map((v) => v?.code));
      for (const role of [this.algorithmY(), this.algorithmX()]) {
        for (const node of role) {
          if (node?.isCreatedColumn && !knownCodes.has(node.code)) {
            nodes.push(node);
            knownCodes.add(node.code);
          }
        }
      }
    }
    return nodes;
  });

  getCategoricalEnumMaps(): EnumMaps {
    const items = [
      ...this.algorithmAssignableVariables(),
      ...this.selectedFilters(),
    ];
    return buildEnumMapForVariables(items);
  }

  private selectedDatasetsSignal = signal<string[]>(this.sessionStorage.getItem('selectedDatasets') || []);
  private transientUrl = '/services/experiments/transient';

  lastUsedAlgorithm = signal<string | null>(this.sessionStorage.getItem('lastUsedAlgorithm') || null);
  selectedDatasets = computed(() => this.selectedDatasetsSignal());
  backendAlgorithms = signal<Record<string, AlgorithmConfig>>({});
  selectedDataModel = signal<DataModel | null>(this.sessionStorage.getItem('selectedDataModel'));
  readonly crossSectionalModels = signal<DataModel[]>([]);
  readonly longitudinalModels = signal<DataModel[]>([]);
  readonly availableDatasets = signal<{ code: string; label: string }[]>([]);
  private pathologyAccessWarningSignal = signal<PathologyAccessWarning | null>(null);
  readonly pathologyAccessWarning = this.pathologyAccessWarningSignal.asReadonly();

  private currentExperimentUUIDSignal = signal<string | null>(null);
  readonly currentExperimentUUID = this.currentExperimentUUIDSignal.asReadonly();

  private editingExistingExperimentSignal = signal(false);
  readonly editingExistingExperiment = this.editingExistingExperimentSignal.asReadonly();

  readonly isShared = signal<boolean>(false);

  private readonly _isRunning = signal(false);
  readonly isRunning = this._isRunning.asReadonly();

  /**
   * Run outcome for the Experiment Execution step. Lives here (not on the algorithm panel)
   * because the result outlives the parameters view and is read from another step.
   */
  readonly runResult = signal<any | null>(null);
  readonly runError = signal<string | null>(null);
  readonly lastRunSchema = signal<any[]>([]);
  /** Execution unlocks the first time a run is dispatched in this studio session. */
  readonly hasRunStarted = signal(false);
  readonly runStatusText = signal('Processing experiment...');
  /**
   * Frozen inputs of the run that produced `runResult`; null until a run is dispatched.
   * Read this instead of live state: editing a parameter does not clear a result that is
   * already on screen, so live state can describe a run that never happened. Not persisted,
   * exactly like `runResult`.
   */
  readonly runSetup = signal<ExperimentRunSetup | null>(null);
  /** Save As toast host: rendered by the Execution step, triggered from anywhere. */
  readonly saveSucceeded = signal(false);

  notifySaveSucceeded(): void {
    this.saveSucceeded.set(true);
    setTimeout(() => this.saveSucceeded.set(false), 8000);
  }

  /** code → human label for every variable the algorithm can see, shared by result views. */
  readonly variableLabelMap = computed(() => {
    const map: Record<string, string> = {};
    [...this.algorithmAssignableVariables(), ...this.selectedFilters()].forEach((item) => {
      if (item?.code && item?.label) map[item.code] = item.label;
    });
    return map;
  });
  private dataExclusionWarningsSignal = signal<string[]>([]);
  readonly dataExclusionWarnings = this.dataExclusionWarningsSignal.asReadonly();
  private excludedDatasetsSignal = signal<string[]>([]);
  readonly excludedDatasets = this.excludedDatasetsSignal.asReadonly();

  /**
   * Freezes what the next run will send. The algorithm panel calls this once the final
   * parameter values are stored, so datasets, filters, roles, preprocessing and parameters
   * are all read from the same instant the request is built from.
   */
  captureRunSetup(algorithmName: string): void {
    const configuredParameters = this.algorithmConfigurations()[algorithmName] ?? {};
    this.runSetup.set({
      algorithmKey: algorithmName,
      dataModel: this.selectedDataModel()?.label ?? this.selectedDataModel()?.code ?? null,
      datasets: [...this.selectedDatasets()],
      outcome: this.roleCodes(this.algorithmY()),
      covariates: this.roleCodes(this.algorithmX()),
      filterLogic: this.filterLogic(),
      preprocessing: this.getEffectivePreprocessingEntries(algorithmName, this.variableLabelMap()),
      parameters: { ...configuredParameters },
    });
  }

  private roleCodes(nodes: any[]): string[] {
    return (nodes ?? []).map((node) => String(node?.code ?? '').trim()).filter(Boolean);
  }

  // teardown for transient requests
  private destroy$ = new Subject<void>();

  private readonly crossValidationVariants: Record<string, string> = {
    linear_regression: 'linear_regression_cv',
    logistic_regression: 'logistic_regression_cv',
    naive_bayes_gaussian: 'naive_bayes_gaussian_cv',
    naive_bayes_categorical: 'naive_bayes_categorical_cv',
  };

  private readonly crossValidationBases: Record<string, string> = Object.entries(
    this.crossValidationVariants
  ).reduce((acc, [base, cv]) => {
    acc[cv] = base;
    return acc;
  }, {} as Record<string, string>);

  private readonly transformationVariants: Record<string, string> = {
    pca: 'pca_with_transformation',
  };

  private readonly transformationBases: Record<string, string> = Object.entries(
    this.transformationVariants
  ).reduce((acc, [base, variant]) => {
    acc[variant] = base;
    return acc;
  }, {} as Record<string, string>);


  constructor() {
    this.loadBackendAlgorithms().subscribe();




    // Reset filters when no filter variables OR no rules
    effect(() => {
      const vars = this.selectedFiltersSignal();
      const logic = this._filterLogic();

      const noVars = !vars || vars.length === 0;
      const noRules = !logic || !Array.isArray(logic.rules) || logic.rules.length === 0;

      if (noVars || noRules) {
        if (this._filterLogic()) {
          this._filterLogic.set(null);
        }
      }
    });

    effect(() => {
      const selected = this.selectedDatasetsSignal();
      if (!selected) return;

      // untracked: setVariables/prune used to write new y/x arrays and retrigger this effect.
      if (selected.length === 0) {
        untracked(() => {
          if (!this.selectedVariablesSignal().length && !this.selectedFiltersSignal().length) {
            return;
          }
          console.warn('No datasets selected — resetting state');
          this.setVariables([]);
          this.setFilters([]);
        });
      } else {
        untracked(() => this.refreshDataModel());
      }
    });

    // --- State Persistence ---
    const persistencePairs: Array<[string, () => unknown]> = [
      ['selectedVariables', () => this.selectedVariablesSignal()],
      ['selectedFilters', () => this.selectedFiltersSignal()],
      ['selectedDatasets', () => this.selectedDatasetsSignal()],
      ['selectedDataModel', () => this.selectedDataModel()],
      ['filterLogic', () => this._filterLogic()],
      ['algorithmY', () => this.algorithmYSignal()],
      ['algorithmX', () => this.algorithmXSignal()],
      ['algorithmConfigurations', () => this.algorithmConfigurations()],
      ['algorithmPreprocessingConfigurations', () => this.algorithmPreprocessingConfigurations()],
      ['lastUsedAlgorithm', () => this.lastUsedAlgorithm()],
    ];
    for (const [key, read] of persistencePairs) {
      effect(() => {
        this.sessionStorage.setItem(key, read());
      });
    }
  }
  setAlgorithmY(nodes: any[]): void {
    this.setRole('y', nodes);
  }

  setAlgorithmX(nodes: any[]): void {
    this.setRole('x', nodes);
  }

  private setRole(role: 'y' | 'x', nodes: any[]): void {
    const unique = this.uniqueByCode(nodes);
    const thisSignal = role === 'y' ? this.algorithmYSignal : this.algorithmXSignal;
    const otherSignal = role === 'y' ? this.algorithmXSignal : this.algorithmYSignal;
    thisSignal.set(unique);
    const codes = new Set(unique.map((v) => v.code));
    otherSignal.set(otherSignal().filter((v) => !codes.has(v.code)));
  }

  private uniqueByCode(nodes: any[]): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const node of nodes ?? []) {
      const code = node?.code;
      if (code === null || code === undefined || code === '') continue;
      const key = String(code);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(node);
    }
    return out;
  }

  /** Codes of derived columns (e.g. transformation output) that must not be sent as source CDEs. */
  private derivedVariableCodes(): Set<string> {
    const codes = new Set<string>();
    for (const node of this.transformationColumnNodes()) {
      if (node?.code) codes.add(String(node.code));
    }
    return codes;
  }

  /** Minimal synthetic node for a derived column code found in a saved experiment. */
  private syntheticDerivedNode(code: string): any {
    return {
      code,
      label: code,
      name: code,
      type: 'text',
      enumerations: [],
      isCreatedColumn: true,
    };
  }

  /**
   * Synthetic node for one categorical_column_creator config (derived column),
   * exposed in the assignable pool. Returns null when the config has no usable code.
   */
  private derivedColumnNode(creator: { code?: unknown; rules?: Record<string, unknown>; default_enumeration?: unknown }): any | null {
    const code = String(creator?.code ?? '').trim();
    if (!code) return null;
    const enumerations: Array<{ code: string; label: string }> = [];
    Object.keys(creator?.rules ?? {}).forEach((value) => {
      if (value) enumerations.push({ code: value, label: value });
    });
    const def = String(creator?.default_enumeration ?? '').trim();
    if (def && !enumerations.some((e) => e.code === def)) {
      enumerations.push({ code: def, label: def });
    }
    return { ...this.syntheticDerivedNode(code), enumerations };
  }

  /** Synthetic node for every applied transformation column, exposed in the assignable pool. */
  private transformationColumnNodes(): any[] {
    return this.appliedCategoricalCreators()
      .map((creator) =>
        this.derivedColumnNode(
          creator as { code?: unknown; rules?: Record<string, unknown>; default_enumeration?: unknown }
        )
      )
      .filter((node): node is any => !!node);
  }

  /** Every applied categorical_column_creator config, in store order. */
  appliedCategoricalCreators(): Record<string, unknown>[] {
    return (this.appliedPreprocessingConfig()?.['categorical_column_creator'] as
      | Record<string, unknown>[]
      | undefined) ?? [];
  }


  getActiveDataModelCode(): string {
    const model = this.selectedDataModel();
    if (!model?.code || !model?.version) {
      console.warn('No active data model found.');
      return 'unknown';
    }
    return `${model.code}:${model.version}`;
  }

  refreshDataModel() {
    const selected = this.selectedDatasetsSignal();
    if (!selected || selected.length === 0) return;

    this.loadAllDataModels()
      .pipe(takeUntil(this.destroy$))
      .subscribe(models => {
        const active = models.filter(m => selected.includes(m.code));
        if (!active.length) return;
        const model = active[0];
        this.selectedDataModel.set(model);

      });
  }


  setSelectedDatasets(datasets: string[]) {
    this.selectedDatasetsSignal.set(datasets);
    this.clearDataExclusionWarnings();
  }

  algorithmEnabled(variableType: string): string[] {
    // Normalize to array because incoming variable metadata may be scalar or array.
    const varTypes = Array.isArray(variableType) ? variableType : [variableType];
    const allAlgos = Object.values(this.backendAlgorithms());

    // filter inputdata.y and add at least one of the varTypes in types list
    const result = allAlgos
      .filter(algo => {
        const yReq = algo.inputdata?.y;
        const xReq = algo.inputdata?.x;

        if (!yReq || !Array.isArray(yReq.types)) {
          return false;
        }

        const varIsNominal = varTypes.includes(VariableTypes.NOMINAL);

        if (varIsNominal && yReq.stattypes?.includes(VariableTypes.NOMINAL)) {
          return true;
        }

        const yExists = varTypes.some(t => yReq.types.includes(t));

        if (!yExists) {
          return false;
        }

        if (xReq && Array.isArray(xReq.types)) {
          if (varTypes.length === 0) {
            return false;
          }

          const xExists = varTypes.some(t => xReq.types.includes(t));
          if (!xExists) {
            return false;
          }
        }

        if (varIsNominal && xReq?.stattypes?.includes(VariableTypes.NOMINAL)) {
          return true;
        }
        return true;
      })
      .map(algo => algo.name);
    return result;

  }

  // adds variables and adds enumerations for the algorithm panel
  addVariableAndEnrich(node: any): void {
    const currentVars = this.selectedVariables();
    if (currentVars.some(v => v.code === node.code)) {
      return;
    }

    const enabledAlgos = this.algorithmEnabled(node.type);

    const enrichedNode = {
      ...node,
      code: node.code,
      label: node.label,
      name: node.name,
      enumerations: node.enumerations,
      supportedAlgos: enabledAlgos,
    };

    // update signal
    this.selectedVariablesSignal.set([...currentVars, enrichedNode]);
    this.pruneRolesToAssignable();
  }

  setVariables(vars: D3HierarchyNode[]) {
    this.selectedVariablesSignal.set(vars);
    this.pruneRolesToAssignable();
    this.clearDataExclusionWarnings();
  }


  setFilters(filters: D3HierarchyNode[]): void {
    this.selectedFiltersSignal.set(filters);
    this.clearDataExclusionWarnings();
  }

  /** Pathology/data-model change invalidates variables, datasets, and review state. */
  clearSelectionsForDataModelChange(): void {
    this.setVariables([]);
    this.setFilters([]);
    this.setSelectedDatasets([]);
    this.setFilterLogic(null);
  }

  /** Keep y/x roles limited to currently-assignable items (pool + created column). */
  private pruneRolesToAssignable(): void {
    untracked(() => {
      const assignable = new Set(this.algorithmAssignableVariables().map((v) => v.code));
      const y = this.algorithmYSignal();
      const nextY = y.filter((v) => assignable.has(v.code));
      if (nextY.length !== y.length) {
        this.algorithmYSignal.set(nextY);
      }
      const x = this.algorithmXSignal();
      const nextX = x.filter((v) => assignable.has(v.code));
      if (nextX.length !== x.length) {
        this.algorithmXSignal.set(nextX);
      }
    });
  }

  setDataExclusionWarnings(warnings: string[], excludedDatasets: string[] = []): void {
    const sanitized = Array.from(
      new Set((warnings ?? [])
        .map((warning) => String(warning ?? '').trim())
        .filter((warning) => warning.length > 0))
    );
    this.dataExclusionWarningsSignal.set(sanitized);
    this.excludedDatasetsSignal.set(excludedDatasets);
  }

  clearDataExclusionWarnings(): void {
    this.dataExclusionWarningsSignal.set([]);
    this.excludedDatasetsSignal.set([]);
  }

  selectedAlgorithm = signal<AlgorithmConfig | null>(
    this.sessionStorage.getItem<AlgorithmConfig>('selectedAlgorithm') ?? null
  );

  algorithmConfigurations = signal<Record<string, Record<string, any>>>(
    this.sessionStorage.getItem('algorithmConfigurations') || {}
  );
  algorithmPreprocessingConfigurations = signal<Record<string, PreprocessingConfig | null>>(
    this.sessionStorage.getItem('algorithmPreprocessingConfigurations') || {}
  );
  readonly appliedPreprocessingConfig = computed(
    () => this.algorithmPreprocessingConfigurations()[APPLIED_DESCRIPTIVE_PREPROCESSING] ?? null
  );

  setAppliedDescriptivePreprocessing(preprocessing: PreprocessingConfig | null): void {
    this.algorithmPreprocessingConfigurations.set({
      ...this.algorithmPreprocessingConfigurations(),
      [APPLIED_DESCRIPTIVE_PREPROCESSING]: this.normalizePreprocessingConfig(preprocessing),
    });
    this.pruneRolesToAssignable();
  }

  getAppliedDescriptivePreprocessing(): PreprocessingConfig | null {
    return this.normalizePreprocessingConfig(this.appliedPreprocessingConfig());
  }

  hasAppliedDescriptivePreprocessing(): boolean {
    const applied = this.algorithmPreprocessingConfigurations()[APPLIED_DESCRIPTIVE_PREPROCESSING];
    return !!applied && Object.keys(applied).length > 0;
  }

  /**
   * Whether the next run for this algorithm carries a missing-value strategy.
   * Same truth source as the run payload: a stored config, otherwise the
   * request-time per-variable drop default (describe/outlier-report send none).
   */
  hasRequestPreprocessingForRun(algorithmName: string): boolean {
    if (algorithmName === AlgorithmNames.DESCRIBE || algorithmName === AlgorithmNames.OUTLIER_REPORT) return true;
    return this.getEffectivePreprocessingSummary(algorithmName) !== 'none';
  }

  /**
   * Merge the Transformation step (exaflow `categorical_column_creator`) into the shared
   * APPLIED_DESCRIPTIVE_PREPROCESSING config so it reaches every experiment run via
   * getStoredPreprocessingConfig -> resolveRequestPreprocessing -> preprocessingConfigToSteps.
   * Statistics for the derived column can also call describe with this config present,
   * using source CDEs in inputdata.variables and the new column code in algorithm.y.
   */
  setTransformationPreprocessing(config: Record<string, unknown>[] | null): void {
    const current = this.algorithmPreprocessingConfigurations()[APPLIED_DESCRIPTIVE_PREPROCESSING] ?? {};
    const next: PreprocessingConfig = { ...current };
    if (config?.length) {
      next['categorical_column_creator'] = config;
    } else {
      delete next['categorical_column_creator'];
    }
    this.algorithmPreprocessingConfigurations.set({
      ...this.algorithmPreprocessingConfigurations(),
      [APPLIED_DESCRIPTIVE_PREPROCESSING]: Object.keys(next).length ? next : null,
    });
    this.pruneRolesToAssignable();
  }

  async setAlgorithm(algorithm: AlgorithmConfig) {
    const algo = this.backendAlgorithms()[algorithm.name];
    if (!algo) {
      console.error("Algorithm not found:", algorithm.name);
      return;
    }

    const algorithmY = this.algorithmY();
    if (algorithmY.length !== 1) {
      console.warn("Enrichment skipped: need exactly 1 algorithm variable for enums.");
      this.selectedAlgorithm.set(algo);
      this.sessionStorage.setItem('selectedAlgorithm', algo);
      return;
    }

    const selectedY = algorithmY[0];
    let enums = selectedY.enumerations ?? [];

    const enrichedConfig = algo.configSchema.map((field) => {
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        return { ...field, options: [...enums] }; // avoid shared reference
      }
      return field;
    });

    const enrichedAlgo = { ...algo, configSchema: enrichedConfig };
    this.selectedAlgorithm.set(enrichedAlgo);
    this.sessionStorage.setItem('selectedAlgorithm', enrichedAlgo);
  }

  loadBackendAlgorithms(): Observable<Record<string, AlgorithmConfig>> {
    return forkJoin({
      inputdata: this.http.get('/services/specifications/inputdata'),
      preprocessing: this.http.get('/services/specifications/preprocessing'),
      algorithms: this.http.get('/services/specifications/algorithms'),
    }).pipe(
      map(({ inputdata, preprocessing, algorithms }) => {
        const mapped = mapSpecificationsToAlgorithmConfigs(
          inputdata as any,
          preprocessing as any[],
          algorithms as any[],
        );

        this.backendAlgorithms.set(mapped);
        this.refreshSelectedAlgorithmFromCatalog(mapped);
        return mapped;
      }),
      catchError((error) => {
        console.error('Failed to fetch backend specifications:', error);
        return of({});
      })
    );
  }

  private refreshSelectedAlgorithmFromCatalog(mapped: Record<string, AlgorithmConfig>): void {
    const selected = this.selectedAlgorithm();
    if (!selected) return;
    const fresh = mapped[selected.name];
    if (!fresh) return;

    const refreshed = {
      ...fresh,
      configSchema: selected.configSchema?.length ? selected.configSchema : fresh.configSchema,
    };
    this.selectedAlgorithm.set(refreshed);
    this.sessionStorage.setItem('selectedAlgorithm', refreshed);
  }

  getCrossValidationVariant(baseName: string): string | null {
    return this.crossValidationVariants[baseName] ?? null;
  }

  getCrossValidationBase(name: string): string | null {
    if (this.crossValidationBases[name]) return this.crossValidationBases[name];
    if (name.endsWith('_cv')) {
      return name.slice(0, -3);
    }
    return null;
  }

  isCrossValidationAlgorithm(name: string): boolean {
    return (
      name in this.crossValidationBases ||
      name.endsWith('_cv')
    );
  }

  isCrossValidationOnly(name: string): boolean {
    if (!this.isCrossValidationAlgorithm(name)) return false;
    const base = this.getCrossValidationBase(name);
    return !!base && !this.backendAlgorithms()[base];
  }

  getTransformationVariant(baseName: string): string | null {
    return this.transformationVariants[baseName] ?? null;
  }

  getTransformationBase(name: string): string | null {
    if (this.transformationBases[name]) return this.transformationBases[name];
    if (name.endsWith('_with_transformation')) {
      return name.replace('_with_transformation', '');
    }
    return null;
  }

  isTransformationAlgorithm(name: string): boolean {
    return (
      name in this.transformationBases ||
      name.endsWith('_with_transformation')
    );
  }

  availableGroupedAlgorithms = computed(() => {
    // Explicitly read role signals to establish reactive dependencies.
    this.algorithmY();
    this.algorithmX();

    return Object.values(this.backendAlgorithms())
      .filter(algo => !ALGORITHM_PANEL_EXCLUDED.has(algo.name))
      .filter(algo => {
        if (!this.isCrossValidationAlgorithm(algo.name)) return true;
        const base = this.getCrossValidationBase(algo.name);
        return !base || !this.backendAlgorithms()[base];
      })
      .filter(algo => !this.isTransformationAlgorithm(algo.name))
      .reduce((acc, algo) => {
        const cat = algo.category || 'Other';
        if (!acc[cat]) acc[cat] = [];
        const availability = this.getAlgorithmAvailability(algo.name);
        acc[cat].push({
          ...algo,
          availability,
          isDisabled: !availability.available,
        });
        return acc;
      }, {} as Record<string, AlgorithmConfig[]>);
  });

  getAlgorithmAvailability(name: string): AlgorithmAvailability {
    const algo = this.backendAlgorithms()[name];
    const emptyAvailability: AlgorithmAvailability = {
      available: false,
      summary: 'Algorithm is not in the backend catalog.',
      details: [],
    };
    if (!algo?.inputdata) return emptyAvailability;

    return this.algorithmRulesService.evaluateAlgorithmAvailability(algo, {
      y: this.algorithmY(),
      x: this.algorithmX(),
    });
  }

  isAlgorithmAvailable(name: string): boolean {
    return this.getAlgorithmAvailability(name).available;
  }

  private buildSharedInputDataPayload(
    algo: AlgorithmConfig,
    filtersPayload: BackendFilter | null,
    datasetsOverride?: string[] | null,
    extraVariableCodes?: string[] | null,
  ): AnalysisInputData {
    const inputdata = algo.inputdata ?? {};
    const datasets = datasetsOverride ?? this.selectedDatasetsSignal().filter(
      (ds) => !this.excludedDatasetsSignal().includes(ds),
    );
    const variables = this.collectSourceVariables(filtersPayload, extraVariableCodes);

    return {
      data_model: this.getActiveDataModelCode(),
      datasets,
      validation_datasets: algo.requires_validation_datasets ? datasets : null,
      filters: (
        Object.prototype.hasOwnProperty.call(inputdata, 'filter') ||
        Object.prototype.hasOwnProperty.call(inputdata, 'filters')
      ) ? filtersPayload : null,
      variables,
    };
  }

  private collectSourceVariables(
    filtersPayload: BackendFilter | null,
    extraCodes: string[] | null = null,
  ): string[] {
    const derived = this.derivedVariableCodes();
    return Array.from(
      new Set(
        [
          // Pool CDEs (including unassigned members used as transformation sources).
          ...this.selectedVariables().map((v) => v.code),
          // Experiment filter fields.
          ...this.collectFilterVariableCodes(filtersPayload),
          // Transformation-rule filter fields (source CDEs referenced by the rules).
          ...this.collectTransformationFilterCodes(),
          // Previewed CDEs (histogram inspect happens before add-to-pool).
          ...this.toArray(extraCodes),
        ]
          .map((code) => String(code).trim())
          .filter((code) => code && code !== 'dataset' && !derived.has(code)),
      ),
    );
  }

  private preprocessingConfigToSteps(
    config: PreprocessingConfig | null | undefined,
  ): AnalysisPreprocessingStep[] | null {
    if (!config) return null;
    // An array value (e.g. several categorical_column_creator configs) expands to
    // one ordered step per entry; the engine accepts repeated steps with the same name.
    const steps: AnalysisPreprocessingStep[] = [];
    for (const [name, parameters] of Object.entries(config)) {
      if (Array.isArray(parameters)) {
        for (const item of parameters) {
          if (item && typeof item === 'object') {
            steps.push({ name, parameters: item as Record<string, unknown> });
          }
        }
        continue;
      }
      if (parameters && typeof parameters === 'object') {
        steps.push({ name, parameters: parameters as Record<string, unknown> });
      }
    }
    return steps.length ? steps : null;
  }

  private preprocessingStepsToConfig(
    steps: AnalysisPreprocessingStep[] | null | undefined,
  ): PreprocessingConfig | null {
    if (!steps?.length) return null;
    // Preserve every step: repeated names (e.g. several categorical_column_creator
    // entries) hydrate into an array so edit-hydration does not last-win them.
    const config: PreprocessingConfig = {};
    for (const step of steps) {
      const existing = config[step.name];
      if (existing === undefined) {
        config[step.name] = step.parameters;
      } else if (Array.isArray(existing)) {
        existing.push(step.parameters);
      } else {
        config[step.name] = [existing, step.parameters];
      }
    }
    // The store keeps the repeatable transformation config as a list, whatever the
    // engine's step shape was; one read shape for every consumer.
    const creators = config['categorical_column_creator'];
    if (creators !== undefined && !Array.isArray(creators)) {
      config['categorical_column_creator'] = [creators];
    }
    return config;
  }

  private buildExperimentRequest(
    name: string,
    analysis: AnalysisRequest,
  ): ExperimentCreateRequest {
    return {
      name,
      analysis,
    };
  }

  private rolePayload(
    algo: AlgorithmConfig,
    role: 'y' | 'x',
    codes: string[]
  ): string[] | null {
    const req = algo.inputdata?.[role];
    if (!req) return null;
    if (!codes || codes.length === 0) return null;
    return codes;
  }

  private resolveAlgorithmConfig(algorithmName: string): AlgorithmConfig | undefined {
    const algorithms = this.backendAlgorithms();
    const direct = algorithms[algorithmName];
    if (direct) return direct;

    if (algorithmName === AlgorithmNames.HISTOGRAM) {
      return algorithms[AlgorithmNames.HISTOGRAM];
    }

    return undefined;
  }

  /**
   * Cohort filters for one request. `undefined` keeps the stored rules, `null`
   * means "run with no rules" (the step-0 source snapshot), and a filter object
   * replaces the store without touching it — the Cohort Filtering preview.
   */
  private resolveFilterPayload(filterOverride?: BackendFilter | null): BackendFilter | null {
    return filterOverride === undefined ? this._filterLogic() : filterOverride;
  }

  buildRequestBody(
    algorithmName: string | null = null,
    yVariables: string[] | null = null,
    xVariables: string[] | null = null,
    effectiveAlgorithmName: string | null = null,
    customName: string | null = null,
    bins: number | null = null,
    preprocessingOverride?: PreprocessingConfig | null,
    filterOverride?: BackendFilter | null
  ): any {
    let algoConfig: AlgorithmConfig | undefined;

    if (algorithmName) {
      algoConfig = this.resolveAlgorithmConfig(algorithmName);
    } else {
      algoConfig = this.selectedAlgorithm() ?? undefined;
    }

    if (!algoConfig) {
      throw new Error('No algorithm config found for ' + algorithmName);
    }

    const requestAlgorithmName = effectiveAlgorithmName ?? algoConfig.name;
    const expName = customName ?? `experiment_${requestAlgorithmName.replace(/\s+/g, '_')}`;

    // unified signals
    const variables = yVariables?.length
      ? yVariables
      : this.algorithmY().map((v) => v.code);

    const covariates =
      xVariables ?? this.algorithmX().map((c) => c.code);

    const allConfigs = this.algorithmConfigurations();
    let config = { ...(allConfigs[algoConfig.name ?? ''] || {}) };
    const isCvRequest = this.isCrossValidationAlgorithm(requestAlgorithmName);
    if (isCvRequest && config['n_splits'] === undefined) {
      config['n_splits'] = 5;
    }
    if (!isCvRequest && config['n_splits'] !== undefined) {
      delete config['n_splits'];
    }
    config = this.normalizeParameterConfig(algoConfig, config);


    // filters logic - a `null` filterOverride is the step-0 source snapshot,
    // which previews the selection with no cohort filter attached.
    const filterLogic = this.resolveFilterPayload(filterOverride);
    const hasFilters =
      !!(
        filterLogic &&
        Array.isArray(filterLogic.rules) &&
        filterLogic.rules.length > 0
      );

    const yPayload = this.rolePayload(algoConfig, 'y', variables);
    const xPayload = this.rolePayload(algoConfig, 'x', covariates);
    const filtersPayload = hasFilters ? filterLogic : null;

    // special case for histogram (transient preview)
    if (algorithmName === AlgorithmNames.HISTOGRAM) {
      const histogramY = yVariables?.length ? yVariables : null;
      const histogramPreprocessing = this.resolveHistogramPreprocessing(
        requestAlgorithmName,
        histogramY,
        preprocessingOverride
      );
      const inputdata = this.buildSharedInputDataPayload(
        algoConfig,
        filtersPayload,
        this.selectedDatasetsSignal(),
        histogramY,
      );
      return this.buildExperimentRequest(
        expName,
        {
          inputdata,
          preprocessing: this.preprocessingConfigToSteps(histogramPreprocessing),
          algorithm: {
            name: requestAlgorithmName,
            y: histogramY,
            x: null,
            parameters: {
              histogram_type: HistogramBinningType.WILKINSON,
              ...(bins ? { bins } : {}),
            },
          },
        },
      );
    }
    const preprocessing = this.resolveRequestPreprocessing(
      requestAlgorithmName,
      yPayload,
      xPayload,
      this.getStoredPreprocessingConfig(algoConfig.name, requestAlgorithmName)
    );
    return this.buildExperimentRequest(
      expName,
      {
        inputdata: this.buildSharedInputDataPayload(algoConfig, filtersPayload),
        preprocessing: this.preprocessingConfigToSteps(preprocessing),
        algorithm: {
          name: requestAlgorithmName,
          x: xPayload,
          y: yPayload,
          parameters: config,
        },
      },
    );
  }

  private normalizeParameterConfig(
    algoConfig: AlgorithmConfig,
    config: Record<string, any>
  ): Record<string, any> {
    const normalized = { ...config };
    const numericKeys = new Set(
      (algoConfig.configSchema ?? [])
        .filter((field: any) => field?.type === 'number')
        .map((field: any) => String(field.key))
    );

    numericKeys.forEach((key) => {
      const value = normalized[key];
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) normalized[key] = parsed;
    });

    (algoConfig.configSchema ?? []).forEach((field: any) => {
      if (field?.type !== 'select' && field?.type !== 'multi-select') return;
      const key = String(field.key);
      if (!(key in normalized)) return;
      normalized[key] = serializeAlgorithmParameterValue(normalized[key], field);
    });

    if (normalized['positive_class'] !== undefined && normalized['positive_class'] !== null && normalized['positive_class'] !== '') {
      normalized['positive_class'] = serializeAlgorithmParameterValue(normalized['positive_class'], {
        key: 'positive_class',
        type: 'select',
      });
    }

    if (normalized['event_var'] !== undefined && normalized['event_var'] !== null && normalized['event_var'] !== '') {
      normalized['event_var'] = serializeAlgorithmParameterValue(normalized['event_var'], {
        key: 'event_var',
        type: 'select',
      });
    }

    return omitEmptyOptionalParameters(
      normalized,
      algoConfig.configSchema ?? []
    ) as Record<string, any>;
  }

  private getStoredPreprocessingConfig(...algorithmNames: Array<string | null | undefined>): PreprocessingConfig | null {
    const configs = this.algorithmPreprocessingConfigurations();
    for (const name of algorithmNames) {
      if (!name) continue;
      const config = configs[name];
      if (config && Object.keys(config).length > 0) return config;
    }
    const appliedDescriptivePreprocessing = configs[APPLIED_DESCRIPTIVE_PREPROCESSING];
    if (
      appliedDescriptivePreprocessing &&
      Object.keys(appliedDescriptivePreprocessing).length > 0
    ) {
      return appliedDescriptivePreprocessing;
    }
    return null;
  }

  private resolveHistogramPreprocessing(
    algorithmName: string,
    histogramY: string[] | null,
    preprocessingOverride: PreprocessingConfig | null | undefined
  ): PreprocessingConfig | null {
    if (preprocessingOverride === undefined) {
      return this.resolveRequestPreprocessing(algorithmName, histogramY, null, null);
    }
    if (preprocessingOverride === null) {
      return null;
    }

    const normalized = this.normalizePreprocessingConfig(preprocessingOverride);
    if (!normalized) {
      return this.resolveRequestPreprocessing(algorithmName, histogramY, null, null);
    }
    if (!histogramY?.length) {
      return normalized;
    }

    return (
      this.filterPreprocessingConfigForVariables(normalized, histogramY)
      ?? this.resolveRequestPreprocessing(algorithmName, histogramY, null, null)
    );
  }

  private resolveRequestPreprocessing(
    algorithmName: string,
    yPayload: string[] | string | null,
    xPayload: string[] | string | null,
    explicitPreprocessing: unknown = null
  ): PreprocessingConfig | null {
    if (
      algorithmName === AlgorithmNames.DESCRIBE ||
      algorithmName === AlgorithmNames.OUTLIER_REPORT
    ) {
      return null;
    }

    const explicit = this.normalizePreprocessingConfig(explicitPreprocessing);
    if (explicit) return explicit;

    const variables = Array.from(
      new Set(
        [...this.toArray(yPayload), ...this.toArray(xPayload)]
          .map((code) => String(code).trim())
          .filter((code) => code && code !== 'dataset')
      )
    );

    if (!variables.length) return null;

    return {
      [MISSING_VALUES_HANDLER]: {
        strategies: Object.fromEntries(variables.map((code) => [code, 'drop'])),
      },
    };
  }

  private normalizePreprocessingConfig(value: unknown): PreprocessingConfig | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const preprocessing = value as PreprocessingConfig;
    return Object.keys(preprocessing).length > 0 ? { ...preprocessing } : null;
  }

  /** Keep only preprocessing entries for variables present in the algorithm input (y/x). */
  private filterPreprocessingConfigForVariables(
    preprocessing: PreprocessingConfig,
    variableCodes: string[]
  ): PreprocessingConfig | null {
    const allowed = new Set(
      variableCodes.map((code) => String(code).trim()).filter((code) => code.length > 0)
    );
    if (!allowed.size) return null;

    const filtered: PreprocessingConfig = {};

    const missing = preprocessing[MISSING_VALUES_HANDLER];
    if (missing && typeof missing === 'object' && !Array.isArray(missing)) {
      const next = this.filterPreprocessingStepRecordMaps(
        missing as Record<string, unknown>,
        allowed,
        ['strategies', 'fill_values']
      );
      if (next) filtered[MISSING_VALUES_HANDLER] = next;
    }

    const outlier = preprocessing[OUTLIER_WINSORIZER];
    if (outlier && typeof outlier === 'object' && !Array.isArray(outlier)) {
      const next = this.filterPreprocessingStepRecordMaps(
        outlier as Record<string, unknown>,
        allowed,
        ['strategies', 'tails', 'folds']
      );
      if (next) filtered[OUTLIER_WINSORIZER] = next;
    }

    const longitudinal = preprocessing['longitudinal_transformer'];
    if (longitudinal && typeof longitudinal === 'object' && !Array.isArray(longitudinal)) {
      const longitudinalRecord = longitudinal as Record<string, unknown>;
      const strategies = longitudinalRecord['strategies'];
      if (strategies && typeof strategies === 'object' && !Array.isArray(strategies)) {
        const filteredStrategies = Object.fromEntries(
          Object.entries(strategies as Record<string, unknown>).filter(([code]) => allowed.has(code))
        );
        if (Object.keys(filteredStrategies).length) {
          filtered['longitudinal_transformer'] = {
            ...(longitudinalRecord['visit1'] !== undefined ? { visit1: longitudinalRecord['visit1'] } : {}),
            ...(longitudinalRecord['visit2'] !== undefined ? { visit2: longitudinalRecord['visit2'] } : {}),
            strategies: filteredStrategies,
          };
        }
      }
    }

    return Object.keys(filtered).length > 0 ? filtered : null;
  }

  private filterPreprocessingStepRecordMaps(
    step: Record<string, unknown>,
    allowed: Set<string>,
    perVariableKeys: string[]
  ): Record<string, unknown> | null {
    const next: Record<string, unknown> = {};
    let hasContent = false;

    Object.entries(step).forEach(([key, value]) => {
      if (perVariableKeys.includes(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        const filteredMap = Object.fromEntries(
          Object.entries(value as Record<string, unknown>).filter(([code]) => allowed.has(code))
        );
        if (Object.keys(filteredMap).length > 0) {
          next[key] = filteredMap;
          hasContent = true;
        }
        return;
      }
      next[key] = value;
      hasContent = true;
    });

    return hasContent ? next : null;
  }

  /**
   * Effective preprocessing of a run for `algorithmName` as labelled rows — the same truth
   * source as the request payload, including the defaults Exaflow applies anyway.
   */
  getEffectivePreprocessingEntries(
    algorithmName: string | null | undefined,
    labelMap: Record<string, string> = {}
  ): RunSetupSummaryRow[] {
    if (!algorithmName) return [];
    const poolCodes = this.selectedVariables().map((variable) => variable.code);
    const preprocessing = this.resolveRequestPreprocessing(
      algorithmName,
      poolCodes,
      [],
      this.getStoredPreprocessingConfig(algorithmName)
    );
    return this.formatPreprocessingEntries(preprocessing, labelMap);
  }

  getEffectivePreprocessingSummary(algorithmName: string | null | undefined): string {
    return this.summarizePreprocessingEntries(this.getEffectivePreprocessingEntries(algorithmName));
  }

  formatPreprocessingConfig(preprocessing: unknown, labelMap: Record<string, string> = {}): string {
    return this.summarizePreprocessingEntries(this.formatPreprocessingEntries(preprocessing, labelMap));
  }

  /** `Label: value` rows as the multi-line summary text, or 'none' when nothing was set. */
  private summarizePreprocessingEntries(entries: RunSetupSummaryRow[]): string {
    return entries.length
      ? entries.map((entry) => `${entry.label}: ${entry.value}`).join('\n')
      : 'none';
  }

  formatPreprocessingEntries(
    preprocessing: unknown,
    labelMap: Record<string, string> = {}
  ): RunSetupSummaryRow[] {
    return this.summarizePreprocessingConfig(this.normalizePreprocessingConfig(preprocessing), labelMap);
  }

  private summarizePreprocessingConfig(
    preprocessing: PreprocessingConfig | null,
    labelMap: Record<string, string> = {}
  ): RunSetupSummaryRow[] {
    if (!preprocessing) return [];

    const entries: RunSetupSummaryRow[] = [];
    const missingValues = preprocessing[MISSING_VALUES_HANDLER] as { strategies?: Record<string, unknown> } | undefined;
    const strategies = missingValues?.strategies ?? {};
    const strategyEntries = Object.entries(strategies);
    if (strategyEntries.length) {
      const labels = strategyEntries.map(([code, strategy]) =>
        `${this.preprocessingVariableLabel(code, labelMap)}: ${this.humanizePreprocessingValue(String(strategy))}`
      );
      entries.push({ label: 'Missing values', value: labels.join(', ') });
    }

    const outlier = preprocessing[OUTLIER_WINSORIZER] as {
      strategies?: Record<string, unknown>;
      tails?: Record<string, unknown>;
      folds?: Record<string, unknown>;
    } | undefined;
    const outlierStrategies = outlier?.strategies ?? {};
    const outlierEntries = Object.entries(outlierStrategies);
    if (outlierEntries.length) {
      const labels = outlierEntries.map(([code, strategy]) => {
        const tail = String(outlier?.tails?.[code] ?? 'both');
        const fold = outlier?.folds?.[code];
        const foldText = fold === undefined || fold === null || fold === '' ? 'fold unavailable' : `fold ${fold}`;
        return `${this.preprocessingVariableLabel(code, labelMap)}: ${outlierStrategyLabel(String(strategy))}, ${outlierTailLabel(tail)} ${tail === 'both' ? 'tails' : 'tail'}, ${foldText}`;
      });
      entries.push({ label: 'Outlier winsorizer', value: labels.join('; ') });
    }

    const longitudinal = preprocessing['longitudinal_transformer'] as Record<string, unknown> | undefined;
    if (longitudinal) {
      const visit1 = longitudinal['visit1'];
      const visit2 = longitudinal['visit2'];
      const visitLabel = visit1 && visit2 ? ` (${visit1} to ${visit2})` : '';
      const longitudinalStrategies = longitudinal['strategies'] as Record<string, unknown> | undefined;
      const strategyEntries = Object.entries(longitudinalStrategies ?? {});
      const strategySummary = strategyEntries.length
        ? strategyEntries.map(
          ([code, strategy]) =>
            `${this.preprocessingVariableLabel(code, labelMap)}: ${this.humanizeLongitudinalStrategy(String(strategy))}`
        )
          .join(', ')
        : 'configured';
      entries.push({ label: 'Longitudinal transformation', value: `${strategySummary}${visitLabel}` });
    }

    const knownKeys = new Set([MISSING_VALUES_HANDLER, OUTLIER_WINSORIZER, 'longitudinal_transformer']);
    Object.keys(preprocessing)
      .filter((key) => !knownKeys.has(key))
      .forEach((key) => entries.push({ label: key.replace(/_/g, ' '), value: 'configured' }));

    return entries;
  }

  private preprocessingVariableLabel(code: string, labelMap: Record<string, string>): string {
    return labelMap[code] ?? code;
  }

  private humanizePreprocessingValue(value: string): string {
    switch (value) {
      case 'drop':
        return 'remove rows';
      case 'mean':
        return 'mean imputation';
      case 'median':
        return 'median imputation';
      case 'constant':
        return 'constant value';
      default:
        return value.replace(/_/g, ' ');
    }
  }

  private humanizeLongitudinalStrategy(value: string): string {
    switch (value) {
      case 'diff':
        return 'difference between visits';
      case 'first':
        return 'use first visit';
      case 'second':
        return 'use second visit';
      default:
        return value.replace(/_/g, ' ');
    }
  }

  loadAllDataModels(): Observable<any[]> {
    if (this.dataModelsLoaded) {
      return of(this.dataModels);
    }

    if (!this.dataModelsRequest$) {
      this.dataModelsRequest$ = this.http.get<any[]>(this.apiUrl).pipe(
        tap((models) => {
          this.pathologyAccessWarningSignal.set(null);
          this.dataModels = models;
          this.dataModelsLoaded = true;
        }),
        catchError((err) => {
          const warning = this.resolvePathologyAccessWarning(err);
          if (warning) {
            this.pathologyAccessWarningSignal.set(warning);
            this.clearLoadedDataModelState();
            return of([]);
          }

          this.pathologyAccessWarningSignal.set(null);
          console.error('Error fetching data models:', err);
          this.errorService.setError('Failed to load data models. Please try again.');
          return of([]);
        }),
        finalize(() => {
          this.dataModelsRequest$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }

    return this.dataModelsRequest$;
  }

  private clearLoadedDataModelState(): void {
    this.dataModels = [];
    this.dataModelsLoaded = false;
    this.crossSectionalModels.set([]);
    this.longitudinalModels.set([]);
    this.availableDatasets.set([]);
    this.selectedDataModel.set(null);
    this.selectedDatasetsSignal.set([]);
    this.selectedVariablesSignal.set([]);
    this.algorithmYSignal.set([]);
    this.algorithmXSignal.set([]);
    this.selectedFiltersSignal.set([]);
    this.selectedAlgorithm.set(null);
  }

  private resolvePathologyAccessWarning(err: any): PathologyAccessWarning | null {
    const status = Number(err?.status ?? 0);

    if (status === 404) {
      return {
        kind: 'no-pathologies',
        title: 'No Pathologies Available',
        message: 'This federation does not currently expose any pathologies to the platform.',
      };
    }

    if (status === 403) {
      return {
        kind: 'no-access',
        title: 'No Access to Federation Pathologies',
        message: 'You do not have access to any of the pathologies available in this federation.',
      };
    }

    return null;
  }

  getAllDataModels(): Observable<any[]> {
    return this.loadAllDataModels();
  }

  convertToD3Hierarchy(data: DataModel): {
    hierarchy: D3HierarchyNode;
    allVariables: D3HierarchyNode[];
    allDatasets: any[];
  } {
    const convertVariables = (vars: Variable[] = []): D3HierarchyNode[] =>
      vars.map((v) => ({
        label: v.label,
        code: v.code ?? '',
        value: 1,
        type: v.type ?? 'unknown',
        isCategorical: v.isCategorical ?? !!v.enumerations?.length,
        sql_type: v.sql_type,
        description: v.description ?? '',
        enumerations: v.enumerations ?? [],
        methodology: v.methodology,
        units: v.units,
        minValue: v.minValue,
        maxValue: v.maxValue,
      }));

    const convertGroups = (groups: Group[] = []): D3HierarchyNode[] =>
      groups.map((g) => ({
        label: g.label,
        code: g.code ?? '',
        children: [
          ...convertVariables(g.variables ?? []),
          ...convertGroups(g.groups ?? []),
        ],
      }));

    const extractFlat = (node: any, list: D3HierarchyNode[] = []): D3HierarchyNode[] => {
      if (node.children) node.children.forEach((child: any) => extractFlat(child, list));
      else if (node.label) list.push(node);
      return list;
    };

    const hierarchy: D3HierarchyNode = {
      label: data.label,
      code: data.code ?? '',
      children: [
        ...convertVariables(data.variables ?? []),
        ...convertGroups(data.groups ?? []),
      ],
    };

    const allVariables = extractFlat(hierarchy);

    const datasetSource: any = (data as any).datasets;
    let allDatasets: any[] = [];
    if (Array.isArray(datasetSource)) {
      allDatasets = datasetSource;
    } else if (datasetSource && typeof datasetSource === 'object') {
      if (Array.isArray(datasetSource.enumerations)) {
        allDatasets = datasetSource.enumerations;
      } else if (Array.isArray(datasetSource.values)) {
        allDatasets = datasetSource.values;
      } else if (Array.isArray(datasetSource.items)) {
        allDatasets = datasetSource.items;
      }
    }

    return {
      hierarchy,
      allVariables,
      allDatasets,
    };
  }

  submitRequest(requestBody: any, cacheHandler?: (response: any) => void): Observable<any> {
    return this.http.post<any>(this.experimentUrl, requestBody).pipe(
      switchMap((res) => {
        const uuid = res?.uuid || res?.algorithm?.execution_id;
        if (!uuid) {
          throw new Error('UUID not found in response');
        }
        this.currentExperimentUUIDSignal.set(uuid);
        return this.pollForResults(`${this.experimentUrl}/${uuid}`);
      }),
      tap((response) => {
        if (cacheHandler && response?.result) {
          cacheHandler(response.result);
        }
      }),
      catchError(() => {
        this.errorService.setError('Failed to run experiment. Please try again.');
        this.setRunning(false);
        return of({ status: 'error', result: { message: 'Experiment request failed.' } });
      })
    );
  }


  private isTransientAlgorithm(name: string): boolean {
    return (
      name === AlgorithmNames.HISTOGRAM ||
      name === AlgorithmNames.DESCRIBE ||
      name === AlgorithmNames.OUTLIER_REPORT
    );
  }

  private normalizeResponse(algoName: string, resp: any): any {
    if (this.isTransientAlgorithm(algoName) && resp && !resp.result) {
      return { result: resp };
    }
    return resp;
  }

  private normalizeTransientResponse(resp: any): any {
    if (!resp) return null;
    if (resp.result !== undefined || resp.status !== undefined) return resp;
    return { result: resp };
  }

  private submitTransientRequest(requestBody: any, cacheHandler?: (result: any) => void): Observable<any> {
    return this.http.post<any>(this.transientUrl, requestBody).pipe(
      tap((resp) => {
        if (cacheHandler && resp) cacheHandler(resp);
      }),
      catchError(() => {
        this.errorService.setError('Quick preview failed. Please retry.');
        return of(null);
      })
    );
  }

  //Runs transient or standard algorithm calls.
  //Used for fetching quick results like histograms or descriptive stats.
  getAlgorithmResults(
    algorithmName: string,
    nodeCodes: string[] | null = null,
    bins: number | null = null,
    preprocessingOverride?: PreprocessingConfig | null,
    filterOverride?: BackendFilter | null
  ): Observable<any> {
    if (algorithmName === AlgorithmNames.HISTOGRAM) {
      const requestBody = this.buildRequestBody(
        algorithmName,
        nodeCodes,
        null,
        null,
        null,
        bins,
        preprocessingOverride,
        filterOverride
      );
      return this.submitTransientRequest(requestBody).pipe(
        map(resp => this.normalizeResponse(algorithmName, resp))
      );
    }

    // non-transient: ignore nodeCodes
    const requestBody = this.buildRequestBody(algorithmName);
    return this.submitRequest(requestBody);
  }

  private buildDescriptiveRequestBody(
    variableCodes: string[],
    preprocessing: PreprocessingConfig | null = null,
    sourceVariableCodes: string[] | null = null,
    filterOverride?: BackendFilter | null
  ): ExperimentCreateRequest {
    // A `null` filterOverride is the step-0 source snapshot: the same describe
    // run with no cohort filter attached, i.e. the data exactly as selected.
    const filters = this.resolveFilterPayload(filterOverride);
    const hasFilters = !!(filters && Array.isArray(filters.rules) && filters.rules.length > 0);
    const yPayload = variableCodes.length ? variableCodes : null;
    // Derived columns (e.g. categorical_column_creator output) belong in algorithm.y
    // only. Source inputdata.variables must be real data-model CDEs.
    const sourceCodes = sourceVariableCodes?.length
      ? Array.from(
          new Set([
            ...sourceVariableCodes.map((code) => String(code).trim()).filter(Boolean),
            ...this.collectFilterVariableCodes(hasFilters ? filters : null),
          ])
        )
      : this.collectSourceVariables(hasFilters ? filters : null);

    return this.buildExperimentRequest(
      `experiment_describe_${variableCodes.join('_')}`,
      {
        inputdata: {
          data_model: this.getActiveDataModelCode(),
          datasets: this.selectedDatasetsSignal(),
          validation_datasets: null,
          filters: hasFilters ? filters : null,
          variables: sourceCodes,
        },
        preprocessing: this.preprocessingConfigToSteps(this.normalizePreprocessingConfig(preprocessing)),
        algorithm: {
          name: 'describe',
          y: yPayload,
          x: null,
          parameters: {},
        },
      },
    );
  }

  private buildOutlierReportRequestBody(
    variableCodes: string[],
    parameters: Record<string, unknown>,
    preprocessing: PreprocessingConfig | null = null
  ): ExperimentCreateRequest {
    const filters = this.filterLogic();
    const hasFilters = !!(filters && Array.isArray(filters.rules) && filters.rules.length > 0);
    const selectedYCodes = new Set(this.algorithmY().map((variable) => String(variable?.code ?? '')));
    const selectedXCodes = new Set(this.algorithmX().map((variable) => String(variable?.code ?? '')));
    const y = variableCodes.filter((code) => selectedYCodes.has(code));
    const covariateOnly = variableCodes.filter((code) => selectedXCodes.has(code) && !selectedYCodes.has(code));
    const unassigned = variableCodes.filter((code) => !selectedYCodes.has(code) && !selectedXCodes.has(code));
    const yPayload = y.length ? y : [...covariateOnly, ...unassigned];
    const xPayload = y.length ? covariateOnly : [];

    return this.buildExperimentRequest(
      `experiment_outlier_report_${variableCodes.join('_')}`,
      {
        inputdata: {
          data_model: this.getActiveDataModelCode(),
          datasets: this.selectedDatasetsSignal().filter(ds => !this.excludedDatasetsSignal().includes(ds)),
          validation_datasets: null,
          filters: hasFilters ? filters : null,
          variables: this.collectSourceVariables(hasFilters ? filters : null),
        },
        preprocessing: this.preprocessingConfigToSteps(this.normalizePreprocessingConfig(preprocessing)),
        algorithm: {
          name: AlgorithmNames.OUTLIER_REPORT,
          y: yPayload?.length ? yPayload : null,
          x: xPayload.length ? xPayload : null,
          parameters,
        },
      },
    );
  }

  loadDescriptiveOverview(
    variableCodes: string[],
    preprocessing: PreprocessingConfig | null = null,
    sourceVariableCodes: string[] | null = null,
    filterOverride?: BackendFilter | null
  ): Observable<any> {
    const requestBody = this.buildDescriptiveRequestBody(
      variableCodes,
      preprocessing,
      sourceVariableCodes,
      filterOverride
    );

    return this.submitTransientRequest(requestBody).pipe(
      map(resp => this.normalizeResponse("describe", resp)),
      catchError((error) => {
        console.error("Error fetching descriptive overview:", error);
        this.errorService.setError('Failed to load descriptive statistics.');
        return of(null);
      })
    );
  }

  /** Public helper for Transformation stats: collect CDE codes referenced by a filter tree. */
  /** Accepts a rule tree or the bare condition a category rule can hold. */
  filterVariableCodes(logic: BackendFilter | BackendRule | null): string[] {
    return this.collectFilterVariableCodes(logic);
  }

  loadOutlierReportPreview(
    variableCodes: string[],
    parameters: Record<string, unknown>,
    preprocessing: PreprocessingConfig | null = null
  ): Observable<any> {
    const requestBody = this.buildOutlierReportRequestBody(variableCodes, parameters, preprocessing);

    return this.submitTransientRequest(requestBody).pipe(
      map(resp => this.normalizeTransientResponse(resp)),
      catchError((error) => {
        console.error("Error fetching outlier report preview:", error);
        this.errorService.setError('Failed to load outlier report preview.');
        return of(null);
      })
    );
  }

  runSelectedAlgorithm(
    algorithmNameOverride: string | null = null,
    effectiveAlgorithmName: string | null = null,
    customName: string | null = null
  ): Observable<any> | null {
    const selectedAlgo = this.selectedAlgorithm();
    if (!selectedAlgo) {
      console.error('No algorithm selected.');
      return null;
    }

    const baseAlgorithmName = algorithmNameOverride ?? selectedAlgo.name;
    const requestAlgorithmName = effectiveAlgorithmName ?? baseAlgorithmName;

    if (baseAlgorithmName === 'describe') {
      const variableCodes = this.selectedVariables().map((v) => v.code);
      if (!variableCodes.length) {
        console.warn('Descriptive stats: no variables selected.');
        return null;
      }
      return this.loadDescriptiveOverview(variableCodes);
    }

    const requestBody = this.buildRequestBody(baseAlgorithmName, null, null, requestAlgorithmName, customName);

    return this.submitRequest(requestBody);
  }

  runSelectedAlgorithmTransient(
    algorithmNameOverride: string | null = null,
    effectiveAlgorithmName: string | null = null
  ): Observable<any> | null {
    const selectedAlgo = this.selectedAlgorithm();
    if (!selectedAlgo) {
      console.error('No algorithm selected.');
      return null;
    }

    const baseAlgorithmName = algorithmNameOverride ?? selectedAlgo.name;
    const requestAlgorithmName = effectiveAlgorithmName ?? baseAlgorithmName;

    if (baseAlgorithmName === 'describe') {
      const variableCodes = this.selectedVariables().map((v) => v.code);
      if (!variableCodes.length) {
        console.warn('Descriptive stats: no variables selected.');
        return null;
      }
      return this.loadDescriptiveOverview(variableCodes).pipe(
        map(resp => this.normalizeTransientResponse(resp))
      );
    }

    const requestBody = this.buildRequestBody(
      baseAlgorithmName,
      null,
      null,
      requestAlgorithmName
    );

    return this.submitTransientRequest(requestBody).pipe(
      map(resp => this.normalizeTransientResponse(resp))
    );
  }


  pollForResults(url: string): Observable<any> {
    const pollingInterval = 5000;
    const maxRetries = 60;
    return timer(0, pollingInterval).pipe(
      take(maxRetries),
      switchMap(() =>
        this.http.get<any>(url).pipe(
          map((response) => {
            if (response.status === 'success' || response.status === 'error') {
              return response;
            }
            return null;
          }),
          catchError(() =>
            of({
              status: 'error',
              result: { message: 'Network or server error while polling results.' }
            })
          )
        )
      ),
      filter((result) => result !== null),
      take(1),
      defaultIfEmpty({
        status: 'error',
        result: { message: 'Experiment run timed out before completion.' }
      })
    );
  }

  categorizeDataModels(dataModels: DataModel[]): {
    crossSectional: DataModel[];
    longitudinal: DataModel[];
  } {
    return {
      crossSectional: dataModels.filter((m) => !m.longitudinal),
      longitudinal: dataModels.filter((m) => m.longitudinal)
    };
  }

  updateExperimentName(uuid: string, newName: string) {
    return this.http.patch(`/services/experiments/${uuid}`, { name: newName });
  }

  get filterLogic() {
    return this._filterLogic.asReadonly();
  }

  setFilterLogic(logic: BackendFilter | null) {
    this._filterLogic.set(logic);
  }

  private toArray = (v: any): string[] => v == null ? [] : Array.isArray(v) ? v : [v];

  loadAndCategorizeModels(): Observable<any[]> {
    return this.getAllDataModels().pipe(
      tap((models) => {
        const { crossSectional, longitudinal } = this.categorizeDataModels(models);
        this.crossSectionalModels.set(crossSectional);
        this.longitudinalModels.set(longitudinal);
      })
    );
  }

  getDatasetLabelMap(): Record<string, string> {
    const available = this.availableDatasets();
    if (available.length) {
      return Object.fromEntries(available.map((dataset) => [dataset.code, dataset.label]));
    }

    const model = this.selectedDataModel();
    if (!model) return {};

    const { allVariables } = this.convertToD3Hierarchy(model);
    const datasetVariable = allVariables.find(
      (variable: any) => String(variable?.code ?? '').toLowerCase() === 'dataset'
    );
    const map: Record<string, string> = {};
    (datasetVariable?.enumerations ?? []).forEach((dataset: any) => {
      const code = String(dataset?.code ?? '');
      if (!code) return;
      map[code] = String(dataset?.label ?? dataset?.name ?? code);
    });
    return map;
  }

  updateAvailableDatasets(model: DataModel | null): void {
    if (!model) {
      this.availableDatasets.set([]);
      return;
    }
    const { allVariables } = this.convertToD3Hierarchy(model);
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
    const available = datasetEnums
      .filter((dataset: any) => {
        const code = String(dataset?.code ?? '');
        return allowedCodes.size === 0 || allowedCodes.has(code);
      })
      .map((dataset: any) => ({
        code: String(dataset?.code ?? ''),
        label: String(dataset?.label ?? dataset?.name ?? dataset?.code ?? ''),
      }));
    this.availableDatasets.set(available);
  }

  hydrateFromBackendExperiment(exp: BackendExperiment): void {
    if (!exp?.analysis?.algorithm) {
      console.warn('hydrateFromBackendExperiment called with invalid exp:', exp);
      return;
    }

    this.isShared.set(!!exp.shared);
    this.setEditingExistingExperiment(true);
    this.currentExperimentUUIDSignal.set(exp.uuid ?? null);

    const analysis = exp.analysis;
    const algoName = analysis.algorithm.name;
    const input = analysis.inputdata || {};
    const params = analysis.algorithm.parameters || {};
    const preprocessing = this.preprocessingStepsToConfig(analysis.preprocessing);
    const filters = input.filters ?? null;

    // Selected datasets
    this.setSelectedDatasets(this.toArray(input.datasets));

    this.setFilterLogic(filters);

    this.loadAllDataModels()
      .pipe(takeUntil(this.destroy$))
      .subscribe((models) => {
        if (!models || !models.length) {
          console.warn('No data models available for hydration.');
          return;
        }

        const model = findDataModelByCodeVersion(input.data_model, models);
        if (!model) {
          console.warn(
            'No matching data model found for',
            input.data_model,
            'in',
            models
          );
          return;
        }

        this.selectedDataModel.set(model);

        const converted = this.convertToD3Hierarchy(model);
        const allVariables = converted.allVariables;

        const yCodes = this.toArray(analysis.algorithm.y);
        const xCodes = this.toArray(analysis.algorithm.x);
        const filterCodes = this.collectFilterVariableCodes(filters);

        const yRealNodes = allVariables
          .filter((v: any) => yCodes.includes(v.code))
          .map((n) => this.enrichVariableNode(n));

        const xRealNodes = allVariables
          .filter((v: any) => xCodes.includes(v.code))
          .map((n) => this.enrichVariableNode(n));

        const filterNodes = allVariables.filter((v: any) =>
          filterCodes.includes(v.code)
        );

        // Saved y/x codes not present in the data model are derived columns
        // (e.g. the transformation output). Represent them as synthetic nodes.
        // They belong only in the role signals and the assignable computed, never
        // in the variables-panel pool (which holds real CDE nodes only).
        const knownCodes = new Set(allVariables.map((v: any) => v.code));
        const yNodes = [...yRealNodes];
        const xNodes = [...xRealNodes];
        yCodes
          .filter((code: string) => !knownCodes.has(code))
          .forEach((code: string) => yNodes.push(this.syntheticDerivedNode(code)));
        xCodes
          .filter((code: string) => !knownCodes.has(code))
          .forEach((code: string) => xNodes.push(this.syntheticDerivedNode(code)));

        // Pool = unique real CDE nodes from saved inputdata.variables plus saved y + x.
        // input.variables may contain derived codes that are absent from the data
        // model (synthetics), so filtering against allVariables excludes them.
        const inputVariables = this.toArray(input.variables || analysis.inputdata?.variables || []);
        const inputRealNodes = allVariables
          .filter((v: any) => inputVariables.includes(v.code))
          .map((n) => this.enrichVariableNode(n));

        this.setVariables(this.uniqueByCode([...inputRealNodes, ...yRealNodes, ...xRealNodes]));
        this.setAlgorithmY(yNodes);
        this.setAlgorithmX(xNodes);
        this.setFilters(filterNodes);

        const algoConfig = this.backendAlgorithms()[algoName];

        if (!algoConfig) {
          console.warn('Algorithm config not found for', algoName);
          return;
        }

        const existingConfigs = this.algorithmConfigurations();
        this.algorithmConfigurations.set({
          ...existingConfigs,
          [algoName]: params,
        });
        this.algorithmPreprocessingConfigurations.set({
          ...this.algorithmPreprocessingConfigurations(),
          [algoName]: preprocessing,
          [APPLIED_DESCRIPTIVE_PREPROCESSING]: preprocessing,
        });

        this.setAlgorithm(algoConfig);
      });
  }

  onToggleShare(): void {
    const nextShared = !this.isShared();
    const uuid = this.currentExperimentUUID();

    if (!uuid) {
      console.warn('Cannot toggle share: missing experiment UUID');
      return;
    }

    this.http
      .patch<BackendExperiment>(`${this.experimentUrl}/${uuid}`, { shared: nextShared })
      .subscribe({
        next: (updated) => this.isShared.set(!!updated.shared),
        error: (err) => console.error('Failed to toggle share', err),
      });
  }


  private enrichVariableNode(node: D3HierarchyNode): any {
    const supported = this.algorithmEnabled(node.type ?? 'unknown');
    return { ...node, supportedAlgos: supported };
  }

  private collectFilterVariableCodes(logic: BackendFilter | BackendRule | null): string[] {
    if (!logic) return [];
    const codes = new Set<string>();

    const walk = (node: any) => {
      if (!node) return;
      if (Array.isArray(node.rules)) {
        node.rules.forEach(walk);
      } else if (node.field || node.id) {
        const c = node.field ?? node.id;
        if (typeof c === 'string') codes.add(c);
      }
    };

    walk(logic);
    return [...codes];
  }

  /** Codes of source CDEs referenced by the transformation rule filters. */
  private collectTransformationFilterCodes(): string[] {
    const codes = new Set<string>();
    for (const creator of this.appliedCategoricalCreators()) {
      const rules = (creator['rules'] ?? {}) as Record<string, BackendFilter>;
      Object.values(rules).forEach((filter) => {
        this.collectFilterVariableCodes(filter).forEach((code) => codes.add(code));
      });
    }
    return [...codes];
  }

  setEditingExistingExperiment(isEditing: boolean) {
    this.editingExistingExperimentSignal.set(isEditing);
  }

  clearCurrentExperimentUUID(): void {
    this.currentExperimentUUIDSignal.set(null);
  }

  hasPersistedStudioWork(): boolean {
    return (
      this.selectedVariables().length > 0
      || this.algorithmY().length > 0
      || this.algorithmX().length > 0
      || this.selectedFilters().length > 0
      || !!this.selectedAlgorithm()
      || !!this.currentExperimentUUID()
      || this.hasAppliedDescriptivePreprocessing()
      || Object.keys(this.algorithmConfigurations()).length > 0
    );
  }

  getDefaultDataModel(): DataModel | null {
    if (this.editingExistingExperiment()) {
      return null;
    }

    const models = [...this.crossSectionalModels(), ...this.longitudinalModels()];
    return models[0] ?? null;
  }

  preselectAllDatasetsForModel(model: DataModel): void {
    this.updateAvailableDatasets(model);
    const codes = this.availableDatasets().map((dataset) => dataset.code);
    if (codes.length > 0) {
      this.setSelectedDatasets(codes);
      return;
    }

    const fallbackCodes = (model.datasets ?? [])
      .map((item) => String(item))
      .filter((code) => code);
    if (fallbackCodes.length > 0) {
      this.setSelectedDatasets(fallbackCodes);
    }
  }

  resetStudioStateForGuide(): void {
    const defaultModel = this.getDefaultDataModel();
    this.resetStudioState();
    if (defaultModel) {
      this.selectedDataModel.set(defaultModel);
      this.preselectAllDatasetsForModel(defaultModel);
    }
  }

  resetStudioState(): void {
    // basic signals
    this.selectedDatasetsSignal.set([]);
    this.selectedDataModel.set(null);

    this.setVariables([]);
    this.setAlgorithmY([]);
    this.setAlgorithmX([]);
    this.setFilters([]);

    this._filterLogic.set(null);
    this.errorService.clearError();
    this.clearDataExclusionWarnings();

    // algorithm state
    this.selectedAlgorithm.set(null);
    this.algorithmConfigurations.set({});
    this.algorithmPreprocessingConfigurations.set({});
    this.lastUsedAlgorithm.set(null);

    // execution step state (results are session-scoped, see hasRunStarted)
    this.runResult.set(null);
    this.runError.set(null);
    this.runSetup.set(null);
    this.lastRunSchema.set([]);
    this.hasRunStarted.set(false);
    this.runStatusText.set('Processing experiment...');
    this.saveSucceeded.set(false);

    // meta info
    this.currentExperimentUUIDSignal.set(null);
    this.setEditingExistingExperiment(false);

    // share flag for safety
    this.isShared.set(false);
    this.sessionStorage.removeItem('selectedVariables');
    this.sessionStorage.removeItem('algorithmY');
    this.sessionStorage.removeItem('algorithmX');
    this.sessionStorage.removeItem('selectedFilters');
    this.sessionStorage.removeItem('selectedDatasets');
    this.sessionStorage.removeItem('selectedDataModel');
    this.sessionStorage.removeItem('selectedAlgorithm');
    this.sessionStorage.removeItem('algorithmConfigurations');
    this.sessionStorage.removeItem('algorithmPreprocessingConfigurations');
    this.sessionStorage.removeItem('filterLogic');
    this.sessionStorage.removeItem('lastUsedAlgorithm');

    // cancel any in-flight transient requests
    this.destroy$.next();
  }

  setRunning(isRunning: boolean): void {
    this._isRunning.set(isRunning);
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
