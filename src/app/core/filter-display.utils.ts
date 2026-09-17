import { BackendFilter, BackendRule } from '../models/filters.model';
import { EnumMaps, LabelMap } from './algorithm-result-enum-mapper';
import { filterOperatorSymbolFor, isUnaryFilterOperator } from './filter-logic.utils';

/**
 * Reads a backend filter tree as a user reads it. The tree is the payload Exaflow
 * receives, so this is the one place that knows how a rule group reads as a sentence.
 */
interface FilterDisplaySources {
  /** Variable code → data-model label. */
  labelMap: LabelMap;
  /** Variable code → enum code → label, for the value side of a rule. */
  enumMaps?: EnumMaps;
}

/* The operator symbols come from core/filter-logic.utils — the same table the filter builder
   writes with, so a tree never prints a raw backend token here and a real operator there. */

/** Leaf-rule count of a filter tree; 0 when nothing was filtered. */
export function countFilterRules(node: BackendFilter | null | undefined): number {
  if (!node || !Array.isArray(node.rules)) return 0;
  return node.rules.reduce<number>(
    (total, rule) => total + ((rule as BackendFilter)?.rules ? countFilterRules(rule as BackendFilter) : 1),
    0
  );
}

/**
 * One-line cohort description, e.g. `Age >= 18 AND (Sex = female OR Sex = male)`.
 * Returns '' for a tree without rules so callers can show their own empty state.
 */
export function formatFilterExpression(
  node: BackendFilter | null | undefined,
  sources: FilterDisplaySources
): string {
  return formatNode(node, sources, true);
}

/** Only a nested group is parenthesised: the outermost group has nothing to bind tighter than. */
function formatNode(
  node: BackendRule | BackendFilter | null | undefined,
  sources: FilterDisplaySources,
  isRoot = false
): string {
  if (!node) return '';

  if ('rules' in node) {
    const parts = node.rules.map((child) => formatNode(child, sources)).filter(Boolean);
    if (!parts.length) return '';
    const condition = String(node.condition).toUpperCase() === 'OR' ? 'OR' : 'AND';
    const expression = parts.join(` ${condition} `);
    return parts.length > 1 && !isRoot ? `(${expression})` : expression;
  }

  const field = String(node.field ?? node.id ?? '');
  const label = sources.labelMap[field] || field || 'Variable';
  const operator = filterOperatorSymbolFor(String(node.operator ?? ''));

  if (isUnaryFilterOperator(String(node.operator ?? ''))) {
    return `${label} ${operator}`;
  }
  return `${label} ${operator} ${formatValue(field, node.value, sources)}`;
}

function formatValue(field: string, value: unknown, sources: FilterDisplaySources): string {
  if (value === null || value === undefined || value === '') return 'value';
  if (Array.isArray(value)) {
    const parts = value.map((entry) => formatValue(field, entry, sources)).filter(Boolean);
    return parts.length ? parts.join(', ') : 'value';
  }
  const code = String(value);
  return sources.enumMaps?.[field]?.[code] ?? code;
}
