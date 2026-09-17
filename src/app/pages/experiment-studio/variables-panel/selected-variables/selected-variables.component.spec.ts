import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { SelectedVariablesComponent } from './selected-variables.component';

describe('SelectedVariablesComponent', () => {
  let experimentStudioService: {
    selectedVariables: ReturnType<typeof signal<any[]>>;
    selectedDatasets: ReturnType<typeof signal<string[]>>;
    setVariables: jasmine.Spy;
    addVariableAndEnrich: jasmine.Spy;
  };

  beforeEach(() => {
    experimentStudioService = {
      selectedVariables: signal<any[]>([]),
      selectedDatasets: signal<string[]>([]),
      setVariables: jasmine.createSpy('setVariables').and.callFake((vars: any[]) =>
        experimentStudioService.selectedVariables.set(vars),
      ),
      addVariableAndEnrich: jasmine.createSpy('addVariableAndEnrich'),
    };

    TestBed.configureTestingModule({
      imports: [SelectedVariablesComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: experimentStudioService },
      ],
    });
  });

  function openPopover(fixture: ReturnType<typeof TestBed.createComponent<SelectedVariablesComponent>>): void {
    fixture.nativeElement.querySelector('.selected-variables-trigger').click();
    fixture.detectChanges();
  }

  it('toggles the popover from the count trigger', () => {
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.selected-variables-popover')).toBeNull();

    openPopover(fixture);

    expect(fixture.componentInstance.isOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('.selected-variables-popover')).not.toBeNull();
  });

  it('shows an empty hint when the pool is empty', () => {
    experimentStudioService.selectedVariables.set([]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();
    openPopover(fixture);

    const emptyEl: HTMLElement | null = fixture.nativeElement.querySelector('.parameter-empty');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl?.textContent).toContain('No variables in this experiment yet');
  });

  it('reports the selected chip count', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'age_value', label: 'Age', type: 'real' },
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.variables().length).toBe(2);
    const countEl: HTMLElement | null = fixture.nativeElement.querySelector('.selected-variables-trigger-count');
    expect(countEl?.textContent).toBe('2');

    openPopover(fixture);
    const rows = fixture.nativeElement.querySelectorAll('.selected-vars-row');
    expect(rows.length).toBe(2);
  });

  it('lists every selected variable in the popover', () => {
    experimentStudioService.selectedVariables.set(Array.from({ length: 7 }, (_, i) => ({ code: `v${i}`, label: `Var ${i}`, type: 'real' })));
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();
    openPopover(fixture);

    expect(fixture.nativeElement.querySelectorAll('.selected-vars-row').length).toBe(7);
    expect(fixture.nativeElement.querySelector('.selected-vars-pager')).toBeNull();
  });

  it('renders no Values column in the table', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'sex_value', label: 'Sex', type: 'string', enumerations: [{ code: '1', label: 'Male' }] },
      { code: 'age_value', label: 'Age', type: 'real', minValue: 0, maxValue: 90 },
    ]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();
    openPopover(fixture);

    const headers = [...fixture.nativeElement.querySelectorAll('.selected-vars-table th')].map((el: any) => el.textContent?.trim());
    expect(headers.filter(Boolean)).toEqual(['Variable', 'Type']);
    expect(fixture.nativeElement.querySelector('.selected-var-value-chip')).toBeNull();
  });

  it('removes a single variable from the pool', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'age_value', label: 'Age', type: 'real' },
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();

    fixture.componentInstance.removeItem({ code: 'age_value' });

    expect(experimentStudioService.setVariables).toHaveBeenCalledWith([
      { code: 'sex_value', label: 'Sex', type: 'string' },
    ]);
  });

  it('clears the whole pool', () => {
    experimentStudioService.selectedVariables.set([
      { code: 'age_value', label: 'Age', type: 'real' },
    ]);
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();

    fixture.componentInstance.clearList();

    expect(experimentStudioService.setVariables).toHaveBeenCalledWith([]);
  });

  it('closes the popover on Escape', () => {
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();
    openPopover(fixture);
    expect(fixture.componentInstance.isOpen()).toBeTrue();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.isOpen()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.selected-variables-popover')).toBeNull();
  });

  it('closes on an outside click but stays open on an inside click', () => {
    const fixture = TestBed.createComponent(SelectedVariablesComponent);
    fixture.detectChanges();
    openPopover(fixture);

    // A click on the popover's own content must not close it.
    const popover = fixture.nativeElement.querySelector('.selected-variables-popover') as HTMLElement;
    popover.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.isOpen()).toBeTrue();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.isOpen()).toBeFalse();
  });
});
