export type EnumMaps = Record<string, Record<string, string>>;
export type LabelMap = Record<string, string>;

function normalizeKey(value: any): string {
  return String(value);
}

function resolveEnumMapForValues(values: any[], enumMaps: EnumMaps): Record<string, string> | null {
  if (!values.length) return null;
  const normalized = values.map(normalizeKey);
  const candidates = Object.values(enumMaps).filter((map) =>
    normalized.every((v) => Object.prototype.hasOwnProperty.call(map, v))
  );
  return candidates.length === 1 ? candidates[0] : null;
}

function mapArrayValues(values: any[], map: Record<string, string>): any[] {
  return values.map((value) => {
    const key = normalizeKey(value);
    return map[key] ?? value;
  });
}

function mapObjectKeys(obj: Record<string, any>, map: Record<string, string>): Record<string, any> {
  const next: Record<string, any> = {};
  Object.keys(obj).forEach((key) => {
    const mappedKey = map[normalizeKey(key)] ?? key;
    next[mappedKey] = obj[key];
  });
  return next;
}

function mapClassificationSummary(summary: any, map: Record<string, string>): any {
  const next: Record<string, any> = {};
  Object.keys(summary || {}).forEach((metric) => {
    const block = summary[metric];
    if (!block || typeof block !== 'object') {
      next[metric] = block;
      return;
    }
    next[metric] = mapObjectKeys(block, map);
  });
  return next;
}

function getEnumMapForVar(enumMaps: EnumMaps, varCode: string | null | undefined) {
  if (!varCode) return null;
  return enumMaps[String(varCode)] ?? null;
}

function mapConfusionMatrix(
  result: any,
  enumMaps: EnumMaps,
  yVar: string | null | undefined
): { result: any; map: Record<string, string> | null } {
  const labels: any[] = result?.confusion_matrix?.labels;
  if (!Array.isArray(labels)) return { result, map: null };

  const target =
    yVar ??
    result?.dependent_var ??
    result?.target_var ??
    result?.target ??
    result?.y ??
    result?.variable ??
    result?.confusion_matrix?.variable ??
    null;

  const directMap = getEnumMapForVar(enumMaps, target);
  const map = directMap ?? resolveEnumMapForValues(labels, enumMaps);
  if (!map) return { result, map: null };

  return {
    result: {
      ...result,
      confusion_matrix: {
        ...result.confusion_matrix,
        labels: mapArrayValues(labels, map),
      },
    },
    map,
  };
}

function mapAnovaOneway(result: any, enumMaps: EnumMaps, xVar: string | null | undefined): any {
  const categories: any[] = Array.isArray(result?.categories) ? result.categories : [];
  const groupStats: any[] = Array.isArray(result?.group_stats_index) ? result.group_stats_index : [];
  const sample = categories.length ? categories : groupStats;
  const directMap = getEnumMapForVar(enumMaps, xVar);
  const map = directMap ?? (sample.length ? resolveEnumMapForValues(sample, enumMaps) : null);
  if (!map) return result;

  const mapped = { ...result };

  if (categories.length) {
    mapped.categories = mapArrayValues(categories, map);
  }

  if (groupStats.length) {
    mapped.group_stats_index = mapArrayValues(groupStats, map);
  }

  if (Array.isArray(result?.tuckey_test)) {
    mapped.tuckey_test = result.tuckey_test.map((row: any) => {
      const nextRow = { ...row };
      if (row.groupA !== undefined) {
        nextRow.groupA = map[normalizeKey(row.groupA)] ?? row.groupA;
      }
      if (row.groupB !== undefined) {
        nextRow.groupB = map[normalizeKey(row.groupB)] ?? row.groupB;
      }
      return nextRow;
    });
  }

  if (result?.min_max_per_group?.categories) {
    const cats = Array.isArray(result.min_max_per_group.categories)
      ? result.min_max_per_group.categories
      : [];
    mapped.min_max_per_group = {
      ...result.min_max_per_group,
      categories: mapArrayValues(cats, map),
    };
  }

  if (result?.anova_table) {
    const table = result.anova_table;
    const mappedTable = { ...table };
    const xLabel = table?.x_label;
    const yLabel = table?.y_label;
    if (xLabel && map[normalizeKey(xLabel)]) {
      mappedTable.x_label = map[normalizeKey(xLabel)];
    }
    if (yLabel && map[normalizeKey(yLabel)]) {
      mappedTable.y_label = map[normalizeKey(yLabel)];
    }
    mapped.anova_table = mappedTable;
  }

  if (result?.ci_info && typeof result.ci_info === 'object') {
    const ci = result.ci_info;
    mapped.ci_info = {
      ...ci,
      sample_stds: ci.sample_stds ? mapObjectKeys(ci.sample_stds, map) : ci.sample_stds,
      means: ci.means ? mapObjectKeys(ci.means, map) : ci.means,
      'm-s': ci['m-s'] ? mapObjectKeys(ci['m-s'], map) : ci['m-s'],
      'm+s': ci['m+s'] ? mapObjectKeys(ci['m+s'], map) : ci['m+s'],
    };
  }

  return mapped;
}

