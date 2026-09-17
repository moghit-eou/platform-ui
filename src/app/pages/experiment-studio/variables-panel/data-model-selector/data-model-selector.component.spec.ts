import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DataModelSelectorComponent } from './data-model-selector.component';
import { DataModel } from '../../../../models/data-model.interface';

describe('DataModelSelectorComponent', () => {
  let fixture: ComponentFixture<DataModelSelectorComponent>;
  let component: DataModelSelectorComponent;

  const persistedModel: DataModel = {
    uuid: 'persisted-stroke',
    code: 'stroke',
    version: '3.7',
    label: 'Stroke 3.7',
    released: true,
  };

  const catalogModel: DataModel = {
    uuid: 'catalog-stroke',
    code: 'stroke',
    version: '3.7',
    label: 'Stroke 3.7',
    released: true,
  };

  const tbiModel: DataModel = {
    uuid: 'tbi-model',
    code: 'tbi',
    version: '2.0',
    label: 'Traumatic Brain Injury',
    released: true,
  };

  const longitudinalModel: DataModel = {
    uuid: 'long-model',
    code: 'long',
    version: '1.0',
    label: 'Longitudinal Example',
    released: true,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DataModelSelectorComponent],
      providers: [provideZonelessChangeDetection()],
    });

    fixture = TestBed.createComponent(DataModelSelectorComponent);
    component = fixture.componentInstance;
  });

  it('replaces an equivalent persisted model with the catalog option instance without re-emitting', () => {
    spyOn(component.dataModelChange, 'emit');
    component.selectedDataModel = persistedModel;
    fixture.componentRef.setInput('crossSectionalModels', [catalogModel]);
    fixture.componentRef.setInput('defaultModel', catalogModel);

    fixture.detectChanges();

    expect(component.selectedDataModel).toBe(catalogModel);
    expect(component.dataModelChange.emit).not.toHaveBeenCalled();
  });

  it('renders one chip per model and marks the selected chip', () => {
    fixture.componentRef.setInput('crossSectionalModels', [catalogModel, tbiModel]);
    fixture.componentRef.setInput('longitudinalModels', [longitudinalModel]);
    fixture.componentRef.setInput('defaultModel', catalogModel);
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.studio-chip');
    expect(chips.length).toBe(3);
    expect(chips[0].textContent).toContain('Stroke 3.7');
    expect(chips[0].classList.contains('is-selected')).toBeTrue();
    expect(chips[0].querySelector('input')!.checked).toBeTrue();
    expect(chips[1].querySelector('input')!.checked).toBeFalse();
  });

  it('selects a model via its chip and emits the change', () => {
    const emitSpy = spyOn(component.dataModelChange, 'emit');
    fixture.componentRef.setInput('crossSectionalModels', [catalogModel, tbiModel]);
    fixture.componentRef.setInput('defaultModel', catalogModel);
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.studio-chip');
    (chips[1] as HTMLElement).click();
    fixture.detectChanges();

    expect(component.selectedDataModel).toBe(tbiModel);
    expect(emitSpy).toHaveBeenCalledWith(tbiModel);
  });
});
