import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, inject, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { AlgorithmResultComponent } from '../../experiment-studio/algorithm-panel/algorithm-result/algorithm-result.component';
import { getOutputSchema } from '../../../core/algorithm-mappers';
import { ExperimentLabelService } from '../../../services/experiment-label.service';
import { EnumMaps } from '../../../core/algorithm-result-enum-mapper';
import { enrichPcaResult, withLabels } from '../../../core/result-label.utils';
import { ExperimentFoldersService } from '../../../services/experiment-folders.service';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentStatusComponent } from '../shared/experiment-status/experiment-status.component';

interface CompareResultState {
  loading: boolean;
  error: string | null;
  result: any | null;
}

interface CompareItem {
  exp: Experiment;
  state: CompareResultState;
}

/** One column: a run, its comparison-wide number, and the set tag when a folder set claimed it. */
interface CompareColumn {
  item: CompareItem;
  number: number;
  setTag: string | null;
}

@Component({
  selector: 'app-experiments-compare',
  imports: [CommonModule, AlgorithmResultComponent, ExperimentStatusComponent],
  templateUrl: './experiments-compare.component.html',
  styleUrl: './experiments-compare.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentsCompareComponent implements OnDestroy {
  private dashboardService = inject(ExperimentsDashboardService);
  private labelService = inject(ExperimentLabelService);
  private foldersService = inject(ExperimentFoldersService);
  private expStudio = inject(ExperimentStudioService);
  private destroy$ = new Subject<void>();

  experiments = input<Experiment[]>([]);

  /**
   * The folder this compare was opened from, or null for a hand-picked selection. The id is enough:
   * sets are read from the same signal-backed service the canvas edits, so a set created after the
   * handoff still sections the workspace, and this view never has to write to it.
   */
  readonly originFolderId = input<string | null>(null);
  readonly backToFolder = output<void>();

  readonly originFolder = computed(() => this.foldersService.folderById(this.originFolderId()));
  readonly originFolderName = computed(() => this.originFolder()?.name ?? null);

  /** Says what the workspace is holding, so the header stops asking for a selection it already has. */
  readonly compareHeadline = computed(() => {
    const count = this.experiments().length;
    const runs = count === 1 ? 'run' : 'runs';
    return `Comparing ${this.originFolderName() ?? 'your selection'} · ${count} ${runs}`;
  });

  // Results map: expId -> state
  private resultMap = signal<Record<string, CompareResultState>>({});

  // Config collapse per exp
  private configExpandedMap = signal<Record<string, boolean>>({});

  // Labels grouped by domain (data_model:version)
  private labelsByDomain = signal<Record<string, Record<string, string>>>({});
  private enumMapsByDomain = signal<Record<string, EnumMaps>>({});

  readonly experimentsWithState = computed<CompareItem[]>(() => {
    const exps = this.experiments();
    const map = this.resultMap();
    return exps.map((exp) => ({
      exp,
      state: map[exp.id] ?? { loading: false, error: null, result: null },
    }));
  });

  /**
   * The comparison's order, flattened to one column per run: user sets come first, in folder order
   * — the order the canvas numbered them in — and everything nobody grouped follows as one group
   * per algorithm label, in the order the runs appear. Describe and histogram are ordinary
   * algorithm groups: an ungrouped run needs a home, not a special case. Numbering runs across the
   * whole comparison, so "run 7" names one column whichever group it landed in.
   */
  readonly columns = computed<CompareColumn[]>(() => {
    const groups: { setTag: string | null; items: CompareItem[] }[] = [];
    const claimed = new Set<string>();

    for (const set of this.originFolder()?.sets ?? []) {
      const members = this.experimentsWithState().filter((item) => set.experimentIds.includes(item.exp.id));
      if (!members.length) continue; // An empty set has nothing to show; its tag can wait.
      members.forEach((member) => claimed.add(member.exp.id));
      groups.push({ setTag: set.name, items: members });
    }

    const byAlgorithm = new Map<string, CompareItem[]>();
    for (const item of this.experimentsWithState()) {
      if (claimed.has(item.exp.id)) continue;
      const key = item.exp.algorithmName ?? 'unknown';
      const bucket = byAlgorithm.get(key);
      if (bucket) bucket.push(item);
      else byAlgorithm.set(key, [item]);
    }
    for (const items of byAlgorithm.values()) groups.push({ setTag: null, items });

    let number = 0;
    return groups.flatMap((group) =>
      group.items.map((item) => ({ item, number: (number += 1), setTag: group.setTag })),
    );
  });

  constructor() {
    effect(
      () => {
        const exps = this.experiments();
        const currentMap = this.resultMap();

        // load results for missing
        exps.forEach((exp) => {
          if (!currentMap[exp.id]) this.loadResult(exp.id);
        });

        const domains = Array.from(
          new Set(
            exps
              .map((exp) => exp?.domain)
              .filter((domain): domain is string => !!domain)
          )
        );
        domains.forEach((domain) => {
          void this.loadLabels(domain);
          void this.loadEnumMaps(domain);
        });
      }
    );
  }

  private async loadLabels(domain: string | null) {
    if (!domain) return;
    if (this.labelsByDomain()[domain]) return;

    const map = await this.labelService.getLabelMap(domain);
    this.labelsByDomain.update((current) => ({ ...current, [domain]: map }));
  }

  private async loadEnumMaps(domain: string | null) {
    if (!domain) return;

    const cached = this.enumMapsByDomain()[domain];
    if (cached) return;

    const maps = await this.labelService.getEnumMaps(domain);
    this.enumMapsByDomain.update((current) => ({ ...current, [domain]: maps }));
  }


  isConfigExpanded(expId: string): boolean {
    return this.configExpandedMap()[expId] ?? false; // default collapsed
  }

  toggleConfig(expId: string) {
    this.configExpandedMap.update((m) => ({
      ...m,
      [expId]: !(m[expId] ?? false),
    }));
  }

  private loadResult(uuid: string) {
    this.resultMap.update((map) => ({
      ...map,
      [uuid]: { loading: true, error: null, result: null },
    }));

    this.dashboardService.getExperimentResult(uuid).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.resultMap.update((map) => ({
          ...map,
          [uuid]: {
            loading: false,
            error: null,
            result: res?.result ?? res,
          },
        }));
      },
      error: (err) => {
        console.error('Error loading experiment result for compare', err);
        this.resultMap.update((map) => ({
          ...map,
          [uuid]: {
            loading: false,
            error: 'Failed to load results.',
            result: null,
          },
        }));
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getOutputSchemaFor(exp: Experiment) {
    return getOutputSchema(exp.algorithmName) ?? [];
  }

  private getLabelMapForDomain(domain: string | null | undefined): Record<string, string> {
    if (!domain) return {};
    return this.labelsByDomain()[domain] ?? {};
  }

  private withLabels(codes: string[] | undefined | null, domain?: string | null) {
    return withLabels(codes, this.getLabelMapForDomain(domain));
  }

  /** The algorithm's human label, so a column's algorithm line reads like the list row above it. */
  algorithmLabel(code: string | null | undefined): string {
    if (!code) return 'Unknown algorithm';
    return this.expStudio.backendAlgorithms()[code]?.label || code;
  }

  getVariablesWithLabels(exp: Experiment) {
    return this.withLabels((exp as any).variables, exp?.domain ?? null);
  }

  getCovariatesWithLabels(exp: Experiment) {
    return this.withLabels((exp as any).covariates, exp?.domain ?? null);
  }

  getFiltersWithLabels(exp: Experiment) {
    return this.withLabels((exp as any).filters, exp?.domain ?? null);
  }

  getEnumMapsFor(exp: Experiment): EnumMaps {
    const domain = exp?.domain ?? '';
    return this.enumMapsByDomain()[domain] ?? {};
  }

  getLabelMapFor(exp: Experiment): Record<string, string> {
    return this.getLabelMapForDomain(exp?.domain ?? null);
  }

  getYVarFor(exp: Experiment): string | null {
    const vars = (exp as any)?.variables;
    if (Array.isArray(vars)) return vars[0] ?? null;
    return null;
  }

  getXVarFor(exp: Experiment): string | null {
    const vars = (exp as any)?.covariates;
    if (Array.isArray(vars)) return vars[0] ?? null;
    return null;
  }

  enrichResult(exp: Experiment, result: any): any {
    if (!result || !exp) return result;
    return enrichPcaResult(
      result,
      exp.algorithmName,
      this.getVariablesWithLabels(exp).map((v) => v.label),
      this.getCovariatesWithLabels(exp).map((c) => c.label)
    );
  }
}
