/** Old backend responses remain compatible; only explicit backlog signals count. */
export function emailSyncPending(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const data = value as { pending_windows?: unknown; budget_esaurito?: unknown };
  return data.budget_esaurito === true
    || (typeof data.pending_windows === "number" && data.pending_windows > 0);
}
