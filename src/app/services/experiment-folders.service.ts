import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';

import { ExperimentFolder, ExperimentSet } from '../models/experiment-folder.model';
import { BackendExperimentFoldersResponse } from '../models/backend-experiment-folder.model';
import { User } from '../models/user.interface';

/** The one backend surface for folders and the sets inside them; see `backend-experiment-folder.model.ts`. */
const FOLDERS_URL = '/services/experiment-folders';
const MAX_NAME_LENGTH = 60;

/** Every mutation answers with the folder itself (ExperimentFolderAPI returns a bare DTO). */

/**
 * Experiment folders ("analysis sets"): a named group of runs the user wants side by side.
 *
 * PostgreSQL is the store and `/services/experiment-folders` is the only way in or out. The signal
 * below is a mirror of the server's rows, not a second source of truth: every mutation sends its
 * request, and only the folder the server returns is written back into the signal. Nothing is kept
 * in the browser, so a folder made here is a folder the next tab, device, or reload finds.
 *
 * Ownership is not a query parameter — the session picks the rows — so the username here is only a
 * cache key: it tells the service when the mirror has to be thrown away and read again.
 *
 * Folders hold member ids only, never experiment copies, so the only drift risk is an id that no
 * longer resolves. Membership is pruned after a confirmed delete or a real 404, never against the
 * visible page: the dashboard list is server-paginated, so a page is never the full truth and
 * pruning against it would silently empty folders whose members sit on another page.
 *
 * Inside a folder, sets are named subsets of the members — the grouping the compare workspace
 * renders as sections. They partition the members: a run sits in at most one set, and anything
 * in no set is Ungrouped, which the compare derives per algorithm instead.
 */
@Injectable({ providedIn: 'root' })
export class ExperimentFoldersService {
  readonly folders = signal<ExperimentFolder[]>([]);
  /** True while the folder rows for the active user are on their way in. */
  readonly loading = signal(false);
  /** Why the mirror above is not the truth; the folder strip says so instead of showing nothing. */
  readonly loadError = signal<string | null>(null);

  private readonly http = inject(HttpClient);

  /** Whose rows `folders` mirrors; null means nobody is signed in and there is nothing to mirror. */
  private activeUsername: string | null = null;
  /** Rises with every load, so a response that arrives after a newer one is dropped, not applied. */
  private loadToken = 0;

  /**
   * Points the mirror at the signed-in user. Called from the dashboard once the session resolves.
   *
   * A signed-out user gets an empty mirror and no request; a new username clears the mirror and
   * reads the server again; the same username coming back through change detection does neither.
   */
  setActiveUser(user: User | null): void {
    const username = user?.username?.trim() || null;
    if (username === this.activeUsername) return;

    this.activeUsername = username;
    const token = ++this.loadToken;
    this.folders.set([]);
    this.loadError.set(null);
    if (!username) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.http.get<BackendExperimentFoldersResponse>(FOLDERS_URL).subscribe({
      next: (response) => {
        if (token !== this.loadToken) return;
        this.loading.set(false);
        this.folders.set(this.foldersFrom(response));
      },
      error: (err) => {
        if (token !== this.loadToken) return;
        console.error('[ExperimentFoldersService] Could not load folders', err);
        this.loading.set(false);
        this.loadError.set('Could not load your folders. Check the connection and reload the page.');
      },
    });
  }

  /** Blank names are rejected here; a name another folder of this user's already took comes back as 409, which becomes null. */
  createFolder(name: string, experimentId?: string): Observable<ExperimentFolder | null> {
    const cleanName = this.sanitizeName(name);
    if (!cleanName) return of(null);

    return this.post(FOLDERS_URL, {
      name: cleanName,
      ...(experimentId ? { experimentUuid: experimentId } : {}),
    }).pipe(
      catchError((error) => this.nameTaken<ExperimentFolder | null>(error, null)),
    );
  }

  /** True on success, false when the name is taken or blank; anything else the server said is rethrown. */
  renameFolder(folderId: string, name: string): Observable<boolean> {
    const cleanName = this.sanitizeName(name);
    if (!cleanName) return of(false);
    if (!folderId) return this.invalid('renameFolder needs a folder id');

    return this.http
      .patch<ExperimentFolder>(this.folderUrl(folderId), { name: cleanName })
      .pipe(
        map((response) => this.confirmRename(response)),
        catchError((error) => this.nameTaken<boolean>(error, false)),
      );
  }

