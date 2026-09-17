import { provideZonelessChangeDetection, SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SearchBarComponent } from './search-bar.component';
import { MetadataSearchResult } from '../../visualisations/metadata-browser/metadata-browser.model';

describe('SearchBarComponent', () => {
  const mockHierarchy = {
    code: 'root',
    label: 'Stroke 3.7',
    children: [
      {
        code: 'demographics',
        label: 'Demographics',
        children: [
          {
            code: 'age',
            label: 'Age at onset',
            type: 'integer',
          },
          {
            code: 'gender',
            label: 'Gender',
            type: 'nominal',
          },
        ],
      },
      {
        code: 'vitals',
        label: 'Vitals',
        children: [
          {
            code: 'blood_pressure',
            label: 'Blood Pressure',
            type: 'real',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SearchBarComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  function setupComponent(): {
    fixture: ReturnType<typeof TestBed.createComponent<SearchBarComponent>>;
    component: SearchBarComponent;
  } {
    const fixture = TestBed.createComponent(SearchBarComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('dataModelHierarchy', mockHierarchy);
    component.ngOnChanges({
      dataModelHierarchy: new SimpleChange(null, mockHierarchy, true),
    });
    fixture.detectChanges();
    return { fixture, component };
  }

  it('indexes hierarchy and discovers variable types', () => {
    const { component } = setupComponent();
    expect(component.variableTypes).toEqual(['integer', 'nominal', 'real']);
  });

  it('filters variables by search query', () => {
    const { component } = setupComponent();
    component.onSearchFocus();
    component.handleSearch('age');

    expect(component.filteredItems.length).toBe(1);
    expect(component.filteredItems[0].label).toBe('Age at onset');
    expect(component.filteredItems[0].kind).toBe('variable');
  });

  it('filters groups when filterType is groups', () => {
    const { component } = setupComponent();
    component.onSearchFocus();
    component.setFilterType('groups');

    expect(component.filteredItems.length).toBeGreaterThan(0);
    expect(component.filteredItems.every((item) => item.kind === 'group')).toBeTrue();
    const groupLabels = component.filteredItems.map((item) => item.label);
    expect(groupLabels).toContain('Demographics');
  });

  it('filters variables by type filter', () => {
    const { component } = setupComponent();
    component.onSearchFocus();
    component.handleSearch('');
    component.setVariableTypeFilter('nominal');

    expect(component.filteredItems.length).toBe(1);
    expect(component.filteredItems[0].label).toBe('Gender');

    // Toggle off / clear type filter
    component.setVariableTypeFilter('nominal');
    expect(component.filteredItems.length).toBe(3);
  });

  it('emits searchResultSelected when an item is clicked', () => {
    const { component } = setupComponent();
    let selected: MetadataSearchResult | undefined;
    component.searchResultSelected.subscribe((item) => (selected = item));

    component.onSearchFocus();
    component.handleSearch('Gender');
    expect(component.filteredItems.length).toBe(1);

    component.onItemClick(component.filteredItems[0]);

    expect(selected).toBeDefined();
    expect(selected?.label).toBe('Gender');
    expect(component.searchSuggestionsVisible).toBeFalse();
  });

  it('supports keyboard navigation with arrow keys and Enter', () => {
    const { component } = setupComponent();
    let selected: MetadataSearchResult | undefined;
    component.searchResultSelected.subscribe((item) => (selected = item));

    component.onSearchFocus();
    component.handleSearch('');
    expect(component.filteredItems.length).toBe(3);
    expect(component.activeIndex).toBe(0);

    // Arrow down moves selection
    component.onSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.activeIndex).toBe(1);

    // Enter selects the active item
    component.onSearchKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(selected).toBeDefined();
    expect(selected?.label).toBe(component.filteredItems[1].label);
  });

  it('closes suggestions on Escape key', () => {
    const { component } = setupComponent();
    component.onSearchFocus();
    expect(component.searchSuggestionsVisible).toBeTrue();

    component.onSearchKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.searchSuggestionsVisible).toBeFalse();
  });

  it('highlights matched substring within label', () => {
    const { component } = setupComponent();
    component.searchQuery = 'Age';
    const highlighted = component.highlight('Age at onset');
    expect(highlighted).toContain('<mark>Age</mark>');
  });

  it('escapes HTML in labels because the result is bound via innerHTML', () => {
    const { component } = setupComponent();
    // Even with no query, the raw label must not reach [innerHTML].
    const plain = component.highlight('Age <script>');
    expect(plain).toContain('&lt;script&gt;');
    expect(plain).not.toContain('<script');

    component.searchQuery = 'Age';
    const highlighted = component.highlight('Age <script>');
    expect(highlighted).toContain('<mark>Age</mark>');
    expect(highlighted).toContain('&lt;script&gt;');
    expect(highlighted).not.toContain('<script');
  });

  it('formats breadcrumbs properly for variable results', () => {
    const { component } = setupComponent();
    const item: MetadataSearchResult = {
      id: 'variable:age',
      kind: 'variable',
      label: 'Age at onset',
      path: 'Stroke 3.7 > Demographics > Age at onset',
      pathLabels: ['Stroke 3.7', 'Demographics', 'Age at onset'],
      matchText: 'Age at onset',
      parentGroupId: 'demographics',
    };

    const breadcrumb = component.breadcrumbPath(item);
    expect(breadcrumb).toBe('Stroke 3.7 › Demographics');
  });

  it('clears search input and updates results on clearSearch', () => {
    const { component } = setupComponent();
    component.onSearchFocus();
    component.handleSearch('Age');
    expect(component.searchQuery).toBe('Age');

    component.clearSearch();
    expect(component.searchQuery).toBe('');
    expect(component.filteredItems.length).toBe(3);
  });

  it('wires the combobox contract so the active option is announced', () => {
    // Opened before the first render: the zoneless harness does not reliably
    // re-render attribute bindings on a second detectChanges().
    const fixture = TestBed.createComponent(SearchBarComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('dataModelHierarchy', mockHierarchy);
    component.ngOnChanges({
      dataModelHierarchy: new SimpleChange(null, mockHierarchy, true),
    });
    component.onSearchFocus();
    component.handleSearch('age');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#search-bar');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe('search-results-listbox');
    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-0');

    const active = fixture.nativeElement.querySelector('#search-result-0');
    expect(active.getAttribute('role')).toBe('option');
    expect(active.getAttribute('aria-selected')).toBe('true');
  });
});
