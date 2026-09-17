import { D3HierarchyNode } from '../../../../models/data-model.interface';
import {
  normalizeMetadataTree,
  searchMetadataIndex,
  selectionFromSearchResult,
} from './metadata-browser-normalizer';

describe('metadata browser normalizer', () => {
  const model: D3HierarchyNode = {
    label: 'Stroke 3.7',
    code: 'Stroke',
    children: [
      {
        label: 'Demographics',
        code: 'demographics',
        children: [
          {
            label: 'Dataset Registry Origin',
            code: 'dataset-group',
            children: [
              {
                label: 'Dataset Registry origin',
                code: 'dataset',
                description: 'Variable used to differentiate datasets',
                type: 'nominal',
                sql_type: 'text',
                isCategorical: true,
                enumerations: [
                  { code: 'SSR', label: 'Swiss Stroke Registry' },
                  { code: 'GRSR', label: 'Greek Stroke Registry' },
                ],
              },
            ],
          },
          {
            label: 'Sex',
            code: 'sex',
            description: 'Patient sex',
            type: 'nominal',
            sql_type: 'text',
            enumerations: [{ code: '1', label: 'Female' }],
          },
        ],
      },
      {
        label: 'Vitals',
        code: 'vitals',
        children: [
          {
            label: 'Metabolic',
            code: 'duplicate',
            children: [
              {
                label: 'Glucose',
                code: 'glucose',
                description: 'Blood glucose value',
                type: 'real',
                sql_type: 'real',
                units: 'mmol/L',
                minValue: 0,
                maxValue: 50,
              },
            ],
          },
        ],
      },
      {
        label: 'Other Vitals',
        code: 'other-vitals',
        children: [
          {
            label: 'Metabolic',
            code: 'duplicate',
            children: [
              {
                label: 'Glucose copy',
                code: 'glucose',
                description: 'Duplicate code under another path',
                type: 'real',
                sql_type: 'real',
              },
            ],
          },
        ],
      },
    ],
  };

  it('normalizes deep and mixed groups without dropping direct variables', () => {
    const index = normalizeMetadataTree(model);
    const demographics = Object.values(index.groupsById).find((group) => group.code === 'demographics');

    expect(demographics).toBeDefined();
    expect(demographics?.directGroupCount).toBe(1);
    expect(demographics?.directVariableCount).toBe(1);
    expect(demographics?.totalVariableCount).toBe(2);
  });

  it('generates breadcrumbs for groups and variables', () => {
    const index = normalizeMetadataTree(model);
    const glucose = Object.values(index.variablesById).find((variable) => variable.label === 'Glucose');

    expect(glucose?.pathLabels).toEqual(['Stroke 3.7', 'Vitals', 'Metabolic', 'Glucose']);
    expect(glucose?.units).toBe('mmol/L');
    expect(glucose?.minValue).toBe('0');
    expect(glucose?.maxValue).toBe('50');
  });

  it('keeps duplicate group and variable codes distinct by path when needed', () => {
    const index = normalizeMetadataTree(model);
    const duplicateGroups = Object.values(index.groupsById).filter((group) => group.code === 'duplicate');
    const duplicateVariables = Object.values(index.variablesById).filter((variable) => variable.code === 'glucose');

    expect(duplicateGroups.length).toBe(2);
    expect(new Set(duplicateGroups.map((group) => group.id)).size).toBe(2);
    expect(duplicateVariables.length).toBe(2);
    expect(new Set(duplicateVariables.map((variable) => variable.id)).size).toBe(2);
  });

  it('lists all metadata entries when the search query is empty', () => {
    const index = normalizeMetadataTree(model);

    expect(searchMetadataIndex(index, '').length).toBe(index.variableIds.length + index.groupIds.length);
    expect(searchMetadataIndex(index, '   ').map((result) => result.label)).toContain('Glucose');
  });

  it('searches labels, codes, descriptions, and enumeration labels', () => {
    const index = normalizeMetadataTree(model);

    expect(searchMetadataIndex(index, 'greek')[0]?.label).toBe('Dataset Registry origin');
    expect(searchMetadataIndex(index, 'glucose')[0]?.label).toContain('Glucose');
    expect(searchMetadataIndex(index, 'demographics')[0]?.kind).toBe('group');
    expect(searchMetadataIndex(index, 'patient sex')[0]?.label).toBe('Sex');
  });

  it('maps a variable search result to its containing group and original node', () => {
    const index = normalizeMetadataTree(model);
    const result = searchMetadataIndex(index, 'female')[0];
    const selection = selectionFromSearchResult(index, result);

    expect(selection.variableId).toBe(result.id);
    expect(index.groupsById[selection.groupId].label).toBe('Demographics');
    expect(selection.originalNode.code).toBe('sex');
  });

  it('selects the duplicate group that matches the chosen search path', () => {
    const index = normalizeMetadataTree(model);
    const results = searchMetadataIndex(index, 'metabolic');
    const otherVitalsResult = results.find((result) => result.path.includes('Other Vitals'));

    expect(otherVitalsResult).toBeDefined();
    const selection = selectionFromSearchResult(index, otherVitalsResult!);

    expect(selection.originalNode.label).toBe('Metabolic');
    expect(index.groupsById[selection.groupId].pathLabels).toContain('Other Vitals');
    expect(selection.originalNode).toBe(index.groupsById[otherVitalsResult!.id].original);
  });

  it('ranks exact label matches above prefix, substring, description, and enumeration hits', () => {
    const modelWithAge: D3HierarchyNode = {
      label: 'Stroke 3.7',
      code: 'Stroke',
      children: [
        {
          label: 'Demographics',
          code: 'demographics',
          children: [
            { label: 'Age', code: 'age', type: 'integer', sql_type: 'integer' },
            { label: 'Native imaged setting', code: 'native', type: 'nominal', sql_type: 'text' },
          ],
        },
        {
          label: 'Imaging',
          code: 'imaging',
          children: [
            {
              label: 'Age acquisition note',
              code: 'age-note',
              type: 'text',
              sql_type: 'text',
            },
          ],
        },
      ],
    };
    const index = normalizeMetadataTree(modelWithAge);
    const results = searchMetadataIndex(index, 'age');
    const order = results.map((result) => result.label);

    expect(order[0]).toBe('Age');
    expect(order.indexOf('Age')).toBeLessThan(order.indexOf('Native imaged setting'));
    expect(order.indexOf('Age')).toBeLessThan(order.indexOf('Age acquisition note'));
  });

  it('ranks label substring hits before description-only hits', () => {
    const modelWithNote: D3HierarchyNode = {
      label: 'Root',
      code: 'root',
      children: [
        {
          label: 'Group A',
          code: 'group-a',
          children: [{ label: 'Note', code: 'note', type: 'text', sql_type: 'text' }],
        },
        {
          label: 'Group B',
          code: 'group-b',
          children: [
            {
              label: 'Unrelated',
              code: 'unrelated',
              type: 'text',
              sql_type: 'text',
              description: 'Contains a note about the visit',
            },
          ],
        },
      ],
    };
    const index = normalizeMetadataTree(modelWithNote);
    const results = searchMetadataIndex(index, 'note');

    expect(results[0]?.label).toBe('Note');
    expect(results.map((result) => result.label)).toContain('Unrelated');
  });
});
