import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DatasetSelectorComponent } from './dataset-selector.component';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

describe('DatasetSelectorComponent', () => {
  let fixture: ComponentFixture<DatasetSelectorComponent>;
  let component: DatasetSelectorComponent;
  let expStudioService: jasmine.SpyObj<ExperimentStudioService>;

  const setInputs = (inputs: {
    datasets?: { code: string; label: string }[];
    selectedDatasetCodes?: string[];
  }): void => {
    Object.entries(inputs).forEach(([name, value]) => {
      fixture.componentRef.setInput(name, value);
    });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    expStudioService = jasmine.createSpyObj('ExperimentStudioService', ['setSelectedDatasets']);

    await TestBed.configureTestingModule({
      imports: [DatasetSelectorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: expStudioService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DatasetSelectorComponent);
    component = fixture.componentInstance;
  });

  it('does not select datasets the service has not asked for', () => {
    setInputs({
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    expect(component.selectedDatasets().size).toBe(0);
    expect(expStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('uses hydrated dataset codes instead of replacing them with all datasets', () => {
    setInputs({
      selectedDatasetCodes: ['ds2'],
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    expect(component.isDatasetSelected('ds1')).toBeFalse();
    expect(component.isDatasetSelected('ds2')).toBeTrue();
    expect(expStudioService.setSelectedDatasets).not.toHaveBeenCalled();
  });

  it('renders a chip per dataset and toggles the selection on click', () => {
    expStudioService.setSelectedDatasets.calls.reset();
    // Mirror the real service: writing the selection is what feeds the input back.
    expStudioService.setSelectedDatasets.and.callFake((codes: string[]) =>
      fixture.componentRef.setInput('selectedDatasetCodes', codes)
    );
    setInputs({
      selectedDatasetCodes: ['ds1'],
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    const chips = fixture.nativeElement.querySelectorAll('.studio-chip') as NodeListOf<HTMLElement>;
    expect(chips.length).toBe(2);
    expect(chips[0].classList.contains('is-selected')).toBeTrue();
    expect(chips[1].classList.contains('is-selected')).toBeFalse();

    chips[1].click();
    fixture.detectChanges();

    expect(component.isDatasetSelected('ds2')).toBeTrue();
    expect(expStudioService.setSelectedDatasets).toHaveBeenCalledWith(['ds1', 'ds2']);
  });

  it('selects all datasets when selectAll is called', () => {
    setInputs({
      selectedDatasetCodes: ['ds1'],
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    component.selectAll();
    expect(expStudioService.setSelectedDatasets).toHaveBeenCalledWith(['ds1', 'ds2']);
  });

  it('clears all datasets when clearAll is called', () => {
    setInputs({
      selectedDatasetCodes: ['ds1', 'ds2'],
      datasets: [
        { code: 'ds1', label: 'Dataset 1' },
        { code: 'ds2', label: 'Dataset 2' },
      ],
    });

    component.clearAll();
    expect(expStudioService.setSelectedDatasets).toHaveBeenCalledWith([]);
  });

  it('shows empty state when datasets array is empty', () => {
    setInputs({
      datasets: [],
      selectedDatasetCodes: [],
    });

    const emptyState = fixture.nativeElement.querySelector('.dataset-empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('No datasets available');
  });
});

