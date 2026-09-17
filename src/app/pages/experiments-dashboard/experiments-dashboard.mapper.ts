import { BackendExperiment } from "../../models/backend-experiment.model";
import { BackendFilter } from "../../models/filters.model";
import { Experiment } from './../../models/experiments-dashboard.model';
import { AnalysisPreprocessingStep } from "../../models/backend-algorithms.model";


function collectFilterVariableCodes(
  logic: BackendFilter | null | undefined
): string[] {
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

function normalizeToStringArray(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (value === null || value === undefined || value === '') {
    return [];
  }
  return [String(value)];
}

function preprocessingStepsToRecord(
  steps: AnalysisPreprocessingStep[] | null | undefined
): Record<string, unknown> | null {
  if (!steps?.length) return null;
  return Object.fromEntries(steps.map((step) => [step.name, step.parameters]));
}

export { preprocessingStepsToRecord };

// Map BackendExperiment to Experiment
export function mapBackendToFrontend(backend: BackendExperiment): Experiment {

  console.groupCollapsed('[Mapper] BackendExperiment → Experiment');
  console.groupEnd();

  const analysis = backend.analysis;
  const input = analysis?.inputdata || {};
  const filtersLogic = input.filters ?? null;

  return {
    id: backend.uuid,
    name: backend.name,
    dateCreated: new Date(backend.created),
    description: backend.description ?? '',
    status: backend.status,

    algorithmName: analysis?.algorithm?.name,
    author:
      backend.createdBy.fullname ||
      backend.createdBy.username ||
      backend.createdBy.email,
    authorEmail: backend.createdBy.email,
    isShared: backend.shared,

    domain: input.data_model ?? null,
    datasets: normalizeToStringArray(input.datasets),
    variables: normalizeToStringArray(analysis?.algorithm?.y),
    covariates: normalizeToStringArray(analysis?.algorithm?.x),
    filters: collectFilterVariableCodes(filtersLogic),
    filterLogic: filtersLogic,
    preprocessing: preprocessingStepsToRecord(analysis?.preprocessing),
    mipVersion: backend.mipVersion ?? undefined,
  };
}

