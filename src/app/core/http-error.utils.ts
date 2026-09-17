/**
 * True when an HTTP failure means "this resource is gone", not "the request failed".
 * The distinction matters for folder-member hydration: a 404 is safe to prune, while a
 * transient network/server error must leave folder membership intact for a retry.
 */
export function isNotFoundError(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 404;
}
