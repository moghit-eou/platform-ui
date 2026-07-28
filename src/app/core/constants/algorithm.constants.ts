
export const AlgorithmNames = {
    ANOVA_ONEWAY: 'anova_oneway',
    ANOVA_TWOWAY: 'anova_twoway',
    TTEST_ONESAMPLE: 'ttest_onesample',
    PCA: 'pca',
    PCA_WITH_TRANSFORMATION: 'pca_with_transformation',
    HISTOGRAM: 'histogram',
    DESCRIBE: 'describe',
    QUARTILES: 'quartiles',
    BINNED_MANN_WHITNEY_U_TEST: 'binned_mann_whitney_u_test',
    LMM: 'lmm',
    GLMM_BINARY: 'glmm_binary',
    GLMM_ORDINAL: 'glmm_ordinal',
    CHI_SQUARED: 'chi_squared',
    FISHER_EXACT: 'fisher_exact',
    OUTLIER_REPORT: 'outlier_report',
    LINEAR_SVM: 'linear_svm',
    LOGISTIC_REGRESSION_FEDAVERAGE_FLOWER: 'logistic_regression_fedaverage_flower',
};

export const VariableTypes = {
    NOMINAL: 'nominal',
    REAL: 'real',
    INTEGER: 'integer',
    INT: 'int',
    TEXT: 'text',
};

export const HistogramBinningType = {
    WILKINSON: 'wilkinson',
} as const;

export const AlgorithmRoles = {
    Y: 'y',
    X: 'x',
    FILTERS: 'filters',
    FILTER: 'filter',
};
