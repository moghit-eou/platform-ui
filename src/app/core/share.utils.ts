import { Router } from '@angular/router';

/**
 * Build an absolute share URL for an experiment, pointing back at the
 * experiments dashboard with the experiment id in the query string.
 */
export function buildExperimentShareUrl(router: Router, experimentId: string): string {
  const tree = router.createUrlTree(['/experiments-dashboard'], {
    queryParams: { experiment: experimentId },
  });
  const relative = router.serializeUrl(tree);
  return window.location.origin + relative;
}

/**
 * Whether the given user owns the experiment (matching the author's email).
 * Returns false when either email is unavailable.
 */
export function isExperimentOwner(
  currentUserEmail: string | null | undefined,
  authorEmail: string | null | undefined
): boolean {
  if (!currentUserEmail || !authorEmail) return false;
  return currentUserEmail === authorEmail;
}

/**
 * Toast copy for the share flow, in one place. Both the dashboard list (which
 * anchors the toast on the row that was acted on) and the detail view show these
 * same strings; keeping them here is what stops the two surfaces from worded-splitting.
 */
export const SHARE_TOAST = {
  copied: 'Link copied to clipboard',
  copyFailed: 'Could not copy link — check console.',
  clipboardUnavailable: 'Clipboard not available — check console log.',
  nowShared: 'Experiment is now shared',
  noLongerShared: 'Experiment is no longer shared',
  toggleFailed: 'Failed to update share state',
} as const;

/** Copy `text` and resolve to the toast string for the outcome (the reason is logged, not shown). */
export async function copyShareUrl(text: string): Promise<string> {
  if (!navigator.clipboard?.writeText) {
    console.warn('Clipboard API not available, share URL:', text);
    return SHARE_TOAST.clipboardUnavailable;
  }
  try {
    await navigator.clipboard.writeText(text);
    return SHARE_TOAST.copied;
  } catch (err) {
    console.warn('Failed to copy share URL:', err);
    return SHARE_TOAST.copyFailed;
  }
}

/** Toast for a completed share toggle. */
export function shareToggleToast(shared: boolean): string {
  return shared ? SHARE_TOAST.nowShared : SHARE_TOAST.noLongerShared;
}
