export const DEFAULT_QUERY_TIMEOUT_MS = 12_000;

export function withClientTimeout<T>(
  task: PromiseLike<T>,
  label = "Richiesta",
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label}: timeout dopo ${Math.round(timeoutMs / 1000)} secondi`));
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(task), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}
