import { BackendFilter } from './filters.model';

/** One `Label: value` row of the run's effective preprocessing. */
export interface RunSetupSummaryRow {
  label: string;
  value: string;
}

/**
 * Frozen copy of the inputs of the run that produced `ExperimentStudioService.runResult`.
 * Editing a parameter on the Algorithm step does not invalidate a result that is already
 * shown, so the Execution step reads this snapshot rather than live state; otherwise the
 * summary would describe a run that never happened. Dataset and variable labels stay out —
 * they are stored as codes and labelled at render time from the label maps.
 */
export interface ExperimentRunSetup {
  /** Algorithm the run went out as, including any CV / transformation variant. */
  algorithmKey: string | null;
  /** Selected data model, labelled (a pathology) the way the studio calls it. */
  dataModel: string | null;
  datasets: string[];
  /** Codes assigned to the algorithm's `y` role. */
  outcome: string[];
  /** Codes assigned to the algorithm's `x` role. */
  covariates: string[];
  filterLogic: BackendFilter | null;
  /** Effective preprocessing of the request, including defaults Exaflow applies anyway. */
  preprocessing: RunSetupSummaryRow[];
  /** Parameter values as configured for `algorithmKey`. */
  parameters: Record<string, unknown>;
}
