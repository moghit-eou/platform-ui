import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { EXPERIMENT_DRAG_MIME } from '../../../core/experiment-drag.utils';
import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentFoldersService } from '../../../services/experiment-folders.service';
import { FakeExperimentFoldersService } from '../experiment-folders.testing';
import { ExperimentsListComponent } from './experiment-list.component';

const experiment = (id: string): Experiment => ({
  id,
  name: `Run ${id}`,
  dateCreated: new Date('2026-01-01T00:00:00.000Z'),
  status: 'success',
  algorithmName: 'mock_anova',
  author: 'Marie Curie',
  authorEmail: 'marie.curie@chuv.ch',
  isShared: false,
});

describe('ExperimentsListComponent list pane', () => {
  let fixture: ComponentFixture<ExperimentsListComponent>;
  let component: ExperimentsListComponent;
  let foldersService: FakeExperimentFoldersService;
  let loaded: ReturnType<typeof signal<Experiment[]>>;

  const root = () => fixture.nativeElement as HTMLElement;
  const rowTrigger = () =>
    (fixture.nativeElement as HTMLElement).querySelector('.folder-menu-anchor > .icon-btn') as HTMLButtonElement;
  const chips = () => Array.from(root().querySelectorAll<HTMLElement>('.folder-chip:not(.folder-chip--new)'));

  const rows = () => Array.from(root().querySelectorAll<HTMLElement>('.experiment-row'));
  const dataTransferWith = (type: string, value: string) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData(type, value);
    return dataTransfer;
  };
  /** Returns the event so a spec can assert whether the target accepted the drag. */
  const dispatchDrag = (type: string, target: HTMLElement, dataTransfer: DataTransfer, relatedTarget?: Node | null) => {
    const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, relatedTarget });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(async () => {
    foldersService = new FakeExperimentFoldersService();
    loaded = signal<Experiment[]>([experiment('a'), experiment('b')]);

    await TestBed.configureTestingModule({
      imports: [ExperimentsListComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ExperimentsDashboardService,
          useValue: {
            experiments: loaded,
            totalPages: signal(1),
            totalExperiments: signal(2),
            historyTruncated: signal(false),
            fullHistoryCap: 2500,
            isLoading: signal(false),
            getUserExperiments: jasmine.createSpy('getUserExperiments'),
            toggleExperimentShare: jasmine.createSpy('toggleExperimentShare').and.returnValue(of({ shared: true })),
          },
        },
        {
          provide: ExperimentStudioService,
          useValue: { loadAllDataModels: () => of([]), backendAlgorithms: signal({}) },
        },
        { provide: ExperimentFoldersService, useValue: foldersService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExperimentsListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('shows one chip per folder with its member count and the selected state', () => {
    foldersService.seedFolder('ANOVA', ['a']);
    foldersService.seedFolder('PCA');
    fixture.componentRef.setInput('selectedFolderId', foldersService.folders()[0].id);
    fixture.detectChanges();

    expect(root().querySelector('.folder-strip-label')!.textContent!.trim()).toBe('Folders');
    expect(chips().length).toBe(2);
    expect(chips()[0].textContent).toContain('ANOVA');
    expect(chips()[0].querySelector('.count-badge')!.textContent!.trim()).toBe('1');
    expect(chips()[0].classList.contains('selected')).toBeTrue();
    expect(chips()[1].classList.contains('selected')).toBeFalse();
  });

  it('names the history a client-side filter could not read, beside the count it limits', () => {
    const dashboard = TestBed.inject(ExperimentsDashboardService) as any;
    dashboard.historyTruncated.set(true);
    fixture.detectChanges();

    const summary = root().querySelector('.list-summary')!;
    expect(summary.textContent).toContain('of');
    expect(summary.querySelector('.list-summary-note')?.textContent)
      .toContain('searched your 2500 most recent experiments');

    dashboard.historyTruncated.set(false);
    fixture.detectChanges();
    expect(root().querySelector('.list-summary-note')).toBeNull();
  });

  it('sits under the tabs, never above search: folders cut across the list, they do not scope it', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const order = Array.from(
      root().querySelectorAll<HTMLElement>('.list-toolbar, .experiments-tabs-row, .folder-strip'),
    ).map((region) =>
      region.classList.contains('list-toolbar') ? 'search' : region.classList.contains('folder-strip') ? 'folders' : 'tabs',
    );
    expect(order).toEqual(['search', 'tabs', 'folders']);
  });

  it('wears the tab recipe on the chip, including the ghost "+ New" chip', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const newChip = root().querySelector('.folder-chip--new')!;
    expect(newChip.classList.contains('folder-chip')).toBeTrue();

    // fa-object-group: fa-layer-group already means domain in this pane and is the compare placeholder.
    expect(chips()[0].querySelector('i')!.classList.contains('fa-object-group')).toBeTrue();
    const rowTrigger = root().querySelector('.folder-menu-anchor .icon-btn i')!;
    expect(rowTrigger.classList.contains('fa-object-group')).toBeTrue();
    expect(rowTrigger.classList.contains('fa-layer-group')).toBeFalse();
  });

  it('tells the dashboard which folder is open and clears it when the chip is pressed again', () => {
    const folder = foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const emitted: Array<string | null> = [];
    component.folderSelected.subscribe((id) => emitted.push(id));

    chips()[0].click();
    // The chip only knows what the dashboard feeds it back, so press it the way the parent does.
    fixture.componentRef.setInput('selectedFolderId', folder.id);
    fixture.detectChanges();
    chips()[0].click();

    expect(emitted).toEqual([folder.id, null]);
  });

  it('creates a folder from the strip and opens it', () => {
    fixture.detectChanges();

    (root().querySelector('.folder-chip--new') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-chip-input') as HTMLInputElement;
    input.value = 'Sensitivity';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.folder-chip-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders().map((folder) => folder.name)).toEqual(['Sensitivity']);

    const emitted: Array<string | null> = [];
    component.folderSelected.subscribe((id) => emitted.push(id));
    chips()[0].click();
    expect(emitted).toEqual([foldersService.folders()[0].id]);
  });

  it('rejects a duplicate name instead of creating a second folder', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    (root().querySelector('.folder-chip--new') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-chip-input') as HTMLInputElement;
    input.value = 'anova';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.folder-chip-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders().length).toBe(1);
    expect(root().querySelector('.folder-strip-error')!.textContent).toContain('taken');
  });

  it('adds and drops the run of an opened row menu', () => {
    const folder = foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const trigger = root().querySelectorAll<HTMLButtonElement>('.folder-menu-anchor > .icon-btn')[0];
    trigger.click();
    fixture.detectChanges();

    const items = root().querySelectorAll<HTMLElement>('.folder-menu__item');
    expect(items.length).toBe(2); // the folder plus "New folder…"
    expect(items[0].querySelector('.folder-menu__check')!.classList.contains('folder-menu__check--off')).toBeTrue();

    items[0].click();
    fixture.detectChanges();
    expect(foldersService.isMember(folder.id, 'a')).toBeTrue();

    // A pick is a tick, not a navigation: the menu stays open so a run can join a second folder.
    const checks = root().querySelectorAll<HTMLElement>('.folder-menu__item .folder-menu__check');
    expect(checks[0].classList.contains('folder-menu__check--off')).toBeFalse();
    expect(root().querySelector('.folder-menu')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    (checks[0].closest('.folder-menu__item') as HTMLElement).click();
    fixture.detectChanges();
    expect(foldersService.isMember(folder.id, 'a')).toBeFalse();
  });

  it('treats a folder pick as a folder choice, not as a row selection', () => {
    foldersService.seedFolder('ANOVA');
    const selectExperiment = spyOn(fixture.componentInstance, 'selectExperiment');
    fixture.detectChanges();

    rowTrigger().click();
    fixture.detectChanges();
    root().querySelector<HTMLElement>('.folder-menu__item')!.click();
    fixture.detectChanges();

    expect(selectExperiment).not.toHaveBeenCalled();
    expect(foldersService.folders()[0].experimentIds).toEqual(['a']);
  });

  it('keeps the menu open for its own clicks and closes on a click outside it', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    rowTrigger().click();
    fixture.detectChanges();

    // The panel hangs off the row, so "outside the trigger" must not yet mean "outside the menu".
    root()
      .querySelector<HTMLElement>('.folder-menu__name')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(root().querySelector('.folder-menu')).toBeTruthy();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(root().querySelector('.folder-menu')).toBeNull();
  });

  it('offers every row to a folder as a drag carrying its run id', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const row = rows()[0];
    expect(row.getAttribute('draggable')).toBe('true');

    const dataTransfer = new DataTransfer();
    dispatchDrag('dragstart', row, dataTransfer);
    fixture.detectChanges();

    expect(dataTransfer.getData(EXPERIMENT_DRAG_MIME)).toBe('a');
    expect(row.classList.contains('experiment-row--dragging')).toBeTrue();

    dispatchDrag('dragend', row, dataTransfer);
    fixture.detectChanges();
    expect(row.classList.contains('experiment-row--dragging')).toBeFalse();
  });

  it('files a run dropped on a folder chip, without opening the canvas first', () => {
    const folder = foldersService.seedFolder('ANOVA', ['a']);
    fixture.detectChanges();

    const chip = chips()[0];
    const dataTransfer = dataTransferWith(EXPERIMENT_DRAG_MIME, 'b');
    const hover = dispatchDrag('dragover', chip, dataTransfer);
    fixture.detectChanges();

    // No preventDefault means no drop event at all, so the ring has to follow the acceptance.
    expect(hover.defaultPrevented).toBeTrue();
    expect(chip.classList.contains('folder-chip--receiving')).toBeTrue();

    dispatchDrag('drop', chip, dataTransfer);
    fixture.detectChanges();

    expect(foldersService.folderById(folder.id)!.experimentIds).toEqual(['a', 'b']);
    expect(chip.classList.contains('folder-chip--receiving')).toBeFalse();
  });

  it('adds on a drop instead of toggling a member the run already is', () => {
    const folder = foldersService.seedFolder('ANOVA', ['a']);
    fixture.detectChanges();

    const dataTransfer = dataTransferWith(EXPERIMENT_DRAG_MIME, 'a');
    dispatchDrag('drop', chips()[0], dataTransfer);
    fixture.detectChanges();

    expect(foldersService.folderById(folder.id)!.experimentIds).toEqual(['a']);
  });

  it('holds the chip ring while the pointer crosses the chip itself', () => {
    foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const chip = chips()[0];
    const dataTransfer = dataTransferWith(EXPERIMENT_DRAG_MIME, 'b');
    dispatchDrag('dragover', chip, dataTransfer);
    fixture.detectChanges();

    dispatchDrag('dragleave', chip, dataTransfer, chip.querySelector('.folder-chip__name'));
    fixture.detectChanges();
    expect(chip.classList.contains('folder-chip--receiving')).toBeTrue();

    dispatchDrag('dragleave', chip, dataTransfer, null);
    fixture.detectChanges();
    expect(chip.classList.contains('folder-chip--receiving')).toBeFalse();
  });

  it('ignores a drag that carries something other than a run', () => {
    const folder = foldersService.seedFolder('ANOVA');
    fixture.detectChanges();

    const chip = chips()[0];
    const dataTransfer = dataTransferWith('text/plain', 'a');
    const hover = dispatchDrag('dragover', chip, dataTransfer);
    fixture.detectChanges();
    expect(hover.defaultPrevented).toBeFalse();
    expect(chip.classList.contains('folder-chip--receiving')).toBeFalse();

    dispatchDrag('drop', chip, dataTransfer);
    fixture.detectChanges();
    expect(foldersService.folderById(folder.id)!.experimentIds).toEqual([]);
  });

  it('reports a drop the server refused instead of letting the chip look like it took the run', () => {
    spyOn(console, 'error');
    const folder = foldersService.seedFolder('ANOVA', ['a']);
    foldersService.failWith('addExperiment');
    fixture.detectChanges();

    dispatchDrag('drop', chips()[0], dataTransferWith(EXPERIMENT_DRAG_MIME, 'b'));
    fixture.detectChanges();

    expect(foldersService.folderById(folder.id)!.experimentIds).toEqual(['a']);
    expect(root().querySelector('.folder-strip-error')!.textContent).toContain('Could not add a run');
  });

  it('keeps the name form open when the create never reached the server', () => {
    spyOn(console, 'error');
    foldersService.failWith('createFolder');
    fixture.detectChanges();

    (root().querySelector('.folder-chip--new') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-chip-input') as HTMLInputElement;
    input.value = 'Sensitivity';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.folder-chip-form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders()).toEqual([]);
    expect(root().querySelector('.folder-chip-input')).toBeTruthy();
    expect(root().querySelector('.folder-strip-error')!.textContent).toContain('Could not create the folder');
  });

  it('says the folders could not be read at all, rather than showing an empty strip as the truth', () => {
    foldersService.loadError.set('Could not load your folders. Check the connection and reload the page.');
    fixture.detectChanges();

    expect(root().querySelector('.folder-strip-error')!.textContent).toContain('Could not load your folders');
    expect(root().querySelector('.folder-strip-hint')).toBeNull();
  });

  it('creates a folder straight from the row menu and files the run in it', () => {
    fixture.detectChanges();

    root().querySelectorAll<HTMLButtonElement>('.folder-menu-anchor > .icon-btn')[0].click();
    fixture.detectChanges();

    const newItem = root().querySelector('.folder-menu__item--new') as HTMLButtonElement;
    newItem.click();
    fixture.detectChanges();

    const input = root().querySelector('.folder-menu__input') as HTMLInputElement;
    input.value = 'Q3 meta';
    input.dispatchEvent(new Event('input'));
    (root().querySelector('.folder-menu__form-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(foldersService.folders().length).toBe(1);
    expect(foldersService.folders()[0].experimentIds).toEqual(['a']);
  });
  describe('the tabs row', () => {
    const trigger = () => root().querySelector<HTMLButtonElement>('.sort-overflow__trigger')!;

    // A sort pick writes the query, and Karma keeps one page across specs: start clean, leave clean.
    beforeEach(() => {
      history.replaceState(null, '', '/experiments-dashboard');
      component.sort.set('created-desc');
    });
    afterEach(() => history.replaceState(null, '', '/experiments-dashboard'));

    const orders = () => Array.from(root().querySelectorAll<HTMLElement>('.sort-overflow .row-overflow__item'));
    const details = () => root().querySelector<HTMLDetailsElement>('.sort-overflow')!;
    const checkOf = (item: HTMLElement) =>
      item.querySelector<HTMLElement>('.sort-overflow__check')!.classList.contains('sort-overflow__check--off');

    it('keeps the tabs and the controls on one row, with the six orders behind the sort icon', () => {
      fixture.detectChanges();

      // A select here measured 112px and pushed Filters onto a second line of its own.
      expect(root().querySelector('select.sort-select')).toBeNull();

      const rowEl = root().querySelector<HTMLElement>('.experiments-tabs-row')!;
      const tallest = Math.max(
        ...Array.from(rowEl.children).map((el) => (el as HTMLElement).getBoundingClientRect().height),
      );
      if (window.innerWidth > 640) {
        // Below that the two-row layout is the design, not an accident, and it re-wraps on purpose.
        // A wrapped row would stand as tall as both of its lines together.
        expect(rowEl.getBoundingClientRect().height).toBeLessThanOrEqual(tallest + 4);
      }

      expect(trigger().title).toBe('Sort: Newest');
      expect(details().open).toBeFalse();

      trigger().click();
      fixture.detectChanges();

      expect(orders().map((b) => b.textContent!.trim())).toEqual([
        'Newest',
        'Oldest',
        'Name A–Z',
        'Name Z–A',
        'Status',
        'Algorithm',
      ]);
      expect(checkOf(orders()[0])).toBeFalse();
      expect(checkOf(orders()[1])).toBeTrue();
      expect(details().open).toBeTrue();
    });

    it('folds back into the icon once an order is taken, and says which one is on', () => {
      fixture.detectChanges();
      trigger().click();
      fixture.detectChanges();

      orders()[2].click();
      fixture.detectChanges();

      expect(component.sort()).toBe('name-asc');
      expect(details().open).toBeFalse();
      expect(trigger().title).toBe('Sort: Name A–Z');
    });
  });

  describe('the page count', () => {
    it('is paged once, with the range stated under the tabs instead', () => {
      fixture.detectChanges();

      expect(root().querySelectorAll('.list-pagination').length).toBe(1);
      expect(root().querySelector('.list-pagination small')).toBeNull();
      expect(root().querySelector('.list-summary')!.textContent).toContain('Showing 1–2 of 2');
    });
  });
});
