import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  OnDestroy,
  output,
  Renderer2,
  signal,
  viewChild,
} from '@angular/core';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { Observable } from 'rxjs';
import { InflightWrites } from '../../../core/inflight-writes';

import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentSet } from '../../../models/experiment-folder.model';
import { droppedExperimentId, isExperimentDrag, leavesDragZone } from '../../../core/experiment-drag.utils';
import { isNotFoundError } from '../../../core/http-error.utils';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentFoldersService } from '../../../services/experiment-folders.service';
import { CommonModule } from '@angular/common';
import { ExperimentStatusComponent } from '../shared/experiment-status/experiment-status.component';

/** One row of the canvas: a member id plus whatever we know about it yet. */
interface FolderMemberRow {
  id: string;
  experiment: Experiment | null;
}

/** One heading on the canvas: a named set, or the implicit Ungrouped tail. */
interface MemberGroup {
  id: string;
  name: string;
  isUngrouped: boolean;
  /** Rows listed above this heading, so one number line runs down the whole canvas. */
  start: number;
  rows: FolderMemberRow[];
}

/** Not a set id — nothing a set can be called, so it can never clash with one. */
const UNGROUPED_GROUP_ID = 'ungrouped';
const UNGROUPED_GROUP_NAME = 'Ungrouped';

/** One drop report: the copy, whether it changed anything (which drives its tint), and the row it just added. */
interface DropNotice {
  text: string;
  kind: 'added' | 'duplicate';
  landedId: string | null;
}

/** Long enough to read against the row that just appeared, short enough not to linger. */
const DROP_NOTICE_MS = 2200;

/**
 * The folder canvas: the centre-pane view for a selected analysis set. It is a selection
 * helper, not a second detail view — a member click still opens the detail, and the primary
 * action hands the member ids to the compare workspace.
 *
 * Inside the canvas, members are partitioned into named sets: the headings the compare
 * workspace later renders as sections. Everything not moved into a set sits under an
 * implicit Ungrouped heading, which compare groups by algorithm instead.
 */
@Component({
  selector: 'app-experiment-folder',
  templateUrl: './experiment-folder.component.html',
  styleUrl: './experiment-folder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CdkMenu, CdkMenuItem, ExperimentStatusComponent],
})
export class ExperimentFolderComponent implements OnDestroy {
  /** The folder is read through the service, so a member added or pruned elsewhere shows up
   *  without the parent having to push a fresh copy down. */
  readonly folderId = input<string | null>(null);

  readonly back = output<void>();
  readonly openExperiment = output<Experiment>();
  readonly compareRequested = output<string[]>();

  private dashboardService = inject(ExperimentsDashboardService);
  private foldersService = inject(ExperimentFoldersService);
  private expStudio = inject(ExperimentStudioService);
  private renderer = inject(Renderer2);
  private cdr = inject(ChangeDetectorRef);

  readonly folder = computed(() => this.foldersService.folderById(this.folderId()));

  /** Members outside the loaded page, fetched for display only (never upserted into the list). */
  private fetched = signal<Record<string, Experiment>>({});
  /** Guards the fetch loop only; no template reads it, and `fetched` already re-runs the effect. */
  private readonly inFlight = new Set<string>();
  /** Members the backend stopped returning. The canvas shows one folder, so a folder id resets them. */
  private unavailable = linkedSignal({
    source: () => this.folderId(),
    computation: () => [] as string[],
  });
  /** Members that failed to load for a reason other than a 404; they stay in the folder. */
  private readonly memberErrors = linkedSignal({
    source: () => this.folderId(),
    computation: () => ({} as Record<string, string>),
  });

  readonly isEditingName = signal(false);
  readonly nameDraft = signal('');
  readonly nameError = signal<string | null>(null);
  readonly isConfirmingDelete = signal(false);

  /**
   * What the server refused. The canvas keeps no local copy of a folder, so a write that never
   * landed has nowhere else to be admitted — silently leaving the rows as they were would read as
   * the click having done nothing at all.
   */
  readonly actionError = signal<string | null>(null);
  /** Writes on their way to the server; `busy` is what the template disarms buttons with. */
  private readonly writes = new InflightWrites((message) => this.actionError.set(message));
  readonly busy = this.writes.busy;