  /** The server answers with no body, so the mirror is what drops the folder. */
  deleteFolder(folderId: string): Observable<void> {
    if (!folderId) return this.invalid('deleteFolder needs a folder id');

    return this.http.delete<void>(this.folderUrl(folderId)).pipe(
      map(() => {
        this.folders.update((current) => current.filter((folder) => folder.id !== folderId));
      }),
    );
  }

  /** The row menu ticks a folder on or off, so one entry point decides which way this call goes. */
  toggleExperiment(folderId: string, experimentId: string): Observable<ExperimentFolder> {
    return this.isMember(folderId, experimentId)
      ? this.removeExperiment(folderId, experimentId)
      : this.addExperiment(folderId, experimentId);
  }

  addExperiment(folderId: string, experimentId: string): Observable<ExperimentFolder> {
    if (!folderId || !experimentId) return this.invalid('addExperiment needs a folder and a run');

    return this.post(this.folderUrl(folderId, 'members'), { experimentUuid: experimentId });
  }

  /** Leaving the folder ends the membership outright: a set cannot keep a run the folder lost. */
  removeExperiment(folderId: string, experimentId: string): Observable<ExperimentFolder> {
    if (!folderId || !experimentId) return this.invalid('removeExperiment needs a folder and a run');

    return this.http
      .delete<ExperimentFolder>(this.folderUrl(folderId, 'members', experimentId))
      .pipe(map((response) => this.applyFolder(response)));
  }

