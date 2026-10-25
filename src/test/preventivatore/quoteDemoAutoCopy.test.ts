import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuoteDemoAutoCopy, type QuoteAutoCopyState } from '@/lib/preventivi/quoteDemoAutoCopy';
import { createQuoteDemoMemory } from '@/lib/preventivi/quoteDemoMemory';
import { localSnapshot, memoryScope } from './localPlanFixtures';
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
describe('Copia automatica demo: consenso, debounce e due scrittori', () => {
  it('non fa traffico senza consenso, né per snapshot identici o ancora in elaborazione', async () => {
    const save = vi.fn().mockResolvedValue(1); const sync = createQuoteDemoAutoCopy({ save, load: vi.fn() }, memoryScope, vi.fn());
    const snapshot = localSnapshot(); sync.update(snapshot); await vi.advanceTimersByTimeAsync(5000); expect(save).not.toHaveBeenCalled();
    await sync.start(snapshot, 0); sync.update(snapshot); await vi.advanceTimersByTimeAsync(5000); expect(save).toHaveBeenCalledTimes(1);
    sync.update({ ...snapshot, input: 'Nuovo messaggio', interrupted: true }); await vi.advanceTimersByTimeAsync(5000); expect(save).toHaveBeenCalledTimes(1);
    sync.dispose();
  });
  it('raggruppa la digitazione in una sola scrittura CAS e non invia blob', async () => {
    const save = vi.fn().mockImplementation(async (_, _snapshot, expected) => expected + 1); const sync = createQuoteDemoAutoCopy({ save, load: vi.fn() }, memoryScope, vi.fn());
    const snapshot = localSnapshot(); await sync.start(snapshot, 3);
    for (let i = 0; i < 10; i++) { sync.update({ ...snapshot, input: `Testo ${i}` }); await vi.advanceTimersByTimeAsync(200); }
    expect(save).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[1]).toEqual([memoryScope, { ...snapshot, input: 'Testo 9' }, 4]);
    sync.dispose();
  });
  it('non perde una modifica fatta durante l’attivazione', async () => {
    let finish!: (n: number) => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<number>(r => { finish = r; })).mockResolvedValue(2);
    const sync = createQuoteDemoAutoCopy({ save, load: vi.fn() }, memoryScope, vi.fn()); const snapshot = localSnapshot();
    const started = sync.start(snapshot, 0); sync.update({ ...snapshot, input: 'Scritto nel frattempo' }); finish(1); await started;
    await vi.advanceTimersByTimeAsync(3000); expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[1][1].input).toBe('Scritto nel frattempo'); sync.dispose();
  });
  it('due dispositivi non si sovrascrivono: il primo conflitto sospende senza retry', async () => {
    let version = 0; const save = vi.fn().mockImplementation(async (_scope, _snapshot, expected) => { if (expected !== version) throw new Error('409: copia aggiornata da un altro dispositivo'); return ++version; });
    const states: QuoteAutoCopyState[] = []; const remote = { save, load: vi.fn() };
    const a = createQuoteDemoAutoCopy(remote, memoryScope, s => states.push(s)); const b = createQuoteDemoAutoCopy(remote, memoryScope, vi.fn());
    const snapshot = localSnapshot(); await a.start(snapshot, 0); await b.start(snapshot, 1);
    a.update({ ...snapshot, input: 'Dispositivo A' }); await vi.advanceTimersByTimeAsync(3000);
    expect(a.isEnabled()).toBe(false); expect(states.at(-1)?.status).toContain('409');
    const count = save.mock.calls.length; await vi.advanceTimersByTimeAsync(120_000); expect(save).toHaveBeenCalledTimes(count);
    expect(version).toBe(2); a.dispose(); b.dispose();
  });
  it('disattivazione, smontaggio e replay degli effetti non riavviano salvataggi', async () => {
    const save = vi.fn().mockResolvedValue(1); const sync = createQuoteDemoAutoCopy({ save, load: vi.fn() }, memoryScope, vi.fn());
    const snapshot = localSnapshot(); await sync.start(snapshot, 0); sync.update({ ...snapshot, input: 'Nuovo' }); sync.stop();
    await vi.advanceTimersByTimeAsync(5000); expect(save).toHaveBeenCalledTimes(1);
    sync.dispose(); sync.resume(); expect(sync.isEnabled()).toBe(false); await vi.advanceTimersByTimeAsync(5000); expect(save).toHaveBeenCalledTimes(1); sync.dispose();
  });
  it('non riattiva la copia se la risposta di attivazione arriva dopo stop', async () => {
    let finish!: (n: number) => void; const save = vi.fn().mockImplementation(() => new Promise<number>(r => { finish = r; })); const state = vi.fn();
    const sync = createQuoteDemoAutoCopy({ save, load: vi.fn() }, memoryScope, state); const pending = sync.start(localSnapshot(), 0); sync.stop(); finish(1); await pending;
    expect(sync.isEnabled()).toBe(false); expect(sync.isPending()).toBe(false); expect(state.mock.calls.at(-1)![0].pending).toBe(false); sync.dispose();
  });
  it('non trasmette una bozza quando il JWT appartiene ora a un account diverso', async () => {
    const fetch = vi.fn(); const remote = createQuoteDemoMemory({ endpoint: 'http://localhost:8081/functions/v1/ai-preventivo-conversazione', publishableKey: 'test', getIdentity: async () => ({ ownerId: 'b2000000-0000-4000-a000-000000000001', token: 'new-account' }), fetch });
    await expect(remote.save(memoryScope, localSnapshot(), 0)).rejects.toThrow('Account cambiato'); expect(fetch).not.toHaveBeenCalled();
  });
});
