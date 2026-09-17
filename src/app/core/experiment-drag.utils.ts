/**
 * The one contract between an experiment row being dragged and whatever can receive it — the
 * folder canvas and the folder chips. A private MIME keeps the payload from being mistaken for
 * dropped text, and every target reads it through these helpers so the two surfaces cannot
 * drift apart on the type string.
 *
 * Drop targets may only inspect `types` while the drag is in flight: the payload itself stays
 * unreadable until the drop lands. Hence the split `isExperimentDrag` / `droppedExperimentId`.
 */

export const EXPERIMENT_DRAG_MIME = 'application/x-mip-experiment';

/** Arm the drag. Only `dragstart` has a writable data transfer, so this is the single writer. */
export function beginExperimentDrag(dataTransfer: DataTransfer | null, experimentId: string): void {
  if (!dataTransfer || !experimentId) return;
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(EXPERIMENT_DRAG_MIME, experimentId);
}

/** Cheap enough for `dragover`, which fires continuously and must never touch the payload. */
export function isExperimentDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types || []).includes(EXPERIMENT_DRAG_MIME);
}

/** The dragged run id, or null when the drag carries something else (a file, selected text). */
export function droppedExperimentId(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer || !isExperimentDrag(dataTransfer)) return null;
  const id = dataTransfer.getData(EXPERIMENT_DRAG_MIME)?.trim();
  return id ? id : null;
}

/**
 * Whether a `dragleave` really leaves the drop zone. It also fires when the pointer crosses a
 * child, so the naive handler makes a highlight flicker over every row and icon inside it.
 */
export function leavesDragZone(event: DragEvent, zone: EventTarget | null): boolean {
  if (!zone) return true;
  const next = event.relatedTarget as Node | null;
  return !(zone as HTMLElement).contains(next);
}
