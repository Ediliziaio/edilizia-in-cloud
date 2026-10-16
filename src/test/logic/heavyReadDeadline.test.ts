import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {withHeavyDatabaseRead} from '@/lib/limitHeavyReads';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('budget letture comprensivo della coda', () => {
  it('scade in coda senza eseguire la richiesta e libera slot con trasporti bloccati', async () => {
    const blocked = () => new Promise<never>(() => {});
    const first = expect(withHeavyDatabaseRead(blocked, 'prima', 1000)).rejects.toThrow('timeout');
    const second = expect(withHeavyDatabaseRead(blocked, 'seconda', 1000)).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(0);
    const fetch = vi.fn(async () => 1);
    const queued = expect(withHeavyDatabaseRead(fetch, 'in coda', 50)).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(50); await queued;
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(950); await first; await second;
    await expect(withHeavyDatabaseRead(async () => 42)).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('non concede un secondo budget completo dopo l’attesa in coda', async () => {
    const blocker = () => new Promise<number>(resolve => setTimeout(() => resolve(1), 80));
    const first = withHeavyDatabaseRead(blocker, 'prima', 1000);
    const second = withHeavyDatabaseRead(blocker, 'seconda', 1000);
    await vi.advanceTimersByTimeAsync(0);
    let startedAt: number | null = null;
    let signal!: AbortSignal;
    const begin = Date.now();
    const queued = expect(withHeavyDatabaseRead(s => {
      signal = s; startedAt = Date.now();
      return new Promise<never>(() => {});
    }, 'dopo attesa', 100)).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(80);
    expect(startedAt! - begin).toBe(80);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(20); await queued;
    expect(signal.aborted).toBe(true);
    await first; await second;
    expect(vi.getTimerCount()).toBe(0);
  });
});
