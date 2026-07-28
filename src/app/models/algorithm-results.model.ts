export interface AnovaResult {
    anova_table: AnovaTable;
    tuckey_test: TuckeyTestItem[];
    min_max_per_group: MinMaxPerGroup;
    ci_info: CIInfo;
}

export interface AnovaTable {
    n_obs: number;
    y_label: string;
    x_label: string;
    df_residual: number;
    df_explained: number;
    ss_residual: number;
    ss_explained: number;
    ms_residual: number;
    ms_explained: number;
    p_value: number;
    f_stat: number;
}

export interface TuckeyTestItem {
    groupA: string;
    groupB: string;
    meanA: number;
    meanB: number;
    diff: number;
    se: number;
    t_stat: number;
    p_tuckey: number;
}

export interface MinMaxPerGroup {
    categories: string[];
    min: number[];
    max: number[];
}

export interface CIInfo {
    means: Record<string, number>;
    sample_stds: Record<string, number>;
    'm-s': Record<string, number>;
    'm+s': Record<string, number>;
}

export interface AnovaTwoWayResult {
    terms: string[];
    sum_sq: number[];
    df: number[];
    f_stat: (number | null)[];
    f_pvalue: (number | null)[];
}

export interface DescriptiveStatsResult {
    featurewise?: VariableStats[];
}

export interface VariableStats {
    variable: string;
    dataset: string;
    data: NominalDescriptiveStats | NumericalDescriptiveStats | null;
}

export interface NominalDescriptiveStats {
    num_dtps: number;
    num_na: number;
    num_total: number;
    counts: Record<string, number>;
}

export interface NumericalDescriptiveStats {
    num_dtps: number;
    num_na: number;
    num_total: number;
    mean: number | null;
    std: number | null;
    min: number | null;
    q1: number | null;
    q2: number | null;
    q3: number | null;
    median?: number | null;
    max: number | null;
}

export interface QuartileResult {
    q: number;
    value: number | null;
    actual_q: number | null;
}

export interface QuartilesResult {
    quantiles: QuartileResult[];
}

export interface BinnedMannWhitneyUTestResult {
    u_stat: number;
    p_value: number;
    z_score: number;
    n1: number;
    n2: number;
}

export interface HistogramResult {
    histogram: HistogramResultItem[];
}

export interface HistogramResultItem {
    var: string;
    grouping_var: string | null;
    grouping_enum: string | null;
    bins: (number | string)[];
    counts: (number | null)[];
}

export interface KMeansResult {
    title: string;
    n_obs: number;
    centers: number[][];
}

export interface LinearRegressionResult {
    dependent_var: string;
    n_obs: number;
    df_resid: number;
    df_model: number;
    rse: number;
    r_squared: number;
    r_squared_adjusted: number;
    f_stat: number;
    f_pvalue: number;
    f_stat_status?: string;
    f_stat_display?: string;
    f_pvalue_display?: string;
    f_stat_note?: string;
    ll: number;
    aic: number;
    bic: number;
    indep_vars: string[];
    coefficients: number[];
    std_err: number[];
    t_stats: number[];
    pvalues: number[];
    lower_ci: number[];
    upper_ci: number[];
}

export interface CoxRegressionSummaryBase {
    n_obs: number;
    n_events: number;
    coefficients: number[];
    hazard_ratios: number[];
    std_err: number[];
    lower_ci: number[];
    upper_ci: number[];
    hr_lower_ci: number[];
    hr_upper_ci: number[];
    z_scores: number[];
    pvalues: number[];
    df_model: number;
    df_resid: number;
    ll: number;
}

export interface ClassicalCoxRegressionSummary extends CoxRegressionSummaryBase {
    n_covariates: number;
    n_unique_event_times: number;
    ties: string;
    n_iter: number;
    converged: boolean;
    score_norm: number;
    step_norm: number;
    method: string;
}

export interface StackedCoxRegressionSummary extends CoxRegressionSummaryBase {
    n_stacked_rows: number;
    n_covariates: number;
    r_squared_cs: number;
    r_squared_mcf: number;
    ll0: number;
    aic: number;
    bic: number;
    time_grid_strategy: string;
    n_time_bins_used: number;
    method: string;
}

