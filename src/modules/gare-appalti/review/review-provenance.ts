const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function reviewValueChanges(snapshot: Record<string, unknown>, previous: Record<string, unknown>) {
  const current = { ...record(snapshot.mapping), ...record(snapshot.answers) }, before = { ...record(previous.mapping), ...record(previous.answers) };
  return [...new Set([...Object.keys(current), ...Object.keys(before)])].filter(key => JSON.stringify(canonical(current[key])) !== JSON.stringify(canonical(before[key]))).map(key => ({ key, before: before[key], current: current[key] }));
}
