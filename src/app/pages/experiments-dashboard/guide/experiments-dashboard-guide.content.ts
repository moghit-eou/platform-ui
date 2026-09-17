import {
  EXPERIMENT_STUDIO_GUIDE_LABELS,
  GuideSection,
} from '../../experiment-studio/guide/experiment-studio-guide.content';

export { EXPERIMENT_STUDIO_GUIDE_LABELS };

type ExperimentsDashboardGuidePlacement = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface ExperimentsDashboardGuideStep {
  id: string;
  section: GuideSection;
  title: string;
  body: string;
  selector?: string;
  placement?: ExperimentsDashboardGuidePlacement;
  allowTargetInteraction?: boolean;
  advanceOnTargetClick?: boolean;
  requirementHint?: string;
  maskBackground?: string;
  /** When true, skipped only if selector is missing/zero-size. Never put Complete behind optional steps. */
  optional?: boolean;
}

/**
 * Order matters: open → workbench → actions → results, then optional compare,
 * then Guide Complete LAST. compare-workspace must not outrank Complete.
 */
export const EXPERIMENTS_DASHBOARD_GUIDE_STEPS: ExperimentsDashboardGuideStep[] = [
  {
    id: 'dashboard-overview',
    section: 'Explore',
    title: 'My experiments',
    body: 'This is your experiments home (<strong>My experiments</strong> in the header). From here you can create a new experiment, reopen an existing one, see experiments shared with you, or compare multiple runs. Open Studio anytime from the header <strong>Studio</strong> link.',
    maskBackground: 'transparent',
  },
  {
    id: 'workspace',
    section: 'Explore',
    title: 'Experiment list',
    body: 'The left pane is your experiment history. Select a run to inspect it in the workbench on the right, or use <strong>New</strong> to start from scratch in Studio.',
    selector: '[data-guide="dashboard-workspace"]',
    placement: 'right',
  },
  {
    id: 'search',
    section: 'Explore',
    title: 'Search and Date Filter',
    body: 'Use the search input and date filter to narrow the experiment list.',
    selector: '[data-guide="dashboard-search"]',
    placement: 'bottom',
    allowTargetInteraction: true,
  },
  {
    id: 'tabs',
    section: 'Explore',
    title: 'My Experiments and Shared',
    body: 'Switch between experiments you own and experiments shared with you. Shared stays empty until someone shares a run with you.',
    selector: '[data-guide="dashboard-tabs"]',
    placement: 'bottom',
    allowTargetInteraction: true,
  },
  {
    id: 'new-experiment',
    section: 'Experiment',
    title: 'New experiment',
    body: 'Use <strong>New</strong> to open Experiment Studio and create an experiment from scratch. You can also jump there with the header <strong>Studio</strong> link.',
    selector: '[data-guide="dashboard-new"]',
    placement: 'bottom',
  },
  {
    id: 'tutorial-experiment',
    section: 'Results',
    title: 'Open an Experiment',
    body: 'Click an experiment in the list to load it into the workbench. If the highlighted tutorial example is available, use that one to continue the flow.',
    selector: '[data-guide="dashboard-experiment-card"]',
    placement: 'right',
    allowTargetInteraction: true,
    advanceOnTargetClick: true,
    requirementHint: 'Click the highlighted experiment row to open it in the workbench and continue.',
    optional: true,
  },
  {
    id: 'workbench',
    section: 'Explore',
    title: 'Experiment Workbench',
    body: 'After you select an experiment, this workbench shows its details, configuration, and stored results.',
    selector: '[data-guide="dashboard-detail-card"]',
    placement: 'left',
    allowTargetInteraction: true,
    optional: true,
  },
  {
    id: 'actions',
    section: 'Results',
    title: 'Experiment Actions',
    body: 'From here you can open the run in Studio or use the toolbar actions on this experiment (export, copy link, share, or delete when available).',
    selector: '[data-guide="dashboard-detail-actions"]',
    placement: 'left',
    optional: true,
  },
  {
    id: 'results',
    section: 'Results',
    title: 'Results Review',
    body: 'This section displays the stored result for the selected experiment.',
    selector: '[data-guide="dashboard-results"]',
    placement: 'left',
    allowTargetInteraction: true,
    optional: true,
  },
  {
    id: 'compare',
    section: 'Explore',
    title: 'Compare Mode',
    body: 'Optional: turn on <strong>Compare</strong> to pick two or more runs and inspect them side by side. You can skip this and finish the guide.',
    selector: '[data-guide="dashboard-compare"]',
    placement: 'bottom',
    allowTargetInteraction: true,
  },
  {
    id: 'compare-workspace',
    section: 'Results',
    title: 'Comparison Workspace',
    body: 'With compare on, select a <strong>second</strong> run from the list (at least two). Or press <strong>Skip</strong> to finish without comparing.',
    selector: '[data-guide="dashboard-compare-workspace"]',
    placement: 'left',
    allowTargetInteraction: true,
    optional: true,
  },
  {
    id: 'dashboard-guide-complete',
    section: 'Results',
    title: 'Guide Complete',
    body: 'You successfully completed the dashboard guide.',
  },
];
