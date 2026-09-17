/**
 * Dashboard URL state helpers.
 *
 * The dashboard keeps selection, tab, page, filters and sort in the query string so a
 * refresh, bookmark or browser Back returns the same view. It uses history.replaceState
 * instead of Router.navigate so changing a filter never restarts route resolution or
 * creates a history entry for every keystroke. Components listen for popstate and re-read
 * the query themselves.
 */
export type DashboardQueryPatch = Record<string, string | null | undefined>;

export function readDashboardQuery(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function updateDashboardQuery(patch: DashboardQueryPatch): void {
  const params = readDashboardQuery();
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', url);
}