function mapMultipleHistograms(
  result: any,
  enumMaps: EnumMaps,
  yVar: string | null | undefined
): any {
  const list = result?.histogram ?? result?.histograms;
  if (!Array.isArray(list)) return result;

  const mappedHist = list.map((hist: any) => {
    const bins = Array.isArray(hist?.bins) ? hist.bins : [];
    const directMap = getEnumMapForVar(enumMaps, yVar);
    const map = directMap ?? resolveEnumMapForValues(bins, enumMaps);
    if (!map) return hist;

    const next = { ...hist, bins: mapArrayValues(bins, map) };
    if (Array.isArray(hist?.groups)) {
      next.groups = mapArrayValues(hist.groups, map);
    }
    if (Array.isArray(hist?.grouping_enum)) {
      next.grouping_enum = mapArrayValues(hist.grouping_enum, map);
    }
    return next;
  });

  return { ...result, histogram: mappedHist };
}

function mapDummyCategoryLabel(value: string, labelMap: LabelMap | null | undefined, enumMaps: EnumMaps): string {
  const bracketMatch = value.match(/^(.+?)\[(.+)\]$/);
  if (bracketMatch) {
    const base = bracketMatch[1];
    const level = bracketMatch[2];
    const map = enumMaps[base];
    const baseLabel = labelMap?.[base] ?? base;
    if (map) {
      const mapped = map[normalizeKey(level)] ?? level;
      return `${baseLabel}[${mapped}]`;
    }
    return `${baseLabel}[${level}]`;
  }

  const eqIndex = value.indexOf('=');
  if (eqIndex > 0) {
    const base = value.slice(0, eqIndex);
    const level = value.slice(eqIndex + 1);
    const map = enumMaps[base];
    const baseLabel = labelMap?.[base] ?? base;
    if (map) {
      const mapped = map[normalizeKey(level)] ?? level;
      return `${baseLabel}=${mapped}`;
    }
    return `${baseLabel}=${level}`;
  }

  const directLabel = labelMap?.[value];
  return directLabel ?? value;
}

function mapRegressionVars(result: any, enumMaps: EnumMaps, labelMap: LabelMap | null | undefined): any {
  const indep: any[] = Array.isArray(result?.indep_vars) ? result.indep_vars : [];
  const dep = result?.dependent_var;

  const mappedIndep = indep.map((val) => {
    if (typeof val !== 'string') return val;
    return mapDummyCategoryLabel(val, labelMap, enumMaps);
  });

  const mappedDep = typeof dep === 'string' ? (labelMap?.[dep] ?? dep) : dep;

  const changedIndep = mappedIndep.some((v, i) => v !== indep[i]);
  const changedDep = mappedDep !== dep;

  if (!changedIndep && !changedDep) return result;

  return {
    ...result,
    ...(indep.length ? { indep_vars: mappedIndep } : {}),
    ...(dep !== undefined ? { dependent_var: mappedDep } : {}),
  };
}

