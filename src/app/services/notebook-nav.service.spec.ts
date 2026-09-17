import { TestBed } from '@angular/core/testing';

import { NotebookNavService } from './notebook-nav.service';

describe('NotebookNavService', () => {
  let service: NotebookNavService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotebookNavService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to not visited', () => {
    expect(service.hasVisited()).toBeFalse();
  });

  it('marks visited and persists to localStorage', () => {
    service.markVisited();

    expect(service.hasVisited()).toBeTrue();
    expect(localStorage.getItem('mip.notebook.nav.seen')).toBe('true');
  });

  it('does not throw when markVisited is called twice', () => {
    service.markVisited();
    service.markVisited();

    expect(service.hasVisited()).toBeTrue();
  });

  it('reads visited state from localStorage on init', () => {
    localStorage.setItem('mip.notebook.nav.seen', 'true');
    const fresh = new NotebookNavService();

    expect(fresh.hasVisited()).toBeTrue();
  });

  it('does not throw when localStorage is unavailable', () => {
    spyOn(localStorage, 'setItem').and.throwError('quota');

    expect(() => service.markVisited()).not.toThrow();
    expect(service.hasVisited()).toBeFalse();
  });
});
