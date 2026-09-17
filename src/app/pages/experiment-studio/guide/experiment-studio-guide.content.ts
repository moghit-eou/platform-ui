export type GuideSection = 'Explore' | 'Analysis' | 'Experiment' | 'Results';

export interface ExperimentStudioGuideStep {
  id: string;
  section: GuideSection;
  title: string;
  body: string;
  compactTitle?: boolean;
  selector?: string;
  interactionSelectors?: string[];
  allowTargetInteraction?: boolean;
  advanceOnTargetClick?: boolean;
  requirement?:
  | 'selected-sex'
  | 'variable-sex'
  | 'selected-age'
  | 'variable-age'
  | 'roles-assigned'
  | 'algorithm-selected'
  | 'experiment-result-ready'
  | 'save-as-opened'
  | 'experiment-saved-as';
  optional?: boolean;
}

export const EXPERIMENT_STUDIO_GUIDE_LABELS = {
  launcher: 'User Guide',
  exit: 'Exit',
  collapse: 'Collapse',
  expand: 'Expand',
  back: 'Back',
  next: 'Next',
  skip: 'Skip',
  done: 'Done',
  moveToDashboard: 'Move to dashboard',
} as const;

export const EXPERIMENT_STUDIO_GUIDE_STEPS: ExperimentStudioGuideStep[] = [
  {
    id: 'welcome',
    section: 'Explore',
    title: 'Experiment Studio User Guide',
    body: 'This guide walks you through Experiment Studio step by step. During interactive steps, you can only interact with the highlighted <strong>blue panel</strong> on the page—the rest of the interface stays dimmed until you press Next.',
  },
  {
    id: 'launcher',
    section: 'Explore',
    title: 'Guide Launcher',
    body: 'Use this button to reopen the guide at any time on the current page. While the guide is active, interaction is limited to the highlighted blue panel; use Back and Next here to move between steps.',
    selector: '[data-guide="launcher"]',
  },
  {
    id: 'header-account',
    section: 'Explore',
    title: 'Account menu',
    body: 'Open the account control to reach <strong>Account settings</strong> or <strong>Sign Out</strong>. Primary navigation for <strong>My experiments</strong> and <strong>Studio</strong> lives in the header to the left.',
    selector: '[data-guide="header-account"]',
  },
  {
    id: 'navigation',
    section: 'Explore',
    title: 'Studio step bar',
    body: 'Use the step bar to move between <strong>Data Exploration</strong>, <strong>Data Handling</strong>, <strong>Algorithm Selection</strong>, and <strong>Experiment Execution</strong>. The CTA on the right starts as <strong>Continue</strong>, becomes <strong>Continue with N variables</strong> after you add variables, <strong>Continue to Algorithm Selection</strong> on Data Handling, and <strong>Run experiment</strong> on Algorithm Selection. Switch to the list anytime with <strong>My experiments</strong> in the header — not from this step bar.',
    selector: '[data-guide="studio-navigation"]',
  },
  {
    id: 'study-context',
    section: 'Explore',
    title: 'Pathology & Datasets',
    body: 'Choose the pathology you want to work with, then pick the datasets or cohorts to include in the current analysis. Click the chip to open both selectors — the available variables update from this selection.',
    selector: '[data-guide="study-context"]',
    allowTargetInteraction: true,
    interactionSelectors: [
      '[data-guide="data-model-selector"]',
      '[data-guide="dataset-selector"]',
    ],
  },
  {
    id: 'search-variables',
    section: 'Explore',
    title: 'Search Variables',
    body: 'Click the search icon to open the search bar, then search for variables or groups and narrow the results by Variables or Groups and by variable type.',
    selector: '[data-guide="search-bar"]',
    allowTargetInteraction: true,
  },
  {
    id: 'variable-selection',
    section: 'Explore',
    title: 'Explore Variable Views',
    body: 'Browse variables in <strong>Map</strong>, <strong>List</strong>, or <strong>Graph</strong> — try switching modes here, or press <strong>Next</strong>. Charts and details appear on the right.',
    selector: '[data-guide="variable-selection"]',
    allowTargetInteraction: true,
  },
  {
    id: 'variable-details',
    section: 'Explore',
    title: 'Variable Details',
    body: 'This panel shows the selected variable histogram or the selected group information. Export actions appear at the top right corner when histogram data is available.',
    selector: '[data-guide="variable-details"]',
  },
  {
    id: 'variable-containers',
    section: 'Explore',
    title: 'Compose Your Experiment',
    body: 'Select an item in the Map or List view, then click <strong>Add</strong> (or double-click the item). The numeric chip next to Add opens your current selection so you can review, remove, or clear variables.',
    selector: '[data-guide="variable-containers"]',
  },
  {
    id: 'select-sex-variable',
    section: 'Explore',
    title: 'Select the <span class="guide-copy-green">green</span>-highlighted {{GUIDE_COVARIATE}} variable.',
    body: '',
    compactTitle: true,
    selector: '[data-guide="variable-selection"]',
    allowTargetInteraction: true,
    requirement: 'selected-sex',
  },
  {
    id: 'preview-sex-variable-details',
    section: 'Explore',
    title: 'Preview {{GUIDE_COVARIATE}} Details',
    body: 'Review the histogram and metadata for the selected variable. Switch between <strong>Chart</strong> and <strong>Details</strong>, and use export actions when available.',
    selector: '[data-guide="variable-details"]',
    allowTargetInteraction: true,
  },
  {
    id: 'add-sex-covariate',
    section: 'Explore',
    title: 'Add {{GUIDE_COVARIATE}} as Variable',
    body: '',
    selector: '[data-guide="guide-add-variable"]',
    allowTargetInteraction: true,
    requirement: 'variable-sex',
  },
  {
    id: 'select-age-variable',
    section: 'Explore',
    title: 'Select the <span class="guide-copy-green">green</span>-highlighted {{GUIDE_VARIABLE}} variable.',
    body: '',
    compactTitle: true,
    selector: '[data-guide="variable-selection"]',
    allowTargetInteraction: true,
    interactionSelectors: ['[data-guide="variable-details"]'],
    requirement: 'selected-age',
  },
  {
    id: 'preview-age-variable-details',
    section: 'Explore',
    title: 'Preview {{GUIDE_VARIABLE}} Details',
    body: 'Review the histogram and metadata for the selected variable. Switch between <strong>Chart</strong> and <strong>Details</strong>, and use export actions when available.',
    selector: '[data-guide="variable-details"]',
    allowTargetInteraction: true,
  },
  {
    id: 'add-age-variable',
    section: 'Explore',
    title: 'Add {{GUIDE_VARIABLE}} as Variable',
    body: '',
    selector: '[data-guide="guide-add-variable"]',
    allowTargetInteraction: true,
    requirement: 'variable-age',
  },
  {
    id: 'analysis-intro',
    section: 'Analysis',
    title: 'Data Handling',
    body: 'Data Handling is optional: Filtering, Preprocessing, and Transformation, plus a read-only Raw data preview. Solid cards are in the run (<strong>Default</strong>/<strong>Applied</strong>); dashed cards are inactive. Tour the stations next or skip with <strong>Next</strong>, then <strong>Continue to Algorithm Selection</strong>.',
    selector: '[data-guide="analysis-section"]',
    allowTargetInteraction: true,
  },
  {
    id: 'analysis-filtering',
    section: 'Analysis',
    title: '1. Filtering',
    body: 'Optional — open <strong>Add Filtering</strong> to try a rule, or press <strong>Next</strong> to skip. <strong>Preview data</strong> shows the cohort; <strong>Apply</strong> saves rules, <strong>Close</strong> leaves an empty step.',
    selector: '[data-guide="analysis-filtering"]',
    allowTargetInteraction: true,
  },
  {
    id: 'analysis-raw-statistics',
    section: 'Analysis',
    title: '2. Raw Data Summary',
    body: 'Optional — use Filtering <strong>Preview data</strong> for tables/charts, then <strong>Close</strong>. Press <strong>Next</strong> if you do not need this view.',
    selector: '[data-guide="analysis-raw-summary"]',
    allowTargetInteraction: true,
  },
  {
    id: 'analysis-preprocessing',
    section: 'Analysis',
    title: '3. Preprocessing',
    body: 'Optional — missing values are already dropped (<strong>Default</strong>). Open the card to change imputation or add outlier clipping, or press <strong>Next</strong> to keep defaults.',
    selector: '[data-guide="analysis-preprocessing"]',
    allowTargetInteraction: true,
  },
  {
    id: 'analysis-processed-summary',
    section: 'Analysis',
    title: '4. Processed Data Summary',
    body: 'Optional — Preprocessing <strong>Preview data</strong> shows processed tables after defaults/edits. Press <strong>Next</strong> to continue.',
    selector: '[data-guide="analysis-processed-summary"]',
    allowTargetInteraction: true,
  },
  {
    id: 'analysis-transformation',
    section: 'Analysis',
    title: '5. Transformation',
    body: 'Optional — open <strong>Add Transformation</strong> for a derived column, or press <strong>Next</strong> to skip. Then choose <strong>Continue to Algorithm Selection</strong>.',
    selector: '[data-guide="analysis-transformation"]',
    allowTargetInteraction: true,
  },
  {
    id: 'experiment-intro',
    section: 'Experiment',
    title: 'Experiment workspace',
    body: 'This step is for assigning outcome and predictors, choosing an algorithm, configuring parameters, then running from the step-bar CTA on the right (<strong>Run experiment</strong>).',
    selector: '[data-guide="experiment-workspace"]',
    allowTargetInteraction: false,
  },
  {
    id: 'experiment-role-assignment',
    section: 'Experiment',
    title: 'Assign outcome &amp; predictors',
    body: 'In the <strong>Experiment pool</strong>, set each variable as <strong>Outcome y</strong> or <strong>Predictor x</strong> (usually one outcome). Assigned variables move into the rails above — drag a chip between rails to move it, or use × to return it to the list. Matching algorithms update as you assign. A created transformation column can also be assigned here.',
    selector: '[data-guide="guide-role-assignment"]',
    allowTargetInteraction: true,
    requirement: 'roles-assigned',
  },
  {
    id: 'experiment-select-algorithm',
    section: 'Experiment',
    title: 'Algorithm Selection',
    body: 'The catalog on the left lists runnable methods per group by default — switch the chip to All to see unavailable ones and their reasons. Click a method to open its documentation and parameters in <strong>Algorithm configuration</strong> beside the catalog.',
    selector: '[data-guide="algorithm-selection"]',
    allowTargetInteraction: true,
    requirement: 'algorithm-selected',
  },
  {
    id: 'experiment-run',
    section: 'Experiment',
    title: 'Run experiment',
    body: 'Review documentation and optional parameters in Algorithm configuration, then press <strong>Run experiment</strong> on the right of the step bar. The guide waits until Experiment Execution shows a result.',
    selector: '[data-guide="run-experiment"]',
    allowTargetInteraction: true,
    requirement: 'experiment-result-ready',
  },
  {
    id: 'experiment-explore-result',
    section: 'Results',
    title: 'Explore the result',
    body: 'Experiment Execution shows the result title, charts/tables, and a toolbar with <strong>Edit parameters</strong>, <strong>Save as</strong>, and <strong>Export PDF</strong>. Inspect the output here, then press Next when you are ready to continue.',
    selector: '[data-guide="experiment-result"]',
    allowTargetInteraction: true,
  },
  {
    id: 'experiment-edit-parameters',
    section: 'Results',
    title: 'Edit parameters',
    body: 'Use <strong>Edit parameters</strong> to go back to Algorithm Selection and adjust the setup before saving or running again.',
    selector: '[data-guide="edit-parameters-action"]',
    allowTargetInteraction: false,
  },
  {
    id: 'experiment-result-actions',
    section: 'Results',
    title: 'Result actions',
    body: 'The result toolbar groups follow-ups. This tour continues with <strong>Save as</strong>; <strong>Edit parameters</strong> and <strong>Export PDF</strong> stay available on any result.',
    selector: '[data-guide="save-as-flow"]',
    allowTargetInteraction: true,
  },
  {
    id: 'experiment-save-as-action',
    section: 'Results',
    title: 'Save as',
    body: 'Use <strong>Save as</strong> to keep this result as a named experiment. That opens the inline save form in the result toolbar.',
    selector: '[data-guide="save-as-action"]',
    allowTargetInteraction: true,
    advanceOnTargetClick: true,
    requirement: 'save-as-opened',
  },
  {
    id: 'experiment-wait-for-save',
    section: 'Results',
    title: 'Save experiment',
    body: 'Enter an <strong>Experiment name</strong>, then click <strong>Save experiment</strong>. The guide continues automatically after a successful save (you can Cancel to stay on the result).',
    selector: '[data-guide="save-as-form"]',
    allowTargetInteraction: true,
    requirement: 'experiment-saved-as',
  },
  {
    id: 'experiment-finish',
    section: 'Results',
    title: 'Studio guide done',
    body: 'You finished the Studio path through Experiment Execution. Next, the tour moves to <strong>My experiments</strong> on the dashboard.',
    allowTargetInteraction: true,
  }
];
