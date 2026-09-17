import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { ExperimentStudioNavigationService } from '../../../../services/experiment-studio-navigation.service';
import { prettifyLabel } from '../../../../core/algorithm-mappers';
import { LabeledItem, withLabels } from '../../../../core/result-label.utils';
import { formatAlgorithmParameterValue } from '../../../../core/algorithm-parameter.utils';
import { countFilterRules, formatFilterExpression } from '../../../../core/filter-display.utils';

interface SetupDetailRow {
  key: string;
  label: string;
  value: string;
}

/**
 * The setup behind the result on the Experiment Execution step: data model, datasets,
 * variable roles, cohort filters, data handling and algorithm parameters in one column.
 *
 * Every field comes from `ExperimentStudioService.runSetup`, the snapshot taken when the run
 * was dispatched, so nothing here can describe a selection the result did not use. Labels are
 * resolved at render time because they belong to a code, not to a run.
 */
@Component({
  selector: 'app-experiment-setup-summary',
  templateUrl: './experiment-setup-summary.component.html',
  styleUrl: './experiment-setup-summary.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentSetupSummaryComponent {
  private studio = inject(ExperimentStudioService);
  private navigation = inject(ExperimentStudioNavigationService);

  /** Null when no run has been dispatched in this studio session. */
  readonly setup = this.studio.runSetup;

  readonly datasets = computed<LabeledItem[]>(() => {
    const labelByCode = Object.fromEntries(this.studio.availableDatasets().map((item) => [item.code, item.label]));
    return withLabels(this.setup()?.datasets, labelByCode);
  });

  readonly outcome = computed<LabeledItem[]>(() =>
    withLabels(this.setup()?.outcome, this.studio.variableLabelMap())
  );
  readonly covariates = computed<LabeledItem[]>(() =>
    withLabels(this.setup()?.covariates, this.studio.variableLabelMap())
  );

  readonly filterRuleCount = computed(() => countFilterRules(this.setup()?.filterLogic ?? null));
  readonly filterExpression = computed(() => {
    const setup = this.setup();
    if (!setup) return '';
    return formatFilterExpression(setup.filterLogic, {
      labelMap: this.studio.variableLabelMap(),
      enumMaps: this.studio.getCategoricalEnumMaps(),
    });
  });

  readonly preprocessing = computed(() => this.setup()?.preprocessing ?? []);

  readonly algorithmKey = computed(() => this.setup()?.algorithmKey ?? '');
  readonly algorithmLabel = computed(() => {
    const key = this.algorithmKey();
    if (!key) return '';
    return this.studio.backendAlgorithms()[key]?.label ?? prettifyLabel(key);
  });

  /**
   * Parameters as they were configured for this run, labelled from the algorithm schema.
   * `data_transformation` is reported under Data handling instead, where the rule belongs.
   */
  readonly parameters = computed<SetupDetailRow[]>(() => {
    const setup = this.setup();
    if (!setup?.algorithmKey) return [];
    const schema = this.studio.backendAlgorithms()[setup.algorithmKey]?.configSchema ?? [];

    return Object.entries(setup.parameters)
      .filter(([key]) => key !== 'data_transformation')
      .map(([key, value]) => {
        const field = schema.find((entry: any) => String(entry?.key) === key);
        return {
          key,
          label: String(field?.label ?? prettifyLabel(key)),
          value: formatAlgorithmParameterValue(value, field),
        };
      })
      .filter((entry) => entry.value);
  });

  readonly hasVariables = computed(() => this.outcome().length > 0 || this.covariates().length > 0);

  goToDatasets(): void {
    this.navigation.navigateToSection('variables-top');
  }

  goToFilters(): void {
    this.navigation.navigateToDescriptiveStep('filters');
  }

  goToDataHandling(): void {
    this.navigation.goToPreprocessing();
  }

  goToAlgorithm(): void {
    this.navigation.navigateToSection('algorithm-section');
  }
}
