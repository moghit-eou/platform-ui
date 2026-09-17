/**
 * The one operator vocabulary the app shares between the filter builder, the filter
 * display, and anything that sends a filter tree to the backend.
 *
 * A builder-side `symbol` is what a condition block holds and what a `<select>` binds;
 * `backend` is the operator name exaflow expects. Every lookup accepts either form and
 * returns the input untouched when it is not in the table, so an operator the builder
 * cannot author is preserved verbatim instead of silently becoming `equal`.
 */
export type FilterOperatorValueKind =
  /** One value: a category, a number, a string. */
  | 'single'
  /** Any number of values, sent as an array: `in`, `not_in`. */
  | 'values'
  /** No value at all: `is null`, `is not null`. */
  | 'none';

export interface FilterOperatorSpec {
  symbol: string;
  backend: string;
  /** How the builder names the operator to the user. */
  label: string;
  valueKind: FilterOperatorValueKind;
  /** Offered only for variables the data model types as real/integer. */
  numericOnly?: boolean;
}

export const FILTER_OPERATORS: readonly FilterOperatorSpec[] = [
  { symbol: '=', backend: 'equal', label: 'Equals', valueKind: 'single' },
  { symbol: '!=', backend: 'not_equal', label: 'Does not equal', valueKind: 'single' },
  { symbol: 'IN', backend: 'in', label: 'In (any of)', valueKind: 'values' },
  { symbol: 'NOT IN', backend: 'not_in', label: 'Not in (none of)', valueKind: 'values' },
  { symbol: '>', backend: 'greater', label: 'Greater than', valueKind: 'single', numericOnly: true },
  { symbol: '>=', backend: 'greater_or_equal', label: 'Greater than or equal to', valueKind: 'single', numericOnly: true },
  { symbol: '<', backend: 'less', label: 'Less than', valueKind: 'single', numericOnly: true },
  { symbol: '<=', backend: 'less_or_equal', label: 'Less than or equal to', valueKind: 'single', numericOnly: true },
  { symbol: 'IS NULL', backend: 'is_null', label: 'Is null', valueKind: 'none' },
  { symbol: 'IS NOT NULL', backend: 'is_not_null', label: 'Is not null', valueKind: 'none' },
];

/** Looks an operator up by builder symbol or by backend name — callers never convert first. */
export function filterOperatorSpec(operator: string | null | undefined): FilterOperatorSpec | null {
  return FILTER_OPERATORS.find((entry) => entry.symbol === operator || entry.backend === operator) ?? null;
}

/** Backend name → builder symbol. Anything outside the table is returned unchanged. */
export function filterOperatorSymbolFor(operator: string): string {
  return filterOperatorSpec(operator)?.symbol ?? operator;
}

/** Builder symbol → backend name. Anything outside the table is returned unchanged. */
export function filterOperatorBackendFor(operator: string): string {
  return filterOperatorSpec(operator)?.backend ?? operator;
}

export function filterOperatorValueKind(operator: string): FilterOperatorValueKind {
  return filterOperatorSpec(operator)?.valueKind ?? 'single';
}

export function isUnaryFilterOperator(operator: string): boolean {
  return filterOperatorValueKind(operator) === 'none';
}

/** `in` / `not_in`: the value is a set, so any number of categories can be picked. */
export function isMultiValueFilterOperator(operator: string): boolean {
  return filterOperatorValueKind(operator) === 'values';
}

/** Operator symbols offered for a data-model variable type. */
export function filterOperatorSymbolsForType(type: string | null | undefined): string[] {
  const numeric = String(type ?? '').toLowerCase() !== 'nominal';
  return FILTER_OPERATORS.filter((entry) => numeric || !entry.numericOnly).map((entry) => entry.symbol);
}

