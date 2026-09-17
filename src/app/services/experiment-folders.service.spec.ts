import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { ExperimentFolder } from '../models/experiment-folder.model';
import { User } from '../models/user.interface';
import { ExperimentFoldersService } from './experiment-folders.service';

/** The one surface the service speaks; see `backend-experiment-folder.model.ts` for the table. */
const apiUrl = '/services/experiment-folders';

const user = (username: string): User => ({
  username,
  fullname: username,
  email: `${username}@chuv.ch`,
  subjectId: `orcid-${username}`,
});

const folder = (overrides: Partial<ExperimentFolder> = {}): ExperimentFolder => ({
  id: 'folder-1',
  name: 'Q3 meta',
  experimentIds: ['exp-1'],
  sets: [],
  ...overrides,
});

describe('ExperimentFoldersService', () => {
  let service: ExperimentFoldersService;
  let httpMock: HttpTestingController;

  /** Signs in and hands back the GET the service owes us, so each test flushes its own answer. */
  const signIn = (username = 'mcurie') => {
    service.setActiveUser(user(username));
    return httpMock.expectOne(apiUrl);
  };

  /** Collects what a mutation answers, the way a component subscription would. */
  const record = <T>(request: Observable<T>) => {
    const values: T[] = [];
    const errors: unknown[] = [];
    request.subscribe({ next: (value) => values.push(value), error: (err) => errors.push(err) });
    return { values, errors };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExperimentFoldersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('reading the signed-in user', () => {
    it('reads the folders of whoever the session turns out to be', () => {
      service.setActiveUser(user('mcurie'));
      const read = httpMock.expectOne(apiUrl);

      expect(read.request.method).toBe('GET');
      expect(service.loading()).toBeTrue();

      read.flush({
        folders: [folder(), folder({ id: 'folder-2', name: 'PCA', experimentIds: ['exp-2', 'exp-3'] })],
      });

      expect(service.loading()).toBeFalse();
      expect(service.folders().map((candidate) => candidate.id)).toEqual(['folder-1', 'folder-2']);
      expect(service.folderById('folder-2')?.name).toBe('PCA');
      expect(service.isMember('folder-2', 'exp-3')).toBeTrue();
    });

    it('carries the sets across with the folder that holds them', () => {
      signIn().flush({
        folders: [folder({ sets: [{ id: 'set-1', name: 'T-tests', experimentIds: ['exp-1'] }] })],
      });

      expect(service.folders()[0].sets.map((set) => set.name)).toEqual(['T-tests']);
      expect(service.setOf('folder-1', 'exp-1')).toBe('set-1');
      expect(service.setOf('folder-1', 'exp-9')).toBeNull();
    });

    it('asks again for a different user, having forgotten the rows of the one before', () => {
      signIn('mcurie').flush({ folders: [folder()] });

      service.setActiveUser(user('hermita'));
      expect(service.folders()).toEqual([]);

      const second = httpMock.expectOne(apiUrl);
      second.flush({ folders: [folder({ id: 'folder-9', name: 'Stroke' })] });

      expect(service.folders().map((candidate) => candidate.id)).toEqual(['folder-9']);
    });

    it('does not read twice for the same user, however often the session is re-read', () => {
      signIn('mcurie').flush({ folders: [folder()] });

      // The session object is replaced on every refresh; the username inside it is what matters.
      service.setActiveUser(user('mcurie'));
      service.setActiveUser(null);
      service.setActiveUser(null);

      expect(service.folders()).toEqual([]);
      httpMock.expectNone(apiUrl);
    });

    it('signing out empties the mirror without going looking for anything', () => {
      signIn('mcurie').flush({ folders: [folder()] });

      service.setActiveUser(null);

      expect(service.folders()).toEqual([]);
      expect(service.loading()).toBeFalse();
      httpMock.expectNone(apiUrl);
    });

    it('waits for a session instead of reading folders for nobody', () => {
      service.setActiveUser(null);

      expect(service.folders()).toEqual([]);
      httpMock.expectNone(apiUrl);
    });

    it('drops an answer that arrives after the user has already changed', () => {
      service.setActiveUser(user('mcurie'));
      const stale = httpMock.expectOne(apiUrl);

      service.setActiveUser(user('hermita'));
      const current = httpMock.expectOne(apiUrl);

      current.flush({ folders: [folder({ id: 'b', name: 'Hers' })] });
      stale.flush({ folders: [folder({ id: 'a', name: 'Mine' })] });

      expect(service.folders().map((candidate) => candidate.id)).toEqual(['b']);
    });

    it('says out loud when the read fails, rather than showing an empty list as if it were the truth', () => {
      spyOn(console, 'error');
      signIn().flush('database down', { status: 500, statusText: 'Server Error' });

      expect(service.loading()).toBeFalse();
      expect(service.loadError()).toContain('Could not load your folders');
    });

    it('keeps a payload that lost a field from taking the whole read with it', () => {
      signIn().flush({
        folders: [folder({ experimentIds: ['exp-1', 7, null] as unknown as string[] }), { name: 'no id' }, null],
      });

      expect(service.folders().map((candidate) => candidate.id)).toEqual(['folder-1']);
      expect(service.folders()[0].experimentIds).toEqual(['exp-1']);
    });
  });

  describe('folders', () => {
    beforeEach(() => {
      signIn().flush({ folders: [folder()] });
    });

    it('creates a folder with a normalised name and takes the signal from the answer', () => {
      const created = record(service.createFolder('  Q3   meta  two  '));
      expect(created.values).toEqual([]);

      const write = httpMock.expectOne(apiUrl);
      expect(write.request.method).toBe('POST');
      expect(write.request.body).toEqual({ name: 'Q3 meta two' });

      write.flush(folder({ id: 'folder-2', name: 'Q3 meta two', experimentIds: [] }));

      expect(created.values[0]).toEqual(jasmine.objectContaining({ id: 'folder-2', name: 'Q3 meta two' }));
      expect(service.folders().map((candidate) => candidate.id)).toEqual(['folder-1', 'folder-2']);
    });

    it('brings a run with a folder made from the row menu', () => {
      service.createFolder('ANOVA', 'exp-7').subscribe();

      const write = httpMock.expectOne(apiUrl);
      expect(write.request.body).toEqual({ name: 'ANOVA', experimentUuid: 'exp-7' });
      write.flush(folder({ id: 'folder-2', name: 'ANOVA', experimentIds: ['exp-7'] }));

      expect(service.folderById('folder-2')?.experimentIds).toEqual(['exp-7']);
    });

    it('maps a name a sibling already took to null, and leaves the mirror alone', () => {
      const created = record(service.createFolder('q3 meta'));

      httpMock.expectOne(apiUrl).flush('taken', { status: 409, statusText: 'Conflict' });

      expect(created.values).toEqual([null]);
      expect(service.folders().map((candidate) => candidate.id)).toEqual(['folder-1']);
    });

    it('never sends a blank name to the server', () => {
      const created = record(service.createFolder('   '));

      expect(created.values).toEqual([null]);
      httpMock.expectNone(apiUrl);
    });

    it('renames through PATCH, and is true only when the server agreed', () => {
      const renamed = record(service.renameFolder('folder-1', '  ANOVA one  '));

      const write = httpMock.expectOne(`${apiUrl}/folder-1`);
      expect(write.request.method).toBe('PATCH');
      expect(write.request.body).toEqual({ name: 'ANOVA one' });

      write.flush(folder({ name: 'ANOVA one' }));

      expect(renamed.values).toEqual([true]);
      expect(service.folderById('folder-1')?.name).toBe('ANOVA one');
    });

    it('a taken new name comes back false, so the inline line can say so', () => {
      const renamed = record(service.renameFolder('folder-1', 'PCA'));

      httpMock.expectOne(`${apiUrl}/folder-1`).flush('taken', { status: 409, statusText: 'Conflict' });

      expect(renamed.values).toEqual([false]);
      expect(service.folderById('folder-1')?.name).toBe('Q3 meta');
    });

    it('deletes a folder out of the mirror once the server has it', () => {
      const gone = record(service.deleteFolder('folder-1'));

      const write = httpMock.expectOne(`${apiUrl}/folder-1`);
      expect(write.request.method).toBe('DELETE');
      write.flush(null, { status: 204, statusText: 'No Content' });

      expect(gone.values.length).toBe(1);
      expect(service.folders()).toEqual([]);
    });

    it('propagates a failure that is not about the name, so the component can say something', () => {
      const renamed = record(service.renameFolder('folder-1', 'ANOVA one'));

      httpMock.expectOne(`${apiUrl}/folder-1`).flush('database down', { status: 500, statusText: 'Server Error' });

      expect(renamed.values).toEqual([]);
      expect(renamed.errors.length).toBe(1);
      expect(service.folderById('folder-1')?.name).toBe('Q3 meta');
    });
  });

  describe('membership', () => {
    beforeEach(() => {
      signIn().flush({ folders: [folder({ experimentIds: ['exp-1'], sets: [{ id: 'set-1', name: 'T-tests', experimentIds: ['exp-1'] }] })] });
    });

    it('adds a run to the folder it was dropped on', () => {
      const added = record(service.addExperiment('folder-1', 'exp-2'));

      const write = httpMock.expectOne(`${apiUrl}/folder-1/members`);
      expect(write.request.method).toBe('POST');
      expect(write.request.body).toEqual({ experimentUuid: 'exp-2' });

      write.flush(folder({ experimentIds: ['exp-1', 'exp-2'] }));

      expect(added.values[0]).toEqual(jasmine.objectContaining({ id: 'folder-1' }));
      expect(service.folderById('folder-1')?.experimentIds).toEqual(['exp-1', 'exp-2']);
    });

    it('removes a run, and the server decides what its set loses', () => {
      service.removeExperiment('folder-1', 'exp-1').subscribe();

      const write = httpMock.expectOne(`${apiUrl}/folder-1/members/exp-1`);
      expect(write.request.method).toBe('DELETE');
      write.flush(folder({ experimentIds: [], sets: [{ id: 'set-1', name: 'T-tests', experimentIds: [] }] }));

      expect(service.folderById('folder-1')?.experimentIds).toEqual([]);
      expect(service.folderById('folder-1')?.sets[0].experimentIds).toEqual([]);
    });

    it('a row-menu tick goes whichever way the mirror says the run stands', () => {
      service.toggleExperiment('folder-1', 'exp-1').subscribe();
      httpMock.expectOne(`${apiUrl}/folder-1/members/exp-1`).flush(folder({ experimentIds: [] }));

      service.toggleExperiment('folder-1', 'exp-2').subscribe();
      const added = httpMock.expectOne(`${apiUrl}/folder-1/members`);
      expect(added.request.method).toBe('POST');
      added.flush(folder({ experimentIds: ['exp-2'] }));

      expect(service.isMember('folder-1', 'exp-1')).toBeFalse();
      expect(service.isMember('folder-1', 'exp-2')).toBeTrue();
    });

    it('a drop the server refused is an error the canvas hears, not a silent no-op', () => {
      const added = record(service.addExperiment('folder-1', 'exp-2'));

      httpMock.expectOne(`${apiUrl}/folder-1/members`).flush('down', { status: 503, statusText: 'Unavailable' });

      expect(added.values).toEqual([]);
      expect(added.errors.length).toBe(1);
      expect(service.folderById('folder-1')?.experimentIds).toEqual(['exp-1']);
    });
  });

  describe('sets', () => {
    beforeEach(() => {
      signIn().flush({ folders: [folder({ experimentIds: ['exp-1', 'exp-2'], sets: [{ id: 'set-1', name: 'T-tests', experimentIds: ['exp-1'] }] })] });
    });

    it('creates a set with the run that asked for it', () => {
      const created = record(service.createSet('folder-1', '  Chi-squared  ', 'exp-2'));

      const write = httpMock.expectOne(`${apiUrl}/folder-1/sets`);
      expect(write.request.method).toBe('POST');
      expect(write.request.body).toEqual({ name: 'Chi-squared', experimentUuid: 'exp-2' });

      write.flush(
        folder({
          experimentIds: ['exp-1', 'exp-2'],
          sets: [
            { id: 'set-1', name: 'T-tests', experimentIds: ['exp-1'] },
            { id: 'set-2', name: 'Chi-squared', experimentIds: ['exp-2'] },
          ],
        }),
      );

      expect(created.values[0]?.sets.map((set) => set.name)).toEqual(['T-tests', 'Chi-squared']);
      expect(service.setOf('folder-1', 'exp-2')).toBe('set-2');
    });

    it('a set name a sibling took comes back null, with the partition untouched', () => {
      const created = record(service.createSet('folder-1', 't-TESTS', 'exp-2'));

      httpMock.expectOne(`${apiUrl}/folder-1/sets`).flush('taken', { status: 409, statusText: 'Conflict' });

      expect(created.values).toEqual([null]);
      expect(service.folderById('folder-1')?.sets.length).toBe(1);
    });

    it('never sends a blank set name either', () => {
      const created = record(service.createSet('folder-1', '  ', 'exp-2'));

      expect(created.values).toEqual([null]);
      httpMock.expectNone(apiUrl);
    });

    it('renames a set through PATCH on the set', () => {
      const renamed = record(service.renameSet('folder-1', 'set-1', ' Age tests '));

      const write = httpMock.expectOne(`${apiUrl}/folder-1/sets/set-1`);
      expect(write.request.method).toBe('PATCH');
      expect(write.request.body).toEqual({ name: 'Age tests' });

      write.flush(folder({ sets: [{ id: 'set-1', name: 'Age tests', experimentIds: ['exp-1'] }] }));

      expect(renamed.values).toEqual([true]);
      expect(service.folderById('folder-1')?.sets[0].name).toBe('Age tests');
    });

    it('a sibling name on a rename is false', () => {
      const renamed = record(service.renameSet('folder-1', 'set-1', 'Chi-squared'));

      httpMock.expectOne(`${apiUrl}/folder-1/sets/set-1`).flush('taken', { status: 409, statusText: 'Conflict' });

      expect(renamed.values).toEqual([false]);
    });

    it('deleting a set returns the folder with its runs back ungrouped', () => {
      service.deleteSet('folder-1', 'set-1').subscribe();

      const write = httpMock.expectOne(`${apiUrl}/folder-1/sets/set-1`);
      expect(write.request.method).toBe('DELETE');
      write.flush(folder({ experimentIds: ['exp-1', 'exp-2'], sets: [] }));

      expect(service.folderById('folder-1')?.sets).toEqual([]);
      expect(service.folderById('folder-1')?.experimentIds).toEqual(['exp-1', 'exp-2']);
    });

    it('moves a run into a set by writing its set id', () => {
      const moved = record(service.moveToSet('folder-1', 'exp-2', 'set-1'));

      const write = httpMock.expectOne(`${apiUrl}/folder-1/members/exp-2/set`);
      expect(write.request.method).toBe('PATCH');
      expect(write.request.body).toEqual({ setId: 'set-1' });

      write.flush(folder({ experimentIds: ['exp-1', 'exp-2'], sets: [{ id: 'set-1', name: 'T-tests', experimentIds: ['exp-1', 'exp-2'] }] }));

      expect(moved.values[0]?.sets[0].experimentIds).toEqual(['exp-1', 'exp-2']);
      expect(service.setOf('folder-1', 'exp-2')).toBe('set-1');
    });

    it('leaving a set is the same write with the set id cleared', () => {
      service.removeFromSets('folder-1', 'exp-1').subscribe();

      const write = httpMock.expectOne(`${apiUrl}/folder-1/members/exp-1/set`);
      expect(write.request.method).toBe('PATCH');
      expect(write.request.body).toEqual({ setId: null });

      write.flush(folder({ experimentIds: ['exp-1', 'exp-2'], sets: [{ id: 'set-1', name: 'T-tests', experimentIds: [] }] }));

      expect(service.setOf('folder-1', 'exp-1')).toBeNull();
      expect(service.isMember('folder-1', 'exp-1')).toBeTrue();
    });
  });

  describe('pruning a run the experiment API has already lost', () => {
    it('clears the mirror without asking the folder API to do it', () => {
      signIn().flush({
        folders: [
          folder({ experimentIds: ['exp-1', 'exp-2'], sets: [{ id: 'set-1', name: 'T-tests', experimentIds: ['exp-1'] }] }),
          folder({ id: 'folder-2', name: 'PCA', experimentIds: ['exp-1'] }),
        ],
      });

      service.pruneExperiment('exp-1');

      expect(service.folderById('folder-1')?.experimentIds).toEqual(['exp-2']);
      expect(service.folderById('folder-1')?.sets[0].experimentIds).toEqual([]);
      expect(service.folderById('folder-2')?.experimentIds).toEqual([]);
      httpMock.expectNone(apiUrl);
    });
  });
});
