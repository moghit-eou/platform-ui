import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ExperimentStudioService } from '../../../services/experiment-studio.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { AlgorithmResultComponent } from '../algorithm-panel/algorithm-result/algorithm-result.component';
import { ExecutionPanelComponent } from './execution-panel.component';

/** The result view has its own suite; here it only needs to exist so the shell renders. */
@Component({
  standalone: true,
  selector: 'app-algorithm-result',
  template: '<div class="fake-result"></div>',
  inputs: ['result', 'schema', 'algorithm', 'enumMaps', 'yVar', 'xVar', 'labelMap', 'algorithmLabel'],
})
class FakeResultComponent {}

describe('ExecutionPanelComponent', () => {
  let fixture: ComponentFixture<ExecutionPanelComponent>;
  const studio = {
    isRunning: signal(false),
    runResult: signal<Record<string, unknown> | null>(null),
    runSetup: signal(null),
    runError: signal<string | null>(null),
    lastRunSchema: signal<unknown>(null),
    runStatusText: signal('Running the experiment…'),
    saveSucceeded: signal(false),
    lastUsedAlgorithm: signal('flat_algo'),
    backendAlgorithms: signal<Record<string, { label: string }>>({ flat_algo: { label: 'Flat Algo' } }),
    algorithmY: signal<never[]>([]),
    algorithmX: signal<never[]>([]),
    variableLabelMap: signal<Record<string, string>>({}),
    getCategoricalEnumMaps: () => ({}),
  };
  const studioNavigation = { navigateToSection: jasmine.createSpy('navigateToSection') };

  /** Zoneless: every state is a signal write, so rendering is driven through the stub. */
  function render(state: Partial<{ running: boolean; result: Record<string, unknown> | null; error: string | null }> = {}): HTMLElement {
    studio.isRunning.set(state.running ?? false);
    studio.runResult.set(state.result ?? null);
    studio.runError.set(state.error ?? null);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    studio.isRunning.set(false);
    studio.runResult.set(null);
    studio.runError.set(null);
    studioNavigation.navigateToSection.calls.reset();

    await TestBed.configureTestingModule({
      imports: [ExecutionPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ExperimentStudioService, useValue: studio },
        { provide: ExperimentStudioNavigationService, useValue: studioNavigation },
        { provide: RuntimeEnvService, useValue: { mipVersion: 'test' } },
      ],
    }).compileComponents();
    TestBed.overrideComponent(ExecutionPanelComponent, {
      remove: { imports: [AlgorithmResultComponent] },
      add: { imports: [FakeResultComponent] },
    });

    fixture = TestBed.createComponent(ExecutionPanelComponent);
  });

  it('asks for a run while there is no result', () => {
    const html = render();

    expect(html.querySelector('.execution-empty')).toBeTruthy();
    expect(html.querySelector('.fake-result')).toBeFalsy();
  });

  it('shows the run skeleton with its status text instead of the empty state', () => {
    const html = render({ running: true, result: { title: 'Ignored while running' } });

    expect(html.querySelector('.panel-loader')).toBeTruthy();
    expect(html.querySelector('.panel-loader p')?.textContent?.trim()).toBe('Running the experiment…');
    expect(html.querySelector('.execution-empty')).toBeFalsy();
  });

  it('reports a failed run and returns to the algorithm step', () => {
    const html = render({ error: 'Backend exploded' });

    expect(html.querySelector('.execution-error')?.textContent).toContain('Backend exploded');

    html.querySelector<HTMLButtonElement>('.execution-error-action')!.click();
    expect(studioNavigation.navigateToSection).toHaveBeenCalledWith('algorithm-section');
  });

  it('keeps the setup rail out of the result workspace until a run captured one', () => {
    const html = render({ result: {} });

    expect(html.querySelector('.experiment-panel-aside')).toBeFalsy();
  });

  it('names an untitled result after its algorithm and keeps the result actions', () => {
    const html = render({ result: {} });

    expect(html.querySelector('.fake-result')).toBeTruthy();
    expect(html.querySelector('.result-section-title')?.textContent?.trim()).toBe('Result Flat Algo');
    expect(html.querySelector('[data-guide="save-as-action"]')).toBeTruthy();
    expect(html.querySelector('[data-guide="result-export"]')).toBeTruthy();
  });

  it('prefers an explicit result title', () => {
    const html = render({ result: { title: '  My run  ' } });

    expect(html.querySelector('.result-section-title')?.textContent?.trim()).toBe('My run');
  });

  it('emits the trimmed name on save-as and refuses a blank one', () => {
    render({ result: {} });
    const saved: string[] = [];
    fixture.componentInstance.saveAs.subscribe((name: string) => saved.push(name));

    fixture.componentInstance.toggleSaveAsMode();
    fixture.detectChanges();
    expect(htmlOf().querySelector('[data-guide="save-as-form"]')).toBeTruthy();
    expect(fixture.componentInstance.saveAsName()).toBe('Experiment for Flat Algo');

    fixture.componentInstance.saveAsName.set('   ');
    fixture.componentInstance.onSaveAs();
    expect(saved).toEqual([]);

    fixture.componentInstance.saveAsName.set('  My copy  ');
    fixture.componentInstance.onSaveAs();
    expect(saved).toEqual(['My copy']);
  });

  it('leaves save-as mode when going back to the algorithm step', () => {
    render({ result: {} });
    fixture.componentInstance.toggleSaveAsMode();
    fixture.detectChanges();

    fixture.componentInstance.backToAlgorithm();

    expect(fixture.componentInstance.saveAsMode()).toBeFalse();
    expect(studioNavigation.navigateToSection).toHaveBeenCalledWith('algorithm-section');
  });

  function htmlOf(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
});
