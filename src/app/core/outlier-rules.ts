export type OutlierStrategy = 'gaussian' | 'iqr' | 'mad' | 'quantile';
export type OutlierTail = 'left' | 'right' | 'both';

export interface OutlierRule {
  variableCode: string;
  enabled: boolean;
  strategy: OutlierStrategy;
  tail: OutlierTail;
  fold: number | null;
}

interface OutlierVariable {
  code: string;
  label?: string;
  name?: string;
  type?: string;
  enumerations?: unknown[];
}

interface SerializedOutlierRules {
  strategies: Record<string, OutlierStrategy>;
  tails: Record<string, OutlierTail>;
  folds: Record<string, number>;
}

export const OUTLIER_STRATEGIES: Array<{ value: OutlierStrategy; label: string }> = [
  { value: 'gaussian', label: 'Gaussian' },
  { value: 'iqr', label: 'IQR' },
  { value: 'mad', label: 'MAD' },
  { value: 'quantile', label: 'Quantile' },
];

export const OUTLIER_TAILS: Array<{ value: OutlierTail; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
];

const OUTLIER_DEFAULT_FOLDS: Record<OutlierStrategy, number> = {
  gaussian: 3.0,
  iqr: 1.5,
  mad: 3.0,
  quantile: 0.05,
};

const OUTLIER_NUMERIC_TYPES = new Set(['real', 'int', 'integer', 'numeric', 'number']);

function isOutlierStrategy(value: unknown): value is OutlierStrategy {
  return value === 'gaussian' || value === 'iqr' || value === 'mad' || value === 'quantile';
}

function isOutlierTail(value: unknown): value is OutlierTail {
  return value === 'left' || value === 'right' || value === 'both';
}

export function isOutlierEligibleVariable(variable: OutlierVariable): boolean {
  if (!variable?.code) return false;
  if (Array.isArray(variable.enumerations) && variable.enumerations.length > 0) return false;
  return OUTLIER_NUMERIC_TYPES.has(String(variable.type ?? '').toLowerCase());
}

export function createDefaultOutlierRule(variableCode: string, enabled = false): OutlierRule {
  const strategy: OutlierStrategy = 'iqr';
  return {
    variableCode,
    enabled,
    strategy,
    tail: 'both',
    fold: OUTLIER_DEFAULT_FOLDS[strategy],
  };
}

export function defaultFoldForStrategy(strategy: OutlierStrategy): number {
  return OUTLIER_DEFAULT_FOLDS[strategy];
}

export function validateOutlierRule(rule: OutlierRule): string | null {
  if (!rule.enabled) return null;
  const fold = rule.fold;
  if (fold === null || fold === undefined || !Number.isFinite(Number(fold))) {
    return 'A fold value is required.';
  }
  if (rule.strategy === 'quantile') {
    return fold > 0 && fold < 0.5 ? null : 'Quantile fold must be greater than 0 and less than 0.5.';
  }
  return fold > 0 ? null : 'Fold must be greater than 0.';
}

export function serializeOutlierRules(
  rules: Record<string, OutlierRule>,
  allowedCodes?: Set<string>
): SerializedOutlierRules | null {
  const strategies: Record<string, OutlierStrategy> = {};
  const tails: Record<string, OutlierTail> = {};
  const folds: Record<string, number> = {};

  Object.values(rules).forEach((rule) => {
    if (allowedCodes && !allowedCodes.has(rule.variableCode)) return;
    if (!rule.enabled) return;
    const error = validateOutlierRule(rule);
    if (error) return;
    strategies[rule.variableCode] = rule.strategy;
    tails[rule.variableCode] = rule.tail;
    folds[rule.variableCode] = Number(rule.fold);
  });

  return Object.keys(strategies).length ? { strategies, tails, folds } : null;
}

export function cloneOutlierRules(rules: Record<string, OutlierRule>): Record<string, OutlierRule> {
  return Object.fromEntries(
    Object.entries(rules).map(([code, rule]) => [code, { ...rule }])
  );
}

export function serializeOutlierRule(rule: OutlierRule | undefined): string {
  const normalized = rule ?? createDefaultOutlierRule('');
  return JSON.stringify({
    enabled: normalized.enabled,
    strategy: normalized.strategy,
    tail: normalized.tail,
    fold: normalized.fold,
  });
}

export function hydrateOutlierRules(
  config: unknown,
  allowedCodes: Set<string>
): Record<string, OutlierRule> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};

  const payload = config as {
    strategies?: Record<string, unknown>;
    tails?: Record<string, unknown>;
    folds?: Record<string, unknown>;
  };
  const strategies = payload.strategies ?? {};
  const tails = payload.tails ?? {};
  const folds = payload.folds ?? {};
  const hydrated: Record<string, OutlierRule> = {};

  allowedCodes.forEach((code) => {
    const strategyValue = strategies[code];
    if (!isOutlierStrategy(strategyValue)) return;
    const tailValue = tails[code];
    const rawFold = folds[code];
    const parsedFold = rawFold === null || rawFold === undefined || rawFold === ''
      ? null
      : Number(rawFold);
    hydrated[code] = {
      variableCode: code,
      enabled: true,
      strategy: strategyValue,
      tail: isOutlierTail(tailValue) ? tailValue : 'both',
      fold: typeof parsedFold === 'number' && Number.isFinite(parsedFold)
        ? parsedFold
        : defaultFoldForStrategy(strategyValue),
    };
  });

  return hydrated;
}

export function outlierStrategyLabel(strategy: OutlierStrategy | string): string {
  return OUTLIER_STRATEGIES.find((item) => item.value === strategy)?.label ?? String(strategy).replace(/_/g, ' ');
}

export function outlierTailLabel(tail: OutlierTail | string): string {
  return OUTLIER_TAILS.find((item) => item.value === tail)?.label.toLowerCase() ?? String(tail).replace(/_/g, ' ');
}
