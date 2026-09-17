type AlgorithmInputCountRole = 'y' | 'x';

type CountBounds = { min?: number; max?: number };

/** Fallback bounds when the catalog omits min_count/max_count (kept in sync with Exaflow specs). */
const FALLBACK_INPUT_COUNT_BOUNDS: Record<string, Partial<Record<AlgorithmInputCountRole, CountBounds>>> = {
  linear_regression: { y: { max: 1 } },
  linear_regression_cv: { y: { max: 1 } },
  cox_regression_classical: { y: { max: 1 }, x: { min: 2 } },
  cox_regression_stacked: { y: { max: 1 }, x: { min: 2 } },
  lmm: { y: { max: 1 }, x: { min: 2 } },
  glmm_binary: { y: { max: 1 }, x: { min: 2 } },
  glmm_ordinal: { y: { max: 1 }, x: { min: 2 } },
  anova_twoway: { y: { max: 1 }, x: { min: 2, max: 2 } },
};

function normalizeInputCount(value: number | string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readInputCount(field: unknown, key: 'min_count' | 'max_count'): number | null {
  if (!field || typeof field !== 'object') return null;
  const record = field as Record<string, unknown>;
  const camelKey = key === 'min_count' ? 'minCount' : 'maxCount';
  return normalizeInputCount(record[key] as number | string | undefined | null ?? record[camelKey] as number | string | undefined | null);
}

function isInputFieldRequired(field: unknown): boolean {
  if (!field || typeof field !== 'object') return false;
  const required = (field as Record<string, unknown>)['required'];
  if (typeof required === 'boolean') return required;
  if (required === undefined || required === null) return false;
  const normalized = String(required).trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

export function resolveInputMinCount(
  field: unknown,
  role: AlgorithmInputCountRole,
  algorithmName?: string | null
): number {
  const explicit = readInputCount(field, 'min_count');
  if (explicit !== null) return explicit;

  const fallback = algorithmName ? FALLBACK_INPUT_COUNT_BOUNDS[algorithmName]?.[role]?.min : undefined;
  if (fallback !== undefined) return fallback;

  return isInputFieldRequired(field) ? 1 : 0;
}

export function resolveInputMaxCount(
  field: unknown,
  role: AlgorithmInputCountRole,
  algorithmName?: string | null
): number | null {
  const explicit = readInputCount(field, 'max_count');
  if (explicit !== null) return explicit;

  const fallback = algorithmName ? FALLBACK_INPUT_COUNT_BOUNDS[algorithmName]?.[role]?.max : undefined;
  if (fallback !== undefined) return fallback;

  return null;
}


export function formatInputCountRange(minCount: number, maxCount: number | null): string {
  if (minCount === 1 && maxCount === 1) return 'exactly 1';
  if (minCount === 0 && maxCount === 1) return '0-1';
  if (minCount > 0 && maxCount !== null && minCount === maxCount) return `exactly ${minCount}`;
  if (minCount > 0 && maxCount !== null) return `${minCount}-${maxCount}`;
  if (minCount > 0) return `${minCount}+`;
  if (maxCount !== null) return `0-${maxCount}`;
  return 'optional';
}

export function applyFallbackInputCounts(inputdata: unknown, algorithmName: string): Record<string, unknown> {
  if (!inputdata || typeof inputdata !== 'object') return {};
  const next: Record<string, unknown> = { ...(inputdata as Record<string, unknown>) };
  const bounds = FALLBACK_INPUT_COUNT_BOUNDS[algorithmName];
  if (!bounds) return next;

  (['y', 'x'] as AlgorithmInputCountRole[]).forEach((role) => {
    const field = next[role];
    const roleBounds = bounds[role];
    if (!field || typeof field !== 'object' || !roleBounds) return;

    const current = field as Record<string, unknown>;
    next[role] = {
      ...current,
      ...(readInputCount(current, 'min_count') === null && roleBounds.min !== undefined
        ? { min_count: roleBounds.min }
        : {}),
      ...(readInputCount(current, 'max_count') === null && roleBounds.max !== undefined
        ? { max_count: roleBounds.max }
        : {}),
    };
  });

  return next;
}
