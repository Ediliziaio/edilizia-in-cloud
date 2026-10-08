/** Stable arguments as well as names: searching three different orders is not a loop. */
export function toolCallSignature(calls: Array<{ function?: { name?: string; arguments?: string } }>): string {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)]),
    );
    return value;
  }
  return calls.filter(call => call.function?.name).map(call => {
    let args: unknown = call.function?.arguments ?? '{}';
    try { args = canonical(JSON.parse(String(args))); } catch { /* malformed input retains its signature */ }
    return `${call.function!.name}:${JSON.stringify(args)}`;
  }).sort().join('|');
}