  /** A run is hovering over the canvas with the folder as its plausible destination. */
  readonly isReceiving = signal(false);
  /** What the last drop did, spelled out once: the count badge alone does not say "already in".
   *  Its `landedId` is the member that just appeared, so its row can land with a flash. */
  readonly dropNotice = signal<DropNotice | null>(null);
  private dropNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const folder = this.folder();
      if (!folder) return;

      const loaded = new Set(this.dashboardService.experiments().map((exp) => exp.id));
      const cached = this.fetched();

      const pending = folder.experimentIds.filter(
        (id) => !loaded.has(id) && !cached[id] && !this.inFlight.has(id),
      );
      if (!pending.length) return;

      pending.forEach((id) => this.inFlight.add(id));

      const requestFolderId = folder.id;

      pending.forEach((id) =>
        this.dashboardService.fetchExperimentById(id).subscribe({
          next: (exp) => {
            this.inFlight.delete(id);
            this.fetched.update((current) => ({ ...current, [exp.id]: exp }));
            this.memberErrors.update((current) => {
              if (!(id in current)) return current;
              const next = { ...current };
              delete next[id];
              return next;
            });
          },
          error: (err) => {
            this.inFlight.delete(id);
            if (isNotFoundError(err)) {
              console.warn('[ExperimentFolder] Member no longer available', id, err);
              this.markUnavailable(id);
              return;
            }
            if (this.folderId() !== requestFolderId) return;
            console.warn('[ExperimentFolder] Member failed to load', id, err);
            this.markLoadError(id);
          },
        }),
      );
    });
  }

  readonly rows = computed<FolderMemberRow[]>(() => {
    const folder = this.folder();
    if (!folder) return [];

    const loaded = this.dashboardService.experiments();
    const cached = this.fetched();

    const members = folder.experimentIds.map((id) => ({
      id,
      experiment: loaded.find((exp) => exp.id === id) ?? cached[id] ?? null,
    }));

    const ghosts = this.unavailable().map((id) => ({ id, experiment: null }));

    return [...members, ...ghosts];
  });

  /**
   * Sets in folder order first, Ungrouped last — the same order compare sections follow, so
   * the canvas is a preview of the workspace rather than a second arrangement of the runs.
   * An empty set keeps its heading: it is a name the user made on purpose. An empty Ungrouped
   * tail does not, because it is the absence of a name.
   */
  readonly groups = computed<MemberGroup[]>(() => {
    const folder = this.folder();
    if (!folder) return [];

    const rows = this.rows();
    if (!folder.sets.length) {
      return [{ id: UNGROUPED_GROUP_ID, name: UNGROUPED_GROUP_NAME, isUngrouped: true, start: 0, rows }];
    }

    const buckets = new Map<string, FolderMemberRow[]>(folder.sets.map((set) => [set.id, []]));
    const ungrouped: FolderMemberRow[] = [];
    for (const row of rows) {
      const setId = this.currentSetId(row);
      const bucket = setId ? buckets.get(setId) : undefined;
      if (bucket) bucket.push(row);
      else ungrouped.push(row);
    }

    // Numbered as they are listed, not as the folder stores them: a heading is a heading, so the
    // canvas still reads 1, 2, 3 down the page and compare, which sections the same way, agrees.
    let listed = 0;
    const heading = (id: string, name: string, isUngrouped: boolean, members: FolderMemberRow[]) => {
      const group = { id, name, isUngrouped, start: listed, rows: members };
      listed += members.length;
      return group;
    };

    const headings = folder.sets.map((set) => heading(set.id, set.name, false, buckets.get(set.id) ?? []));

    return ungrouped.length
      ? [...headings, heading(UNGROUPED_GROUP_ID, UNGROUPED_GROUP_NAME, true, ungrouped)]
      : headings;
  });

  readonly memberCount = computed(() => this.folder()?.experimentIds.length ?? 0);
  readonly canCompare = computed(() => this.memberCount() >= 2);
  readonly isEmpty = computed(() => this.memberCount() === 0);

  /**
   * What the set is made of, as "2 algorithms · 1 domain". Only resolved members count: a
   * member still loading or gone has no algorithm or domain to contribute, so the line stays
   * out of the way until the canvas knows something true.
   */
  readonly summary = computed<string | null>(() => {
    const resolved = this.rows()
      .map((row) => row.experiment)
      .filter((exp): exp is Experiment => !!exp);
    if (!resolved.length) return null;

    const algorithms = new Set(resolved.map((exp) => exp.algorithmName).filter(Boolean));
    const domains = new Set(resolved.map((exp) => exp.domain).filter(Boolean));
    const parts = [this.countLabel(algorithms.size, 'algorithm')];
    if (domains.size) parts.push(this.countLabel(domains.size, 'domain'));

    return parts.join(' · ');
  });

  isUnavailable(id: string): boolean {
    return this.unavailable().includes(id);
  }

  isLoading(row: FolderMemberRow): boolean {
    return !row.experiment && !this.isUnavailable(row.id) && !this.memberError(row.id);
  }

  memberError(id: string): string | null {
    return this.memberErrors()[id] ?? null;
  }

  getAlgorithmLabel(code: string | null | undefined): string {
    if (!code) return 'Unknown algorithm';
    return this.expStudio.backendAlgorithms()[code]?.label || code;
  }

  /** "1 algorithm" / "3 algorithms" — the summary line never says "1 algorithms". */
  private countLabel(count: number, noun: string): string {
    return `${count} ${count === 1 ? noun : `${noun}s`}`;
  }

  onRowClick(row: FolderMemberRow): void {
    if (row.experiment) this.openExperiment.emit(row.experiment);
  }

  /** The whole canvas is the target, not only the empty state: adding to a full set is commoner. */
  onDragOver(event: DragEvent): void {
    if (!isExperimentDrag(event.dataTransfer)) return;
    // The browser only fires `drop` when the drag was accepted here first.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (!this.isReceiving()) this.isReceiving.set(true);
  }

  onDragLeave(event: DragEvent): void {
    if (!leavesDragZone(event, event.currentTarget)) return;
    this.isReceiving.set(false);
  }

  onDrop(event: DragEvent): void {
    this.isReceiving.set(false);

    const folder = this.folder();
    const experimentId = droppedExperimentId(event.dataTransfer);
    if (!folder || !experimentId) return;
    event.preventDefault();

    // A drop adds; it never undoes. Re-dropping a member is a misaim, not a request to remove it.
    // The mirror answers the duplicate straight away — the server stays the authority either way.
    if (this.foldersService.isMember(folder.id, experimentId)) {
      this.showDropNotice({ text: `Already in ${folder.name}`, kind: 'duplicate', landedId: null });
      return;
    }

    // The notice waits for the answer, so a row that never appeared never arrives wearing "Added".
    this.runWrite(
      `add:${folder.id}:${experimentId}`,
      this.foldersService.addExperiment(folder.id, experimentId),
      (updated) => this.showDropNotice({ text: `Added to ${updated.name}`, kind: 'added', landedId: experimentId }),
      'Could not add that run to the folder.',
    );
  }

  /**
   * The bookend every folder write needs, in `core/inflight-writes`: one request per action in
   * flight, a canvas that says it is waiting, and a visible line when the server refuses. A success
   * retires the previous refusal before the caller reports what the write did.
   */
  private runWrite<T>(dedupeKey: string, request: Observable<T>, onDone: ((value: T) => void) | null, failure: string): void {
    this.writes.run(dedupeKey, request, (value) => {
      this.actionError.set(null);
      onDone?.(value);
    }, failure);
  }

  ngOnDestroy(): void {
    this.clearDropNotice();
    this.unlistenSetMenuClick?.();
    this.unlistenSetMenuClick = null;
  }

  onRemoveMember(row: FolderMemberRow): void {
    // A ghost row is not a member: its id was pruned the moment it 404'd. Removing it from the
    // folder again would no-op and leave the row on screen, so this button dismisses it instead.
    if (this.isUnavailable(row.id)) {
      this.dismissUnavailable(row.id);
      return;
    }

    const folder = this.folder();
    if (!folder) return;
    this.runWrite(
      `remove:${folder.id}:${row.id}`,
      this.foldersService.removeExperiment(folder.id, row.id),
      null,
      'Could not remove that run from the folder.',
    );
  }

  onCompare(): void {
    const folder = this.folder();
    if (!folder || folder.experimentIds.length < 2) return;
    this.compareRequested.emit([...folder.experimentIds]);
  }

  startRename(): void {
    this.nameDraft.set(this.folder()?.name ?? '');
    this.nameError.set(null);
    this.isEditingName.set(true);
  }

  cancelRename(): void {
    this.isEditingName.set(false);
    this.nameError.set(null);
  }

  saveRename(): void {
    const folder = this.folder();
    if (!folder) return;

    const draft = this.nameDraft();
    this.runWrite(
      `rename:${folder.id}`,
      this.foldersService.renameFolder(folder.id, draft),
      (renamed) => {
        // False is the name rule speaking, and it belongs under the input it was typed into;
        // anything else the server said is the general line above.
        if (!renamed) {
          this.nameError.set(draft.trim() ? 'A folder with that name already exists.' : 'Give the folder a name.');
          return;
        }
        this.isEditingName.set(false);
        this.nameError.set(null);
      },
      'Could not rename the folder. Nothing was changed.',
    );
  }

  askDelete(): void {
    this.isConfirmingDelete.set(true);
  }

  cancelDelete(): void {
    this.isConfirmingDelete.set(false);
  }

  confirmDelete(): void {
    const folder = this.folder();
    if (!folder) return;

    // The way out only opens once the server has the folder gone; leaving the canvas over a
    // folder that is still in the strip would leave the two disagreeing.
    this.runWrite(
      `delete:${folder.id}`,
      this.foldersService.deleteFolder(folder.id),
      () => {
        this.isConfirmingDelete.set(false);
        this.back.emit();
      },
      'Could not delete the folder. It is still there.',
    );
  }

  // ---- sets: the headings over the member list ----

  /** Set ids whose rows are folded away. The implicit group is collapsible too. */
  private readonly collapsedGroups = signal<Record<string, boolean>>({});

  isGroupCollapsed(group: MemberGroup): boolean {
    return this.collapsedGroups()[group.id] ?? false;
  }

  toggleGroup(group: MemberGroup): void {
    this.collapsedGroups.update((current) => ({ ...current, [group.id]: !this.isGroupCollapsed(group) }));
  }

  readonly renamingSetId = signal<string | null>(null);
  readonly setRenameDraft = signal('');
  readonly setRenameError = signal<string | null>(null);
  readonly confirmingSetDeleteId = signal<string | null>(null);

  startSetRename(group: MemberGroup): void {
    this.closeSetMenu();
    this.renamingSetId.set(group.id);
    this.setRenameDraft.set(group.name);
    this.setRenameError.set(null);
  }

  cancelSetRename(): void {
    this.renamingSetId.set(null);
    this.setRenameError.set(null);
  }

  saveSetRename(): void {
    const folder = this.folder();
    const setId = this.renamingSetId();
    if (!folder || !setId) return;

    const draft = this.setRenameDraft();
    this.runWrite(
      `rename-set:${folder.id}:${setId}`,
      this.foldersService.renameSet(folder.id, setId, draft),
      (renamed) => {
        if (!renamed) {
          this.setRenameError.set(
            draft.trim() ? 'A set with that name already exists.' : 'Give the set a name.',
          );
          return;
        }
        this.cancelSetRename();
      },
      'Could not rename the set. Nothing was changed.',
    );
  }

  askSetDelete(group: MemberGroup): void {
    this.confirmingSetDeleteId.set(group.id);
  }

  cancelSetDelete(): void {
    this.confirmingSetDeleteId.set(null);
  }

  /** The name retires, the runs do not: they fall back to Ungrouped, listed where they now sit. */
  confirmSetDelete(): void {
    const folder = this.folder();
    const setId = this.confirmingSetDeleteId();
    if (!folder || !setId) return;

    this.runWrite(
      `delete-set:${folder.id}:${setId}`,
      this.foldersService.deleteSet(folder.id, setId),
      () => this.confirmingSetDeleteId.set(null),
      'Could not delete the set. It is still there.',
    );
  }

  // ---- per-row move-to-set menu: same recipe as the list row's add-to-folder menu ----

  readonly setMenuRowId = signal<string | null>(null);
  readonly setMenuNewOpen = signal(false);
  readonly setMenuDraft = signal('');
  readonly setMenuError = signal<string | null>(null);

  private readonly setMenu = viewChild(CdkMenu);
  private unlistenSetMenuClick: (() => void) | null = null;

  /** Which set holds this member right now; null when it sits ungrouped in the folder. */
  currentSetId(row: FolderMemberRow): string | null {
    const folder = this.folder();
    return folder ? this.foldersService.setOf(folder.id, row.id) : null;
  }

  toggleSetMenu(row: FolderMemberRow): void {
    if (this.setMenuRowId() === row.id) {
      this.closeSetMenu();
      return;
    }
    this.openSetMenu(row.id);
  }

  private openSetMenu(rowId: string): void {
    this.setMenuRowId.set(rowId);
    this.setMenuNewOpen.set(false);
    this.setMenuDraft.set('');
    this.setMenuError.set(null);
    // The menu is an @if, so CdkMenu's roving tabindex only exists after this render.
    this.cdr.detectChanges();
    this.setMenu()?.focusFirstItem();

    this.unlistenSetMenuClick?.();
    this.unlistenSetMenuClick = this.renderer.listen(document, 'pointerdown', (event: PointerEvent) => {
      // Every row carries a trigger and only one row carries a panel, so the click is judged by
      // what was hit rather than by comparing against the first of either. A trigger decides its
      // own fate in its click handler; anything else outside the open menu is a click away.
      const target = event.target as HTMLElement | null;
      if (target?.closest('.set-menu-anchor, .set-menu')) return;
      this.closeSetMenu();
    });
  }

  closeSetMenu(): void {
    if (!this.setMenuRowId()) return;
    this.setMenuRowId.set(null);
    this.setMenuNewOpen.set(false);
    this.setMenuError.set(null);
    this.unlistenSetMenuClick?.();
    this.unlistenSetMenuClick = null;
  }

  /** Move to: the run leaves whatever set held it, and the menu stays open to show the new home. */
  onSetMenuPick(set: ExperimentSet, row: FolderMemberRow): void {
    const folder = this.folder();
    if (!folder) return;
    this.runWrite(
      `move:${folder.id}:${row.id}:${set.id}`,
      this.foldersService.moveToSet(folder.id, row.id, set.id),
      () => this.setMenuError.set(null),
      'Could not move that run. The sets are unchanged.',
    );
  }

  onSetMenuUnset(row: FolderMemberRow): void {
    const folder = this.folder();
    if (!folder) return;
    this.closeSetMenu();
    this.runWrite(
      `unset:${folder.id}:${row.id}`,
      this.foldersService.removeFromSets(folder.id, row.id),
      null,
      'Could not move that run back to Ungrouped.',
    );
  }

  openSetMenuNew(): void {
    this.setMenuNewOpen.set(true);
    this.setMenuDraft.set('');
    this.setMenuError.set(null);
  }

  /** A new set is born with the run inside it — an empty heading is not what was asked for. */
  commitSetMenuNew(row: FolderMemberRow): void {
    const folder = this.folder();
    if (!folder) return;

    const draft = this.setMenuDraft();
    this.runWrite(
      `create-set:${folder.id}:${draft}`,
      this.foldersService.createSet(folder.id, draft, row.id),
      (updated) => {
        // null is the duplicate (or the blank) the inline line already explains.
        if (!updated) {
          this.setMenuError.set(draft.trim() ? 'That name is taken.' : 'Give the set a name.');
          return;
        }
        this.setMenuNewOpen.set(false);
        this.setMenuError.set(null);
      },
      'Could not create the set.',
    );
  }

  private showDropNotice(notice: DropNotice): void {
    this.clearDropNotice();
    this.dropNotice.set(notice);
    this.dropNoticeTimer = setTimeout(() => {
      this.dropNotice.set(null);
      this.dropNoticeTimer = null;
    }, DROP_NOTICE_MS);
  }

  /** A second drop restarts the countdown rather than letting an older timer cut the newer one short. */
  private clearDropNotice(): void {
    if (!this.dropNoticeTimer) return;
    clearTimeout(this.dropNoticeTimer);
    this.dropNoticeTimer = null;
  }

  /** Drop a reported ghost row. Only a member that resolves again can replace it. */
  private dismissUnavailable(id: string): void {
    this.unavailable.update((ids) => ids.filter((seen) => seen !== id));
  }

  private markUnavailable(id: string): void {
    // A 404 is the one signal that the run really is gone: prune it from every folder,
    // then keep the row visible in the folder that was showing it so the count change
    // has an explanation instead of a member that quietly disappears.
    const wasMember = this.folder()?.experimentIds.includes(id) ?? false;
    this.foldersService.pruneExperiment(id);
    if (wasMember) {
      this.unavailable.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
    }
  }

  private markLoadError(id: string): void {
    // Transient failures are not deletions: keep the member in the folder and show
    // the row as failed rather than pruning user data on a network blip.
    this.memberErrors.update((current) => ({ ...current, [id]: 'Could not load this run.' }));
  }
}
