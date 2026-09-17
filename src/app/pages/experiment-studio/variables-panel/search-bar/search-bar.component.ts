import {
  Component,
  ElementRef,
  SimpleChanges,
  OnChanges,
  inject,
  ChangeDetectionStrategy,
  output,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MetadataSearchResult,
  NormalizedMetadataIndex,
} from '../../visualisations/metadata-browser/metadata-browser.model';
import {
  normalizeMetadataTree,
  searchMetadataIndex,
} from '../../visualisations/metadata-browser/metadata-browser-normalizer';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  imports: [FormsModule],
  styleUrl: './search-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onOutsideClick($event)',
  },
})
export class SearchBarComponent implements OnChanges {
  private eRef = inject(ElementRef);

  readonly dataModelHierarchy = input<any>();
  readonly searchResultSelected = output<MetadataSearchResult>();

  searchQuery = '';
  filteredItems: MetadataSearchResult[] = [];
  searchSuggestionsVisible = false;
  filterType: 'variables' | 'groups' = 'variables';
  variableTypeFilter = '';
  variableTypes: string[] = [];
  activeIndex = -1;

  get kindIndex(): number {
    return this.filterType === 'groups' ? 1 : 0;
  }

  /** The option the input's aria-activedescendant must point at, or null when nothing is active. */
  activeDescendantId(): string | null {
    return this.searchSuggestionsVisible && this.activeIndex >= 0 ? `search-result-${this.activeIndex}` : null;
  }

  get typeIndex(): number {
    return this.variableTypes.indexOf(this.variableTypeFilter);
  }

  private metadataIndex: NormalizedMetadataIndex | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['dataModelHierarchy']?.currentValue) {
      this.rebuildIndex(this.dataModelHierarchy());
    }
  }


  clearSearch(): void {
    this.searchQuery = '';
    this.handleSearch('');
    this.focusInput();
  }

  hideSuggestions(): void {
    this.searchSuggestionsVisible = false;
    this.activeIndex = -1;
  }

  /** Result is bound via [innerHTML]; escape first, then add <mark> tags. */
  highlight(name: string): string {
    const safe = String(name ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    if (!this.searchQuery) return safe;
    const re = new RegExp(`(${this.escapeRegExp(this.searchQuery)})`, 'gi');
    return safe.replace(re, '<mark>$1</mark>');
  }

  onOutsideClick(event: Event): void {
    if (!this.eRef.nativeElement.contains(event.target)) {
      this.hideSuggestions();
    }
  }

  handleSearch(query: string): void {
    this.searchQuery = query;
    this.applyFilter(this.filterType);
  }

  applyFilter(type: 'variables' | 'groups'): void {
    this.filterType = type;
    const index = this.metadataIndex;
    if (!index) {
      this.filteredItems = [];
      this.activeIndex = -1;
      return;
    }

    const results = searchMetadataIndex(index, this.searchQuery);
    this.filteredItems = results.filter((result) => {
      if (type === 'groups') {
        return result.kind === 'group';
      }
      if (result.kind !== 'variable') {
        return false;
      }
      if (!this.variableTypeFilter) {
        return true;
      }
      return index.variablesById[result.id]?.type === this.variableTypeFilter;
    });
    this.activeIndex = this.filteredItems.length ? 0 : -1;
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideSuggestions();
      return;
    }
    if (!this.searchSuggestionsVisible || !this.filteredItems.length) {
      if (event.key === 'ArrowDown') {
        this.searchSuggestionsVisible = true;
        this.applyFilter(this.filterType);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % this.filteredItems.length;
      this.scrollActiveIntoView();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = this.activeIndex <= 0
        ? this.filteredItems.length - 1
        : this.activeIndex - 1;
      this.scrollActiveIntoView();
      return;
    }
    if (event.key === 'Enter' && this.activeIndex >= 0) {
      event.preventDefault();
      this.onItemClick(this.filteredItems[this.activeIndex]);
    }
  }

  setFilterType(type: 'variables' | 'groups'): void {
    this.variableTypeFilter = '';
    this.applyFilter(type);
  }

  setVariableTypeFilter(type: string): void {
    this.variableTypeFilter = this.variableTypeFilter === type ? '' : type;
    this.applyFilter('variables');
  }

  onItemClick(item: MetadataSearchResult): void {
    this.searchQuery = item.label;
    this.hideSuggestions();
    this.searchResultSelected.emit(item);
  }

  breadcrumbPath(item: MetadataSearchResult): string {
    if (!item.pathLabels || item.pathLabels.length <= 1) {
      return item.path || 'Root';
    }
    // Return ancestor hierarchy without the item label itself
    return item.pathLabels.slice(0, -1).join(' › ');
  }

  groupVariableCount(item: MetadataSearchResult): number {
    return this.metadataIndex?.groupsById[item.id]?.totalVariableCount ?? 0;
  }

  variableType(item: MetadataSearchResult): string {
    return this.metadataIndex?.variablesById[item.id]?.type ?? '';
  }

  generateTooltip(item: MetadataSearchResult): string {
    if (item.kind === 'group') {
      const count = this.groupVariableCount(item);
      return `Group: ${item.label}\nPath: ${item.path}\nVariables: ${count}`;
    }
    const variable = this.metadataIndex?.variablesById[item.id];
    return `Variable: ${item.label}\nPath: ${item.path}\nType: ${variable?.type ?? 'unknown'}`;
  }

  onSearchFocus(): void {
    this.searchSuggestionsVisible = true;
    this.handleSearch(this.searchQuery);
  }

  private scrollActiveIntoView(): void {
    setTimeout(() => {
      const activeEl = this.eRef.nativeElement.querySelector('.search-result-item.is-active');
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }

  private focusInput(): void {
    setTimeout(() => {
      const inputEl = this.eRef.nativeElement.querySelector('#search-bar') as HTMLInputElement | null;
      inputEl?.focus();
    }, 0);
  }

  private rebuildIndex(hierarchy: any): void {
    if (!hierarchy) {
      this.metadataIndex = null;
      this.variableTypes = [];
      this.filteredItems = [];
      return;
    }

    this.metadataIndex = normalizeMetadataTree(hierarchy);
    this.variableTypes = [
      ...new Set(
        this.metadataIndex.variableIds
          .map((id) => this.metadataIndex!.variablesById[id]?.type)
          .filter((type): type is string => !!type)
      ),
    ].sort((a, b) => a.localeCompare(b));
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
