import { createStore, get, promisifyRequest, type UseStore } from 'idb-keyval';
import { readLocalQuoteSnapshot, type LocalQuoteSnapshot } from './localQuoteMemory';

export type WizardAiSnapshot = { snapshot: LocalQuoteSnapshot; blob: Blob | null };
export type WizardAiSavedDraft = WizardAiSnapshot & {
  version: 1; revision: string; fingerprint: string; chapters: Record<string, string>;
};
export type WizardAiMemoryScope = { ownerId: string; companyId: string; path: string };
let defaultStore: UseStore | undefined;
const conflict = () => new Error('Un’altra scheda ha aggiornato la bozza AI. Non è stata sovrascritta: chiudi e riapri per riprenderla.');
const key = (scope: WizardAiMemoryScope) => {
  if (!scope.ownerId || !scope.companyId || !scope.path) throw new Error('Account o preventivo non disponibile per salvare la bozza.');
  return JSON.stringify(['wizard-ai-v1', scope.ownerId, scope.companyId, scope.path]);
};

/** Explicit browser-only draft. Never writes to the native quote or simulation memory.
 * Snapshot, original attachment and chapters commit together, with a cross-tab guard. */
export function createWizardAiMemory(store: UseStore = defaultStore ??= createStore('eic-wizard-ai-v1', 'drafts')) {
  async function write(scope: WizardAiMemoryScope, expected: string | null, value: WizardAiSavedDraft | null) {
    await store('readwrite', objectStore => new Promise<void>((resolve, reject) => {
      const request = objectStore.get(key(scope));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if ((request.result?.revision ?? null) !== expected) {
          // Discarding this tab must not delete a newer saved draft, nor trap
          // the user inside the modal. Saving still refuses to overwrite it.
          if (value) reject(conflict()); else resolve();
          return;
        }
        if (value) objectStore.put(value, key(scope)); else objectStore.delete(key(scope));
        promisifyRequest(objectStore.transaction).then(() => resolve(), reject);
      };
    }));
  }
  return {
    async load(scope: WizardAiMemoryScope): Promise<WizardAiSavedDraft | null> {
      const raw = await get<WizardAiSavedDraft | undefined>(key(scope), store);
      if (raw == null) return null;
      if (raw.version !== 1 || typeof raw.revision !== 'string' || typeof raw.fingerprint !== 'string' ||
        !raw.chapters || Object.values(raw.chapters).some(value => typeof value !== 'string' || value.length > 200))
        throw new Error('Bozza AI locale non leggibile. Nessun dato è stato sovrascritto.');
      const snapshot = readLocalQuoteSnapshot(raw.snapshot);
      if (snapshot.plan && !snapshot.plan.localFileMissing && (!(raw.blob instanceof Blob) || raw.blob.size !== snapshot.plan.size))
        throw new Error('L’allegato della bozza AI non è disponibile. Nessun dato è stato sovrascritto.');
      return { ...raw, snapshot };
    },
    async save(scope: WizardAiMemoryScope, expected: string | null, fingerprint: string, state: WizardAiSnapshot, chapters: Record<string, string>) {
      if (Object.values(chapters).some(value => typeof value !== 'string' || value.length > 200)) throw new Error('Capitoli della bozza non validi.');
      const snapshot = readLocalQuoteSnapshot(state.snapshot);
      if (snapshot.plan && !snapshot.plan.localFileMissing && (!(state.blob instanceof Blob) || state.blob.size !== snapshot.plan.size))
        throw new Error('Allegato non disponibile: resta qui e riprova il salvataggio.');
      const value: WizardAiSavedDraft = { ...state, snapshot, chapters: { ...chapters }, version: 1, revision: crypto.randomUUID(), fingerprint };
      await write(scope, expected, value);
      return value;
    },
    remove: (scope: WizardAiMemoryScope, expected: string | null) => write(scope, expected, null),
  };
}
