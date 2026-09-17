import { Injectable, signal, WritableSignal, inject } from '@angular/core';
import { Experiment } from '../models/experiments-dashboard.model';
import { HttpClient } from '@angular/common/http';
import { BackendExperiment, BackendExperimentWithResult } from '../models/backend-experiment.model';
import { mapBackendToFrontend } from '../pages/experiments-dashboard/experiments-dashboard.mapper';
import {
  EXPERIMENT_SORTS,
  ExperimentDatePreset,
  ExperimentFilters,
  ExperimentSort,
} from '../pages/experiments-dashboard/experiment-search/experiment-filter.model';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { ErrorService } from './error.service';
import { isNotFoundError } from '../core/http-error.utils';

interface ExperimentsPage {
  experiments: BackendExperiment[];
  totalExperiments: number;
  totalPages: number;
  currentPage: number;
}

const PAGE_SIZE_FOR_FULL_LOAD = 50;
/**
 * A filter the backend contract cannot express (substring search, author, variable, status,
 * date) is answered from one ownership-scoped snapshot of the history, sliced here. That
 * snapshot is capped, so past `FULL_LOAD_HISTORY_CAP` runs a search is honest about the
 * range it covered rather than implying it read everything. Retiring the cap needs a backend
 * substring/date filter, which retires loadAllExperiments entirely.
 */
const MAX_FULL_LOAD_PAGES = 50;
const FULL_LOAD_HISTORY_CAP = PAGE_SIZE_FOR_FULL_LOAD * MAX_FULL_LOAD_PAGES;

/** One ownership-scoped read of the history, and whether the cap cut it short. */
interface Snapshot {
  experiments: Experiment[];
  truncated: boolean;
}

const DEFAULT_FILTERS: ExperimentFilters = {
  query: '',
  datePreset: 'any',
  algorithm: null,
  author: null,
  variable: null,
  status: 'any',
  shared: 'any',
};

@Injectable({
  providedIn: 'root',
})
export class ExperimentsDashboardService {
  private apiUrl = '/services/experiments';

  experiments: WritableSignal<Experiment[]> = signal<Experiment[]>([]);
  totalExperiments = signal<number>(0);
  /** True when a client-side filter had to stop at `fullHistoryCap` runs. */
  historyTruncated = signal<boolean>(false);
  readonly fullHistoryCap = FULL_LOAD_HISTORY_CAP;
  totalPages = signal<number>(0);
  currentPage = signal<number>(0);
  isLoading = signal<boolean>(false);

  private http = inject(HttpClient);
  private experimentsRequestSub: Subscription | null = null;
  private lastListRequest: (() => void) | null = null;

  /** Full per-tab cache used only when a filter cannot be pushed to the backend contract. */
  private allExperimentsCache = new Map<'mine' | 'shared', Snapshot>();

  /** Clears the client-filter snapshot so the next load reads the backend again. */
  invalidateListCache(): void {
    this.allExperimentsCache.clear();
  }

  private errorService = inject(ErrorService);

  constructor() { }

  /**
   * Loads a dashboard page.
   *
   * The backend supports ownership, name-prefix, popularity and a few flags directly, but not
   * description/author/variable/status/date filters and not true substring search. When the
   * user asks for one of those, load the ownership-scoped history once and slice it here so
   * the controls do what they say. Normal browsing stays server-paginated.
   */
  getUserExperiments(
    page: number = 0,
    size: number = 10,
    onlyMine: boolean = false,
    filters?: Partial<ExperimentFilters>,
    sort: ExperimentSort = 'created-desc',
  ): void {
    const effectiveFilters: ExperimentFilters = { ...DEFAULT_FILTERS, ...(filters ?? {}) };
    this.lastListRequest = () => this.getUserExperiments(page, size, onlyMine, effectiveFilters, sort);

    this.experimentsRequestSub?.unsubscribe();
    this.isLoading.set(true);

    if (this.needsClientFiltering(effectiveFilters)) {
      this.experimentsRequestSub = this.loadAllExperiments(onlyMine, sort).subscribe({
        next: (all) => this.applyClientView(all, page, size, effectiveFilters),
        error: (err) => this.handleListError(err),
      });
      return;
    }

    this.experimentsRequestSub = this.http
      .get<ExperimentsPage>(this.apiUrl, {
        params: this.buildServerParams(page, size, onlyMine, sort, effectiveFilters),
      })
      .subscribe({
        next: (response) => this.applyServerPage(response),
        error: (err) => this.handleListError(err),
      });
  }

