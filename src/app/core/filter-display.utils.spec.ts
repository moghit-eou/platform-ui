import { BackendFilter } from '../models/filters.model';
import { countFilterRules, formatFilterExpression } from './filter-display.utils';

const sources = {
  labelMap: { age: 'Age at onset', sex: 'Sex' },
  enumMaps: { sex: { '1': 'female', '0': 'male' } },
};

function rule(field: string, operator: string, value: unknown): any {
  return { id: `${field}-${operator}`, field, type: 'string', input: 'text', operator, value };
}

function group(condition: 'AND' | 'OR', rules: unknown[]): BackendFilter {
  return { condition, rules: rules as BackendFilter['rules'], valid: true };
}

describe('filter-display.utils', () => {
  it('reads a single rule with its label, operator and enum value', () => {
    expect(formatFilterExpression(group('AND', [rule('sex', 'equal', '1')]), sources)).toBe('Sex = female');
  });

  it('joins a group with its own condition and parenthesises a nested group', () => {
    const filters = group('AND', [
      rule('age', 'greater_or_equal', 18),
      group('OR', [rule('sex', 'equal', '1'), rule('sex', 'not_equal', '0')]),
    ]);

    expect(formatFilterExpression(filters, sources)).toBe(
      'Age at onset >= 18 AND (Sex = female OR Sex != male)'
    );
  });

  it('renders null checks and unknown operators without a value', () => {
    expect(formatFilterExpression(group('AND', [rule('age', 'is_null', null)]), sources))
      .toBe('Age at onset IS NULL');
    expect(formatFilterExpression(group('AND', [rule('sex', 'between', 'x')]), sources))
      .toBe('Sex between x');
  });

  it('falls back to the raw code when nothing labels it', () => {
    expect(formatFilterExpression(group('AND', [rule('unknown_cde', 'equal', '3')]), sources))
      .toBe('unknown_cde = 3');
  });

  it('returns nothing for an empty tree and counts only leaf rules', () => {
    const empty = group('AND', []);
    expect(formatFilterExpression(empty, sources)).toBe('');
    expect(countFilterRules(empty)).toBe(0);
    expect(countFilterRules(null)).toBe(0);

    const nested = group('AND', [rule('age', 'equal', 1), group('OR', [rule('sex', 'equal', '1'), rule('sex', 'equal', '0')])]);
    expect(countFilterRules(nested)).toBe(3);
  });
});
