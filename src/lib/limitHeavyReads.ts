import { withAbortableClientTimeout, DEFAULT_QUERY_TIMEOUT_MS } from './query-timeout';

/** Limite nel singolo browser, non un lock globale del database o dei worker. */
export function createReadLimit(max: number) {
  if (!Number.isInteger(max) || max < 1) throw new Error('Limite letture non valido');
  let active = 0;
  const queue: Array<{ start: () => void; cancel: () => void; signal?: AbortSignal }> = [];
  const drain = () => {
    while (active < max && queue.length) {
      const item = queue.shift()!;
      item.signal?.removeEventListener('abort', item.cancel);
      active++;
      item.start();
    }
  };
  return function run<T>(task: () => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Annullata', 'AbortError'));
    return new Promise<T>((resolve, reject) => {
      const item = {
        signal,
        cancel: () => {
          const index = queue.indexOf(item);
          if (index >= 0) queue.splice(index, 1);
          signal?.removeEventListener('abort', item.cancel);
          reject(signal?.reason ?? new DOMException('Annullata', 'AbortError'));
        },
        start: () => {
          void Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; drain(); });
        },
      };
      signal?.addEventListener('abort', item.cancel, { once: true });
      queue.push(item);
      drain();
    });
  };
}
const heavyReads = createReadLimit(2);
export function withHeavyDatabaseRead<T>(
  task: (signal: AbortSignal) => PromiseLike<T>, label = 'Richiesta',
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS, parentSignal?: AbortSignal,
): Promise<T> {
  // Il budget include la coda. Il timeout interno libera anche lo slot attivo
  // se il trasporto non conclude la promise dopo l'annullamento del fetch.
  return withAbortableClientTimeout(
    (deadlineSignal) => heavyReads(
      () => withAbortableClientTimeout(task, label, timeoutMs, deadlineSignal),
      deadlineSignal,
    ), label, timeoutMs, parentSignal,
  );
}