function mapMixedEffectsResult(
  result: any,
  enumMaps: EnumMaps,
  vars: { y?: string | null; x?: string | null } | undefined,
  labelMap: LabelMap | null | undefined
): any {
  const mapped = mapRegressionVars(result, enumMaps, labelMap);
  const next = { ...mapped };

  if (typeof mapped?.grouping_var === 'string') {
    next.grouping_var = labelMap?.[mapped.grouping_var] ?? mapped.grouping_var;
  }

  if (Array.isArray(mapped?.category_order)) {
    const directMap = getEnumMapForVar(enumMaps, vars?.y);
    const map = directMap ?? resolveEnumMapForValues(mapped.category_order, enumMaps);
    if (map) {
      next.category_order = mapArrayValues(mapped.category_order, map);
    }
  }

  return next;
}

function mapTableTestLabels(
  result: any,
  enumMaps: EnumMaps,
  vars: { y?: string | null; x?: string | null } | undefined
): any {
  const next = { ...result };

  if (Array.isArray(result?.x_labels)) {
    const directMap = getEnumMapForVar(enumMaps, vars?.x);
    const map = directMap ?? resolveEnumMapForValues(result.x_labels, enumMaps);
    if (map) {
      next.x_labels = mapArrayValues(result.x_labels, map);
    }
  }

  if (Array.isArray(result?.y_labels)) {
    const directMap = getEnumMapForVar(enumMaps, vars?.y);
    const map = directMap ?? resolveEnumMapForValues(result.y_labels, enumMaps);
    if (map) {
      next.y_labels = mapArrayValues(result.y_labels, map);
    }
  }

  return next;
}

function mapTwoWayAnovaKeys(obj: Record<string, any>, labelMap: LabelMap | null | undefined): Record<string, any> {
  if (!labelMap) return obj;
  const next: Record<string, any> = {};
  Object.entries(obj).forEach(([key, val]) => {
    if (!key || typeof key !== 'string') {
      next[key] = val;
      return;
    }
    const parts = key.split(':').map((part) => labelMap[part] ?? part);
    next[parts.join(':')] = val;
  });
  return next;
}

function mapAnovaTerms(terms: any[], labelMap: LabelMap | null | undefined): any[] {
  if (!labelMap) return terms;
  return terms.map((term) => {
    if (typeof term !== 'string') return term;
    const parts = term.split(':').map((part) => labelMap[part] ?? part);
    return parts.join(':');
  });
}

