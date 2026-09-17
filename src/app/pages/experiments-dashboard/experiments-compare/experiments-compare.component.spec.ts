import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY } from 'rxjs';

import { Experiment } from '../../../models/experiments-dashboard.model';
import { ExperimentLabelService } from '../../../services/experiment-label.service';
import { ExperimentsDashboardService } from '../../../services/experiments-dashboard.service';
import { ExperimentFoldersService } from '../../../services/experiment-folders.service';
import { FakeExperimentFoldersService } from '../experiment-folders.testing';
import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentsCompareComponent } from './experiments-compare.component';

const experiment = (id: string, algorithmName = 'mock_anova'): Experiment => ({
  id,
  name: `Run ${id}`,
  dateCreated: new Date('2026-01-01T00:00:00.000Z'),
  status: 'success',
  algorithmName,
  author: 'Marie Curie',
  authorEmail: 'marie.curie@chuv.ch',
  isShared: false,
});

/**
 * The compare page is read as columns side by side. Two things decide the order those columns
 * lay out in: the sets the origin folder defines, and the algorithm of everything nobody
 * grouped. Both are read here — sets are written on the folder canvas.
 */
describe('ExperimentsCompareComponent', () => {
  let fixture: ComponentFixture<ExperimentsCompareComponent>;
  let component: ExperimentsCompareComponent;
  let foldersService: FakeExperimentFoldersService;

  const root = () => fixture.nativeElement as HTMLElement;
  const headline = () => root().querySelector('.compare-header p')!.textContent!.trim();
  const columnsOf = () => Array.from(root().querySelectorAll<HTMLElement>('.compare-column'));
  const columnNames = () => columnsOf().map((column) => column.querySelector('.column-name')!.textContent!.trim());
  const numbers = () => columnsOf().map((column) => column.querySelector('.run-index')!.textContent!.trim());
  const algos = () => columnsOf().map((column) => column.querySelector('.run-algo')!.textContent!.trim());
  const setTags = () => columnsOf().map((column) => column.querySelector('.column-set-tag')?.textContent!.trim() ?? null);

  /** A folder the compare can read: the workspace writes nothing, so specs seed rather than click. */
  const makeFolder = (name: string, memberIds: string[] = []) => foldersService.seedFolder(name, memberIds);
  const show = (ids: string[], originFolderId: string | null = null) =>
    showRuns(ids.map((id) => experiment(id)), originFolderId);

  const showRuns = (experiments: Experiment[], originFolderId: string | null = null) => {
    fixture.componentRef.setInput('experiments', experiments);
    fixture.componentRef.setInput('originFolderId', originFolderId);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    foldersService = new FakeExperimentFoldersService();

    await TestBed.configureTestingModule({
      imports: [ExperimentsCompareComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentFoldersService, useValue: foldersService },
        {
          provide: ExperimentsDashboardService,
          useValue: { experiments: signal<Experiment[]>([]), getExperimentResult: () => EMPTY },
        },
        {
          provide: ExperimentLabelService,
          useValue: { getLabelMap: async () => ({}), getEnumMaps: async () => ({}) },
        },
        {
          provide: ExperimentStudioService,
          useValue: { backendAlgorithms: signal<Record<string, { label: string }>>({ ttest: { label: 'T-test' } }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExperimentsCompareComponent);
    component = fixture.componentInstance;
  });

  describe('header', () => {
    it('counts the runs it holds instead of asking for a selection it has', () => {
      show(['a', 'b', 'c']);

      expect(headline()).toBe('Comparing your selection · 3 runs');
    });

    it('names the analysis set the compare came from and offers the way back', () => {
      const folder = makeFolder('Q3 meta');
      show(['a', 'b'], folder.id);

      expect(headline()).toBe('Comparing Q3 meta · 2 runs');

      const back = root().querySelector('.compare-back-btn') as HTMLButtonElement;
      expect(back.textContent).toContain('Back to Q3 meta');

      let emissions = 0;
      component.backToFolder.subscribe(() => emissions++);
      back.click();

      expect(emissions).toBe(1);
    });

    it('withholds the way back from a hand-built set', () => {
      show(['a', 'b']);

      expect(root().querySelector('.compare-back-btn')).toBeNull();
    });
  });

  describe('columns', () => {
    it('gives every ungrouped run a column, grouped and ordered by its algorithm', () => {
      showRuns([
        experiment('a', 'ttest'),
        experiment('b', 'chisq'),
        experiment('c', 'ttest'),
        experiment('d', 'describe'),
      ]);

      // A code with no label still shows its own name — an ungrouped run needs a home, not a special case.
      expect(columnNames()).toEqual(['Run a', 'Run c', 'Run b', 'Run d']);
      expect(algos()).toEqual(['T-test', 'T-test', 'chisq', 'describe']);
      expect(setTags()).toEqual([null, null, null, null]);
    });

    it('puts the folder sets first and the leftovers after them', () => {
      const folder = makeFolder('Stroke', ['a', 'b', 'c']);
      foldersService.seedSet(folder.id, 'Age tests', ['a', 'b']);

      show(['a', 'b', 'c'], folder.id);

      expect(columnNames()).toEqual(['Run a', 'Run b', 'Run c']);
      expect(setTags()).toEqual(['Age tests', 'Age tests', null]);
    });

    it('numbers runs once across the whole comparison', () => {
      const folder = makeFolder('Stroke', ['a', 'b']);
      foldersService.seedSet(folder.id, 'Age tests', ['b']);

      showRuns([experiment('a', 'ttest'), experiment('b', 'ttest')], folder.id);
      fixture.detectChanges();

      expect(columnNames()).toEqual(['Run b', 'Run a']);
      expect(numbers()).toEqual(['1', '2']);
      expect(setTags()).toEqual(['Age tests', null]);
    });

    it('withholds a column for a set whose runs are not being compared', () => {
      const folder = makeFolder('Stroke', ['a']);
      foldersService.seedSet(folder.id, 'Age tests', ['a']);

      show(['b'], folder.id);

      expect(columnNames()).toEqual(['Run b']);
      expect(setTags()).toEqual([null]);
    });

    it('keeps the configuration closed per column and opens only the one it toggled', () => {
      show(['a', 'b']);

      expect(columnsOf()[0].querySelector('.config-body')).toBeNull();

      columnsOf()[0].querySelector<HTMLButtonElement>('.config-toggle')!.click();
      fixture.detectChanges();

      expect(columnsOf()[0].querySelector('.config-body')).toBeTruthy();
      expect(columnsOf()[1].querySelector('.config-body')).toBeNull();
    });

    it('renders each column its own result state', () => {
      show(['a', 'b']);

      // The stubbed result never answers, so every column sits in its own loading state.
      for (const column of columnsOf()) {
        expect(column.querySelector('.compare-results .muted-text')!.textContent).toContain('Loading');
      }
    });

    it('groups by algorithm alone when runs arrive with no folder at all', () => {
      const folder = makeFolder('Stroke', ['a']);
      foldersService.seedSet(folder.id, 'Age tests', ['a']);

      showRuns([experiment('a', 'ttest'), experiment('b', 'chisq')]);

      expect(columnNames()).toEqual(['Run a', 'Run b']);
      expect(setTags()).toEqual([null, null]);
      expect(columnsOf().length).toBe(2);
    });

    it('reads the partition without editing it', () => {
      const folder = makeFolder('Stroke', ['a', 'b']);
      foldersService.seedSet(folder.id, 'Age tests', ['a']);
      const before = JSON.stringify(foldersService.folderById(folder.id));

      show(['a', 'b'], folder.id);
      columnsOf()[0].querySelector<HTMLButtonElement>('.config-toggle')!.click();
      fixture.detectChanges();
      columnsOf()[1].querySelector<HTMLButtonElement>('.config-toggle')!.click();
      fixture.detectChanges();

      expect(JSON.stringify(foldersService.folderById(folder.id))).toBe(before);
    });
  });
});
