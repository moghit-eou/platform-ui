import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { FilterConfigModalComponent } from './filter-config-modal.component';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

describe('FilterConfigModalComponent block builder', () => {
  let fixture: ComponentFixture<FilterConfigModalComponent>;
  let component: FilterConfigModalComponent;
  let expStudio: any;

  beforeEach(async () => {
    expStudio = {
      selectedDataModel: signal({
        code: 'dm',
        label: 'Data model',
        variables: [
          { code: 'age', label: 'Age', type: 'real' },
          {
            code: 'sex',
            label: 'Sex',
            type: 'nominal',
            enumerations: [
              { code: 'female', label: 'Female' },
              { code: 'male', label: 'Male' },
            ],
          },
        ],
      }),
      selectedVariables: signal<any[]>([
        {
          code: 'sex',
          label: 'Sex',
          type: 'nominal',
          enumerations: [
            { code: 'female', label: 'Female' },
            { code: 'male', label: 'Male' },
          ],
        },
        { code: 'mrs_score', label: 'mRS score', type: 'integer' },
        { code: 'notes', label: 'Notes', type: 'text' },
      ]),
      setFilters: jasmine.createSpy('setFilters'),
      setFilterLogic: jasmine.createSpy('setFilterLogic'),
    };

    await TestBed.configureTestingModule({
      imports: [FilterConfigModalComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ExperimentStudioService, useValue: expStudio },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FilterConfigModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.allFilterVariables.set([
      { code: 'age', label: 'Age', type: 'real' },
      {
        code: 'sex',
        label: 'Sex',
        type: 'nominal',
        enumerations: [
          { code: 'female', label: 'Female' },
          { code: 'male', label: 'Male' },
        ],
      },
    ]);
  });

  it('renders an existing nested filter tree as blocks', () => {
    fixture.componentRef.setInput('filterLogic', {
      condition: 'OR',
      rules: [
        { field: 'age', operator: 'greater', value: 2 },
        { condition: 'AND', rules: [{ field: 'sex', operator: 'equal', value: 'female' }] },
      ],
    });
    fixture.detectChanges();

    expect(component.activeRulesCount()).toBe(2);
    expect(component.previewExpression()).toContain('Age > 2');
    expect(component.previewExpression()).toContain('Sex = Female');
  });

  it('associatively flattens nested groups that share the same condition', () => {
    fixture.componentRef.setInput('filterLogic', {
      condition: 'AND',
      rules: [
        {
          condition: 'AND',
          rules: [
            { field: 'age', operator: 'greater', value: 2 },
            { field: 'sex', operator: 'equal', value: 'female' },
          ],
        },
        { field: 'mrs_score', operator: 'less', value: 5 },
      ],
    });
    fixture.detectChanges();

    const root = component.rootGroup();
    expect(root.rules.length).toBe(3);
    expect((root.rules[0] as any).field).toBe('age');
    expect((root.rules[1] as any).field).toBe('sex');
    expect((root.rules[2] as any).field).toBe('mrs_score');
  });

  it('manages active focus block and compact value summary', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    const condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Sex (nominal)');
    component.setConditionOperator(condition.id, 'IN');
    component.toggleCategory(condition.id, 'female');
    component.toggleCategory(condition.id, 'male');

    // Every edit replaces the block, so the summary is checked on the current one.
    expect(component.compactValueSummary(component.rootGroup().rules[0] as any)).toBe('Female, Male');

    // `<details>` owns the resting/expanded switch; the signal only follows it and
    // force-opens the row addCondition just created.
    expect(component.activeBlockId()).toBe(condition.id);
  });

  it('saves edited condition and nested group to backend filter payload', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    let condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Age (real)');
    component.setConditionOperator(condition.id, '>');
    component.setConditionValue(condition.id, '2');

    component.addGroup(root.id, 1);
    const group = component.rootGroup().rules[1] as any;
    component.setGroupCondition(root.id, 'OR');
    component.addCondition(group.id, 0);
    condition = (component.rootGroup().rules[1] as any).rules[0];
    component.onConditionVariableTextChange(condition.id, 'Sex (nominal)');
    component.setConditionValue(condition.id, 'female');

    component.saveFilters();

    expect(expStudio.setFilters).toHaveBeenCalledWith([
      jasmine.objectContaining({ code: 'age' }),
      jasmine.objectContaining({ code: 'sex' }),
    ]);
    expect(expStudio.setFilterLogic).toHaveBeenCalledWith(jasmine.objectContaining({
      condition: 'OR',
      rules: jasmine.any(Array),
      valid: true,
    }));
  });

  it('offers membership operators on nominal variables and exposes their categories', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    let condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Sex (nominal)');
    condition = component.rootGroup().rules[0] as any;

    expect(component.operatorOptions(condition)).toEqual(['=', '!=', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL']);
    expect(component.categoryOptions(condition).map((item) => item.label)).toEqual(['Female', 'Male']);
  });

  it('shows nominal category labels in the preview while keeping stored codes', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    const condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Sex (nominal)');
    component.setConditionValue(condition.id, 'female');

    expect(component.previewExpression()).toContain('Sex = Female');

    component.saveFilters();

    expect(expStudio.setFilterLogic).toHaveBeenCalledWith(jasmine.objectContaining({
      rules: [jasmine.objectContaining({
        field: 'sex',
        value: 'female',
      })],
    }));
  });

  it('exposes null checks for numeric variables', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    let condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Age (real)');
    condition = component.rootGroup().rules[0] as any;

    expect(component.operatorOptions(condition)).toContain('IS NULL');
    expect(component.operatorOptions(condition)).toContain('IS NOT NULL');
  });

  it('renders readable operator labels without changing stored operator values', () => {
    expect(component.operatorDisplayLabel('=')).toBe('Equals');
    expect(component.operatorDisplayLabel('!=')).toBe('Does not equal');
    expect(component.operatorDisplayLabel('>')).toBe('Greater than');
    expect(component.operatorDisplayLabel('>=')).toBe('Greater than or equal to');
    expect(component.operatorDisplayLabel('<')).toBe('Less than');
    expect(component.operatorDisplayLabel('<=')).toBe('Less than or equal to');
    expect(component.operatorDisplayLabel('IS NULL')).toBe('Is null');
    expect(component.operatorDisplayLabel('IS NOT NULL')).toBe('Is not null');
  });

  it('saves null checks without requiring a value', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    const condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Age (real)');
    component.setConditionOperator(condition.id, 'IS NULL');

    component.saveFilters();

    expect(component.filterError()).toBeNull();
    expect(expStudio.setFilterLogic).toHaveBeenCalledWith(jasmine.objectContaining({
      rules: [jasmine.objectContaining({
        field: 'age',
        operator: 'is_null',
        value: null,
      })],
    }));
  });

  it('renders existing null checks as unary preview expressions', () => {
    fixture.componentRef.setInput('filterLogic', {
      condition: 'OR',
      rules: [
        { field: 'age', operator: 'greater', value: 2 },
        { field: 'age', operator: 'is_null', value: null },
      ],
    });
    fixture.detectChanges();

    expect(component.previewExpression()).toContain('Age > 2');
    expect(component.previewExpression()).toContain('Age IS NULL');
  });

  it('keeps a stored OR group inside an AND group instead of flattening it', () => {
    fixture.componentRef.setInput('filterLogic', {
      condition: 'AND',
      rules: [
        { field: 'age', operator: 'greater', value: 10 },
        {
          condition: 'OR',
          rules: [
            { field: 'sex', operator: 'equal', value: 'female' },
            { field: 'sex', operator: 'equal', value: 'male' },
          ],
        },
      ],
    });
    fixture.detectChanges();

    expect(component.previewExpression()).toBe('Age > 10 AND (Sex = Female OR Sex = Male)');

    component.saveFilters();

    expect(expStudio.setFilterLogic).toHaveBeenCalledWith(jasmine.objectContaining({
      condition: 'AND',
      rules: [
        jasmine.objectContaining({ field: 'age', value: 10 }),
        jasmine.objectContaining({
          condition: 'OR',
          rules: jasmine.arrayWithExactContents([
            jasmine.objectContaining({ field: 'sex', value: 'female' }),
            jasmine.objectContaining({ field: 'sex', value: 'male' }),
          ]),
        }),
      ],
      valid: true,
    }));
  });

  it('renders as an inline builder with no modal chrome', () => {
    fixture.detectChanges();
    const root = fixture.nativeElement.firstElementChild as HTMLElement;
    expect(root.classList).toContain('inline-filter-builder');
    for (const selector of ['.modal-overlay', '.filter-modal-header', '.filter-helper', '.filter-modal-footer', '.btn-preview']) {
      expect(fixture.nativeElement.querySelector(selector)).toBeNull();
    }
  });

  it('frames nested groups but not the empty root group', () => {
    fixture.detectChanges();
    const root = fixture.nativeElement.querySelector('.filter-block-group.is-root') as HTMLElement;
    expect(root.querySelector('.empty-filter-group')).toBeTruthy();
    expect(root.textContent).toContain('No conditions yet.');
    expect(root.textContent).toContain('Add condition');
    expect(root.textContent).toContain('Group');

    component.addGroup(component.rootGroup().id, 0);
    fixture.detectChanges();

    const nested = fixture.nativeElement.querySelector('.filter-block-group:not(.is-root)') as HTMLElement;
    expect(nested).toBeTruthy();
    expect(nested.textContent).toContain('Nested group');
    expect(nested.querySelector('.empty-filter-group')).toBeTruthy();
  });

  it('offers only the selected variables to a transformation rule builder', async () => {
    fixture.componentRef.setInput('variableScope', 'selectedVariables');
    await fixture.whenStable();
    fixture.detectChanges();

    // `age` exists in the data model but was never selected; `notes` cannot be filtered on.
    const codes = component.allFilterVariables().map((variable: any) => variable.code);
    expect(codes).toEqual(['sex', 'mrs_score']);

    component.addCondition(component.rootGroup().id, 0);
    fixture.detectChanges();
    const suggestions = Array.from(fixture.nativeElement.querySelectorAll('.condition-fields datalist option'))
      .map((option) => (option as HTMLOptionElement).value);
    expect(suggestions).toEqual(['Sex (nominal)', 'mRS score (integer)']);
  });

  it('keeps the whole data model in the pool for the cohort filter station', async () => {
    expStudio.selectedDataModel.set({
      code: 'dm',
      label: 'Data model',
      variables: [{ code: 'mrs_score', label: 'mRS score', type: 'integer' }],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.allFilterVariables().map((variable: any) => variable.code)).toEqual(['mrs_score']);
  });

  it('asks for a variable selection when the scoped pool is empty', async () => {
    expStudio.selectedVariables.set([]);
    fixture.componentRef.setInput('variableScope', 'selectedVariables');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.where-error').textContent)
      .toContain('No variables are selected for the Data Handling pipeline yet.');
  });

  describe('membership rules (In (any of) / Not in (none of))', () => {
    it('names the membership operators the way the builder shows them', () => {
      expect(component.operatorDisplayLabel('IN')).toBe('In (any of)');
      expect(component.operatorDisplayLabel('NOT IN')).toBe('Not in (none of)');
    });

    it('reads a stored in-rule back with its operator and every value picked', () => {
      fixture.componentRef.setInput('filterLogic', {
        condition: 'AND',
        rules: [{ field: 'sex', operator: 'in', value: ['female', 'male'], type: 'string' }],
      });
      fixture.detectChanges();

      const condition = component.rootGroup().rules[0] as any;
      expect(condition.operator).toBe('IN');
      expect(condition.values).toEqual(['female', 'male']);
      expect(component.isCategorySelected(condition, 'female')).toBeTrue();
      expect(component.previewExpression()).toBe('Sex IN Female, Male');
    });

    it('keeps in/not_in and their arrays intact through a save', () => {
      fixture.componentRef.setInput('filterLogic', {
        condition: 'AND',
        rules: [
          { field: 'sex', operator: 'in', value: ['female'], type: 'string' },
          { field: 'sex', operator: 'not_in', value: ['male'], type: 'string' },
        ],
      });
      fixture.detectChanges();

      component.saveFilters();

      expect(component.filterError()).toBeNull();
      expect(expStudio.setFilterLogic).toHaveBeenCalledWith(jasmine.objectContaining({
        rules: [
          jasmine.objectContaining({ field: 'sex', operator: 'in', value: ['female'] }),
          jasmine.objectContaining({ field: 'sex', operator: 'not_in', value: ['male'] }),
        ],
      }));
    });

    it('lets the user tick any number of categories', () => {
      const root = component.rootGroup();
      component.addCondition(root.id, 0);
      let condition = component.rootGroup().rules[0] as any;
      component.onConditionVariableTextChange(condition.id, 'Sex (nominal)');
      condition = component.rootGroup().rules[0] as any;
      component.setConditionOperator(condition.id, 'IN');

      component.toggleCategory(condition.id, 'female');
      component.toggleCategory(condition.id, 'male');
      expect((component.rootGroup().rules[0] as any).values).toEqual(['female', 'male']);

      component.toggleCategory(condition.id, 'female');
      condition = component.rootGroup().rules[0] as any;
      expect(condition.values).toEqual(['male']);
      expect(component.previewExpression()).toBe('Sex IN Male');
    });

    it('treats a comma-separated line as the same set for a variable without categories', () => {
      const root = component.rootGroup();
      component.addCondition(root.id, 0);
      let condition = component.rootGroup().rules[0] as any;
      component.onConditionVariableTextChange(condition.id, 'Age (real)');
      condition = component.rootGroup().rules[0] as any;
      component.setConditionOperator(condition.id, 'IN');
      component.setMultiValueText(condition.id, '20, 35.5, ');

      condition = component.rootGroup().rules[0] as any;
      expect(condition.values).toEqual(['20', '35.5']);

      component.saveFilters();

      expect(expStudio.setFilterLogic).toHaveBeenCalledWith(jasmine.objectContaining({
        rules: [jasmine.objectContaining({ field: 'age', operator: 'in', value: [20, 35.5] })],
      }));
    });

    it('refuses to save a membership rule with nothing picked', () => {
      const root = component.rootGroup();
      component.addCondition(root.id, 0);
      let condition = component.rootGroup().rules[0] as any;
      component.onConditionVariableTextChange(condition.id, 'Sex (nominal)');
      condition = component.rootGroup().rules[0] as any;
      component.setConditionOperator(condition.id, 'IN');

      component.saveFilters();

      expect(component.filterError()).toBe('Choose at least one value for every condition.');
      expect(expStudio.setFilterLogic).not.toHaveBeenCalled();
    });

    it('keeps one value shape across operators instead of retyping it', () => {
      const root = component.rootGroup();
      component.addCondition(root.id, 0);
      let condition = component.rootGroup().rules[0] as any;
      component.onConditionVariableTextChange(condition.id, 'Sex (nominal)');
      condition = component.rootGroup().rules[0] as any;
      component.setConditionValue(condition.id, 'female');
      component.setConditionOperator(condition.id, 'IN');

      condition = component.rootGroup().rules[0] as any;
      expect(condition.values).toEqual(['female']);

      component.toggleCategory(condition.id, 'male');
      condition = component.rootGroup().rules[0] as any;
      component.setConditionOperator(condition.id, '=');
      condition = component.rootGroup().rules[0] as any;
      expect(condition.values).toEqual(['female', 'male']);

      // A single-value operator reads the first entry, so nothing had to be reshaped.
      component.saveFilters();
      const saved = (expStudio.setFilterLogic as jasmine.Spy).calls.mostRecent().args[0];
      expect(saved.rules[0]).toEqual(jasmine.objectContaining({ field: 'sex', operator: 'equal', value: 'female' }));
    });
  });

  it('reads a bare category-rule condition into one visible condition', () => {
    fixture.componentRef.setInput('filterLogic', {
      id: 'clinical_sdr',
      field: 'clinical_sdr',
      operator: 'in',
      value: ['1', '2'],
      type: 'string',
    });
    fixture.detectChanges();

    expect(component.activeRulesCount()).toBe(1);
    const condition = component.rootGroup().rules[0] as any;
    expect(condition.operator).toBe('IN');
    expect(condition.values).toEqual(['1', '2']);
  });

  it('exportFilterLogic returns payload without writing cohort filters', () => {
    const root = component.rootGroup();
    component.addCondition(root.id, 0);
    const condition = component.rootGroup().rules[0] as any;
    component.onConditionVariableTextChange(condition.id, 'Age (real)');
    component.setConditionOperator(condition.id, '>');
    component.setConditionValue(condition.id, '2');

    const logic = component.exportFilterLogic();

    expect(logic).toEqual(jasmine.objectContaining({
      condition: jasmine.any(String),
      rules: jasmine.any(Array),
      valid: true,
    }));
    expect(expStudio.setFilters).not.toHaveBeenCalled();
    expect(expStudio.setFilterLogic).not.toHaveBeenCalled();
  });
});