export interface CoxRegressionResult {
    dependent_var: string;
    event_var: string;
    indep_vars: string[];
    summary: ClassicalCoxRegressionSummary | StackedCoxRegressionSummary;
}

export interface LinearRegressionCVResult {
    dependent_var: string;
    indep_vars: string[];
    n_obs: number[];
    mean_sq_error: BasicStats;
    r_squared: BasicStats;
    mean_abs_error: BasicStats;
    f_stat: BasicStats;
}

export interface LMMResult {
    dependent_var: string;
    grouping_var: string;
    indep_vars: string[];
    n_obs: number;
    n_groups: number;
    df_model: number;
    df_resid: number;
    coefficients: number[];
    std_err: number[];
    t_stats: number[];
    pvalue_label: string;
    pvalues: number[];
    pvalues_display: string[];
    lower_ci: number[];
    upper_ci: number[];
    sigma2: number;
    sigma_u2: number;
    ll_reml: number;
    aic: number;
    bic: number;
    converged: boolean;
    n_iter: number;
}

export type BasicStats = {
    mean: number;
    std: number;
} | number[];

export interface SVMResult {
    title: string;
    n_obs: number;
    weights: number[];
    intercept: number;
}

export interface LogisticRegressionResult {
    dependent_var: string;
    indep_vars: string[];
    summary: LogisticRegressionSummary;
}

export interface LogisticRegressionSummary {
    n_obs: number;
    coefficients: number[];
    stderr: number[];
    lower_ci: number[];
    upper_ci: number[];
    z_scores: number[];
    pvalues: number[];
    df_model: number;
    df_resid: number;
    r_squared_cs: number;
    r_squared_mcf: number;
    ll0: number;
    ll: number;
    aic: number;
    bic: number;
}

export interface CVLogisticRegressionResult {
    dependent_var: string;
    indep_vars: string[];
    summary: CVClassificationSummary;
    confusion_matrix: ConfusionMatrix;
    roc_curves: ROCCurve[];
}

export interface CVClassificationSummary {
    row_names: string[];
    n_obs: (number | null)[];
    accuracy: number[];
    precision: number[];
    recall: number[];
    fscore: number[];
}

export interface ConfusionMatrix {
    tp: number;
    fp: number;
    tn: number;
    fn: number;
}

export interface ROCCurve {
    name: string;
    tpr: number[];
    fpr: number[];
    auc: number;
}

export interface NaiveBayesCategoricalResult {
    classes: string[];
    class_count: number[];
    class_log_prior: number[];
    category_count: Record<string, number[][]>;
    category_log_prob: Record<string, number[][]>;
    categories: Record<string, string[]>;
    feature_names: string[];
}

export interface NaiveBayesCVResult {
    confusion_matrix: SimpleConfusionMatrix;
    classification_summary: MulticlassClassificationSummary;
}

export interface SimpleConfusionMatrix {
    data: number[][];
    labels: string[];
}

export interface MulticlassClassificationSummary {
    accuracy: Record<string, Record<string, number>>;
    precision: Record<string, Record<string, number>>;
    recall: Record<string, Record<string, number>>;
    fscore: Record<string, Record<string, number>>;
    n_obs: Record<string, number>;
}

export interface NaiveBayesGaussianResult {
    classes: string[];
    class_count: number[];
    class_prior: number[];
    theta: number[][];
    var: number[][];
    feature_names: string[];
}

export interface PCAResult {
    title: string;
    n_obs: number;
    eigenvalues: number[];
    eigenvectors: number[][];
}

export interface PearsonResult {
    title: string;
    n_obs: number;
    correlations: MatrixDict;
    p_values: MatrixDict;
    ci_hi: MatrixDict;
    ci_lo: MatrixDict;
}

export interface MatrixDict {
    variables: string[];
    [key: string]: string[] | number[]; // dynamic keys for variables
}

// Unified interface for all T-Test results since they share most fields
export interface TTestResult {
    t_stat: number;
    df: number | string; // df is sometimes int, sometimes float in python
    p: number;
    mean_diff: number;
    se_diff: number;
    ci_upper: string | number;
    ci_lower: string | number;
    cohens_d: number;
    n_obs?: number; // Only for OneSample
    std?: number; // Only for OneSample
}
