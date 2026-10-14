/** Latest valid visit, independent of input order or the current ordering of states. */
export function statusVisits(history: readonly {status_id: string; changed_at: string}[]) {
  const visits = new Map<string, Date>();
  for (const entry of history) {
    const date = new Date(entry.changed_at);
    if (!entry.status_id || !Number.isFinite(date.getTime())) continue;
    if (!visits.has(entry.status_id) || visits.get(entry.status_id)!.getTime() < date.getTime()) visits.set(entry.status_id, date);
  }
  return visits;
}
