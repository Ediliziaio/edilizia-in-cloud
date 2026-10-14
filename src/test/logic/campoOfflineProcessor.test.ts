import { beforeEach, describe, expect, it, vi } from "vitest";
import { processCampoOffline } from "@/lib/campo/offlineProcessor";
import { SyncDeferredError, SyncPermanentError, type SyncItem } from "@/lib/campo/sync-queue";
const state = vi.hoisted(() => ({ owner: "u", insert: vi.fn(), select: vi.fn(), filters: vi.fn(), upload: vi.fn(), error: null as null | { code: string; message: string }, existing: null as null | { id: string } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: state.owner } } }, error: null as null }) },
  from: () => { const q = { insert: (p: unknown) => { state.insert(p); return Promise.resolve({ error: state.error }); }, select: (p: string) => { state.select(p); return q; }, eq: (...p: unknown[]) => { state.filters(...p); return q; }, maybeSingle: async () => ({ data: state.existing, error: null as null }) }; return q; },
  storage: { from: () => ({ upload: state.upload }) },
} }));
const id = "11111111-1111-4111-a111-111111111111";
const item = (patch: Partial<SyncItem> = {}): SyncItem => ({ id, operationId: id, type: "timbratura", payload: { user_id: "u", company_id: "c", order_id: "o", tipo: "entrata" }, createdAt: 0, updatedAt: 0, retryCount: 0, status: "pending", ...patch });
beforeEach(() => { vi.clearAllMocks(); state.owner = "u"; state.error = null; state.existing = null; state.upload.mockResolvedValue({ error: null }); });
describe("Sincronizzazione con API simulate", () => {
  it.each(["22023", "22P02", "23503", "23505", "23514", "42501", "40001", "40P01", "53300", "57014", "08006", "PGRST000"])("classifica errore %s senza dichiarare l'invio riuscito", async code => {
    state.error = { code, message: "Errore simulato" };
    const result = processCampoOffline(item());
    if (["22023", "22P02", "23503", "23505", "23514", "42501"].includes(code)) {
      await expect(result).rejects.toBeInstanceOf(SyncPermanentError);
    } else {
      try { await result; throw new Error("Invio dichiarato riuscito per errore"); }
      catch (error) { expect(error).toBeInstanceOf(Error); expect(error).not.toBeInstanceOf(SyncPermanentError); expect((error as Error).message).toBe("Errore simulato"); }
    }
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
  it("usa l'identità originale al primo invio", async () => {
    await processCampoOffline(item()); expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id, user_id: "u", company_id: "c" }));
  });
  it("una risposta persa non crea una seconda riga", async () => {
    state.error = { code: "23505", message: "duplicato" }; state.existing = { id };
    await expect(processCampoOffline(item())).resolves.toBeUndefined();
    expect(state.filters).toHaveBeenCalledWith("id", id); expect(state.filters).toHaveBeenCalledWith("company_id", "c"); expect(state.filters).toHaveBeenCalledWith("user_id", "u");
  });
  it("un altro vincolo duplicato non viene scambiato per ricevuta riuscita", async () => {
    state.error = { code: "23505", message: "duplicato" }; await expect(processCampoOffline(item())).rejects.toBeInstanceOf(SyncPermanentError);
  });
  it("non invia la coda di un altro utente", async () => {
    state.owner = "other"; await expect(processCampoOffline(item())).rejects.toBeInstanceOf(SyncDeferredError); expect(state.insert).not.toHaveBeenCalled();
  });
  it("conserva le vecchie note vocali senza dichiararle giornalieri ricevuti", async () => {
    await expect(processCampoOffline(item({ type: "rapportino_vocale", payload: { operaio_id: "u", company_id: "c", trascrizione: "giornata" } }))).rejects.toBeInstanceOf(SyncPermanentError); expect(state.insert).not.toHaveBeenCalled();
  });
  it("non permette di indicare una tabella arbitraria", async () => {
    await expect(processCampoOffline(item({ type: "generic", target: "orders" }))).rejects.toBeInstanceOf(SyncPermanentError); expect(state.insert).not.toHaveBeenCalled();
  });
  it("una foto già caricata ritenta solo la riga con identità stabile", async () => {
    state.upload.mockResolvedValue({ error: { message: "The resource already exists" } });
    await processCampoOffline(item({ type: "foto", payload: { bucket: "campo-rapportini", path: "c/o/foto.jpg", blob: new Blob(["foto"]), contentType: "image/jpeg", riga: { uploaded_by: "u", company_id: "c", order_id: "o" } } }));
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ id, storage_path: "c/o/foto.jpg" }));
  });
});
