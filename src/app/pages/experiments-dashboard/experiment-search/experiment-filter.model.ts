export type ExperimentDatePreset = 'any' | 'today' | '7d' | '30d';

export type ExperimentSort =
  | 'created-desc'
  | 'created-asc'
  | 'name-asc'
  | 'name-desc'
  | 'status-desc'
  | 'algorithm-asc';

/**
 * Every sort the list offers, once: the menu label plus the `orderBy`/`descending` pair
 * `/services/experiments` accepts (ExperimentOrderBy allows created/name/status/algorithm).
 * Insertion order is the menu order.
 */
export const EXPERIMENT_SORTS: Record<ExperimentSort, { label: string; orderBy: string; descending: boolean }> = {
  'created-desc': { label: 'Newest', orderBy: 'created', descending: true },
  'created-asc': { label: 'Oldest', orderBy: 'created', descending: false },
  'name-asc': { label: 'Name A–Z', orderBy: 'name', descending: false },
  'name-desc': { label: 'Name Z–A', orderBy: 'name', descending: true },
  'status-desc': { label: 'Status', orderBy: 'status', descending: true },
  'algorithm-asc': { label: 'Algorithm', orderBy: 'algorithm', descending: false },
};

export const EXPERIMENT_SORT_VALUES = Object.keys(EXPERIMENT_SORTS) as ExperimentSort[];

export interface ExperimentFilters {
  query: string;
  datePreset: ExperimentDatePreset;

  algorithm: string | null;
  author: string | null;
  variable: string | null;

  status: 'any' | 'success' | 'error';
  shared: 'any' | 'shared' | 'private';
}
