import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Experiment } from '../models/experiments-dashboard.model';
import { ExperimentsDashboardService } from './experiments-dashboard.service';

const apiUrl = '/services/experiments';

const backendExperiment = (uuid: string, name: string) => ({
  uuid,
  name,
  created: '2026-01-01T00:00:00.000Z',
  finished: '2026-01-01T00:01:00.000Z',
  shared: false,
  viewed: false,
  status: 'success',
  description: '',
  analysis: { algorithm: { name: 'mock_anova', y: ['AGE'], x: [] } },
  createdBy: {
    username: 'mcurie',
    fullname: 'Marie Curie',
    email: 'marie.curie@chuv.ch',
    subjectId: 'orcid-0000-0002',
    agreeNDA: true,
  },
});

const frontendExperiment = (id: string, name = id): Experiment => ({
  id,
  name,
  dateCreated: new Date('2026-01-01T00:00:00.000Z'),
  status: 'success',
  algorithmName: 'mock_anova',
  author: 'Marie Curie',
  authorEmail: 'marie.curie@chuv.ch',
  isShared: false,
});

describe('ExperimentsDashboardService hydrateExperiments', () => {
  let service: ExperimentsDashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ExperimentsDashboardService],
    });
    service = TestBed.inject(ExperimentsDashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list requests with filters', () => {
    it('keeps the client-filter snapshot for repeat views within a visit', () => {
      service.getUserExperiments(0, 10, true, { status: 'success' });
      httpMock.expectOne((request) => request.url === apiUrl).flush({
        experiments: [backendExperiment('a', 'A'), backendExperiment('b', 'B')],
        totalExperiments: 2,
        totalPages: 1,
        currentPage: 0,
      });

      expect(service.experiments().map((experiment) => experiment.id)).toEqual(['a', 'b']);

      // A second client-only filter is answered from the same full-history snapshot.
      service.getUserExperiments(0, 10, true, { status: 'error' });
      httpMock.expectNone((request) => request.url === apiUrl);
      expect(service.experiments()).toEqual([]);
      expect(service.totalExperiments()).toBe(0);
    });

    it('names the runs a client-side filter searched once the history cap cut it short', () => {
      service.getUserExperiments(0, 10, true, { status: 'success' });

      // 51 pages of 50 exist; the snapshot reads 50 of them.
      const first = httpMock.expectOne((request) => request.url === apiUrl);
      expect(first.request.params.get('page')).toBe('0');
      first.flush({
        experiments: [backendExperiment('a', 'A')],
        totalExperiments: 2550,
        totalPages: 51,
        currentPage: 0,
      });

      const rest = httpMock.match((request) => request.url === apiUrl);
      expect(rest.length).toBe(49);
      rest.forEach((request, index) => request.flush({
        experiments: [],
        totalExperiments: 2550,
        totalPages: 51,
        currentPage: index + 1,
      }));

      expect(service.fullHistoryCap).toBe(2500);
      expect(service.historyTruncated()).toBeTrue();
    });

    it('does not claim a truncated history the snapshot actually covered', () => {
      service.getUserExperiments(0, 10, true, { status: 'success' });
      httpMock.expectOne((request) => request.url === apiUrl).flush({
        experiments: [backendExperiment('a', 'A')],
        totalExperiments: 1,
        totalPages: 1,
        currentPage: 0,
      });

      expect(service.historyTruncated()).toBeFalse();
    });

    it('invalidates the client-filter snapshot on demand', () => {
      service.getUserExperiments(0, 10, true, { status: 'success' });
      httpMock.expectOne((request) => request.url === apiUrl).flush({
        experiments: [backendExperiment('a', 'A')],
        totalExperiments: 1,
        totalPages: 1,
        currentPage: 0,
      });
      expect(service.experiments().map((experiment) => experiment.id)).toEqual(['a']);

      service.invalidateListCache();
      service.getUserExperiments(0, 10, true, { status: 'success' });
      httpMock.expectOne((request) => request.url === apiUrl).flush({
        experiments: [backendExperiment('b', 'B')],
        totalExperiments: 1,
        totalPages: 1,
        currentPage: 0,
      });

      expect(service.experiments().map((experiment) => experiment.id)).toEqual(['b']);
    });

    it('sends algorithm and shared filters to the server as request params', () => {
      service.getUserExperiments(0, 10, true, { algorithm: 'mock_anova', shared: 'shared' });

      const request = httpMock.expectOne((candidate) => candidate.url === apiUrl);
      expect(request.request.params.get('algorithm')).toBe('mock_anova');
      expect(request.request.params.get('shared')).toBe('true');
      expect(request.request.params.get('mine')).toBe('true');

      request.flush({
        experiments: [backendExperiment('a', 'A')],
        totalExperiments: 1,
        totalPages: 1,
        currentPage: 0,
      });

      expect(service.experiments().map((experiment) => experiment.id)).toEqual(['a']);
    });
  });

  it('resolves members that are already loaded without asking the backend', () => {
    service.experiments.set([frontendExperiment('a'), frontendExperiment('b')]);
    let resolved: Experiment[] | undefined;

    service.hydrateExperiments(['b', 'a']).subscribe((experiments) => (resolved = experiments));

    expect(resolved!.map((exp) => exp.id)).toEqual(['b', 'a']);
  });

  it('fetches a member from another page, upserts it, and keeps folder order', () => {
    service.experiments.set([frontendExperiment('a')]);
    let resolved: Experiment[] | undefined;

    service.hydrateExperiments(['a', 'b', 'c']).subscribe((experiments) => (resolved = experiments));

    httpMock.expectNone(`${apiUrl}/a`);
    httpMock.expectOne(`${apiUrl}/b`).flush(backendExperiment('b', 'Off page b'));
    httpMock.expectOne(`${apiUrl}/c`).flush(backendExperiment('c', 'Off page c'));

    expect(resolved!.map((exp) => exp.id)).toEqual(['a', 'b', 'c']);
    // The compare workspace only sees the loaded list, so the members had to be added to it.
    expect(service.experiments().map((exp) => exp.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('drops a member the backend no longer returns instead of failing the comparison', () => {
    service.experiments.set([frontendExperiment('a')]);
    let resolved: Experiment[] | undefined;

    service.hydrateExperiments(['a', 'gone']).subscribe((experiments) => (resolved = experiments));

    httpMock.expectOne(`${apiUrl}/gone`).flush('not found', { status: 404, statusText: 'Not Found' });

    expect(resolved!.map((exp) => exp.id)).toEqual(['a']);
  });

  it('propagates a real fetch failure instead of treating it as a deleted member', () => {
    service.experiments.set([frontendExperiment('a')]);
    let error: unknown;

    service.hydrateExperiments(['a', 'unreachable']).subscribe({
      error: (err) => (error = err),
    });

    httpMock.expectOne(`${apiUrl}/unreachable`).flush('server down', {
      status: 500,
      statusText: 'Server Error',
    });

    expect((error as { status?: number } | undefined)?.status).toBe(500);
    expect(service.experiments().map((exp) => exp.id)).toEqual(['a']);
  });
});
