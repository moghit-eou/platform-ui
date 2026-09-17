import { SessionStorageService } from './../../../services/session-storage.service';
import { ChangeDetectionStrategy, Component, inject, signal, computed, effect, untracked, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { buildFormControl } from '../../shared/utils/form-control.factory';
import { getOutputSchema, prettifyLabel as toHumanLabel } from '../../../core/algorithm-mappers';
import { formatInputCountRange } from '../../../core/algorithm-input-counts';
import {
  omitEmptyOptionalParameters,
  optionBindingValue,
  serializeAlgorithmParameterValue,
} from '../../../core/algorithm-parameter.utils';
import { AlgorithmAvailabilityDetail, AlgorithmConfig } from '../../../models/algorithm-definition.model';
import { ResultsPdfExportService } from '../../../services/export-results-pdf.service';
import { ErrorService } from '../../../services/error.service';
import { AuthService } from '../../../services/auth.service';
import { AlgorithmNames, VariableTypes } from '../../../core/constants/algorithm.constants';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import {
  createDefaultOutlierRule,
  defaultFoldForStrategy,
  hydrateOutlierRules,
  isOutlierEligibleVariable,
  OUTLIER_STRATEGIES,
  OUTLIER_TAILS,
  OutlierRule,
  OutlierStrategy,
  OutlierTail,
  serializeOutlierRules,
  validateOutlierRule,
} from '../../../core/outlier-rules';
import { AlgorithmRoleAssignmentComponent } from './algorithm-role-assignment/algorithm-role-assignment.component';

type AlgorithmStudioSubstep = 'setup' | 'parameters';

type AlgorithmRunRequirementKind = 'availability' | 'preprocessing';

interface AlgorithmRunRequirement {
  id: AlgorithmRunRequirementKind;
  message: string;
  actionLabel: string;
}

@Component({
  selector: 'app-algorithm-panel',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AlgorithmRoleAssignmentComponent,
  ],
  templateUrl: './algorithm-panel.component.html',
  styleUrl: './algorithm-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class AlgorithmPanelComponent {
  pdfExport = inject(ResultsPdfExportService);
  private errorService = inject(ErrorService);
  private authService = inject(AuthService);
  private runtimeEnvService = inject(RuntimeEnvService);
  private studioNavigation = inject(ExperimentStudioNavigationService);
  experimentStudioService = inject(ExperimentStudioService);
  sessionStorage = inject(SessionStorageService);
  lastUsedAlgorithm = '';
  errorMsg = signal<string | null>(null);
  readonly isRunning = this.experimentStudioService.isRunning;

  /** Studio: setup (roles + methods), then parameters (configure + run). Results live in the Execution step. */
  readonly studioSubstep = signal<AlgorithmStudioSubstep>('setup');
  readonly studioSubstepChange = output<AlgorithmStudioSubstep>();

  setStudioSubstep(step: AlgorithmStudioSubstep): void {
    this.studioSubstep.set(step);
    this.studioSubstepChange.emit(step);
  }

  readonly mipVersion = this.runtimeEnvService.mipVersion;

  readonly selectedAlgorithm = this.experimentStudioService.selectedAlgorithm;
  readonly selectedAlgorithmDocumentation = computed(() => this.selectedAlgorithm()?.documentation?.trim() ?? '');
  readonly selectedAlgorithmUnavailable = computed(() => {
    const algorithm = this.selectedAlgorithm();
    return !!algorithm && !this.experimentStudioService.isAlgorithmAvailable(algorithm.name);
  });
  readonly selectedAlgorithmAvailabilitySummary = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm || !this.selectedAlgorithmUnavailable()) return '';
    const summary = this.experimentStudioService.getAlgorithmAvailability(algorithm.name).summary ?? algorithm.availability?.summary ?? '';
    return this.formatAvailabilityMessage(summary);
  });
  readonly algorithmRunRequirements = computed((): AlgorithmRunRequirement[] => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return [];

    const requirements: AlgorithmRunRequirement[] = [];

    if (this.selectedAlgorithmUnavailable()) {
      const summary = this.selectedAlgorithmAvailabilitySummary();
      requirements.push({
        id: 'availability',
        message: summary || 'Algorithm requirements are not satisfied.',
        actionLabel: this.availabilityRequirementActionLabel(algorithm.name),
      });
    }

    const preprocessingMessage = this.preprocessingRunBlockMessage();
    if (preprocessingMessage) {
      requirements.push({
        id: 'preprocessing',
        message: preprocessingMessage,
        actionLabel: 'Go to preprocessing',
      });
    }

    return requirements;
  });
  readonly selectedAlgorithmCategory = computed(() => this.selectedAlgorithm()?.category?.trim() ?? '');
  readonly yVar = computed(() => this.experimentStudioService.algorithmY()[0]?.code ?? null);
  readonly xVar = computed(() => this.experimentStudioService.algorithmX()[0]?.code ?? null);
  readonly crossValidationEnabled = signal(false);
  private readonly crossValidationSelections: Record<string, boolean> = {};
  readonly transformationEnabled = signal(false);
  private readonly transformationSelectionsByAlgorithm: Record<string, Record<string, string>> = {};
  readonly isCrossValidationOnly = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return false;
    return this.experimentStudioService.isCrossValidationOnly(algorithm.name);
  });
  readonly canToggleTransformation = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return false;
    const baseName = this.experimentStudioService.getTransformationBase(algorithm.name) ?? algorithm.name;
    return !!this.experimentStudioService.getTransformationVariant(baseName);
  });
  readonly transformationTypes = ['standardize', 'center', 'exp'] as const;
  transformationAssignments: Record<string, string> = {};
  readonly outlierStrategies = OUTLIER_STRATEGIES;
  readonly outlierTails = OUTLIER_TAILS;
  outlierReportRules: Record<string, OutlierRule> = {};
  outlierReportValidationErrors: Record<string, string> = {};
  readonly canToggleCrossValidation = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return false;
    if (this.experimentStudioService.isCrossValidationOnly(algorithm.name)) return false;
    const baseName = this.experimentStudioService.getCrossValidationBase(algorithm.name) ?? algorithm.name;
    return (
      !!this.experimentStudioService.getCrossValidationVariant(baseName) &&
      !!this.experimentStudioService.backendAlgorithms()[baseName]
    );
  });
  readonly isOutlierReportSelected = computed(
    () => this.selectedAlgorithm()?.name === AlgorithmNames.OUTLIER_REPORT
  );
  readonly hasAlgorithmParameterControls = computed(() => (
    this.visibleConfigSchema().length > 0 ||
    this.isOutlierReportSelected() ||
    this.canToggleCrossValidation() ||
    this.isCrossValidationOnly() ||
    this.canToggleTransformation()
  ));
  readonly preprocessingRunBlockMessage = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return null;
    if (algorithm.name === AlgorithmNames.OUTLIER_REPORT) return null;
    if (
      this.experimentStudioService.hasAppliedDescriptivePreprocessing() ||
      this.experimentStudioService.hasRequestPreprocessingForRun(algorithm.name)
    ) return null;
    return 'Apply missing value preprocessing before running algorithms.';
  });
  private readonly formInvalid = signal(false);
  readonly canRun = computed(() => (
    !!this.selectedAlgorithm() &&
    !this.isRunning() &&
    !this.selectedAlgorithmUnavailable() &&
    !this.preprocessingRunBlockMessage() &&
    !this.formInvalid()
  ));
  readonly runDisabledReason = computed(() => {
    if (this.isRunning()) return 'Experiment is running';
    if (!this.selectedAlgorithm()) return 'Select an algorithm to run';
    if (this.selectedAlgorithmUnavailable()) return 'Algorithm unavailable for the current selection';
    const preprocessing = this.preprocessingRunBlockMessage();
    if (preprocessing) return preprocessing;
    if (this.formInvalid()) return 'Complete variable and algorithm selection to proceed';
    return 'Execute experiment';
  });
  readonly labelMap = this.experimentStudioService.variableLabelMap;

  // UI toggle: the catalog defaults to runnable methods only — each group lists just the
  // available algorithms. Switching to All re-lists unavailable methods with their reason.
  readonly showOnlyActive = signal(true);
  /** Instant text filter over label, name, description, documentation, category, and flags. */
  readonly algoSearchQuery = signal('');
  readonly hasAnyVisibleAlgorithms = computed(() => {
    return this.filteredAlgorithmCategories().some(c => c.algorithms?.length > 0);
  });

  prettyFieldLabel(field: any): string {
    let base = field.label ?? field.key;
    if ((field.key === 'groupA' || field.key === 'groupB')) {
      const x = this.experimentStudioService.algorithmX();
      const cov = x[0];
      const covName = cov?.label || cov?.name || cov?.code;
      if (covName) base = `${base} (${covName})`;
    }
    return base;
  }

  private variableOptionsForRoles(roles: string[]): Array<{ code: string; label: string }> {
    const roleList = roles.length ? roles : ['x'];
    return roleList.flatMap((role) => {
      const selected =
        role === 'y'
          ? this.experimentStudioService.algorithmY()
          : role === 'x'
            ? this.experimentStudioService.algorithmX()
            : [];

      return selected
        .map((item: any) => {
          const code = item?.code;
          if (code === null || code === undefined || code === '') return null;
          return {
            code: String(code),
            label: String(item?.label ?? item?.name ?? code),
          };
        })
        .filter((item): item is { code: string; label: string } => !!item);
    });
  }
  private enumOptionsForRole(role: string | null | undefined): any[] {
    const selected =
      role === 'x'
        ? this.experimentStudioService.algorithmX()[0]
        : this.experimentStudioService.algorithmY()[0];
    return Array.isArray(selected?.enumerations) ? [...selected.enumerations] : [];
  }

  private resolveSelectedEventVarCode(algorithmName: string | undefined): string | null {
    if (!algorithmName) return null;

    const live = this.eventVarSelection();
    if (live !== null && live !== undefined && String(live).trim() !== '') {
      return String(live);
    }

    const stored = untracked(() => this.experimentStudioService.algorithmConfigurations())[
      algorithmName
    ]?.['event_var'];
    if (stored !== undefined && stored !== null && String(stored).trim() !== '') {
      return String(stored);
    }

    return null;
  }

  private buildConfigSchemaSignature(
    algorithmName: string,
    schema: Array<{ key?: string; type?: string; required?: boolean; options?: unknown[] }>
  ): string {
    return JSON.stringify({
      algorithmName,
      crossValidation: this.crossValidationEnabled(),
      fields: schema.map((field) => ({
        key: field.key,
        type: field.type,
        required: field.required,
        options: (field.options ?? []).map((opt) => this.optionValue(opt)),
      })),
    });
  }

  private syncEventVarSelectionFromValues(
    algorithmName: string,
    values: Record<string, unknown>
  ): void {
    if (!Object.prototype.hasOwnProperty.call(values, 'event_var')) return;
    const raw = values['event_var'];
    const next =
      raw !== null && raw !== undefined && String(raw).trim() !== '' ? String(raw) : null;
    if (this.eventVarSelection() === next) return;
    this.eventVarSelection.set(next);
    this.syncPositiveClassWithEventVar(algorithmName);
  }

  private syncEventVarSelectionFromStored(stored: Record<string, unknown>): void {
    const raw = stored['event_var'];
    const next =
      raw !== null && raw !== undefined && String(raw).trim() !== '' ? String(raw) : null;
    this.eventVarSelection.set(next);
  }

  private enumOptionsForVariableCode(
    varCode: string | null | undefined
  ): Array<{ code: string; label: string }> {
    if (!varCode) return [];

    const variables = [
      ...this.experimentStudioService.algorithmY(),
      ...this.experimentStudioService.algorithmX(),
    ];
    const variable = variables.find((item) => String(item?.code) === String(varCode));
    if (!variable) return [];

    const enumerations = Array.isArray(variable.enumerations) ? variable.enumerations : [];
    const seen = new Set<string>();

    return enumerations
      .map((entry: any) => {
        const code = entry?.code ?? entry?.value ?? entry?.name ?? entry?.label;
        if (code === null || code === undefined || String(code).trim() === '') {
          return null;
        }
        const normalizedCode = String(code);
        if (seen.has(normalizedCode)) return null;
        seen.add(normalizedCode);
        return {
          code: normalizedCode,
          label: String(entry?.label ?? entry?.name ?? normalizedCode),
        };
      })
      .filter(
        (item: { code: string; label: string } | null): item is { code: string; label: string } =>
          !!item
      );
  }

  /** Live event_var from the config form; avoids reading FormGroup inside other computeds. */
  private readonly eventVarSelection = signal<string | null>(null);

  readonly selectedEventVarCode = computed(() => {
    const algorithm = this.selectedAlgorithm();
    return algorithm ? this.resolveSelectedEventVarCode(algorithm.name) : null;
  });

  readonly positiveClassOptions = computed(() =>
    this.enumOptionsForVariableCode(this.selectedEventVarCode())
  );

  private isCoxRegressionAlgorithm(algorithmName: string | null | undefined): boolean {
    return algorithmName === 'cox_regression_classical' || algorithmName === 'cox_regression_stacked';
  }

  private optionValue(opt: any): any {
    if (opt && typeof opt === 'object') {
      return opt.code ?? opt.value ?? opt.name ?? opt.label ?? String(opt);
    }
    return opt;
  }

  // sensible defaults
  private readonly uiDefaults: Record<string, any> = {
    alpha: 0.05,
    alt_hypothesis: 'two-sided',
    mu: 0.0,
    n_splits: 5,
    k: 4,
    tol: 0.01,
    sstype: 2,
    conf_level: 0.95,
    iterations: 1000,
  };

  constructor() {
    effect(() => {
      const algorithm = this.selectedAlgorithm();
      if (!algorithm) {
        this.crossValidationEnabled.set(false);
        return;
      }
      if (this.experimentStudioService.isCrossValidationOnly(algorithm.name)) {
        this.crossValidationEnabled.set(true);
        return;
      }
      const baseName = this.experimentStudioService.getCrossValidationBase(algorithm.name) ?? algorithm.name;
      const hasVariant = !!this.experimentStudioService.getCrossValidationVariant(baseName);
      if (!hasVariant) {
        this.crossValidationEnabled.set(false);
        return;
      }
      const stored = this.crossValidationSelections[baseName];
      const defaultValue = stored !== undefined
        ? stored
        : this.experimentStudioService.isCrossValidationAlgorithm(algorithm.name);
      this.crossValidationEnabled.set(defaultValue);
    });

    effect(() => {
      const algorithm = this.selectedAlgorithm();
      const variables = this.experimentStudioService.algorithmY();
      if (!algorithm) {
        this.transformationEnabled.set(false);
        this.transformationAssignments = {};
        return;
      }

      const baseName =
        this.experimentStudioService.getTransformationBase(algorithm.name) ?? algorithm.name;
      const hasVariant = !!this.experimentStudioService.getTransformationVariant(baseName);

      if (!hasVariant) {
        this.transformationEnabled.set(false);
        this.transformationAssignments = {};
        return;
      }

      const storedConfigs = this.experimentStudioService.algorithmConfigurations();
      const storedData = storedConfigs?.[baseName]?.['data_transformation'];
      const fromConfig = this.extractTransformationAssignments(storedData);
      const previous = this.transformationSelectionsByAlgorithm[baseName] ?? {};

      const next: Record<string, string> = {};
      (variables ?? []).forEach((v) => {
        const code = v?.code;
        if (!code) return;
        next[code] = fromConfig[code] ?? previous[code] ?? 'none';
      });

      this.transformationAssignments = next;
      this.transformationSelectionsByAlgorithm[baseName] = { ...next };

      const hasAny = Object.values(next).some(v => v && v !== 'none');
      this.transformationEnabled.set(hasAny);
    });

    effect(() => {
      // Establish dependencies
      this.selectedAlgorithm();
      this.experimentStudioService.algorithmY();
      this.experimentStudioService.algorithmX();

      // A new selection invalidates whatever the last run produced
      this.experimentStudioService.runResult.set(null);
      this.experimentStudioService.runError.set(null);
    });

    effect(() => {
      const algorithm = this.selectedAlgorithm();
      const variables = this.outlierReportVariables();
      if (!algorithm || algorithm.name !== AlgorithmNames.OUTLIER_REPORT) {
        this.outlierReportValidationErrors = {};
        return;
      }
      const stored = untracked(() => this.experimentStudioService.algorithmConfigurations()[algorithm.name] ?? {});
      this.reconcileOutlierReportRules(variables, stored);
    });

    effect((onCleanup) => {
      const algorithm = this.selectedAlgorithm();
      const schema = this.visibleConfigSchema();

      if (!algorithm) {
        this.lastBuiltFormSchemaSignature = '';
        this.eventVarSelection.set(null);
        this.configForm.set(new FormGroup({}));
        this.formInvalid.set(false);
        return;
      }

      const schemaSignature = this.buildConfigSchemaSignature(algorithm.name, schema);
      if (schemaSignature === this.lastBuiltFormSchemaSignature) {
        return;
      }
      this.lastBuiltFormSchemaSignature = schemaSignature;

      const allConfigs = untracked(() => this.experimentStudioService.algorithmConfigurations());
      const stored = allConfigs?.[algorithm.name] || {};
      this.syncEventVarSelectionFromStored(stored);

      const group: { [key: string]: FormControl } = {};

      schema.forEach((field) => {
        // backend default
        let backendDefault =
          field.default !== undefined ? field.default : null;
        const storedValue = stored?.[field.key];

        // special treatment for alpha
        if ((backendDefault === null || backendDefault === undefined) && field.key === 'alpha') {
          backendDefault = 0.05;
        }

        // fallback value logic
        const fallback =
          storedValue !== undefined
            ? storedValue
            : field.default !== undefined && field.default !== null
              ? field.default
              : backendDefault !== undefined && backendDefault !== null
                ? backendDefault
                : this.uiDefaults[field.key] !== undefined
                  ? this.uiDefaults[field.key]
                  : field.type === 'checkbox'
                    ? false
                    : '';

        // label if missing
        const label =
          field.label && field.label.trim() !== ''
            ? field.label
            : toHumanLabel(field.key);

        const prettyField = {
          ...field,
          label,
          desc: field.desc ?? field.description ?? '',
        };

        const control = buildFormControl(prettyField, fallback);

        // extra validation: integer-only for numeric fields
        const isNumeric = prettyField.type === 'number';
        const allowsDecimal =
          prettyField.types?.includes('real') ||
          prettyField.key === 'alpha' ||
          prettyField.key === 'tol' ||
          prettyField.key === 'mu';

        if (isNumeric && !allowsDecimal) {
          const integerPattern = Validators.pattern(/^-?\d+$/);
          const existingValidator = control.validator;

          control.setValidators(
            existingValidator ? [existingValidator, integerPattern] : [integerPattern]
          );

          // stop events while building form
          control.updateValueAndValidity({ emitEvent: false });
        }

        group[field.key] = control;
      });

      const form = new FormGroup(group, { updateOn: 'change' });
      this.configForm.set(form);
      this.formInvalid.set(form.invalid);

      Object.values(this.configForm().controls).forEach(control => {
        if (control.valid) {
          control.markAsTouched({ onlySelf: true });
        }
      });

      const statusSub = form.statusChanges.subscribe(() => this.formInvalid.set(form.invalid));
      const subscription = form.valueChanges.subscribe((values) => {
        this.syncEventVarSelectionFromValues(algorithm.name, values);
        this.persistCurrentFormConfig(
          algorithm.name,
          untracked(() => this.visibleConfigSchema())
        );
      });
      onCleanup(() => {
        subscription.unsubscribe();
        statusSub.unsubscribe();
      });

      this.formKey++;
    });
    effect(() => {
      const res = this.experimentStudioService.runResult();
      const schema = this.outputSchema();

      if (!res || !schema.length) return;

      const missing = schema.filter(field => !(field.key in res));
      if (missing.length > 0) {
        console.warn('[Validation] Missing fields from result:', missing.map(f => f.key));
      }
    });

    effect(() => {
      const categories = this.filteredAlgorithmCategories();
      const selectedName = this.selectedAlgorithm()?.name ?? null;
      untracked(() => this.syncMatchCategoryOpen(categories, selectedName));
    });
  }


  configForm = signal<FormGroup>(new FormGroup({}));
  formKey = 0;
  private lastBuiltFormSchemaSignature = '';

  enrichedConfigSchema = computed(() => {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return [];

    // Basic algorithm schema (shallow copy)
    const schema = (algorithm.configSchema ?? []).map(f => ({ ...f }));

    const yVars = this.experimentStudioService.algorithmY();
    const xVars = this.experimentStudioService.algorithmX();
    const yVar = yVars[0];
    const xVar = xVars[0];
    const eventVarCode = this.selectedEventVarCode();
    const positiveClassOptions = this.enumOptionsForVariableCode(eventVarCode);
    const isCox = this.isCoxRegressionAlgorithm(algorithm.name);
    const enriched = schema.map(field => {
      let options = field.options ?? [];
      const enumSource = Array.isArray(field.enumSource) ? field.enumSource : [];

      if (field.enumType === 'input_var_names') {
        options = this.variableOptionsForRoles(enumSource);
      } else if (field.enumType === 'input_var_CDE_enums') {
        options = this.enumOptionsForRole(enumSource[0]);
      } else if (field.key === 'category_order' && yVar?.enumerations?.length) {
        options = [...yVar.enumerations];
      } else if (field.key === 'positive_class' && positiveClassOptions.length) {
        options = positiveClassOptions;
      }

      // Placeholder substitution for enums
      if (Array.isArray(options) && options.length === 1) {
        const placeholder = options[0];

        if (placeholder === 'y' && yVar?.enumerations?.length) {
          options = [...yVar.enumerations];
        } else if (placeholder === 'x' && xVar?.enumerations?.length) {
          options = [...xVar.enumerations];
        }
      }

      // Fallback for empty select fields (not input_var_names — those list y/x variables)
      if (
        field.type === 'select' &&
        field.enumType !== 'input_var_names' &&
        (!options || options.length === 0) &&
        yVar?.enumerations?.length
      ) {
        options = [...yVar.enumerations];
      }

      const defaultValue = field.key === 'category_order' && Array.isArray(options) && options.length > 0
        ? options.map((opt: any) => this.optionValue(opt))
        : field.default;

      // Normalize label and desc
      const label = field.label?.trim() || toHumanLabel(field.key);
      const desc =
        field.key === 'positive_class' && isCox
          ? 'Event level mapped to 1; other observed levels are mapped to 0.'
          : field.desc ?? field.description ?? '';
      const type =
        field.key === 'positive_class' && positiveClassOptions.length
          ? 'select'
          : field.type;
      const required =
        (field.key === 'positive_class' && isCox) ||
        field.required === true ||
        String(field.required ?? '').trim().toLowerCase() === 'true';

      // Return enriched field
      return { ...field, label, desc, options, default: defaultValue, type, required };
    });

    if (this.crossValidationEnabled() && this.canToggleCrossValidation()) {
      const hasSplits = enriched.some((field) => field.key === 'n_splits');
      if (!hasSplits) {
        enriched.push({
          key: 'n_splits',
          label: 'Cross-validation folds (n_splits)',
          desc: 'Number of folds to use for cross-validation.',
          type: 'number',
          min: 2,
          default: 5,
        });
      }
    }

    return enriched;
  });

  readonly visibleConfigSchema = computed(() => {
    const schema = this.enrichedConfigSchema();
    if (!this.isOutlierReportSelected()) return schema;
    return schema.filter((field) => field.type !== 'dict' && !['strategies', 'tails', 'folds'].includes(String(field.key)));
  });

  readonly outlierReportVariables = computed(() => {
    const unique = new Map<string, any>();
    this.experimentStudioService.algorithmAssignableVariables().forEach((variable: any) => {
      if (variable?.code) unique.set(String(variable.code), variable);
    });
    return Array.from(unique.values()).filter((variable) => isOutlierEligibleVariable(variable));
  });

  readonly outputSchema = computed(() =>
    getOutputSchema(this.selectedAlgorithm()?.name ?? '') ?? []
  );

  readonly searchActive = computed(() => this.algoSearchQuery().trim().length > 0);

  private matchesAlgorithmSearch(algorithm: AlgorithmConfig, query: string): boolean {
    if (!query) return true;
    const haystack = [
      algorithm.label,
      algorithm.name,
      algorithm.description,
      algorithm.documentation ?? '',
      algorithm.category ?? '',
      (algorithm.flags ?? []).join(' '),
    ].join(' ').toLowerCase();
    return query.split(/\s+/).every((term) => haystack.includes(term));
  }

  readonly filteredAlgorithmCategories = computed(() => {
    const grouped = this.experimentStudioService.availableGroupedAlgorithms();
    const onlyActive = this.showOnlyActive();
    const query = this.algoSearchQuery().trim().toLowerCase();

    const entries = Object.entries(grouped ?? {}).map(([name, algorithms]) => {
      let filtered = (algorithms ?? []).filter(a => this.matchesAlgorithmSearch(a, query));
      if (onlyActive) {
        filtered = filtered.filter(a => !a.isDisabled);
      }

      // Runnable-first: when showing all methods, surface runnable ones before disabled ones.
      const ordered = onlyActive
        ? filtered
        : [...filtered].sort((a, b) => Number(a.isDisabled) - Number(b.isDisabled));

      return { name, algorithms: ordered };
    });

    return entries.filter(c => c.algorithms.length > 0);
  });

  readonly algoCounts = computed(() => {
    const grouped = this.experimentStudioService.availableGroupedAlgorithms();
    const all = Object.values(grouped ?? {}).flat();
    const active = all.filter(a => !a.isDisabled);
    return { all: all.length, active: active.length };
  });

  toggleActiveOnly() {
    this.showOnlyActive.update(v => !v);
  }

  onSearchInput(event: Event): void {
    this.algoSearchQuery.set((event.target as HTMLInputElement)?.value ?? '');
  }

  clearSearch(): void {
    this.algoSearchQuery.set('');
  }

  /**
   * Collapsed Matching-method categories. A category missing from this set is open, so
   * categories coming back after a filter switch keep the state the user left them in.
   */
  private readonly collapsedMatchCategories = signal<ReadonlySet<string>>(new Set<string>());
  /** Categories the user opened/closed themselves; these are never changed automatically. */
  private readonly matchCategoryUserToggles = new Set<string>();
  private lastMatchSelectionName: string | null | undefined;

  isMatchCategoryOpen(categoryName: string): boolean {
    return !this.collapsedMatchCategories().has(categoryName);
  }

  toggleMatchCategory(categoryName: string): void {
    this.matchCategoryUserToggles.add(categoryName);
    const next = new Set(this.collapsedMatchCategories());
    if (next.has(categoryName)) {
      next.delete(categoryName);
    } else {
      next.add(categoryName);
    }
    this.collapsedMatchCategories.set(next);
  }

  /**
   * Default state: a group is open only when it holds the selected method or at least one
   * runnable method — with nothing runnable in a group it stays collapsed so the catalog
   * opens straight to what can actually be executed. Beyond that default, the group a new
   * selection lands in is revealed; groups the user toggled are never changed automatically.
   */
  private syncMatchCategoryOpen(
    categories: Array<{ name: string; algorithms: AlgorithmConfig[] }>,
    selectedName: string | null,
  ): void {
    const selectionChanged = this.lastMatchSelectionName !== selectedName;
    this.lastMatchSelectionName = selectedName;

    const selectedCategory = selectedName
      ? categories.find((category) =>
          category.algorithms.some((algorithm) => algorithm.name === selectedName))?.name
      : null;

    const next = new Set(this.collapsedMatchCategories());
    let changed = false;

    categories.forEach((category) => {
      if (this.matchCategoryUserToggles.has(category.name)) return;
      const shouldOpen =
        category.name === selectedCategory ||
        category.algorithms.some((algorithm) => !algorithm.isDisabled);
      if (shouldOpen === !next.has(category.name)) return;
      if (shouldOpen) {
        next.delete(category.name);
      } else {
        next.add(category.name);
      }
      changed = true;
    });

    if (selectedCategory && selectionChanged && next.delete(selectedCategory)) {
      changed = true;
    }

    if (changed) this.collapsedMatchCategories.set(next);
  }

  algorithmUnavailableReason(algorithm: AlgorithmConfig): string {
    const availability = this.experimentStudioService.getAlgorithmAvailability(algorithm.name);
    const summary = availability?.summary || algorithm.availability?.summary || '';
    if (summary) return this.formatAvailabilityMessage(summary);
    const details = availability?.details?.length
      ? availability.details
      : (algorithm.availability?.details ?? []);
    const first = details.find((detail) => detail.messages.length > 0);
    return first ? this.formatAvailabilityMessage(first.messages[0]) : 'Unavailable';
  }


  readonly datasetsWithLabels = computed(() => {
    const codes = this.experimentStudioService.selectedDatasets();
    const labelByCode = this.experimentStudioService.getDatasetLabelMap();
    const fallbackMap = this.labelMap();
    return codes.map((code) => ({
      code,
      label: labelByCode[code] ?? fallbackMap[code] ?? toHumanLabel(code),
    }));
  });

  readonly experimentInfo = computed(() => {
    const selected = this.experimentStudioService.selectedAlgorithm();
    const lastRunName =
      this.experimentStudioService.lastUsedAlgorithm() || this.lastUsedAlgorithm;

    const algoName = selected?.name || lastRunName || null;

    const algoCatalog = this.experimentStudioService.backendAlgorithms();
    const algoMeta = algoName ? algoCatalog[algoName] : null;

    const displayLabel = selected?.label || algoMeta?.label || algoName || 'N/A';
    const defaultName = `Experiment for ${displayLabel}`;

    const allConfigs = this.experimentStudioService.algorithmConfigurations();
    const configs =
      (algoName && allConfigs[algoName]) || {};

    const preprocessingSteps = this.experimentStudioService.formatPreprocessingEntries(
      this.experimentStudioService.getAppliedDescriptivePreprocessing(),
      this.labelMap(),
    );

    return {
      experimentName: defaultName,
      variables: this.experimentStudioService.algorithmY(),
      covariates: this.experimentStudioService.algorithmX(),
      filters: this.experimentStudioService.selectedFilters(),
      algorithmConfigs: configs,
      preprocessingSteps,
    };
  });

  private syncPositiveClassWithEventVar(algorithmName: string): void {
    const positiveControl = this.configForm().get('positive_class');
    if (!positiveControl) return;

    const options = this.enumOptionsForVariableCode(this.resolveSelectedEventVarCode(algorithmName));
    if (!options.length) return;

    const allowed = new Set(options.map((option) => option.code));
    const current = positiveControl.value;
    if (
      current !== null &&
      current !== undefined &&
      String(current).trim() !== '' &&
      !allowed.has(String(current))
    ) {
      positiveControl.setValue(null, { emitEvent: false });
    }
  }

  private persistCurrentFormConfig(algorithmName: string, schema = this.visibleConfigSchema()): Record<string, any> {
    const values = this.normalizeFormValues(this.configForm().getRawValue(), schema);
    const nextValues = algorithmName === AlgorithmNames.OUTLIER_REPORT
      ? this.mergeOutlierReportConfig(values)
      : values;
    const allConfigs = this.experimentStudioService.algorithmConfigurations();
    const previous = allConfigs[algorithmName];
    if (previous && JSON.stringify(previous) === JSON.stringify(nextValues)) {
      return nextValues;
    }
    this.experimentStudioService.algorithmConfigurations.set({
      ...allConfigs,
      [algorithmName]: nextValues,
    });
    return nextValues;
  }

  bindOptionValue(option: unknown): string {
    return optionBindingValue(option);
  }

  private normalizeFormValues(values: Record<string, any>, schema: any[]): Record<string, any> {
    const normalized = { ...values };
    schema
      .filter((field) => field?.type === 'number')
      .forEach((field) => {
        const key = String(field.key);
        const value = normalized[key];
        if (typeof value !== 'string') return;
        const trimmed = value.trim();
        if (!trimmed) return;
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) normalized[key] = parsed;
    });

    schema.forEach((field) => {
      const key = String(field.key);
      if (!(key in normalized)) return;
      if (field?.type === 'select' || field?.type === 'multi-select' || key === 'positive_class') {
        normalized[key] = serializeAlgorithmParameterValue(normalized[key], field);
      }
    });

    return omitEmptyOptionalParameters(normalized, schema) as Record<string, any>;
  }

  private mergeOutlierReportConfig(configValues: Record<string, any>): Record<string, any> {
    if (!this.isOutlierReportSelected()) return configValues;
    delete configValues['strategies'];
    delete configValues['tails'];
    delete configValues['folds'];
    const payload = serializeOutlierRules(
      this.outlierReportRules,
      new Set(this.outlierReportVariables().map((variable) => variable.code))
    );
    return payload ? { ...configValues, ...payload } : configValues;
  }

  private persistOutlierReportConfig(): void {
    const algorithm = this.selectedAlgorithm();
    if (!algorithm || algorithm.name !== AlgorithmNames.OUTLIER_REPORT) return;
    const visibleValues = this.normalizeFormValues(this.configForm().getRawValue(), this.visibleConfigSchema());
    const nextConfig = this.mergeOutlierReportConfig(visibleValues);
    this.experimentStudioService.algorithmConfigurations.set({
      ...this.experimentStudioService.algorithmConfigurations(),
      [algorithm.name]: nextConfig,
    });
  }

  private reconcileOutlierReportRules(variables: any[], stored: Record<string, any>): void {
    const allowedCodes = new Set(variables.map((variable) => variable.code));
    const hydrated = hydrateOutlierRules(stored, allowedCodes);
    const hasStoredRules = !!stored && typeof stored === 'object' && Object.keys(stored?.['strategies'] ?? {}).length > 0;
    const hasExistingRules = Object.keys(this.outlierReportRules).length > 0;
    const next: Record<string, OutlierRule> = {};

    variables.forEach((variable) => {
      const code = variable.code;
      next[code] = this.outlierReportRules[code]
        ? { ...this.outlierReportRules[code] }
        : hydrated[code]
          ? { ...hydrated[code] }
          : createDefaultOutlierRule(code, hasExistingRules || !hasStoredRules);
    });

    this.outlierReportRules = next;
    this.outlierReportValidationErrors = Object.fromEntries(
      Object.entries(this.outlierReportValidationErrors).filter(([code]) => allowedCodes.has(code))
    );
  }

  outlierReportRuleFor(variable: any): OutlierRule {
    if (!this.outlierReportRules[variable.code]) {
      this.outlierReportRules = {
        ...this.outlierReportRules,
        [variable.code]: createDefaultOutlierRule(variable.code, true),
      };
    }
    return this.outlierReportRules[variable.code];
  }

  outlierVariableLabel(variable: any): string {
    return variable?.label ?? variable?.name ?? variable?.code ?? '';
  }

  onOutlierReportEnabledChange(variable: any, enabled: boolean): void {
    const existing = this.outlierReportRuleFor(variable);
    this.outlierReportRules = {
      ...this.outlierReportRules,
      [variable.code]: { ...existing, enabled },
    };
    this.outlierReportValidationErrors = {
      ...this.outlierReportValidationErrors,
      [variable.code]: '',
    };
    this.persistOutlierReportConfig();
  }

  onOutlierReportStrategyChange(variable: any, strategy: OutlierStrategy): void {
    const existing = this.outlierReportRuleFor(variable);
    this.outlierReportRules = {
      ...this.outlierReportRules,
      [variable.code]: {
        ...existing,
        enabled: true,
        strategy,
        fold: defaultFoldForStrategy(strategy),
      },
    };
    this.outlierReportValidationErrors = {
      ...this.outlierReportValidationErrors,
      [variable.code]: '',
    };
    this.persistOutlierReportConfig();
  }

  onOutlierReportTailChange(variable: any, tail: OutlierTail): void {
    const existing = this.outlierReportRuleFor(variable);
    this.outlierReportRules = {
      ...this.outlierReportRules,
      [variable.code]: { ...existing, enabled: true, tail },
    };
    this.persistOutlierReportConfig();
  }

  onOutlierReportFoldChange(variable: any, rawValue: string | number): void {
    const existing = this.outlierReportRuleFor(variable);
    const value = String(rawValue ?? '').trim();
    const fold = value === '' ? null : Number(value);
    this.outlierReportRules = {
      ...this.outlierReportRules,
      [variable.code]: {
        ...existing,
        enabled: true,
        fold: typeof fold === 'number' && Number.isFinite(fold) ? fold : null,
      },
    };
    const error = validateOutlierRule(this.outlierReportRules[variable.code]);
    this.outlierReportValidationErrors = {
      ...this.outlierReportValidationErrors,
      [variable.code]: error ?? '',
    };
    this.persistOutlierReportConfig();
  }

  outlierReportRuleError(variable: any): string {
    const rule = this.outlierReportRuleFor(variable);
    return this.outlierReportValidationErrors[variable.code] || validateOutlierRule(rule) || '';
  }

  private validateOutlierReportConfig(): boolean {
    if (!this.isOutlierReportSelected()) return true;

    const variables = this.outlierReportVariables();
    if (!variables.length) {
      this.errorMsg.set('Select at least one numerical variable or covariate for the outlier report.');
      return false;
    }

    const errors: Record<string, string> = {};
    variables.forEach((variable) => {
      const rule = this.outlierReportRuleFor(variable);
      const error = validateOutlierRule(rule);
      if (error) errors[variable.code] = error;
    });

    this.outlierReportValidationErrors = errors;
    if (Object.keys(errors).length > 0) {
      this.errorMsg.set('Fix the outlier report configuration before running.');
      return false;
    }

    const serialized = serializeOutlierRules(
      this.outlierReportRules,
      new Set(variables.map((variable) => variable.code))
    );
    if (!serialized) {
      this.errorMsg.set('Enable at least one numerical variable for the outlier report.');
      return false;
    }

    this.persistOutlierReportConfig();
    return true;
  }


  /** Transformation grid operates on the assigned outcome variables (y). */
  get selectedVariables() {
    return this.experimentStudioService.algorithmY();
  }

  /** Assignable pool drives the role-assignment UI (shown without a selected algorithm). */
  get assignablePool() {
    return this.experimentStudioService.algorithmAssignableVariables();
  }


  readonly tooltipVisible = signal(false);
  readonly tooltipPosition = signal({ x: 0, y: 0 });
  readonly tooltipData = signal<any | null>(null);

  selectAlgorithm(algorithm: AlgorithmConfig) {
    this.lastBuiltFormSchemaSignature = '';
    this.eventVarSelection.set(null);
    // Use service method so it enriches configSchema and persists to sessionStorage
    this.experimentStudioService.setAlgorithm(algorithm);
    this.experimentStudioService.runResult.set(null);
    this.experimentStudioService.runError.set(null);
    this.errorMsg.set(null);
  }

  onAlgorithmClick(algorithm: AlgorithmConfig) {
    this.selectAlgorithm(algorithm);
    // Parent bookkeeping only: the details and parameters bands render from
    // selectedAlgorithm() below the row, so no substep navigation or page scroll.
    this.setStudioSubstep('parameters');
    this.hideTooltip();
  }

  /** Scrolls a studio anchor; `scroll-margin-top` on the target clears sticky chrome. */
  private scrollStudioTargetIntoView(target: HTMLElement | null, focus = false): void {
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focus) target.focus({ preventScroll: true });
  }

  onClickRunExp() {
    this.errorMsg.set(null);
    this.errorService.clearError();

    if (this.selectedAlgorithmUnavailable()) {
      this.errorMsg.set('This algorithm is unavailable for the current selection.');
      return;
    }

    const preprocessingMessage = this.preprocessingRunBlockMessage();
    if (preprocessingMessage) {
      this.errorMsg.set(preprocessingMessage);
      return;
    }

    // algorithm does not run if form is invalid
    if (this.configForm() && this.configForm().invalid) {
      this.configForm().markAllAsTouched();
      console.warn('[AlgorithmPanel] Run blocked – configForm invalid');
      return;
    }

    const algo = this.experimentStudioService.selectedAlgorithm();
    this.errorMsg.set(null);
    this.errorService.clearError();
    this.experimentStudioService.runStatusText.set('Processing experiment...');
    this.experimentStudioService.hasRunStarted.set(true);
    this.experimentStudioService.runError.set(null);
    this.experimentStudioService.runResult.set(null);
    this.experimentStudioService.setRunning(true);

    if (!algo) {
      console.error('No algorithm selected in service.');
      const msg = 'Please choose an algorithm before running.';
      this.errorMsg.set(msg);
      this.experimentStudioService.setRunning(false);
      this.experimentStudioService.hasRunStarted.set(false);
      return;
    }

    if (!this.validateOutlierReportConfig()) {
      this.experimentStudioService.setRunning(false);
      return;
    }

    const isCvOnly = this.experimentStudioService.isCrossValidationOnly(algo.name);
    const baseAlgorithmName = isCvOnly
      ? algo.name
      : this.experimentStudioService.getCrossValidationBase(algo.name) ??
      this.experimentStudioService.getTransformationBase(algo.name) ??
      algo.name;
    const cvVariant =
      this.experimentStudioService.getCrossValidationVariant(baseAlgorithmName);
    const shouldIncludeSplits =
      this.crossValidationEnabled() ||
      this.experimentStudioService.isCrossValidationOnly(algo.name);
    const useCrossValidation = shouldIncludeSplits && !!cvVariant;
    const transformationVariant =
      this.experimentStudioService.getTransformationVariant(baseAlgorithmName);
    const useTransformation = this.transformationEnabled() && !!transformationVariant;
    const effectiveAlgorithmName = useCrossValidation
      ? cvVariant
      : useTransformation
        ? transformationVariant
        : baseAlgorithmName;

    const finalAlgorithmName = isCvOnly ? algo.name : effectiveAlgorithmName;

    this.experimentStudioService.lastUsedAlgorithm.set(finalAlgorithmName);
    this.errorMsg.set(null);

    let configValues = this.normalizeFormValues(this.configForm().getRawValue(), this.visibleConfigSchema());
    configValues = this.mergeOutlierReportConfig(configValues);
    if (!shouldIncludeSplits && configValues['n_splits'] !== undefined) {
      delete configValues['n_splits'];
    }
    if (useTransformation) {
      const payload = this.buildTransformationPayload();
      configValues['data_transformation'] = payload;
    } else if (configValues['data_transformation']) {
      delete configValues['data_transformation'];
    }
    this.experimentStudioService.algorithmConfigurations.set({
      ...this.experimentStudioService.algorithmConfigurations(),
      [baseAlgorithmName]: configValues,
      ...(effectiveAlgorithmName !== baseAlgorithmName ? { [effectiveAlgorithmName]: configValues } : {})
    });

    // Freeze the setup before the request leaves: the Execution step describes the run from
    // this snapshot, and parameter edits after the run must not rewrite it.
    this.experimentStudioService.captureRunSetup(finalAlgorithmName);

    const result$ = this.experimentStudioService.runSelectedAlgorithmTransient(
      baseAlgorithmName,
      finalAlgorithmName
    );
    if (!result$) {
      const msg = 'Unable to start the run. Check your selections.';
      this.errorMsg.set(msg);
      this.experimentStudioService.setRunning(false);
      this.experimentStudioService.hasRunStarted.set(false);
      return;
    }

    result$.subscribe({
      next: (res) => {
        const status = res?.status;
        const payload = res?.result ?? {};
        if (status === 'error') {
          const msg =
            payload?.data ||
            payload?.message ||
            'The server returned an error for this run.';
          this.experimentStudioService.runError.set(msg);
          return;
        }

        const schema = getOutputSchema(finalAlgorithmName ?? '') ?? [];
        this.experimentStudioService.runResult.set({
          ...res?.result ?? { message: "No result returned" },
        });
        this.lastUsedAlgorithm = finalAlgorithmName;
        this.experimentStudioService.lastRunSchema.set(schema);
      },
      error: () => {
        this.experimentStudioService.runError.set('Unable to run experiment. Please try again.');
      },
      complete: () => {
        this.experimentStudioService.setRunning(false);
      }
    });

  }

  toggleCrossValidation(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const enabled = !!target?.checked;
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return;
    const baseName = this.experimentStudioService.getCrossValidationBase(algorithm.name) ?? algorithm.name;
    const variant = this.experimentStudioService.getCrossValidationVariant(baseName);
    if (!variant) return;
    const configs = this.experimentStudioService.algorithmConfigurations();
    const currentFormValues = this.configForm()?.getRawValue?.() ?? {};
    const preservedConfig = { ...(configs[baseName] ?? {}), ...currentFormValues };

    this.crossValidationSelections[baseName] = enabled;

    if (!enabled) {
      if (preservedConfig['n_splits'] !== undefined) delete preservedConfig['n_splits'];

      if (this.configForm()?.contains('n_splits')) {
        this.configForm().removeControl('n_splits');
      }

      const variantConfig = { ...(configs[variant] ?? {}) };
      if (variantConfig['n_splits'] !== undefined) delete variantConfig['n_splits'];
      this.experimentStudioService.algorithmConfigurations.set({
        ...configs,
        [baseName]: preservedConfig,
        [variant]: variantConfig,
      });
    } else {
      this.experimentStudioService.algorithmConfigurations.set({
        ...configs,
        [baseName]: preservedConfig,
        [variant]: { ...(configs[variant] ?? {}), ...preservedConfig },
      });
    }

    this.crossValidationEnabled.set(enabled);
  }

  toggleTransformation(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const enabled = !!target?.checked;
    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return;
    const baseName = this.experimentStudioService.getTransformationBase(algorithm.name) ?? algorithm.name;
    if (!this.experimentStudioService.getTransformationVariant(baseName)) return;
    this.transformationEnabled.set(enabled);
  }

  setTransformationAssignment(variableCode: string, value: string) {
    if (!variableCode) return;
    this.transformationAssignments = {
      ...this.transformationAssignments,
      [variableCode]: value,
    };

    const algorithm = this.selectedAlgorithm();
    if (!algorithm) return;
    const baseName = this.experimentStudioService.getTransformationBase(algorithm.name) ?? algorithm.name;
    this.transformationSelectionsByAlgorithm[baseName] = { ...this.transformationAssignments };
  }

  getTransformationAssignment(variableCode: string): string {
    return this.transformationAssignments?.[variableCode] ?? 'none';
  }

  private extractTransformationAssignments(data: any): Record<string, string> {
    if (!data || typeof data !== 'object') return {};
    const result: Record<string, string> = {};
    this.transformationTypes.forEach((type) => {
      const values = Array.isArray(data[type]) ? data[type] : [];
      values.forEach((code: any) => {
        if (code === null || code === undefined) return;
        result[String(code)] = type;
      });
    });
    return result;
  }

  private buildTransformationPayload(): Record<string, string[]> {
    const payload: Record<string, string[]> = {
      standardize: [],
      center: [],
      exp: [],
    };
    Object.entries(this.transformationAssignments).forEach(([code, choice]) => {
      if (!choice || choice === 'none') return;
      if (!payload[choice]) payload[choice] = [];
      payload[choice].push(code);
    });
    Object.keys(payload).forEach((key) => {
      if (!payload[key].length) delete payload[key];
    });
    return payload;
  }

  isAlgorithmAvailable(algorithm: string): boolean {
    return this.experimentStudioService.isAlgorithmAvailable(algorithm);
  }

  availabilityDetails(algorithm: AlgorithmConfig | null = null): AlgorithmAvailabilityDetail[] {
    return (algorithm ?? this.tooltipData())?.availability?.details ?? [];
  }

  availabilityRequirementText(detail: AlgorithmAvailabilityDetail): string {
    const count = this.formatAvailabilityCount(detail);
    const parts = [detail.label + ': ' + count + ', selected ' + detail.selectedCount];
    const types = this.formatRequirementTypes(detail.types);
    if (types) {
      parts.push('type: ' + types.join(', '));
    }
    return parts.join(' • ');
  }

  private formatAvailabilityCount(detail: AlgorithmAvailabilityDetail): string {
    return formatInputCountRange(detail.minCount, detail.maxCount);
  }

  private formatAvailabilityMessage(message: string): string {
    return message.replace(
      /((?:Outcome|Predictor) type must be one of )([^.]*)\./g,
      (_match, prefix: string, types: string) => {
        const displayTypes = this.formatRequirementTypes(
          types.split(',').map((type) => type.trim())
        );
        return prefix + (displayTypes ?? []).join(', ') + '.';
      }
    );
  }

  resolveRunRequirement(requirement: AlgorithmRunRequirement): void {
    if (requirement.id === 'preprocessing') {
      this.studioNavigation.goToPreprocessing();
      return;
    }
    // Availability issues are fixed on the setup board, which stays on screen above.
    this.setStudioSubstep('setup');
    requestAnimationFrame(() =>
      this.scrollStudioTargetIntoView(
        document.querySelector<HTMLElement>('[data-guide="guide-role-assignment"]'),
        true
      )
    );
  }

  private availabilityRequirementActionLabel(algorithmName: string): string {
    const failingDetail = this.experimentStudioService
      .getAlgorithmAvailability(algorithmName)
      .details
      .find((detail) => !detail.satisfied && detail.messages.length > 0);

    if (failingDetail?.role === 'x') {
      return 'Assign predictor';
    }

    return 'Assign outcome';
  }

  showTooltip(algorithm: any, event: MouseEvent) {
    event.stopPropagation();
    const item = (event.currentTarget as HTMLElement)?.closest('li') || (event.currentTarget as HTMLElement);
    const rect = item.getBoundingClientRect();
    const container = item.closest('.experiment-container') as HTMLElement | null;
    const containerRect = container?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 16;
    const offset = 12;

    this.tooltipVisible.set(true);
    this.tooltipData.set(algorithm);

    const initialPosition = this.getTooltipPosition(rect, containerRect, 320, 200, viewportWidth, viewportHeight, padding, offset);

    // Immediate initial placement
    this.tooltipPosition.set(initialPosition);

    // Refinement after render
    setTimeout(() => {
      const el = document.querySelector('.tooltip') as HTMLElement | null;
      if (!el) return;

      const w = el.offsetWidth || 320;
      const h = el.offsetHeight || 200;

      this.tooltipPosition.set(
        this.getTooltipPosition(rect, containerRect, w, h, viewportWidth, viewportHeight, padding, offset)
      );
    }, 0);
  }

  hideTooltip() {
    this.tooltipVisible.set(false);
  }

  private getTooltipPosition(
    rect: DOMRect,
    containerRect: DOMRect,
    tooltipWidth: number,
    tooltipHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    padding: number,
    offset: number,
  ): { x: number; y: number } {
    const rightAlignedX = rect.right + offset;
    const leftAlignedX = rect.left - tooltipWidth - offset;
    const centeredY = rect.top + (rect.height - tooltipHeight) / 2;

    let x = rightAlignedX;
    if (rightAlignedX + tooltipWidth > viewportWidth - padding) {
      x = leftAlignedX >= padding
        ? leftAlignedX
        : viewportWidth - tooltipWidth - padding;
    }

    let y = centeredY;
    if (y + tooltipHeight > viewportHeight - padding) {
      y = viewportHeight - tooltipHeight - padding;
    }
    if (y < padding) {
      y = padding;
    }

    return {
      x: Math.max(padding, x - containerRect.left),
      y: Math.max(padding, y - containerRect.top),
    };
  }

  private normalizeRequirementDisplayType(type: unknown): string | null {
    const normalized = String(type ?? '').trim().toLowerCase();
    if (!normalized) return null;

    switch (normalized) {
      case VariableTypes.TEXT:
      case 'polynominal':
      case 'ordinal':
        return VariableTypes.NOMINAL;
      case VariableTypes.INTEGER:
        return VariableTypes.INT;
      default:
        return normalized;
    }
  }

  private formatRequirementTypes(types: unknown): string[] | null {
    if (!Array.isArray(types) || types.length === 0) {
      return null;
    }

    const normalized = types
      .map((type) => this.normalizeRequirementDisplayType(type))
      .filter((type): type is string => !!type);

    const unique = Array.from(new Set(normalized));
    return unique.length ? unique : null;
  }

  onSaveAs(name: string) {
    const experimentName = name.trim();
    if (!experimentName) {
      this.errorMsg.set('Please provide a name for the experiment.');
      return;
    }

    this.errorMsg.set(null);
    this.errorService.clearError();

    const algo = this.experimentStudioService.selectedAlgorithm();
    if (!algo) return;

    if (!this.validateOutlierReportConfig()) return;

    this.experimentStudioService.setRunning(true);

    const isCvOnly = this.experimentStudioService.isCrossValidationOnly(algo.name);
    const baseAlgorithmName = isCvOnly
      ? algo.name
      : this.experimentStudioService.getCrossValidationBase(algo.name) ??
      this.experimentStudioService.getTransformationBase(algo.name) ??
      algo.name;

    const cvVariant = this.experimentStudioService.getCrossValidationVariant(baseAlgorithmName);
    const shouldIncludeSplits = this.crossValidationEnabled() || this.experimentStudioService.isCrossValidationOnly(algo.name);
    const useCrossValidation = shouldIncludeSplits && !!cvVariant;
    const transformationVariant = this.experimentStudioService.getTransformationVariant(baseAlgorithmName);
    const useTransformation = this.transformationEnabled() && !!transformationVariant;
    const effectiveAlgorithmName = useCrossValidation
      ? cvVariant
      : useTransformation
        ? transformationVariant
        : baseAlgorithmName;

    const finalAlgorithmName = isCvOnly ? algo.name : effectiveAlgorithmName;
    let configValues = this.normalizeFormValues(this.configForm().getRawValue(), this.visibleConfigSchema());
    configValues = this.mergeOutlierReportConfig(configValues);
    if (!shouldIncludeSplits && configValues['n_splits'] !== undefined) {
      delete configValues['n_splits'];
    }
    if (useTransformation) {
      configValues['data_transformation'] = this.buildTransformationPayload();
    } else if (configValues['data_transformation']) {
      delete configValues['data_transformation'];
    }
    this.experimentStudioService.algorithmConfigurations.set({
      ...this.experimentStudioService.algorithmConfigurations(),
      [baseAlgorithmName]: configValues,
      ...(effectiveAlgorithmName !== baseAlgorithmName ? { [effectiveAlgorithmName]: configValues } : {})
    });

    const result$ = this.experimentStudioService.runSelectedAlgorithm(
      baseAlgorithmName,
      finalAlgorithmName,
      experimentName
    );

    this.experimentStudioService.runStatusText.set('Saving experiment...');

    if (!result$) {
      this.errorMsg.set('Unable to start the save process.');
      this.experimentStudioService.setRunning(false);
      return;
    }

    result$.subscribe({
      next: (res) => {
        const status = res?.status;
        const payload = res?.result ?? {};

        if (status === 'error') {
          const msg = payload?.message || 'Failed to save experiment results.';
          this.errorMsg.set(msg);
          return;
        }

        this.experimentStudioService.notifySaveSucceeded();
      },
      error: () => {
        this.errorMsg.set('Failed to save experiment.');
      },
      complete: () => {
        this.experimentStudioService.setRunning(false);
      }
    });
  }

  onExportResult(section: HTMLElement) {
    const result = this.experimentStudioService.runResult();
    if (!section || !result) {
      console.warn('No result or element to export');
      return;
    }

    const info = this.experimentInfo();
    const algoKey =
      this.lastUsedAlgorithm ||
      this.experimentStudioService.lastUsedAlgorithm() ||
      this.experimentStudioService.selectedAlgorithm()?.name ||
      'experiment';

    const algoConfig = this.experimentStudioService.backendAlgorithms()[algoKey];
    const algoLabel = algoConfig?.label || algoKey;

    const currentUser = this.authService.currentUser;
    const createdBy =
      currentUser?.fullname || currentUser?.username || currentUser?.email || null;

    const filename = info.experimentName;

    const transformations = this.transformationEnabled()
      ? Object.entries(this.transformationAssignments)
        .filter(([_, choice]) => choice && choice !== 'none')
        .map(([code, choice]) => {
          const label = this.labelMap()[code] || code;
          return `${label}: ${choice}`;
        })
        .join(', ')
      : null;

    this.pdfExport.exportExperimentPdf({
      filename,
      details: {
        experimentName: info.experimentName,
        createdBy,
        createdAt: new Date(),
        algorithm: algoLabel,
        params: info.algorithmConfigs,
        preprocessing: this.experimentStudioService.getEffectivePreprocessingSummary(algoKey),
        domain: this.experimentStudioService.selectedDataModel()?.code ?? null,
        datasets: this.datasetsWithLabels().map((d) => d.label),
        variables: (info.variables ?? []).map((v: any) => v.label || v.name || v.code),
        covariates: (info.covariates ?? []).map((c: any) => c.label || c.name || c.code),
        filters: (info.filters ?? []).map((f: any) => f.label || f.name || f.code),
        transformations,
        mipVersion: this.mipVersion,
      },
      algorithmKey: algoKey,
      result,
      chartContainer: section,
    });
  }
}
