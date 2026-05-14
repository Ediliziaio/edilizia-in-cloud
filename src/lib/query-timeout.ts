export const DEFAULT_QUERY_TIMEOUT_MS = 12_000;

export function createTimeoutSignal(timeoutMs = DEFAULT_QUERY_TIMEOUT_MS, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  const timeoutId = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

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
