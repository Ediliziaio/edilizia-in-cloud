import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createStore, type UseStore } from 'idb-keyval';
import { Blob as NodeBlob } from 'node:buffer';
import { createLocalQuoteMemory, LocalDraftConflict } from '@/lib/preventivi/localQuoteMemory';
import { emptyQuoteProject } from '@/lib/preventivi/quoteProject';
import { localSnapshot, memoryScope } from './localPlanFixtures';
let store: UseStore;
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('Blob', NodeBlob); store = createStore(`version-${crypto.randomUUID()}`, 'drafts'); });
describe('Versioni locali nominate con isolamento e allegato', () => {
  it('conserva snapshot, costi e allegato senza sostituire la bozza corrente', async () => {
    const repo = createLocalQuoteMemory(store); const snapshot = localSnapshot(); snapshot.project = emptyQuoteProject();
    await repo.save(memoryScope, snapshot, 0, new Blob(['abc']));
    const version = await repo.checkpoint(memoryScope, 'Ipotesi base', snapshot, new Blob(['abc']), 1);
    snapshot.document.title = 'Alternativa'; await repo.save(memoryScope, snapshot, 1);
    const versions = await repo.versions(memoryScope);
    expect(versions).toHaveLength(1); expect(versions[0].snapshot.document.title).not.toBe('Alternativa'); expect(versions[0].blob?.size).toBe(3);
    const current = await repo.load(memoryScope);
    await repo.save(memoryScope, { ...version.snapshot, document: { ...version.snapshot.document, revision: current.snapshot!.document.revision + 1 } }, current.counter, version.blob!);
    expect((await repo.load(memoryScope)).snapshot!.document.title).toBe(version.snapshot.document.title);
    expect(await repo.versions({ ...memoryScope, ownerId: 'b2000000-0000-4000-a000-000000000001' })).toEqual([]);
  });
  it('blocca conflitti, allegati mancanti e sesta versione senza cancellare nulla', async () => {
    const repo = createLocalQuoteMemory(store), snapshot = localSnapshot(); await repo.save(memoryScope, snapshot, 0, new Blob(['abc']));
    await expect(repo.checkpoint(memoryScope, 'Old', snapshot, new Blob(['abc']), 0)).rejects.toBeInstanceOf(LocalDraftConflict);
    await expect(repo.checkpoint(memoryScope, 'Missing', snapshot, null, 1)).rejects.toThrow('Allegato');
    for (let i = 0; i < 5; i++) await repo.checkpoint(memoryScope, `V${i}`, snapshot, new Blob(['abc']), 1);
    await expect(repo.checkpoint(memoryScope, 'V6', snapshot, new Blob(['abc']), 1)).rejects.toThrow('cinque versioni locali');
    expect(await repo.versions(memoryScope)).toHaveLength(5);
    expect((await repo.load(memoryScope)).counter).toBe(1);
  });
});
