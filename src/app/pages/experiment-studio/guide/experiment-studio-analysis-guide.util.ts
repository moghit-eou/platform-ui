type AnalysisWorkflowSection = 'filters' | 'raw' | 'setup' | 'processed' | 'transformation' | 'none';
type AnalysisSummaryTab = 'Statistics' | 'Charts' | 'Histogram';
export type AnalysisPreprocessingStep = 'missing' | 'outlier' | 'longitudinal';

export interface AnalysisGuideLayout {
  expandSection: AnalysisWorkflowSection;
  summaryKind?: 'raw' | 'processed';
  summaryTab?: AnalysisSummaryTab;
  preprocessingStep?: AnalysisPreprocessingStep;
}

const ANALYSIS_GUIDE_LAYOUTS: Record<string, AnalysisGuideLayout> = {
  'analysis-intro': { expandSection: 'none' },
  'analysis-filtering': { expandSection: 'filters' },
  'analysis-raw-statistics': { expandSection: 'raw', summaryKind: 'raw', summaryTab: 'Statistics' },
  'analysis-preprocessing': { expandSection: 'setup', preprocessingStep: 'missing' },
  'analysis-processed-summary': { expandSection: 'processed', summaryKind: 'processed', summaryTab: 'Statistics' },
  'analysis-transformation': { expandSection: 'transformation' },
};

export function getAnalysisGuideLayout(stepId: string | null): AnalysisGuideLayout | null {
  if (!stepId) return null;
  return ANALYSIS_GUIDE_LAYOUTS[stepId] ?? null;
}