  retryLastRequest(): void {
    this.lastListRequest?.();
  }

  private applyServerPage(response: ExperimentsPage | null): void {
    this.isLoading.set(false);
    const mappedExperiments = (response?.experiments || []).map(mapBackendToFrontend);
    this.experiments.set(mappedExperiments);
    this.totalExperiments.set(response?.totalExperiments || 0);
    this.totalPages.set(response?.totalPages || 0);
    this.currentPage.set(response?.currentPage || 0);
    // Server-paginated browsing never reads a capped snapshot.
    this.historyTruncated.set(false);
  }

  /** The snapshot arrives already in the requested order (the server sorted it), so filtering and
   * slicing preserve that order — there is nothing to re-sort here. */
  private applyClientView(
    all: Experiment[],
    page: number,
    size: number,
    filters: ExperimentFilters,
  ): void {
    this.isLoading.set(false);
    const sorted = all.filter((experiment) => this.matchesFilters(experiment, filters));
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / size);
    const safePage = total === 0 ? 0 : Math.min(page, Math.max(0, totalPages - 1));

    this.experiments.set(sorted.slice(safePage * size, safePage * size + size));
    this.totalExperiments.set(total);
    this.totalPages.set(totalPages);
    this.currentPage.set(safePage);
  }

  private buildServerParams(
    page: number,
    size: number,
    onlyMine: boolean,
    sort: ExperimentSort,
    filters: ExperimentFilters,
  ): Record<string, string> {
    const params: Record<string, string> = {
      ...this.baseListParams(page, size, onlyMine),
      ...this.sortParams(sort),
    };

    if (filters.algorithm) params['algorithm'] = filters.algorithm;
    if (filters.shared !== 'any') params['shared'] = (filters.shared === 'shared').toString();

    return params;
  }

  private baseListParams(page: number, size: number, onlyMine: boolean): Record<string, string> {
    return {
      page: page.toString(),
      size: size.toString(),
      mine: onlyMine.toString(),
      notMine: (!onlyMine).toString(),
      includeShared: (!onlyMine).toString(),
    };
  }

  private sortParams(sort: ExperimentSort): Record<string, string> {
    const { orderBy, descending } = EXPERIMENT_SORTS[sort] ?? EXPERIMENT_SORTS['created-desc'];
    return { orderBy, descending: descending.toString() };
  }

  private buildFullLoadParams(page: number, onlyMine: boolean, sort: ExperimentSort): Record<string, string> {
    return {
      ...this.baseListParams(page, PAGE_SIZE_FOR_FULL_LOAD, onlyMine),
      ...this.sortParams(sort),
    };
  }

  private loadAllExperiments(onlyMine: boolean, sort: ExperimentSort): Observable<Experiment[]> {
    const cacheKey: 'mine' | 'shared' = onlyMine ? 'mine' : 'shared';
    const cached = this.allExperimentsCache.get(cacheKey);
    if (cached) {
      this.historyTruncated.set(cached.truncated);
      return of(cached.experiments);
    }

    const fetchPage = (page: number): Observable<{ page: ExperimentsPage; experiments: Experiment[] }> =>
      this.http
        .get<ExperimentsPage>(this.apiUrl, { params: this.buildFullLoadParams(page, onlyMine, sort) })
        .pipe(
          map((response) => ({
            page: response,
            experiments: (response?.experiments || []).map(mapBackendToFrontend),
          })),
        );

    return fetchPage(0).pipe(
      switchMap((first) => {
        const serverPages = first.page?.totalPages || 1;
        const pageCount = Math.min(Math.max(1, serverPages), MAX_FULL_LOAD_PAGES);
        const pageRequests = Array.from({ length: pageCount - 1 }, (_, index) => fetchPage(index + 1));

        return (pageRequests.length ? forkJoin(pageRequests) : of([])).pipe(
          map((rest): Snapshot => ({
            experiments: [
              ...first.experiments,
              ...rest.flatMap((entry) => entry.experiments),
            ],
            // Pages the history had that the cap refused to read: the search did not see them.
            truncated: serverPages > pageCount,
          })),
        );
      }),
      tap((snapshot) => {
        this.allExperimentsCache.set(cacheKey, snapshot);
        this.historyTruncated.set(snapshot.truncated);
      }),
      map((snapshot) => snapshot.experiments),
    );
  }

  private needsClientFiltering(filters: ExperimentFilters): boolean {
    return Boolean(
      filters.query?.trim() ||
      filters.author ||
      filters.variable ||
      filters.status !== 'any' ||
      filters.datePreset !== 'any',
    );
  }

  private matchesFilters(experiment: Experiment, filters: ExperimentFilters): boolean {
    if (!this.matchesQuery(experiment, filters.query)) return false;
    if (filters.algorithm && experiment.algorithmName !== filters.algorithm) return false;
    if (filters.author && !this.normalize(experiment.author).includes(this.normalize(filters.author))) return false;
    if (filters.variable && !this.matchesVariable(experiment, filters.variable)) return false;
    if (filters.status !== 'any' && experiment.status !== filters.status) return false;
    if (filters.shared === 'shared' && !experiment.isShared) return false;
    if (filters.shared === 'private' && experiment.isShared) return false;
    if (!this.matchesDatePreset(experiment.dateCreated, filters.datePreset)) return false;
    return true;
  }

  private matchesQuery(experiment: Experiment, query: string): boolean {
    const needle = this.normalize(query);
    if (!needle) return true;

    const fields = [
      experiment.name,
      experiment.description,
      experiment.author,
      experiment.algorithmName,
      experiment.domain,
      ...(experiment.datasets ?? []),
      ...(experiment.variables ?? []),
      ...(experiment.covariates ?? []),
    ];

    return fields.some((value) => this.normalize(value).includes(needle));
  }

  private matchesVariable(experiment: Experiment, variable: string): boolean {
    const needle = this.normalize(variable);
    if (!needle) return true;

    return [...(experiment.variables ?? []), ...(experiment.covariates ?? [])].some((value) =>
      this.normalize(value).includes(needle),
    );
  }

  private matchesDatePreset(date: Date, preset: ExperimentDatePreset): boolean {
    if (!preset || preset === 'any') return true;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === 'today') return date >= startOfToday;

    const days = preset === '7d' ? 7 : 30;
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - days);
    return date >= from;
  }

  private handleListError(err: unknown): void {
    this.isLoading.set(false);
    console.error('[ExperimentsDashboardService] getUserExperiments error', err);
    this.errorService.setError('Failed to load experiments.');
    this.experiments.set([]);
    this.totalExperiments.set(0);
    this.totalPages.set(0);
    this.currentPage.set(0);
    this.historyTruncated.set(false);
  }

  private normalize(value: string | null | undefined): string {
    return (value ?? '').toLowerCase();
  }

  // For edit / hydrate (metadata)
  getExperiment(uuid: string) {
    return this.http.get<BackendExperiment>(`${this.apiUrl}/${uuid}`);
  }

  fetchExperimentById(uuid: string) {
    return this.http
      .get<BackendExperiment>(`${this.apiUrl}/${uuid}`)
      .pipe(map(mapBackendToFrontend));
  }

  upsertExperiment(experiment: Experiment): void {
    if (!experiment?.id) return;
    this.experiments.update((current) => {
      const idx = current.findIndex((exp) => exp.id === experiment.id);
      if (idx === -1) {
        return [experiment, ...current];
      }
      const next = [...current];
      next[idx] = { ...current[idx], ...experiment };
      return next;
    });

    // The snapshot is a server read, so a local edit drops it rather than being merged into it.
    this.allExperimentsCache.clear();
  }

  /**
   * Resolves `ids` to experiments in folder order, fetching the members that sit on another
   * page. The compare workspace reads the loaded page only, so without this an off-page
   * member of a folder would drop out of the comparison silently. A member the backend no
   * longer returns is skipped here; the folder canvas reports and prunes it.
   */
  hydrateExperiments(ids: string[]): Observable<Experiment[]> {
    const known = new Map(this.experiments().map((exp) => [exp.id, exp] as const));
    const missing = ids.filter((id) => !known.has(id));

    const resolved = (fetched: Experiment[]): Experiment[] => {
      fetched.forEach((exp) => this.upsertExperiment(exp));
      const byId = new Map(known);
      fetched.forEach((exp) => byId.set(exp.id, exp));
      return ids
        .map((id) => byId.get(id))
        .filter((exp): exp is Experiment => !!exp);
    };

    if (!missing.length) return of(resolved([]));

    return forkJoin(
      missing.map((id) =>
        this.fetchExperimentById(id).pipe(
          // A 404 means the member is gone and may be dropped. Any other failure is a real
          // fetch failure and must reach the caller so the UI can say the handoff failed.
          catchError((err) => isNotFoundError(err) ? of<Experiment | null>(null) : throwError(() => err)),
        ),
      ),
    ).pipe(
      map((fetched) =>
        resolved(fetched.filter((exp): exp is Experiment => !!exp)),
      ),
    );
  }

  // For compare / results view
  getExperimentResult(uuid: string) {
    return this.http.get<BackendExperimentWithResult>(`${this.apiUrl}/${uuid}`);
  }

  toggleExperimentShare(experimentId: string, newShared: boolean) {
    return this.http
      .patch<BackendExperiment>(`${this.apiUrl}/${experimentId}`, { shared: newShared })
      .pipe(
        tap((updated) => {
          this.experiments.update((current) =>
            current.map((exp) =>
              exp.id === experimentId
                ? { ...exp, isShared: updated.shared }
                : exp
            )
          );
        })
      );
  }

  updateExperimentName(experimentId: string, name: string) {
    return this.http
      .patch<BackendExperiment>(`${this.apiUrl}/${experimentId}`, { name })
      .pipe(
        tap((updated) => {
          this.experiments.update((current) =>
            current.map((exp) =>
              exp.id === experimentId
                ? { ...exp, name: updated.name }
                : exp
            )
          );
        })
      );
  }

  deleteExperiment(experimentId: string, onDeleted?: (experimentId: string) => void): void {
    if (!experimentId) return;

    const previousExperiments = this.experiments();
    const previousTotal = this.totalExperiments();
    this.allExperimentsCache.clear();

    // Optimistic update UI
    this.experiments.update((current: Experiment[]) =>
      current.filter((exp: Experiment) => exp.id !== experimentId)
    );
    this.totalExperiments.set(Math.max(0, previousTotal - 1));

    // Backend call with rollback on failure
    this.http.delete<void>(`${this.apiUrl}/${experimentId}`).subscribe({
      next: () => {
        onDeleted?.(experimentId);
      },
      error: (err) => {
        console.error('Error deleting experiment', err);
        this.experiments.set(previousExperiments);
        this.totalExperiments.set(previousTotal);
        this.allExperimentsCache.clear();
        this.errorService.setError('Failed to delete experiment.');
      },
    });
  }
}
