/** Run independent conversations concurrently, but never two messages of one conversation. */
export async function recoveryBatch<T>(items: T[], scope: (item: T) => string,
  run: (item: T) => Promise<"processed" | "failed" | "skipped">, concurrency = 4) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = scope(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const groups = [...grouped.values()];
  let cursor = 0;
  const counts = { processed: 0, failed: 0, skipped: 0 };
  await Promise.all(Array.from({ length: Math.min(groups.length, Math.max(1, concurrency)) }, async () => {
    while (cursor < groups.length) {
      const group = groups[cursor++];
      for (const item of group) {
        let outcome: "processed" | "failed" | "skipped";
        try { outcome = await run(item); } catch { outcome = "failed"; }
        counts[outcome]++;
        // Don't burn attempts for later messages behind an active/stuck turn.
        if (outcome !== "processed") {
          counts.skipped += group.length - group.indexOf(item) - 1;
          break;
        }
      }
    }
  }));
  return counts;
}