  /**
   * Prune a deleted or 404'd experiment out of the mirror, sets included. Local on purpose: the
   * caller has already been told by the experiment API that the run is gone, and
   * `ON DELETE CASCADE` dropped the membership rows in the same transaction, so there is nothing
   * left to ask the server. It is never a write — pruning on an unconfirmed delete would let a
   * failed request cost the user a folder.
   */
  pruneExperiment(experimentId: string): void {
    if (!experimentId) return;
    if (!this.folders().some((folder) => this.folderHolds(folder, experimentId))) return;

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

  // ---- sets: named subsets of a folder, one level deep by design ----

  /** Same name rules as folders, in a namespace of their own: a set may share its folder's name. */
  createSet(folderId: string, name: string, experimentId?: string): Observable<ExperimentFolder | null> {
    const cleanName = this.sanitizeName(name);
    if (!folderId || !cleanName) return of(null);

    return this.post(this.folderUrl(folderId, 'sets'), {
      name: cleanName,
      ...(experimentId ? { experimentUuid: experimentId } : {}),
    }).pipe(
      catchError((error) => this.nameTaken<ExperimentFolder | null>(error, null)),
    );
  }

  renameSet(folderId: string, setId: string, name: string): Observable<boolean> {
    const cleanName = this.sanitizeName(name);
    if (!cleanName) return of(false);
    if (!folderId || !setId) return this.invalid('renameSet needs a folder and a set');

    return this.http
      .patch<ExperimentFolder>(this.folderUrl(folderId, 'sets', setId), { name: cleanName })
      .pipe(
        map((response) => this.confirmRename(response)),
        catchError((error) => this.nameTaken<boolean>(error, false)),
      );
  }

  /** Deleting a set retires the name, never the runs: its members fall back to Ungrouped. */
  deleteSet(folderId: string, setId: string): Observable<ExperimentFolder> {
    if (!folderId || !setId) return this.invalid('deleteSet needs a folder and a set');

    return this.http
      .delete<ExperimentFolder>(this.folderUrl(folderId, 'sets', setId))
      .pipe(map((response) => this.applyFolder(response)));
  }

  /** The strict partition: the server repoints the membership row, so the set that had it gives it up. */
  moveToSet(folderId: string, experimentId: string, setId: string): Observable<ExperimentFolder> {
    if (!folderId || !experimentId || !setId) return this.invalid('moveToSet needs a folder, a run and a set');

    return this.assignSet(folderId, experimentId, setId);
  }

  /** The way out of a set that is not "leave the folder": back to the Ungrouped group. */
  removeFromSets(folderId: string, experimentId: string): Observable<ExperimentFolder> {
    if (!folderId || !experimentId) return this.invalid('removeFromSets needs a folder and a run');

    return this.assignSet(folderId, experimentId, null);
  }

  /** Which set holds this run; null when it sits in the folder ungrouped. */
  setOf(folderId: string, experimentId: string): string | null {
    return this.folderById(folderId)?.sets.find((set) => set.experimentIds.includes(experimentId))?.id ?? null;
  }

  /** Joining a set and leaving one are the same write: the member row's set id, set or cleared. */
  private assignSet(folderId: string, experimentId: string, setId: string | null): Observable<ExperimentFolder> {
    return this.http
      .patch<ExperimentFolder>(this.folderUrl(folderId, 'members', experimentId, 'set'), { setId })
      .pipe(map((response) => this.applyFolder(response)));
  }

  /** A rename answers with the renamed folder — the mirror takes it, and the caller gets a true. */
  private confirmRename(payload: ExperimentFolder | null | undefined): boolean {
    this.applyFolder(payload);
    return true;
  }

  private post(url: string, body: unknown): Observable<ExperimentFolder> {
    return this.http.post<ExperimentFolder>(url, body).pipe(map((response) => this.applyFolder(response)));
  }

  /**
   * The server's copy wins, so the mirror is replaced rather than edited. A folder the mirror has
   * never seen — one created in this tab a moment ago — takes its place at the end of the list,
   * which is also where the server's own ordering puts it.
   */
  private applyFolder(payload: ExperimentFolder | null | undefined): ExperimentFolder {
    const folder = this.folderFrom(payload);
    if (!folder) {
      throw new Error('[ExperimentFoldersService] The server answered a folder write without a folder');
    }

    this.folders.update((current) =>
      current.some((candidate) => candidate.id === folder.id)
        ? current.map((candidate) => (candidate.id === folder.id ? folder : candidate))
        : [...current, folder],
    );
    return folder;
  }

  private folderUrl(folderId: string, ...rest: string[]): string {
    return [FOLDERS_URL, folderId, ...rest].join('/');
  }

  /** A 409 is the server saying "a sibling already has that name", which the inline message speaks. */
  private nameTaken<T>(error: unknown, taken: T): Observable<T> {
    if ((error as { status?: number } | null)?.status === 409) return of(taken);
    return throwError(() => error);
  }

  /** A call the UI should never have made: failing loudly beats the silent no-op it used to be. */
  private invalid(message: string): Observable<never> {
    const error = new Error(`[ExperimentFoldersService] ${message}`);
    console.error(error.message);
    return throwError(() => error);
  }

  private sanitizeName(name: string): string {
    return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  }

  private folderHolds(folder: ExperimentFolder, experimentId: string): boolean {
    return folder.experimentIds.includes(experimentId) || folder.sets.some((set) => set.experimentIds.includes(experimentId));
  }

  private dropFromSets(sets: ExperimentSet[], experimentId: string): ExperimentSet[] {
    return sets.map((set) => ({ ...set, experimentIds: set.experimentIds.filter((id) => id !== experimentId) }));
  }

  /**
   * The mirror is written from what the server sent, so a payload that lost a field degrades to
   * "no members" or "no sets" instead of throwing inside a response handler. A row with neither an
   * id nor a name is not a folder and is dropped.
   */
  private foldersFrom(response: BackendExperimentFoldersResponse | null): ExperimentFolder[] {
    const value = response?.folders;
    if (!Array.isArray(value)) return [];

    return value.map((folder) => this.folderFrom(folder)).filter((folder): folder is ExperimentFolder => !!folder);
  }

  private folderFrom(value: unknown): ExperimentFolder | null {
    const candidate = value as Partial<ExperimentFolder> | null;
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return null;

    return {
      id: candidate.id,
      name: candidate.name,
      experimentIds: this.stringsFrom(candidate.experimentIds),
      sets: this.setsFrom(candidate.sets),
    };
  }

  private setsFrom(value: unknown): ExperimentSet[] {
    if (!Array.isArray(value)) return [];

    return value
      .filter((set): set is ExperimentSet => !!set && typeof set.id === 'string' && typeof set.name === 'string')
      .map((set) => ({ id: set.id, name: set.name, experimentIds: this.stringsFrom(set.experimentIds) }));
  }

  private stringsFrom(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  }
}
