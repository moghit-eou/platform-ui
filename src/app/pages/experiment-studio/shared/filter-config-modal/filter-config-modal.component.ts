import { DataModel, Group, Variable } from '../../../../models/data-model.interface';
import { ChangeDetectionStrategy, Component, effect, signal, computed, output, inject, input } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  filterOperatorBackendFor,
  filterOperatorSpec,
  filterOperatorSymbolFor,
  filterOperatorSymbolsForType,
  filterOperatorValueKind,
  isMultiValueFilterOperator,
  isUnaryFilterOperator,
} from '../../../../core/filter-logic.utils';

type GroupCondition = 'AND' | 'OR';
type FilterBlock = FilterGroupBlock | FilterConditionBlock;

interface FilterGroupBlock {
  kind: 'group';
  id: string;
  connector?: GroupCondition;
  rules: FilterBlock[];
}

interface FilterConditionBlock {
  kind: 'condition';
  id: string;
  connector?: GroupCondition;
  field: string;
  variableText: string;
  /** A symbol from FILTER_OPERATORS. */
  operator: string;
  /** Always a list: `in` / `not_in` pick many, everything else uses the first entry. */
  values: string[];
}

/** Splits the comma-separated editing form of a membership value into its codes. */
function splitFilterValues(text: string): string[] {
  return text.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/** Backend value → the builder's list form. `null`/`''` mean "nothing typed yet". */
function toFilterValues(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

@Component({
  selector: 'app-filter-config-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './filter-config-modal.component.html',
  styleUrl: './filter-config-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterConfigModalComponent {
  private expStudio = inject(ExperimentStudioService);

  readonly filterLogic = input<any | null>(null);
  /**
   * Which variables the builder may reference. The cohort-filter station needs the
   * whole data model because any CDE can define a cohort. The transformation
   * category-rule builders pass 'selectedVariables' so a rule can only be built from
   * the variables carried into the Data Handling pipeline.
   */
  readonly variableScope = input<'dataModel' | 'selectedVariables'>('dataModel');
  readonly filtersApplied = output<void>();

  readonly allFilterVariables = signal<any[]>([]);
  readonly rootGroup = signal<FilterGroupBlock>(this.createGroup());
  readonly filterError = signal<string | null>(null);
  readonly previewExpression = computed(() => this.groupPreview(this.rootGroup()));
  readonly activeRulesCount = computed(() => this.countRules(this.rootGroup()));
  readonly emptyPoolMessage = computed(() => this.variableScope() === 'selectedVariables'
    ? 'No variables are selected for the Data Handling pipeline yet. Select variables in Data Exploration first.'
    : 'No filterable variables are available for this pathology.');

  constructor() {
    effect(() => {
      this.allFilterVariables.set(this.variableScope() === 'selectedVariables'
        ? this.normalizeFilterVariables(this.expStudio.selectedVariables())
        : this.flattenDataModelVariables(this.expStudio.selectedDataModel()));
    });

    effect(() => {
      this.rootGroup.set(this.backendToGroup(this.filterLogic()));
      this.filterError.set(null);
    });
  }

  /** The one condition row the user is editing; `<details>` follows it and opens new rows. */
  readonly activeBlockId = signal<string | null>(null);

  addCondition(groupId: string, index: number): void {
    const newCondition = this.createCondition();
    this.updateGroup(groupId, (group) => ({
      ...group,
      rules: this.insertAt(group.rules, index, newCondition),
    }));
    this.activeBlockId.set(newCondition.id);
  }

  addGroup(groupId: string, index: number): void {
    this.updateGroup(groupId, (group) => ({
      ...group,
      rules: this.insertAt(group.rules, index, this.createGroup()),
    }));
  }

  removeBlock(blockId: string): void {
    if (this.activeBlockId() === blockId) {
      this.activeBlockId.set(null);
    }
    this.rootGroup.update((root) => this.ensureGroupConnectors(this.removeBlockFromGroup(root, blockId)));
    this.filterError.set(null);
  }

  /** `<summary>` click handler: the browser toggles `open`, this keeps the signal in step. */
  toggleActiveBlock(blockId: string): void {
    this.activeBlockId.update((current) => current === blockId ? null : blockId);
  }

  groupCondition(group: FilterGroupBlock): GroupCondition {
    const secondRule = group.rules[1];
    return secondRule?.connector ?? 'AND';
  }

  setGroupCondition(groupId: string, condition: GroupCondition): void {
    this.updateGroup(groupId, (group) => ({
      ...group,
      rules: group.rules.map((block, index) => index === 0 ? block : { ...block, connector: condition }),
    }));
  }

  variableType(block: FilterConditionBlock): string {
    const filter = this.selectedFilter(block);
    return filter?.type ? String(filter.type).toLowerCase() : '';
  }

  compactValueSummary(block: FilterConditionBlock): string {
    if (this.isUnaryOperator(block.operator)) return '';
    const labels = block.values.map((value) => this.valueLabel(block, value));
    if (labels.length <= 2) return labels.join(', ') || 'None';
    return `${labels.slice(0, 2).join(', ')} (+${labels.length - 2} more)`;
  }

  onConditionVariableTextChange(blockId: string, value: string): void {
    const selected = this.resolveFilterField(value);
    this.updateCondition(blockId, (block) => {
      const options = selected ? filterOperatorSymbolsForType(selected.type) : [];
      const nextOperator = selected && !options.includes(block.operator) ? options[0] : block.operator;
      return {
        ...block,
        variableText: value,
        field: selected?.code ?? '',
        operator: nextOperator ?? '=',
        values: selected ? [] : block.values,
      };
    });
  }

  setConditionOperator(blockId: string, operator: string): void {
    // The value keeps its list form across operators: `=` reads values[0], `IN` reads them all.
    this.updateCondition(blockId, (block) => ({ ...block, operator }));
  }

  setConditionValue(blockId: string, value: string): void {
    this.updateCondition(blockId, (block) => ({ ...block, values: [value] }));
  }

  isUnaryOperator(operator: string): boolean {
    return isUnaryFilterOperator(operator);
  }

  /** `in` / `not_in`: the value is a set, so any number of categories can be picked. */
  isMultiValueOperator(operator: string): boolean {
    return isMultiValueFilterOperator(operator);
  }

  isCategorySelected(block: FilterConditionBlock, category: string): boolean {
    return block.values.includes(category);
  }

  toggleCategory(blockId: string, category: string): void {
    this.updateCondition(blockId, (block) => ({
      ...block,
      values: block.values.includes(category)
        ? block.values.filter((entry) => entry !== category)
        : [...block.values, category],
    }));
  }

  /** Comma-separated editing surface for a membership rule on a variable without enumerations. */
  setMultiValueText(blockId: string, text: string): void {
    this.updateCondition(blockId, (block) => ({ ...block, values: splitFilterValues(text) }));
  }

  visibleFilterVariables(query: string): any[] {
    const normalized = query.trim().toLowerCase();
    return this.allFilterVariables().filter((variable) => {
      if (!normalized) return true;
      return String(variable.code ?? '').toLowerCase().includes(normalized) ||
        String(variable.label ?? variable.name ?? '').toLowerCase().includes(normalized);
    });
  }

  selectedFilter(block: FilterConditionBlock): any | null {
    return this.allFilterVariables().find((filter) => filter.code === block.field) ?? null;
  }

  // An unresolved field is not treated as nominal, so every operator stays available.
  operatorOptions(block: FilterConditionBlock): string[] {
    return filterOperatorSymbolsForType(this.selectedFilter(block)?.type);
  }

  operatorDisplayLabel(operator: string): string {
    return filterOperatorSpec(operator)?.label ?? operator;
  }

  categoryOptions(block: FilterConditionBlock): Array<{ value: string; label: string }> {
    const filter = this.selectedFilter(block);
    return (filter?.enumerations ?? []).map((entry: any) => ({
      value: String(entry.code ?? entry.label ?? entry.name ?? ''),
      label: String(entry.label ?? entry.name ?? entry.code ?? ''),
    })).filter((entry: { value: string; label: string }) => entry.value);
  }

  variableDisplayLabel(variable: any): string {
    const label = variable?.label ?? variable?.name ?? variable?.code ?? '';
    const type = variable?.type ? ` (${variable.type})` : '';
    return `${label}${type}`;
  }

  /**
   * Validate the current builder and return backend filter logic without writing
   * cohort filters on ExperimentStudioService.
   */
  exportFilterLogic(): any | null {
    const validationError = this.validateGroup(this.rootGroup());
    if (validationError) {
      this.filterError.set(validationError);
      return null;
    }

    const normalized = this.normalizeGroup(this.rootGroup());
    this.filterError.set(null);
    return normalized.rules.length > 0 ? this.formatFiltersForBackend(normalized) : null;
  }

  saveFilters(): void {
    const toStore = this.exportFilterLogic();
    if (this.filterError()) {
      return;
    }
    const selectedFilters = toStore
      ? this.extractFilterCodes(toStore)
        .map((code) => this.allFilterVariables().find((variable) => variable.code === code))
        .filter((variable): variable is any => !!variable)
      : [];

    this.expStudio.setFilters(selectedFilters);
    this.expStudio.setFilterLogic(toStore);
    this.filtersApplied.emit(undefined);
    this.filterError.set(null);
  }

  clearFilters(): void {
    this.rootGroup.set(this.createGroup());
    this.expStudio.setFilters([]);
    this.expStudio.setFilterLogic(null);
    this.filterError.set(null);
  }

  private createGroup(rules: FilterBlock[] = []): FilterGroupBlock {
    return this.ensureGroupConnectors({ kind: 'group', id: this.nextId(), rules });
  }

  private createCondition(): FilterConditionBlock {
    return { kind: 'condition', id: this.nextId(), field: '', variableText: '', operator: '=', values: [] };
  }

  private nextId(): string {
    return `filter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private insertAt<T>(items: T[], index: number, item: T): T[] {
    return [...items.slice(0, index), item, ...items.slice(index)];
  }

  private updateGroup(groupId: string, updater: (group: FilterGroupBlock) => FilterGroupBlock): void {
    this.rootGroup.update((root) => this.ensureGroupConnectors(this.mapGroups(root, groupId, updater)));
    this.filterError.set(null);
  }

  private updateCondition(blockId: string, updater: (block: FilterConditionBlock) => FilterConditionBlock): void {
    this.rootGroup.update((root) => this.ensureGroupConnectors(this.mapConditions(root, blockId, updater)));
    this.filterError.set(null);
  }

  private mapGroups(group: FilterGroupBlock, groupId: string, updater: (group: FilterGroupBlock) => FilterGroupBlock): FilterGroupBlock {
    const mapped = {
      ...group,
      rules: group.rules.map((block) => block.kind === 'group' ? this.mapGroups(block, groupId, updater) : block),
    };
    return mapped.id === groupId ? updater(mapped) : mapped;
  }

  private mapConditions(group: FilterGroupBlock, blockId: string, updater: (block: FilterConditionBlock) => FilterConditionBlock): FilterGroupBlock {
    return {
      ...group,
      rules: group.rules.map((block) => {
        if (block.kind === 'condition') return block.id === blockId ? updater(block) : block;
        return this.mapConditions(block, blockId, updater);
      }),
    };
  }

  private removeBlockFromGroup(group: FilterGroupBlock, blockId: string): FilterGroupBlock {
    return {
      ...group,
      rules: group.rules
        .filter((block) => block.id !== blockId)
        .map((block) => block.kind === 'group' ? this.removeBlockFromGroup(block, blockId) : block),
    };
  }

  private ensureGroupConnectors(group: FilterGroupBlock): FilterGroupBlock {
    return {
      ...group,
      connector: undefined,
      rules: group.rules.map((block, index) => {
        const normalizedConnector = index === 0 ? undefined : (block.connector ?? 'AND');
        if (block.kind === 'group') {
          return {
            ...this.ensureGroupConnectors(block),
            connector: normalizedConnector,
          };
        }
        return {
          ...block,
          connector: normalizedConnector,
        };
      }),
    };
  }

  private resolveFilterField(raw: string): any | null {
    const normalized = raw.toLowerCase();
    return this.allFilterVariables().find((filter) =>
      String(filter.code ?? '').toLowerCase() === normalized ||
      String(filter.label ?? '').toLowerCase() === normalized ||
      String(filter.name ?? '').toLowerCase() === normalized ||
      this.variableDisplayLabel(filter).toLowerCase() === normalized
    ) ?? null;
  }

  /**
   * Accepts every shape the backend can hand back: a group of rules, and the bare condition
   * a `categorical_column_creator` category rule stores — one rule becomes a one-condition
   * group, so a persisted derived column reads back into the builder.
   */
  private backendToGroup(logic: any): FilterGroupBlock {
    if (!logic) return this.createGroup();
    if (!Array.isArray(logic.rules)) {
      if (!this.looksLikeCondition(logic)) return this.createGroup();
      return this.ensureGroupConnectors({
        kind: 'group',
        id: this.nextId(),
        rules: [this.backendToBlock(logic)],
      });
    }
    const condition = this.backendCondition(logic);
    // Associative flattening: a child group with the same condition as its parent (or holding
    // a single rule) says nothing the user did not write, so it is folded away.
    const flatten = (rules: any[]): any[] => rules.flatMap((rule: any) => this.looksLikeGroup(rule)
      && (this.backendCondition(rule) === condition || rule.rules.length <= 1)
      ? flatten(rule.rules)
      : [rule]);

    const rules = flatten(logic.rules)
      .filter((rule: any) => this.looksLikeCondition(rule) || this.looksLikeGroup(rule))
      .map((rule: any, index: number) => ({
        ...this.backendToBlock(rule),
        connector: index === 0 ? undefined : condition,
      }));
    return this.ensureGroupConnectors({ kind: 'group', id: this.nextId(), rules });
  }

  private backendCondition(node: any): GroupCondition {
    return String(node?.condition ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
  }

  private looksLikeGroup(node: any): boolean {
    return !!node && typeof node === 'object' && !!node.condition && Array.isArray(node.rules);
  }

  private backendToBlock(rule: any): FilterBlock {
    if (this.looksLikeGroup(rule)) return this.backendToGroup(rule);
    const field = String(rule?.field ?? rule?.id ?? '');
    const variable = this.allFilterVariables().find((entry) => entry.code === field);
    const backendOperator = String(rule?.operator ?? '=');
    return {
      kind: 'condition',
      id: this.nextId(),
      field,
      variableText: variable ? this.variableDisplayLabel(variable) : field,
      operator: filterOperatorSymbolFor(backendOperator),
      values: toFilterValues(rule?.value),
    };
  }

  private looksLikeCondition(node: any): boolean {
    return !!node && typeof node === 'object' && !Array.isArray(node)
      && (node.operator !== undefined || node.field !== undefined || node.id !== undefined);
  }



  private validateGroup(group: FilterGroupBlock): string | null {
    for (const block of group.rules) {
      if (block.kind === 'group') {
        const groupError = this.validateGroup(block);
        if (groupError) return groupError;
        continue;
      }
      if (!block.field) return 'Choose a variable for every condition.';
      if (!block.operator) return 'Choose an operator for every condition.';
      if (this.isUnaryOperator(block.operator)) continue;
      if (this.isMultiValueOperator(block.operator)) {
        if (block.values.length === 0) return 'Choose at least one value for every condition.';
        continue;
      }
      if (!block.values[0]) return 'Choose or enter a value for every condition.';
    }
    return null;
  }

  private normalizeGroup(group: FilterGroupBlock): any {
    return this.groupToBackendLogic(group);
  }

  private normalizeCondition(block: FilterConditionBlock): any {
    const variable = this.selectedFilter(block);
    const kind = filterOperatorValueKind(block.operator);
    return {
      field: block.field,
      // A unary rule sent without its value key is what the engine rejects, so `value` is
      // always written: null for `is null`, the picked set for `in`, one entry for the rest.
      operator: filterOperatorBackendFor(block.operator),
      value: kind === 'none'
        ? null
        : kind === 'values'
          ? block.values.map((entry) => this.coerceValue(variable, entry))
          : this.coerceValue(variable, block.values[0] ?? ''),
    };
  }

  private coerceValue(variable: any | null, value: string): unknown {
    const type = String(variable?.type ?? '').toLowerCase();
    const numeric = Number(value);
    return (type === 'real' || type === 'integer') && value.trim() !== '' && Number.isFinite(numeric)
      ? numeric
      : value;
  }

  private formatFiltersForBackend(rawLogic: { condition: string; rules: any[] }): any {
    return {
      condition: String(rawLogic.condition || 'AND').toUpperCase(),
      rules: rawLogic.rules.map((rule) => this.formatRuleForBackend(rule)),
      valid: true,
    };
  }

  private formatRuleForBackend(rule: any): any {
    if (rule?.condition && Array.isArray(rule.rules)) {
      return {
        condition: String(rule.condition || 'AND').toUpperCase(),
        rules: rule.rules.map((child: any) => this.formatRuleForBackend(child)),
      };
    }

    const fieldKey = rule.field ?? rule.id;
    return {
      id: fieldKey,
      field: fieldKey,
      type: this.detectType(fieldKey),
      input: this.detectInput(fieldKey),
      operator: rule.operator,
      value: rule.value,
      entity: undefined,
    };
  }

  private detectType(field: string): 'string' | 'integer' | 'real' {
    const variable = this.allFilterVariables().find((entry) => entry.code === field);
    if (variable?.type === 'integer') return 'integer';
    if (variable?.type === 'real') return 'real';
    return 'string';
  }

  private detectInput(field: string): 'text' | 'number' | 'select' {
    const variable = this.allFilterVariables().find((entry) => entry.code === field);
    if (variable?.type === 'integer' || variable?.type === 'real') return 'number';
    if (variable?.type === 'nominal') return 'select';
    return 'text';
  }

  private extractFilterCodes(logic: any): string[] {
    const codes = new Set<string>();
    const walk = (node: any): void => {
      if (!node) return;
      if (Array.isArray(node.rules)) {
        node.rules.forEach(walk);
        return;
      }
      const code = node.field ?? node.id;
      if (code) codes.add(String(code));
    };
    walk(logic);
    return Array.from(codes);
  }

  private countRules(group: FilterGroupBlock): number {
    return group.rules.reduce((count, block) => count + (block.kind === 'group' ? this.countRules(block) : 1), 0);
  }

  private groupPreview(group: FilterGroupBlock): string {
    if (!group.rules.length) return '';
    return group.rules.reduce((expression, block, index) => {
      const blockPreview = block.kind === 'group' ? `(${this.groupPreview(block)})` : this.conditionPreview(block);
      if (index === 0) return blockPreview;
      return `${expression} ${block.connector ?? 'AND'} ${blockPreview}`;
    }, '');
  }

  private conditionPreview(block: FilterConditionBlock): string {
    const variable = this.selectedFilter(block);
    const label = variable?.label ?? variable?.name ?? block.field ?? 'Variable';
    if (this.isUnaryOperator(block.operator)) return `${label} ${block.operator}`;
    const values = block.values.map((value) => this.valueLabel(block, value)).join(', ');
    return `${label} ${block.operator} ${values || 'no value chosen'}`;
  }

  /** A stored code as the user reads it; non-enumerated variables have no label to find. */
  private valueLabel(block: FilterConditionBlock, value: string): string {
    return this.categoryOptions(block).find((option) => option.value === value)?.label ?? value;
  }

  private flattenDataModelVariables(model: DataModel | null): any[] {
    if (!model) return [];
    const collected: Variable[] = [];
    const visitGroups = (groups: Group[] = []): void => {
      groups.forEach((group) => {
        collected.push(...(group.variables ?? []));
        visitGroups(group.groups ?? []);
      });
    };

    collected.push(...(model.variables ?? []));
    visitGroups(model.groups ?? []);
    return this.normalizeFilterVariables(collected);
  }

  /**
   * Pool guard shared by both sources: keeps the fields the builder renders and drops
   * types it cannot express. Selected CDE nodes carry experiment metadata (supported
   * algorithms, role flags) that must not leak into a filter condition.
   */
  private normalizeFilterVariables(variables: Variable[]): any[] {
    const seen = new Map<string, any>();
    variables.forEach((variable) => {
      if (!variable?.code || seen.has(variable.code)) return;
      const type = String(variable.type ?? '').toLowerCase();
      if (!['real', 'integer', 'nominal'].includes(type)) return;
      seen.set(variable.code, {
        code: variable.code,
        label: variable.label,
        name: (variable as any).name,
        type: variable.type,
        enumerations: variable.enumerations,
      });
    });
    return Array.from(seen.values());
  }

  private groupToBackendLogic(group: FilterGroupBlock): any {
    const backendRules = group.rules.map((block) => block.kind === 'group' ? this.groupToBackendLogic(block) : this.normalizeCondition(block));
    if (backendRules.length === 0) return { condition: 'AND', rules: [] };
    if (backendRules.length === 1) return { condition: 'AND', rules: backendRules };

    let folded = backendRules[0];
    for (let index = 1; index < backendRules.length; index += 1) {
      const operator = group.rules[index].connector ?? 'AND';
      const next = backendRules[index];
      if (this.isBackendGroup(folded) && folded.condition === operator) {
        folded = { ...folded, rules: [...folded.rules, next] };
      } else {
        folded = { condition: operator, rules: [folded, next] };
      }
    }

    return this.isBackendGroup(folded) ? folded : { condition: 'AND', rules: [folded] };
  }

  private isBackendGroup(value: any): value is { condition: GroupCondition; rules: any[] } {
    return !!value && typeof value === 'object' && Array.isArray(value.rules) && (value.condition === 'AND' || value.condition === 'OR');
  }
}
