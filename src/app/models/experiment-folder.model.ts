/**
 * A named group of runs inside a folder: the unit the compare workspace turns into a section.
 *
 * Strict partition — a run sits in at most one set per folder, because sets drive section
 * grouping and a run in two sections breaks numbering, counts, and the mental model. Moving a
 * run into a set removes it from its previous one; deleting a set returns its runs to Ungrouped.
 */
export interface ExperimentSet {
  id: string;
  name: string;
  experimentIds: string[];
}

/**
 * A user-curated set of experiments ("analysis set").
 *
 * The rows live in PostgreSQL behind `/services/experiment-folders`; this is the shape the client
 * keeps them in. Both the folder and its sets hold member ids only, never experiment copies, so the
 * only drift risk is an id the experiment API no longer resolves. Ids are plain UUIDs the backend
 * minted — nothing here is generated in the browser.
 */
export interface ExperimentFolder {
  id: string;
  name: string;
  experimentIds: string[];
  /** Named subsets of `experimentIds`. Members in no set render under an implicit Ungrouped group. */
  sets: ExperimentSet[];
}
