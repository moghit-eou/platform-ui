import { D3HierarchyNode } from '../../../../models/data-model.interface';
import {
  MetadataSearchResult,
  MetadataSelection,
  NormalizedEnumeration,
  NormalizedGroupNode,
  NormalizedMetadataIndex,
  NormalizedVariableNode,
} from './metadata-browser.model';

const ROOT_FALLBACK_LABEL = 'Data model';

export function normalizeMetadataTree(root: D3HierarchyNode): NormalizedMetadataIndex {
  const groupsById: Record<string, NormalizedGroupNode> = {};
  const variablesById: Record<string, NormalizedVariableNode> = {};
  const groupIds: string[] = [];
  const variableIds: string[] = [];
  const variableCodeCounts = countVariableCodes(root);

  const visitGroup = (
    node: D3HierarchyNode,
    parentId: string | null,
    pathSegments: string[],
    pathLabels: string[],
    siblingIndex: number,
    depth: number
  ): string => {
    const label = normalizeLabel(node.label, ROOT_FALLBACK_LABEL);
    const code = normalizeString(node.code);
    const segment = buildPathSegment(code || label, siblingIndex);
    const nextPathSegments = [...pathSegments, segment];
    const id = `group:${nextPathSegments.join('/')}`;
    const nextPathLabels = [...pathLabels, label];

    groupsById[id] = {
      kind: 'group',
      id,
      label,
      code,
      parentId,
      childGroupIds: [],
      variableIds: [],
      pathGroupIds: [],
      pathLabels: nextPathLabels,
      depth,
      directGroupCount: 0,
      directVariableCount: 0,
      totalVariableCount: 0,
      original: node,
    };
    groupIds.push(id);

    (node.children ?? []).forEach((child, childIndex) => {
      if (isGroupNode(child)) {
        const childGroupId = visitGroup(
          child,
          id,
          nextPathSegments,
          nextPathLabels,
          childIndex,
          depth + 1
        );
        groupsById[id].childGroupIds.push(childGroupId);
        return;
      }

      const variableId = visitVariable(
        child,
        id,
        nextPathSegments,
        nextPathLabels,
        childIndex,
        variableCodeCounts
      );
      groupsById[id].variableIds.push(variableId);
    });

    groupsById[id].pathGroupIds = buildGroupPathIds(groupsById, id);
    groupsById[id].directGroupCount = groupsById[id].childGroupIds.length;
    groupsById[id].directVariableCount = groupsById[id].variableIds.length;
    return id;
  };

  const visitVariable = (
    node: D3HierarchyNode,
    parentGroupId: string,
    parentPathSegments: string[],
    parentPathLabels: string[],
    siblingIndex: number,
    codeCounts: Map<string, number>
  ): string => {
    const label = normalizeLabel(node.label, normalizeString(node.code) || 'Variable');
    const code = normalizeString(node.code);
    const uniqueCode = code && codeCounts.get(code) === 1;
    const id = uniqueCode
      ? `variable:${encodeIdSegment(code)}`
      : `variable:${[...parentPathSegments, buildPathSegment(code || label, siblingIndex)].join('/')}`;
    const pathLabels = [...parentPathLabels, label];

    variablesById[id] = {
      kind: 'variable',
      id,
      label,
      code,
      description: normalizeString(node.description),
      sqlType: normalizeString(node.sql_type),
      type: normalizeString(node.type || 'unknown'),
      isCategorical: normalizeCategorical(node),
      units: normalizeString(node.units),
      minValue: normalizeString(node.minValue),
      maxValue: normalizeString(node.maxValue),
      enumerations: normalizeEnumerations(node.enumerations),
      parentGroupId,
      pathGroupIds: [],
      pathLabels,
      original: node,
    };
    variableIds.push(id);
    return id;
  };

  const rootId = visitGroup(root, null, [], [], 0, 0);

  groupIds.forEach((id) => {
    groupsById[id].pathGroupIds = buildGroupPathIds(groupsById, id);
  });
  variableIds.forEach((id) => {
    variablesById[id].pathGroupIds = buildGroupPathIds(groupsById, variablesById[id].parentGroupId);
  });
  calculateTotalVariableCounts(groupsById, rootId);

  return {
    rootId,
    groupsById,
    variablesById,
    groupIds,
    variableIds,
  };
}

