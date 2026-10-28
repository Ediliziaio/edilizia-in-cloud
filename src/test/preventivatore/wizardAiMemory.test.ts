import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { createStore, type UseStore } from 'idb-keyval';
import { createWizardAiMemory, type WizardAiMemoryScope } from '@/lib/preventivi/wizardAiMemory';
import { localSnapshot } from './localPlanFixtures';

let store: UseStore;
const scope: WizardAiMemoryScope = { ownerId: 'user', companyId: 'any-company', path: '/azienda/marketing/preventivi/nuovo:revision-1' };
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('Blob', NodeBlob);
  store = createStore(`wizard-ai-test-${crypto.randomUUID()}`, 'drafts');
});
afterEach(() => vi.unstubAllGlobals());

describe('salvataggio esplicito della bozza AI, senza scritture al preventivo', () => {
  it('riprende chat, testo non inviato, voci, misure, allegato originale e capitoli', async () => {
    const memory = createWizardAiMemory(store), snapshot = localSnapshot(), blob = new Blob(['abc']);
    snapshot.input = 'Messaggio non ancora inviato';
    const saved = await memory.save(scope, null, 'original', { snapshot, blob }, { row: 'Finiture' });
    const loaded = await memory.load(scope);
    expect(loaded?.snapshot).toEqual(snapshot); expect(loaded?.blob?.size).toBe(3);
    expect(loaded?.chapters).toEqual({ row: 'Finiture' }); expect(loaded?.revision).toBe(saved.revision);
    expect(await loaded?.blob?.text()).toBe('abc');
  });
  it('isola utenti, aziende, preventivi e revisioni anche fuori da Demo 2', async () => {
    const memory = createWizardAiMemory(store);
    await memory.save(scope, null, 'original', { snapshot: localSnapshot(), blob: new Blob(['abc']) }, {});
    for (const other of [{ ...scope, ownerId: 'other' }, { ...scope, companyId: 'other' }, { ...scope, path: '/altra-commessa' }, { ...scope, path: `${scope.path}:revision-2` }]) {
      expect(await memory.load(other)).toBeNull();
    }
    await expect(memory.load({ ...scope, ownerId: '' })).rejects.toThrow('Account');
  });
  it('non salva niente se manca l’originale allegato', async () => {
    const memory = createWizardAiMemory(store);
    await expect(memory.save(scope, null, 'original', { snapshot: localSnapshot(), blob: null }, {})).rejects.toThrow('Allegato');
    expect(await memory.load(scope)).toBeNull();
  });
  it('due schede non possono sovrascriversi silenziosamente', async () => {
    const memory = createWizardAiMemory(store), state = { snapshot: localSnapshot(), blob: new Blob(['abc']) };
    const results = await Promise.allSettled([memory.save(scope, null, 'original', state, {}), memory.save(scope, null, 'original', state, {})]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  });
  it('scarta solo la propria revisione e non elimina il salvataggio più recente di un’altra scheda', async () => {
    const memory = createWizardAiMemory(store), state = { snapshot: localSnapshot(), blob: new Blob(['abc']) };
    const first = await memory.save(scope, null, 'original', state, {});
    const second = await memory.save(scope, first.revision, 'original', state, { row: 'Nuovo' });
    await memory.remove(scope, first.revision);
    expect((await memory.load(scope))?.revision).toBe(second.revision);
    await memory.remove(scope, second.revision); expect(await memory.load(scope)).toBeNull();
  });
  it('il salvataggio non riuscito mantiene intatta l’ultima copia valida', async () => {
    const memory = createWizardAiMemory(store), state = { snapshot: localSnapshot(), blob: new Blob(['abc']) };
    const first = await memory.save(scope, null, 'original', state, {});
    await expect(memory.save(scope, first.revision, 'original', { ...state, blob: new Blob(['wrong-size']) }, {})).rejects.toThrow('Allegato');
    expect((await memory.load(scope))?.revision).toBe(first.revision);
  });
});
