import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {creaPrimePagineCancellabili} from '@/lib/marketing/primePagineCancellabili';
type Args = {stageId: string; filtro: string};
const key = (args: Args) => args.filtro;
const args = (stageId = 'a', filtro = 'uno'): Args => ({stageId, filtro});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('prime pagine Kanban cancellabili', () => {
  it('raggruppa due colonne in una sola lettura', async () => {
    const fetch = vi.fn(async () => ({a: [1], b: [2]}));
    const read = creaPrimePagineCancellabili<Args, number>(key, fetch);
    const a = read(args()), b = read(args('b'));
    await vi.advanceTimersByTimeAsync(15);
    expect(await a).toEqual([1]); expect(await b).toEqual([2]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(args(), ['a', 'b'], expect.any(AbortSignal));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('annulla prima della raccolta senza avviare richieste', async () => {
    const fetch = vi.fn(async () => ({a: [1]}));
    const read = creaPrimePagineCancellabili<Args, number>(key, fetch);
    const c = new AbortController();
    const check = expect(read(args(), c.signal)).rejects.toMatchObject({name: 'AbortError'});
    c.abort(); await check; await vi.advanceTimersByTimeAsync(100);
    expect(fetch).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('un consumer annullato non interrompe gli altri della stessa colonna', async () => {
    let finish!: (data: Record<string, number[]>) => void;
    let signal!: AbortSignal;
    const read = creaPrimePagineCancellabili<Args, number>(key, (_a, _f, s) => {
      signal = s; return new Promise(resolve => {finish = resolve;});
    });
    const c = new AbortController();
    const check = expect(read(args(), c.signal)).rejects.toThrow('uscita');
    const remaining = read(args());
    await vi.advanceTimersByTimeAsync(15);
    c.abort(new Error('uscita')); await check;
    expect(signal.aborted).toBe(false);
    finish({a: [42]}); expect(await remaining).toEqual([42]);
  });
  it('interrompe il batch attivo solo quando sparisce l’ultimo consumer', async () => {
    let signal!: AbortSignal;
    const read = creaPrimePagineCancellabili<Args, number>(key, (_a, _f, s) => {
      signal = s; return new Promise((_resolve, reject) => s.addEventListener('abort', () => reject(s.reason)));
    });
    const c = new AbortController(), d = new AbortController();
    const first = expect(read(args(), c.signal)).rejects.toMatchObject({name: 'AbortError'});
    const second = expect(read(args('b'), d.signal)).rejects.toMatchObject({name: 'AbortError'});
    await vi.advanceTimersByTimeAsync(15);
    c.abort(); await first; expect(signal.aborted).toBe(false);
    d.abort(); await second; expect(signal.aborted).toBe(true);
  });
  it('dopo un gruppo annullato riparte con la stessa chiave', async () => {
    const fetch = vi.fn(async () => ({a: [2]}));
    const read = creaPrimePagineCancellabili<Args, number>(key, fetch);
    const c = new AbortController();
    const cancelled = expect(read(args(), c.signal)).rejects.toMatchObject({name: 'AbortError'});
    c.abort(); await cancelled;
    const next = read(args()); await vi.advanceTimersByTimeAsync(15);
    expect(await next).toEqual([2]); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('conserva anche un errore undefined senza convertirlo in successo', async () => {
    const read = creaPrimePagineCancellabili<Args, number>(key, async () => {throw undefined;});
    const check = expect(read(args())).rejects.toBeUndefined();
    await vi.advanceTimersByTimeAsync(15); await check;
  });
});