function listMetadataSearchResults(index: NormalizedMetadataIndex): MetadataSearchResult[] {
  const groupResults = index.groupIds.map((id) => toGroupSearchResult(index.groupsById[id]));
  const variableResults = index.variableIds.map((id) => toVariableSearchResult(index.variablesById[id]));

  return [...groupResults, ...variableResults].sort((a, b) => a.path.localeCompare(b.path));
}

export function searchMetadataIndex(index: NormalizedMetadataIndex, query: string): MetadataSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return listMetadataSearchResults(index);
  }

  const scored: Array<{ result: MetadataSearchResult; score: number }> = [];

  index.groupIds.forEach((id) => {
    const group = index.groupsById[id];
    const score = matchScore(normalizedQuery, group.label, group.code, '', []);
    if (score >= 0) {
      scored.push({ result: toGroupSearchResult(group), score });
    }
  });

  index.variableIds.forEach((id) => {
    const variable = index.variablesById[id];
    const enumTexts = [
      ...variable.enumerations.map((item) => item.label),
      ...variable.enumerations.map((item) => item.code),
    ];
    const score = matchScore(normalizedQuery, variable.label, variable.code, variable.description, enumTexts);
    if (score >= 0) {
      scored.push({ result: toVariableSearchResult(variable, normalizedQuery), score });
    }
  });

  scored.sort((a, b) => a.score - b.score || a.result.label.localeCompare(b.result.label));
  return scored.map((entry) => entry.result).slice(0, 50);
}

function toGroupSearchResult(group: NormalizedGroupNode): MetadataSearchResult {
  return {
    kind: 'group',
    id: group.id,
    label: group.label,
    path: group.pathLabels.join(' > '),
    pathLabels: group.pathLabels,
    matchText: group.label,
    parentGroupId: group.parentId,
  };
}

function toVariableSearchResult(
  variable: NormalizedVariableNode,
  normalizedQuery = ''
): MetadataSearchResult {
  return {
    kind: 'variable',
    id: variable.id,
    label: variable.label,
    path: variable.pathLabels.join(' > '),
    pathLabels: variable.pathLabels,
    matchText: normalizedQuery ? bestMatchText(normalizedQuery, variable) : variable.label,
    parentGroupId: variable.parentGroupId,
  };
}

export function selectionFromSearchResult(
  index: NormalizedMetadataIndex,
  result: MetadataSearchResult
): MetadataSelection {
  if (result.kind === 'group') {
    const group = index.groupsById[result.id];
    return {
      groupId: group.id,
      variableId: null,
      originalNode: group.original,
    };
  }

  const variable = index.variablesById[result.id];
  return {
    groupId: variable.parentGroupId,
    variableId: variable.id,
    originalNode: variable.original,
  };
}

