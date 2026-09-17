import { provideZonelessChangeDetection, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { EXPERIMENT_DRAG_MIME } from '../../../core/experiment-drag.utils';
import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentFoldersService } from '../../../services/experiment-folders.service';
import { FakeExperimentFoldersService } from '../experiment-folders.testing';
import { ExperimentFolderComponent } from './experiment-folder.component';

const experiment = (id: string, overrides: Partial<Experiment> = {}): Experiment => ({
  id,
  name: `Run ${id}`,
  dateCreated: new Date('2026-01-01T00:00:00.000Z'),
  status: 'success',
  algorithmName: 'mock_anova',
  author: 'Marie Curie',
  authorEmail: 'marie.curie@chuv.ch',
  isShared: false,
  ...overrides,
});

describe('ExperimentFolderComponent', () => {
  let fixture: ComponentFixture<ExperimentFolderComponent>;
  let component: ExperimentFolderComponent;
  let foldersService: FakeExperimentFoldersService;
  let loaded: ReturnType<typeof signal<Experiment[]>>;
  let fetchSpy: jasmine.Spy;
  let pending: Subject<Experiment>;

  const root = () => fixture.nativeElement as HTMLElement;
  const canvas = () => root().querySelector<HTMLElement>('.folder-canvas')!;
  const dataTransferWith = (type: string, value: string) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData(type, value);
    return dataTransfer;
  };
  /** Returns the event so a spec can assert whether the target accepted the drag. */
  const dragOverWith = (target: HTMLElement, dataTransfer: DataTransfer) => {
    const event = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
    target.dispatchEvent(event);
    return event;
  };
  const dropWith = (target: HTMLElement, dataTransfer: DataTransfer) => {
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
    target.dispatchEvent(event);
    return event;
  };
  const runDrag = (experimentId: string) => dataTransferWith(EXPERIMENT_DRAG_MIME, experimentId);
  const notice = () => root().querySelector<HTMLElement>('.folder-drop-notice');
  const rowsOf = () => Array.from(root().querySelectorAll<HTMLElement>('.member-row'));
  const groupsOf = () => Array.from(root().querySelectorAll<HTMLElement>('.member-group'));
  const groupHeaders = () => Array.from(root().querySelectorAll<HTMLElement>('.member-group-header'));
  const groupNames = () => groupHeaders().map((header) => header.querySelector('.member-group-name')!.textContent!.trim());
  const rowsIn = (group: HTMLElement) => Array.from(group.querySelectorAll<HTMLElement>('.member-row'));
  /** The move-to-set trigger sits in its own popover anchor; Remove stays the row's own action. */
  const setTrigger = (rowIndex: number) => rowsOf()[rowIndex].querySelector<HTMLButtonElement>('.set-menu-anchor > .icon-btn')!;
  const removeButton = (rowIndex: number) => rowsOf()[rowIndex].querySelector<HTMLButtonElement>('.row-actions > .icon-btn:last-child')!;
  const headerAction = (label: string) =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('.folder-actions .folder-form-action'))
      .find((button) => button.textContent!.trim().includes(label))!;

  /** Seeds the folder the canvas is pointed at — the click paths have their own specs below. */
  const openFolder = (memberIds: string[], name = 'Q3 meta') => {
    const folder = foldersService.seedFolder(name, memberIds);
    fixture.componentRef.setInput('folderId', folder.id);
    return folder;
  };

  beforeEach(async () => {
    foldersService = new FakeExperimentFoldersService();
    loaded = signal<Experiment[]>([]);
    pending = new Subject<Experiment>();
    fetchSpy = jasmine.createSpy('fetchExperimentById').and.returnValue(pending);

    await TestBed.configureTestingModule({
      imports: [ExperimentFolderComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentsDashboardService, useValue: { experiments: loaded, fetchExperimentById: fetchSpy } },
        { provide: ExperimentStudioService, useValue: { backendAlgorithms: signal({}) } },
        { provide: ExperimentFoldersService, useValue: foldersService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExperimentFolderComponent);
    component = fixture.componentInstance;
  });



  it('lists the members it can resolve from the loaded page', () => {
    loaded.set([experiment('a'), experiment('b')]);
    openFolder(['a', 'b']);
    fixture.detectChanges();

    expect(root().querySelector('.folder-title')!.textContent.trim()).toBe('Q3 meta');
    expect(root().querySelector('.count-badge')!.textContent.trim()).toBe('2');
    expect(rowsOf().length).toBe(2);
    expect(rowsOf()[0].textContent).toContain('Run a');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks for a member that sits on another page and holds the row open while loading', () => {
    loaded.set([experiment('a')]);
    openFolder(['a', 'off-page']);
    fixture.detectChanges();

    expect(fetchSpy).toHaveBeenCalledWith('off-page');
    expect(rowsOf()[1].querySelector('.member-skeleton--title')).toBeTruthy();

    pending.next(experiment('off-page', { name: 'Off page run' }));
    fixture.detectChanges();

    expect(rowsOf()[1].textContent).toContain('Off page run');
    expect(rowsOf()[1].querySelector('.member-skeleton--title')).toBeNull();
  });

  it('reports a member the backend dropped and prunes it from the folder', () => {
    loaded.set([experiment('a')]);
    openFolder(['a', 'off-page']);
    fixture.detectChanges();

    pending.error(new HttpErrorResponse({ status: 404 }));
    fixture.detectChanges();

    expect(rowsOf()[1].querySelector('.member-name--gone')!.textContent!.trim()).toBe('No longer available');
    expect(foldersService.folders()[0].experimentIds).toEqual(['a']);
  });

  it('keeps a member on a transient load error instead of pruning it', () => {
    loaded.set([experiment('a')]);
    openFolder(['a', 'off-page']);
    fixture.detectChanges();

    pending.error(new Error('network down'));
    fixture.detectChanges();

    expect(rowsOf()[1].textContent).toContain('Could not load this run');
    expect(foldersService.folders()[0].experimentIds).toEqual(['a', 'off-page']);
  });

  it('takes a run the backend dropped out of its set as well', () => {
    loaded.set([experiment('a')]);
    const folder = openFolder(['a', 'off-page']);
    const set = foldersService.seedSet(folder.id, 'T-tests', ['off-page'])!;
    fixture.detectChanges();

    pending.error(new HttpErrorResponse({ status: 404 }));
    fixture.detectChanges();

    expect(foldersService.folders()[0].sets[0].id).toBe(set.id);
    expect(foldersService.folders()[0].sets[0].experimentIds).toEqual([]);
    expect(foldersService.folders()[0].experimentIds).toEqual(['a']);
  });

  it('explains how to add runs to an empty folder', () => {
    openFolder([]);
    fixture.detectChanges();

    expect(root().querySelector('.folder-empty')).toBeTruthy();
    expect(rowsOf().length).toBe(0);
  });

  it('numbers the members, so the canvas reads as an ordered set', () => {
    loaded.set([experiment('a'), experiment('b')]);
    openFolder(['b', 'a']);
    fixture.detectChanges();

    expect(rowsOf().map((row) => row.querySelector('.member-index')!.textContent!.trim())).toEqual(['1', '2']);
  });

  it('summarises what the set holds', () => {
    loaded.set([
      experiment('a', { algorithmName: 'mock_anova', domain: 'cmso' }),
      experiment('b', { algorithmName: 'mock_pca', domain: 'cmso' }),
    ]);
    openFolder(['a', 'b']);
    fixture.detectChanges();

    expect(root().querySelector('.folder-summary')!.textContent!.trim()).toBe('2 algorithms · 1 domain');
  });

  it('withholds the summary until a member resolves', () => {
    openFolder(['off-page']);
    fixture.detectChanges();

    expect(root().querySelector('.folder-summary')).toBeNull();

    pending.next(experiment('off-page', { algorithmName: 'mock_pca' }));
    fixture.detectChanges();

    expect(root().querySelector('.folder-summary')!.textContent!.trim()).toBe('1 algorithm');
  });

  it('hands the member ids to the compare workspace in folder order', () => {
    loaded.set([experiment('a'), experiment('b')]);
    openFolder(['b', 'a']);
    fixture.detectChanges();

    const emitted: string[][] = [];
    component.compareRequested.subscribe((ids) => emitted.push(ids));
    (root().querySelector('.folder-compare-btn') as HTMLButtonElement).click();

    expect(emitted).toEqual([['b', 'a']]);
  });

  it('refuses to compare a single member', () => {
    loaded.set([experiment('a')]);
    openFolder(['a']);
    fixture.detectChanges();

    expect((root().querySelector('.folder-compare-btn') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('renames the folder through the service', () => {
    openFolder([]);
    fixture.detectChanges();

    headerAction('Rename').click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-rename-input') as HTMLInputElement;
    input.value = 'ANOVA sensitivity';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (root().querySelector('.folder-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders()[0].name).toBe('ANOVA sensitivity');
    expect(root().querySelector('.folder-title')!.textContent.trim()).toBe('ANOVA sensitivity');
  });

  it('commits the rename on Enter', () => {
    openFolder([]);
    fixture.detectChanges();

    headerAction('Rename').click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-rename-input') as HTMLInputElement;
    input.value = 'PCA on bids';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(foldersService.folders()[0].name).toBe('PCA on bids');
    expect(root().querySelector('.folder-rename-input')).toBeNull();
  });

  it('asks the server to delete the folder and only leaves the canvas once it has agreed', () => {
    loaded.set([experiment('a')]);
    const folder = openFolder(['a']);
    fixture.detectChanges();

    const back: number[] = [];
    component.back.subscribe(() => back.push(1));

    headerAction('Delete').click();
    fixture.detectChanges();
    (root().querySelector('.folder-delete-confirm .folder-form-action.danger') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folderById(folder.id)).toBeNull();
    expect(component.isConfirmingDelete()).toBeFalse();
    expect(back).toEqual([1]);
  });

  it('holds the canvas, and the confirmation, when the delete never reached the server', () => {
    spyOn(console, 'error');
    loaded.set([experiment('a')]);
    const folder = openFolder(['a']);
    foldersService.failWith('deleteFolder');
    fixture.detectChanges();

    const back: number[] = [];
    component.back.subscribe(() => back.push(1));

    headerAction('Delete').click();
    fixture.detectChanges();
    (root().querySelector('.folder-delete-confirm .folder-form-action.danger') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folderById(folder.id)).toBeTruthy();
    expect(back).toEqual([]);
    expect(root().querySelector('.folder-delete-confirm')).toBeTruthy();
    expect(root().querySelector('.folder-form-error')!.textContent).toContain('Could not delete the folder');
  });

  it('tells a server that did not answer apart from a name that is taken', () => {
    spyOn(console, 'error');
    loaded.set([experiment('a')]);
    openFolder(['a']);
    fixture.detectChanges();

    headerAction('Rename').click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-rename-input') as HTMLInputElement;
    input.value = 'ANOVA sensitivity';
    input.dispatchEvent(new Event('input'));
    foldersService.failWith('renameFolder');
    (root().querySelector('.folder-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders()[0].name).toBe('Q3 meta');
    expect(root().querySelector('.folder-rename-input')).toBeTruthy();
    expect(root().querySelector('.folder-form-error')!.textContent).toContain('Could not rename the folder');
  });

  it('keeps the row and says so when removing the run did not reach the server', () => {
    spyOn(console, 'error');
    loaded.set([experiment('a'), experiment('b')]);
    const folder = openFolder(['a', 'b']);
    foldersService.failWith('removeExperiment');
    fixture.detectChanges();

    removeButton(0).click();
    fixture.detectChanges();

    expect(foldersService.folderById(folder.id)!.experimentIds).toEqual(['a', 'b']);
    expect(rowsOf().length).toBe(2);
    expect(root().querySelector('.folder-form-error')!.textContent).toContain('Could not remove that run');
  });

  it('dismisses a ghost row instead of no-opping against a pruned member', () => {
    loaded.set([experiment('a')]);
    openFolder(['a', 'off-page']);
    fixture.detectChanges();

    pending.error(new HttpErrorResponse({ status: 404 }));
    fixture.detectChanges();
    expect(rowsOf().length).toBe(2);

    removeButton(1).click();
    fixture.detectChanges();

    expect(rowsOf().length).toBe(1);
    expect(foldersService.folders()[0].experimentIds).toEqual(['a']);
  });

  it('removes a member without touching the experiment', () => {
    loaded.set([experiment('a'), experiment('b')]);
    openFolder(['a', 'b']);
    fixture.detectChanges();

    removeButton(0).click();
    fixture.detectChanges();

    expect(rowsOf().length).toBe(1);
    expect(loaded().length).toBe(2);
  });

  it('takes a run dragged onto the canvas and files it in the folder', () => {
    loaded.set([experiment('a'), experiment('c')]);
    const folder = openFolder(['a']);
    fixture.detectChanges();

    const dataTransfer = runDrag('c');
    const hover = dragOverWith(canvas(), dataTransfer);
    fixture.detectChanges();

    // Without preventDefault the browser never fires drop, so the ring would be a lie.
    expect(hover.defaultPrevented).toBeTrue();
    expect(canvas().classList.contains('folder-canvas--receiving')).toBeTrue();

    dropWith(canvas(), dataTransfer);
    fixture.detectChanges();

    expect(foldersService.folderById(folder.id)!.experimentIds).toEqual(['a', 'c']);
    expect(notice()!.textContent).toContain('Added to Q3 meta');
    expect(canvas().classList.contains('folder-canvas--receiving')).toBeFalse();
    expect(rowsOf()[1].classList.contains('member-row--landed')).toBeTrue();
  });

  it('names a re-drop instead of adding the run twice or removing it', () => {
    openFolder(['a']);
    fixture.detectChanges();

    dragOverWith(canvas(), runDrag('a'));
    dropWith(canvas(), runDrag('a'));
    fixture.detectChanges();

    expect(foldersService.folders()[0].experimentIds).toEqual(['a']);
    expect(notice()!.textContent).toContain('Already in Q3 meta');
    expect(notice()!.classList.contains('folder-drop-notice--duplicate')).toBeTrue();
    expect(root().querySelector('.member-row--landed')).toBeNull();
  });

  it('withholds the "added" report from a drop the server refused', () => {
    spyOn(console, 'error');
    loaded.set([experiment('a'), experiment('c')]);
    const folder = openFolder(['a']);
    foldersService.failWith('addExperiment');
    fixture.detectChanges();

    dropWith(canvas(), runDrag('c'));
    fixture.detectChanges();

    expect(foldersService.folderById(folder.id)!.experimentIds).toEqual(['a']);
    expect(notice()).toBeNull();
    expect(root().querySelector('.folder-form-error')!.textContent).toContain('Could not add that run');
  });

  it('leaves a drag alone that carries something other than a run', () => {
    openFolder(['a']);
    fixture.detectChanges();

    const dataTransfer = dataTransferWith('text/plain', 'a');
    const hover = dragOverWith(canvas(), dataTransfer);
    fixture.detectChanges();
    expect(hover.defaultPrevented).toBeFalse();
    expect(canvas().classList.contains('folder-canvas--receiving')).toBeFalse();

    dropWith(canvas(), dataTransfer);
    fixture.detectChanges();
    expect(foldersService.folders()[0].experimentIds).toEqual(['a']);
    expect(notice()).toBeNull();
  });

  it('tells an empty folder what the hovering run will do to it', () => {
    openFolder([]);
    fixture.detectChanges();
    expect(root().querySelector('.folder-empty h3')!.textContent!.trim()).toBe('Nothing in this folder yet');

    dragOverWith(canvas(), runDrag('c'));
    fixture.detectChanges();

    expect(root().querySelector('.folder-empty--receiving')).toBeTruthy();
    expect(root().querySelector('.folder-empty h3')!.textContent!.trim()).toBe('Drop it here');
  });

  it('fades its own drop report, with the newest drop holding the clock', () => {
    jasmine.clock().install();
    try {
      loaded.set([experiment('a'), experiment('c')]);
      openFolder(['a']);
      fixture.detectChanges();

      dropWith(canvas(), runDrag('c'));
      fixture.detectChanges();
      expect(notice()!.textContent).toContain('Added');

      dropWith(canvas(), runDrag('c'));
      fixture.detectChanges();
      jasmine.clock().tick(2100);
      expect(notice()!.textContent).toContain('Already in');

      jasmine.clock().tick(200);
      fixture.detectChanges();
      expect(notice()).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  describe('sets', () => {
    it('partitions the members under their set headings, Ungrouped last', () => {
      loaded.set([experiment('a'), experiment('b'), experiment('c')]);
      const folder = openFolder(['a', 'b', 'c']);
      foldersService.seedSet(folder.id, 'T-tests', ['b']);
      fixture.detectChanges();

      expect(groupNames()).toEqual(['T-tests', 'Ungrouped']);
      expect(rowsIn(groupsOf()[0]).map((row) => row.querySelector('.member-name')!.textContent!.trim())).toEqual(['Run b']);
      expect(rowsIn(groupsOf()[1]).length).toBe(2);
      // The set is a heading, not a renumbering: one order runs down the whole canvas.
      expect(rowsOf().map((row) => row.querySelector('.member-index')!.textContent!.trim())).toEqual(['1', '2', '3']);
    });

    it('numbers every member once when no set exists yet', () => {
      loaded.set([experiment('a'), experiment('b')]);
      openFolder(['a', 'b']);
      fixture.detectChanges();

      expect(groupNames()).toEqual(['Ungrouped']);
      expect(rowsOf().map((row) => row.querySelector('.member-index')!.textContent!.trim())).toEqual(['1', '2']);
    });

    it('collapses a set heading without losing its count', () => {
      loaded.set([experiment('a'), experiment('b'), experiment('c')]);
      const folder = openFolder(['a', 'b', 'c']);
      foldersService.seedSet(folder.id, 'T-tests', ['b']);
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-toggle')!.click();
      fixture.detectChanges();

      expect(rowsIn(groupsOf()[0]).length).toBe(0);
      expect(groupHeaders()[0].querySelector('.count-badge')!.textContent!.trim()).toBe('1');
      expect(rowsIn(groupsOf()[1]).length).toBe(2);

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-toggle')!.click();
      fixture.detectChanges();
      expect(rowsIn(groupsOf()[0]).length).toBe(1);
    });

    it('withholds rename and delete from the implicit group', () => {
      loaded.set([experiment('a')]);
      openFolder(['a']);
      fixture.detectChanges();

      expect(groupHeaders()[0].querySelector('.member-group-actions')).toBeNull();
      expect(groupHeaders()[0].querySelector('.member-group-name')!.textContent!.trim()).toBe('Ungrouped');
    });

    it('moves a run into a set from its row, out of the set that had it', () => {
      loaded.set([experiment('a'), experiment('b')]);
      const folder = openFolder(['a', 'b']);
      const ttests = foldersService.seedSet(folder.id, 'T-tests', ['a'])!;
      fixture.detectChanges();

      setTrigger(1).click();
      fixture.detectChanges();
      expect(root().querySelector('.set-menu')).toBeTruthy();

      root().querySelectorAll<HTMLElement>('.set-menu__item')[0].click();
      fixture.detectChanges();

      expect(foldersService.setOf(folder.id, 'b')).toBe(ttests.id);
      // Strict means b cannot sit in two sets — it left Ungrouped, which is where it was. The run
      // T-tests already held keeps its home: a move files a run, it does not evict anyone.
      expect(foldersService.folderById(folder.id)!.sets[0].experimentIds).toEqual(['a', 'b']);
      expect(rowsIn(groupsOf()[0]).length).toBe(2);
      expect(groupsOf().length).toBe(1);
    });

    it('leaves a set for Ungrouped without leaving the folder', () => {
      loaded.set([experiment('a'), experiment('b')]);
      const folder = openFolder(['a', 'b']);
      foldersService.seedSet(folder.id, 'T-tests', ['a']);
      fixture.detectChanges();

      setTrigger(0).click();
      fixture.detectChanges();
      (root().querySelector('.set-menu__item--unset') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(foldersService.setOf(folder.id, 'a')).toBeNull();
      expect(foldersService.folderById(folder.id)!.experimentIds).toEqual(['a', 'b']);
      expect(root().querySelector('.set-menu')).toBeNull();
      // An empty set keeps its heading and says what would fill it.
      expect(groupNames()).toEqual(['T-tests', 'Ungrouped']);
      expect(groupsOf()[0].querySelector('.member-group-empty')).toBeTruthy();
    });

    it('creates a set around the run whose menu is open', () => {
      loaded.set([experiment('a'), experiment('b')]);
      const folder = openFolder(['a', 'b']);
      fixture.detectChanges();

      setTrigger(0).click();
      fixture.detectChanges();
      (root().querySelector('.set-menu__item--new') as HTMLButtonElement).click();
      fixture.detectChanges();

      const input = root().querySelector('.set-menu__input') as HTMLInputElement;
      input.value = 'Chi-squared';
      input.dispatchEvent(new Event('input'));
      (root().querySelector('.set-menu__form-action') as HTMLButtonElement).click();
      fixture.detectChanges();

      const stored = foldersService.folderById(folder.id)!;
      expect(stored.sets.map((set) => set.name)).toEqual(['Chi-squared']);
      expect(stored.sets[0].experimentIds).toEqual(['a']);
      expect(groupNames()).toEqual(['Chi-squared', 'Ungrouped']);
    });

    it('refuses a set name a sibling already took', () => {
      loaded.set([experiment('a')]);
      const folder = openFolder(['a']);
      foldersService.seedSet(folder.id, 'T-tests');
      fixture.detectChanges();

      setTrigger(0).click();
      fixture.detectChanges();
      (root().querySelector('.set-menu__item--new') as HTMLButtonElement).click();
      fixture.detectChanges();

      const input = root().querySelector('.set-menu__input') as HTMLInputElement;
      input.value = 't-tests';
      input.dispatchEvent(new Event('input'));
      (root().querySelector('.set-menu__form-action') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(root().querySelector('.set-menu__error')!.textContent).toContain('taken');
      expect(foldersService.folderById(folder.id)!.sets.length).toBe(1);
    });

    it('says so when a new set never made it to the server', () => {
      spyOn(console, 'error');
      loaded.set([experiment('a')]);
      const folder = openFolder(['a']);
      foldersService.failWith('createSet');
      fixture.detectChanges();

      setTrigger(0).click();
      fixture.detectChanges();
      (root().querySelector('.set-menu__item--new') as HTMLButtonElement).click();
      fixture.detectChanges();

      const input = root().querySelector('.set-menu__input') as HTMLInputElement;
      input.value = 'Chi-squared';
      input.dispatchEvent(new Event('input'));
      (root().querySelector('.set-menu__form-action') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(foldersService.folderById(folder.id)!.sets).toEqual([]);
      expect(root().querySelector('.set-menu__input')).toBeTruthy();
      expect(root().querySelector('.folder-form-error')!.textContent).toContain('Could not create the set');
    });

    it('renames a set from its heading', () => {
      loaded.set([experiment('a')]);
      const folder = openFolder(['a']);
      foldersService.seedSet(folder.id, 'T-tests', ['a']);
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-actions .icon-btn')!.click();
      fixture.detectChanges();

      const input = root().querySelector('.member-group-rename-input') as HTMLInputElement;
      input.value = 'Age tests';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(foldersService.folderById(folder.id)!.sets[0].name).toBe('Age tests');
      expect(groupNames()[0]).toBe('Age tests');
    });

    it('keeps a set name that clashes with a sibling, and says so', () => {
      loaded.set([experiment('a')]);
      const folder = openFolder(['a']);
      foldersService.seedSet(folder.id, 'T-tests', ['a']);
      foldersService.seedSet(folder.id, 'Chi-squared');
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-actions .icon-btn')!.click();
      fixture.detectChanges();

      const input = root().querySelector('.member-group-rename-input') as HTMLInputElement;
      input.value = 'chi-squared';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(root().querySelector('.folder-form-error')!.textContent).toContain('already exists');
      expect(foldersService.folderById(folder.id)!.sets[0].name).toBe('T-tests');
    });

    it('deletes a set and hands its runs back to Ungrouped', () => {
      loaded.set([experiment('a'), experiment('b')]);
      const folder = openFolder(['a', 'b']);
      foldersService.seedSet(folder.id, 'T-tests', ['a']);
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-actions .icon-btn.danger')!.click();
      fixture.detectChanges();
      (root().querySelector('.member-group-confirm .folder-form-action.danger') as HTMLButtonElement).click();
      fixture.detectChanges();

      const stored = foldersService.folderById(folder.id)!;
      expect(stored.sets).toEqual([]);
      expect(stored.experimentIds).toEqual(['a', 'b']);
      expect(groupNames()).toEqual(['Ungrouped']);
      expect(rowsOf().length).toBe(2);
    });

    it('aborts a set delete before it happens', () => {
      loaded.set([experiment('a')]);
      const folder = openFolder(['a']);
      foldersService.seedSet(folder.id, 'T-tests', ['a']);
      fixture.detectChanges();

      groupHeaders()[0].querySelector<HTMLButtonElement>('.member-group-actions .icon-btn.danger')!.click();
      fixture.detectChanges();
      root().querySelector<HTMLButtonElement>('.member-group-confirm .folder-form-action.cancel')!.click();
      fixture.detectChanges();

      expect(foldersService.folderById(folder.id)!.sets.length).toBe(1);
      expect(rowsOf().length).toBe(1);
    });

    it('keeps a set assignment out of the detail view', () => {
      loaded.set([experiment('a'), experiment('b')]);
      openFolder(['a', 'b']);
      const openExperiment = spyOn(fixture.componentInstance, 'onRowClick');
      fixture.detectChanges();

      setTrigger(0).click();
      fixture.detectChanges();
      root().querySelector<HTMLElement>('.set-menu__name')!.click();
      fixture.detectChanges();

      expect(openExperiment).not.toHaveBeenCalled();
    });
  });

  it('opens the detail view when a member row is clicked', () => {
    loaded.set([experiment('a')]);
    openFolder(['a']);
    fixture.detectChanges();

    const opened: Experiment[] = [];
    component.openExperiment.subscribe((exp) => opened.push(exp));
    rowsOf()[0].click();

    expect(opened.map((exp) => exp.id)).toEqual(['a']);
  });
});
