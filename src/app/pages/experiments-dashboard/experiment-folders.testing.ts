import { signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

import { ExperimentFolder, ExperimentSet } from '../../models/experiment-folder.model';
import { User } from '../../models/user.interface';
import { ExperimentFoldersService } from '../../services/experiment-folders.service';

/** The surface the dashboard, the list, the canvas and the compare workspace call. */
type FoldersSurface = Pick<
  ExperimentFoldersService,
  | 'folders'
  | 'loading'
  | 'loadError'
  | 'setActiveUser'
  | 'createFolder'
  | 'renameFolder'
  | 'deleteFolder'
  | 'toggleExperiment'
  | 'addExperiment'
  | 'removeExperiment'
  | 'createSet'
  | 'renameSet'
  | 'deleteSet'
  | 'moveToSet'
  | 'removeFromSets'
  | 'pruneExperiment'
  | 'folderById'
  | 'isMember'
  | 'setOf'
>;

type FolderMethod =
  | 'createFolder'
  | 'renameFolder'
  | 'deleteFolder'
  | 'toggleExperiment'
  | 'addExperiment'
  | 'removeExperiment'
  | 'createSet'
  | 'renameSet'
  | 'deleteSet'
  | 'moveToSet'
  | 'removeFromSets';

const nameKey = (name: string): string => name.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * `FakeExperimentFoldersService` is the folder service as its components see it, minus the HTTP.
 *
 * `ExperimentFoldersService` speaks to `/services/experiment-folders` and answers every mutation
 * with an Observable, so a spec double can keep the synchronous feel the component specs were
 * written with: seeding is a plain call (`seedFolder`/`seedSet`), a component-triggered mutation
 * answers immediately, and a spec that wants to see the failure path asks for it with `failWith`.
 * The wire contract itself — URLs, bodies, the 409 that becomes `null`/`false` — is covered once,
 * against `HttpTestingController`, in `experiment-folders.service.spec.ts`.
 */
export class FakeExperimentFoldersService implements FoldersSurface {
  readonly folders = signal<ExperimentFolder[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  /** Whom the host kept naming, so a spec can see the session was handed over — and handed over once. */
  readonly sessions: Array<string | null> = [];

  private readonly failures = new Map<FolderMethod, unknown>();
  private sequence = 0;

  // ---- test seams ----

  /** Makes the next `method` the component calls fail, the way a dead backend would. */
  failWith(method: FolderMethod, error: unknown = new Error('the backend is down')): void {
    this.failures.set(method, error);
  }

  /** Seeds a folder without pretending it was a user gesture. */
  seedFolder(name: string, experimentIds: string[] = []): ExperimentFolder {
    const folder: ExperimentFolder = {
      id: this.id('folder'),
      name: name.replace(/\s+/g, ' ').trim(),
      experimentIds: [...experimentIds],
      sets: [],
    };
    this.folders.update((current) => [...current, folder]);
    return folder;
  }

  /** Seeds a set, and the members it holds, without going through the canvas menu. */
  seedSet(folderId: string, name: string, experimentIds: string[] = []): ExperimentSet | null {
    const folder = this.folderById(folderId);
    if (!folder) return null;

    const created: ExperimentSet = { id: this.id('set'), name: name.replace(/\s+/g, ' ').trim(), experimentIds: [...experimentIds] };
    this.folders.update((current) =>
      current.map((candidate) =>
        candidate.id === folderId
          ? {
              ...candidate,
              sets: [...candidate.sets, created],
              experimentIds: [
                ...candidate.experimentIds,
                ...experimentIds.filter((id) => !candidate.experimentIds.includes(id)),
              ],
            }
          : candidate,
      ),
    );
    return created;
  }

  // ---- the surface itself ----

  setActiveUser(user: User | null): void {
    // Recorded, not obeyed: there is nothing to read when the spec is the one seeding the rows.
    this.sessions.push(user?.username?.trim() || null);
  }

  createFolder(name: string, experimentId?: string): Observable<ExperimentFolder | null> {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    if (!cleanName || this.folders().some((folder) => nameKey(folder.name) === nameKey(cleanName))) {
      return of(null);
    }

    return this.answer('createFolder', () => {
      const created = this.seedFolder(cleanName, experimentId ? [experimentId] : []);
      return created;
    });
  }

  renameFolder(folderId: string, name: string): Observable<boolean> {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    if (!cleanName) return of(false);

    return this.answer('renameFolder', () => {
      const clash = this.folders().some((folder) => folder.id !== folderId && nameKey(folder.name) === nameKey(cleanName));
      if (clash) return false;

      this.folders.update((current) =>
        current.map((folder) => (folder.id === folderId ? { ...folder, name: cleanName } : folder)),
      );
      return true;
    });
  }

  deleteFolder(folderId: string): Observable<void> {
    return this.answer('deleteFolder', () => {
      this.folders.update((current) => current.filter((folder) => folder.id !== folderId));
    });
  }

  toggleExperiment(folderId: string, experimentId: string): Observable<ExperimentFolder> {
    return this.isMember(folderId, experimentId)
      ? this.removeExperiment(folderId, experimentId)
      : this.addExperiment(folderId, experimentId);
  }

  addExperiment(folderId: string, experimentId: string): Observable<ExperimentFolder> {
    return this.answer('addExperiment', () => {
      const updated = this.map(folderId, (folder) =>
        folder.experimentIds.includes(experimentId)
          ? folder
          : { ...folder, experimentIds: [...folder.experimentIds, experimentId] },
      );
      return this.require(folderId, updated);
    });
  }

  removeExperiment(folderId: string, experimentId: string): Observable<ExperimentFolder> {
    return this.answer('removeExperiment', () => {
      const updated = this.map(folderId, (folder) => ({
        ...folder,
        experimentIds: folder.experimentIds.filter((id) => id !== experimentId),
        sets: this.dropFromSets(folder.sets, experimentId),
      }));
      return this.require(folderId, updated);
    });
  }

  createSet(folderId: string, name: string, experimentId?: string): Observable<ExperimentFolder | null> {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    const folder = this.folderById(folderId);
    if (!folder || !cleanName || folder.sets.some((set) => nameKey(set.name) === nameKey(cleanName))) {
      return of(null);
    }

    return this.answer('createSet', () => {
      if (experimentId) this.seedSet(folderId, cleanName, [experimentId]);
      else this.seedSet(folderId, cleanName);
      return this.folderById(folderId);
    });
  }

  renameSet(folderId: string, setId: string, name: string): Observable<boolean> {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    const folder = this.folderById(folderId);
    if (!folder || !cleanName || !folder.sets.some((set) => set.id === setId)) return of(false);
    if (folder.sets.some((set) => set.id !== setId && nameKey(set.name) === nameKey(cleanName))) return of(false);

    return this.answer('renameSet', () => {
      this.folders.update((current) =>
        current.map((candidate) =>
          candidate.id === folderId
            ? { ...candidate, sets: candidate.sets.map((set) => (set.id === setId ? { ...set, name: cleanName } : set)) }
            : candidate,
        ),
      );
      return true;
    });
  }

  deleteSet(folderId: string, setId: string): Observable<ExperimentFolder> {
    return this.answer('deleteSet', () => {
      const updated = this.map(folderId, (folder) => ({ ...folder, sets: folder.sets.filter((set) => set.id !== setId) }));
      return this.require(folderId, updated);
    });
  }

  moveToSet(folderId: string, experimentId: string, setId: string): Observable<ExperimentFolder> {
    return this.answer('moveToSet', () => {
      const updated = this.map(folderId, (folder) =>
        folder.sets.some((set) => set.id === setId)
          ? {
              ...folder,
              experimentIds: folder.experimentIds.includes(experimentId)
                ? folder.experimentIds
                : [...folder.experimentIds, experimentId],
              sets: folder.sets.map((set) =>
                set.id === setId
                  ? { ...set, experimentIds: [...set.experimentIds.filter((id) => id !== experimentId), experimentId] }
                  : { ...set, experimentIds: set.experimentIds.filter((id) => id !== experimentId) },
              ),
            }
          : folder,
      );
      return this.require(folderId, updated);
    });
  }

  removeFromSets(folderId: string, experimentId: string): Observable<ExperimentFolder> {
    return this.answer('removeFromSets', () => {
      const updated = this.map(folderId, (folder) => ({ ...folder, sets: this.dropFromSets(folder.sets, experimentId) }));
      return this.require(folderId, updated);
    });
  }

  pruneExperiment(experimentId: string): void {
    if (!experimentId) return;
    this.folders.update((current) =>
      current.map((folder) => ({
        ...folder,
        experimentIds: folder.experimentIds.filter((id) => id !== experimentId),
        sets: this.dropFromSets(folder.sets, experimentId),
      })),
    );
  }

  folderById(folderId: string | null): ExperimentFolder | null {
    if (!folderId) return null;
    return this.folders().find((folder) => folder.id === folderId) ?? null;
  }

  isMember(folderId: string, experimentId: string): boolean {
    return this.folders().find((folder) => folder.id === folderId)?.experimentIds.includes(experimentId) ?? false;
  }

  setOf(folderId: string, experimentId: string): string | null {
    return this.folderById(folderId)?.sets.find((set) => set.experimentIds.includes(experimentId))?.id ?? null;
  }

  // ---- internals ----

  /** One answer per call, with the failure a spec asked for taking precedence. */
  private answer<T>(method: FolderMethod, mutate: () => T): Observable<T> {
    const failure = this.failures.get(method);
    if (failure !== undefined) {
      this.failures.delete(method);
      return throwError(() => failure);
    }
    return of(mutate());
  }

  private map(folderId: string, edit: (folder: ExperimentFolder) => ExperimentFolder): ExperimentFolder | null {
    const updated = this.folders().map((folder) => (folder.id === folderId ? edit(folder) : folder));
    this.folders.set(updated);
    return updated.find((folder) => folder.id === folderId) ?? null;
  }

  /** The server always answers a write with the folder; the double says the same even if it never had it. */
  private require(folderId: string, folder: ExperimentFolder | null): ExperimentFolder {
    return folder ?? { id: folderId, name: 'Missing folder', experimentIds: [], sets: [] };
  }

  private dropFromSets(sets: ExperimentSet[], experimentId: string): ExperimentSet[] {
    return sets.map((set) => ({ ...set, experimentIds: set.experimentIds.filter((id) => id !== experimentId) }));
  }

  private id(prefix: 'folder' | 'set'): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}