export function findGroupByNode(index: NormalizedMetadataIndex, node: D3HierarchyNode | null): NormalizedGroupNode | null {
  if (!node) return null;

  const path = normalizeString((node as D3HierarchyNode & { path?: string }).path);
  if (path) {
    const byPath = index.groupIds
      .map((id) => index.groupsById[id])
      .find((group) => group.pathLabels.join(' > ') === path);
    if (byPath) return byPath;
  }

  const code = normalizeString(node.code);
  const label = normalizeString(node.label);
  const matches = index.groupIds
    .map((id) => index.groupsById[id])
    .filter((group) => (code && group.code === code) || (label && group.label === label));

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

export function findVariableByNode(
  index: NormalizedMetadataIndex,
  node: D3HierarchyNode | null
): NormalizedVariableNode | null {
  if (!node) return null;

  const path = normalizeString((node as D3HierarchyNode & { path?: string }).path);
  if (path) {
    const byPath = index.variableIds
      .map((id) => index.variablesById[id])
      .find((variable) => variable.pathLabels.join(' > ') === path);
    if (byPath) return byPath;
  }

  const code = normalizeString(node.code);
  const label = normalizeString(node.label);
  const matches = index.variableIds
    .map((id) => index.variablesById[id])
    .filter((variable) => (code && variable.code === code) || (label && variable.label === label));

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

export function pathForGroup(index: NormalizedMetadataIndex, groupId: string): NormalizedGroupNode[] {
  return (index.groupsById[groupId]?.pathGroupIds ?? [])
    .map((id) => index.groupsById[id])
    .filter((group): group is NormalizedGroupNode => !!group);
}

function isGroupNode(node: D3HierarchyNode): boolean {
  return Array.isArray(node.children) && node.children.length > 0;
}

function buildGroupPathIds(groupsById: Record<string, NormalizedGroupNode>, groupId: string): string[] {
  const path: string[] = [];
  let current: NormalizedGroupNode | undefined = groupsById[groupId];
  while (current) {
    path.unshift(current.id);
    current = current.parentId ? groupsById[current.parentId] : undefined;
  }
  return path;
}

function calculateTotalVariableCounts(groupsById: Record<string, NormalizedGroupNode>, groupId: string): number {
  const group = groupsById[groupId];
  const childTotal = group.childGroupIds
    .map((childGroupId) => calculateTotalVariableCounts(groupsById, childGroupId))
    .reduce((sum, count) => sum + count, 0);
  group.totalVariableCount = group.variableIds.length + childTotal;
  return group.totalVariableCount;
}

function countVariableCodes(root: D3HierarchyNode): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (node: D3HierarchyNode): void => {
    (node.children ?? []).forEach((child) => {
      if (isGroupNode(child)) {
        visit(child);
        return;
      }
      const code = normalizeString(child.code);
      if (code) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    });
  };
  visit(root);
  return counts;
}

function normalizeEnumerations(value: unknown): NormalizedEnumeration[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const code = normalizeString(record['code'] ?? record['value'] ?? record['label']);
      const label = normalizeString(record['label'] ?? record['name'] ?? record['code']);
      return { code, label };
    }
    const primitive = normalizeString(entry);
    return { code: primitive, label: primitive };
  }).filter((entry) => entry.code || entry.label);
}

function normalizeCategorical(node: D3HierarchyNode): boolean {
  const record = node as D3HierarchyNode & { is_categorical?: unknown };
  if (typeof node.isCategorical === 'boolean') return node.isCategorical;
  if (typeof record.is_categorical === 'boolean') return record.is_categorical;
  if (typeof record.is_categorical === 'string') return record.is_categorical.toLowerCase() === 'true';
  return Array.isArray(node.enumerations) && node.enumerations.length > 0;
}

function matchScore(
  query: string,
  label: string,
  code: string,
  description: string,
  extraTexts: string[]
): number {
  const labelNorm = normalizeSearchText(label);
  const codeNorm = normalizeSearchText(code);
  const descNorm = normalizeSearchText(description);
  const extraNorms = extraTexts.map((text) => normalizeSearchText(text));

  if (labelNorm === query || codeNorm === query) {
    return 0;
  }
  if (labelNorm.startsWith(query) || codeNorm.startsWith(query)) {
    return 1;
  }

  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    if (tokens.every((token) => labelNorm.includes(token))) {
      return 2;
    }
  }

  if (labelNorm.includes(query) || codeNorm.includes(query)) {
    return 3;
  }

  if (descNorm.includes(query)) {
    return 4;
  }

  if (extraNorms.some((text) => text.includes(query))) {
    return 5;
  }

  return -1;
}

function bestMatchText(query: string, variable: NormalizedVariableNode): string {
  const candidates = [
    variable.label,
    variable.code,
    variable.description,
    ...variable.enumerations.map((item) => item.label),
    ...variable.enumerations.map((item) => item.code),
  ];
  return candidates.find((candidate) => normalizeSearchText(candidate).includes(query)) ?? variable.label;
}

function buildPathSegment(value: string, index: number): string {
  return `${encodeIdSegment(value || 'node')}-${index}`;
}

function encodeIdSegment(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase().replace(/\s+/g, '-'));
}

function normalizeLabel(value: unknown, fallback: string): string {
  const normalized = normalizeString(value);
  return normalized || fallback;
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeSearchText(value: unknown): string {
  return normalizeString(value).toLowerCase();
}
