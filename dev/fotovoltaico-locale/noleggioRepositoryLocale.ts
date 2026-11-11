import type { RepositoryNoleggio } from "../../src/lib/finanziamenti/noleggio/repository";
import { validaTabellaNoleggio, type TabellaNoleggio } from "../../supabase/functions/_shared/noleggioOperativo";
const DB = "fv-noleggio-locale-v1";
function apri() { return new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open(DB, 1); req.onupgradeneeded = () => req.result.createObjectStore("tabelle", { keyPath: "id" }); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error("Archivio delle tabelle non disponibile.")); }); }
async function operazione<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore, set: (v: T) => void) => void) { const db = await apri(); try {
    return await new Promise<T>((resolve, reject) => { const tx = db.transaction("tabelle", modo); let result: T; const set = (v: T) => { result = v; }; fn(tx.objectStore("tabelle"), set); tx.oncomplete = () => resolve(result); tx.onerror = () => reject(new Error("Archivio locale non aggiornato.")); tx.onabort = tx.onerror; });
}
finally {
    db.close();
} }
export const repositoryNoleggioLocale: RepositoryNoleggio = {
    async elenca(companyId) { return operazione("readonly", (s, set) => { const r = s.getAll(); r.onsuccess = () => set(r.result.map((x: {
        tabella: unknown;
    }) => validaTabellaNoleggio(x.tabella)).filter((t: TabellaNoleggio) => t.companyId === companyId)); }); },
    async crea(companyId, raw, originali) { const tabella = validaTabellaNoleggio(raw); if (tabella.companyId !== companyId)
        throw new Error("Azienda non valida."); await operazione<void>("readwrite", s => { s.add({ id: tabella.id, tabella, originali }); }); },
    async stato(companyId, id, attiva) { await operazione<void>("readwrite", s => { const r = s.get(id); r.onsuccess = () => { if (!r.result || r.result.tabella.companyId !== companyId) {
        r.transaction?.abort();
        return;
    } s.put({ ...r.result, tabella: { ...r.result.tabella, attiva } }); }; }); }
};