function mapMatrixVariables(matrix: any, labelMap: LabelMap | null | undefined): any {
  if (!labelMap || !matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return matrix;

  const variables = Array.isArray(matrix?.['variables']) ? matrix['variables'] : [];
  const mappedVariables = variables.map((variable: unknown) =>
    typeof variable === 'string' ? (labelMap[variable] ?? variable) : variable
  );

  const next: Record<string, any> = {};
  if (variables.length) {
    next['variables'] = mappedVariables;
  }

  Object.keys(matrix).forEach((key) => {
    if (key === 'variables') return;
    const mappedKey = labelMap[key] ?? key;
    next[mappedKey] = matrix[key];
  });

  return next;
}

function mapPearsonRows(rows: any[], labelMap: LabelMap | null | undefined): any[] {
  if (!labelMap) return rows;
  return rows.map((row) => {
    if (!Array.isArray(row) || row.length < 2) return row;
    const nextRow = [...row];
    if (typeof nextRow[0] === 'string') {
      nextRow[0] = labelMap[nextRow[0]] ?? nextRow[0];
    }
    if (typeof nextRow[1] === 'string') {
      nextRow[1] = labelMap[nextRow[1]] ?? nextRow[1];
    }
    return nextRow;
  });
}

function mapNaiveBayesClasses(
  result: any,
  enumMaps: EnumMaps,
  yVar: string | null | undefined
): { result: any; map: Record<string, string> | null } {
  const classes: any[] = Array.isArray(result?.classes) ? result.classes : [];
  if (!classes.length) return { result, map: null };

  const directMap = getEnumMapForVar(enumMaps, yVar);
  const map = directMap ?? resolveEnumMapForValues(classes, enumMaps);
  if (!map) return { result, map: null };

  return {
    result: {
      ...result,
      classes: mapArrayValues(classes, map),
    },
    map,
  };
}

function mapCoxResult(
  result: any,
  enumMaps: EnumMaps,
  labelMap: LabelMap | null | undefined
): any {
  const mapped = mapRegressionVars(result, enumMaps, labelMap);
  const next = { ...mapped };

  if (typeof mapped?.event_var === 'string') {
    next.event_var = labelMap?.[mapped.event_var] ?? mapped.event_var;
  }

  return next;
}

export function mapAlgorithmResultEnums(
  algorithm: string | null | undefined,
  result: any,
  enumMaps: EnumMaps | null | undefined,
  vars?: { y?: string | null; x?: string | null },
  labelMap?: LabelMap | null
): any {
  if (!algorithm || !result) return result;
  const hasEnums = !!enumMaps && Object.keys(enumMaps).length > 0;
  const hasLabels = !!labelMap && Object.keys(labelMap).length > 0;
  if (!hasEnums && !hasLabels) return result;

  const safeEnumMaps = enumMaps ?? {};
  const yVar = vars?.y ?? null;
  const xVar = vars?.x ?? null;

  switch (algorithm) {
    case 'naive_bayes_categorical':
    case 'naive_bayes_categorical_cv':
    case 'naive_bayes_gaussian':
    case 'naive_bayes_gaussian_cv': {
      const classesMapped = mapNaiveBayesClasses(result, safeEnumMaps, yVar);
      const confusionMapped = mapConfusionMatrix(classesMapped.result, safeEnumMaps, yVar);
      const effectiveMap = confusionMapped.map ?? classesMapped.map;

      if (effectiveMap && confusionMapped.result?.classification_summary) {
        return {
          ...confusionMapped.result,
          classification_summary: mapClassificationSummary(confusionMapped.result.classification_summary, effectiveMap),
        };
      }
      return confusionMapped.result;
    }
    case 'anova_oneway':
      {
        const mapped = mapAnovaOneway(result, safeEnumMaps, xVar);
        if (labelMap && mapped?.anova_table) {
          const table = mapped.anova_table;
          const updated = { ...table };
          if (table.x_label && labelMap[table.x_label]) {
            updated.x_label = labelMap[table.x_label];
          }
          if (table.y_label && labelMap[table.y_label]) {
            updated.y_label = labelMap[table.y_label];
          }
          return { ...mapped, anova_table: updated };
        }
        return mapped;
      }
    case 'histogram':
      return mapMultipleHistograms(result, safeEnumMaps, yVar);
    case 'linear_regression':
    case 'linear_regression_cv':
    case 'logistic_regression':
    case 'logistic_regression_cv':
    case 'cox_regression_classical':
    case 'cox_regression_stacked':
      return mapCoxResult(result, safeEnumMaps, labelMap);
    case 'lmm':
    case 'glmm_binary':
    case 'glmm_ordinal':
      return mapMixedEffectsResult(result, safeEnumMaps, vars, labelMap);
    case 'chi_squared':
    case 'fisher_exact':
      return mapTableTestLabels(result, safeEnumMaps, vars);
    case 'anova_twoway': {
      if (!labelMap) return result;
      const mapped: any = { ...result };
      if (Array.isArray(mapped.terms)) {
        mapped.terms = mapAnovaTerms(mapped.terms, labelMap);
      }
      const twoWayKeys = ['sum_sq', 'df', 'ms', 'f_stat', 'f_value', 'p_value', 'pvalue', 'f_pvalue'];
      for (const key of twoWayKeys) {
        if (mapped[key] && typeof mapped[key] === 'object' && !Array.isArray(mapped[key])) {
          mapped[key] = mapTwoWayAnovaKeys(mapped[key], labelMap);
        }
      }
      return mapped;
    }
    case 'pearson_correlation': {
      if (!labelMap) return result;
      const mapped: any = { ...result };
      const correlations = mapped.correlations;
      if (Array.isArray(correlations)) {
        mapped.correlations = mapPearsonRows(correlations, labelMap);
      } else if (correlations && typeof correlations === 'object') {
        mapped.correlations = mapMatrixVariables(correlations, labelMap);
      }

      // Backwards compatibility: keep historical Pearson matrix key aliases when remapping labels.
      const matrixKeys = [
        'p-values',
        'p_values',
        'pvalues',
        'low_confidence_intervals',
        'high_confidence_intervals',
        'ci_lo',
        'ci_hi',
      ];
      matrixKeys.forEach((key) => {
        const value = mapped[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          mapped[key] = mapMatrixVariables(value, labelMap);
        }
      });

      return mapped;
    }
    default:
      return result;
  }
}
