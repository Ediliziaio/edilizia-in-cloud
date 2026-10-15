/** Stati storici equivalenti: lettura comune senza riscrivere i dati. */
export function normalizeAdminTaskStatus(status: string): string {
  return status === "todo" || status === "pending" ? "open" : status;
}
export function matchesAdminTaskStatus(status: string, filter: string): boolean {
  const normalized = normalizeAdminTaskStatus(status);
  if (filter === "all") return true;
  if (filter === "active") return normalized !== "completed";
  return normalized === filter;
}
export function adminTaskStatusPatch(status: string, now = new Date()) {
  const normalized = normalizeAdminTaskStatus(status);
  return { status: normalized, completed_at: normalized === "completed" ? now.toISOString() : null, updated_at: now.toISOString() };
}
