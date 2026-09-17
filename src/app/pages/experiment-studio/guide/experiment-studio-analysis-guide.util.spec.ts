import { getAnalysisGuideLayout } from './experiment-studio-analysis-guide.util';

describe('experiment-studio-analysis-guide.util', () => {
  it('opens the matching workflow section for each analysis guide step', () => {
    expect(getAnalysisGuideLayout('analysis-intro')?.expandSection).toBe('none');
    expect(getAnalysisGuideLayout('analysis-filtering')?.expandSection).toBe('filters');
    expect(getAnalysisGuideLayout('analysis-raw-statistics')).toEqual({
      expandSection: 'raw',
      summaryKind: 'raw',
      summaryTab: 'Statistics',
    });
    expect(getAnalysisGuideLayout('analysis-preprocessing')?.preprocessingStep).toBe('missing');
    expect(getAnalysisGuideLayout('analysis-processed-summary')?.expandSection).toBe('processed');
    expect(getAnalysisGuideLayout('analysis-transformation')?.expandSection).toBe('transformation');
  });
});
